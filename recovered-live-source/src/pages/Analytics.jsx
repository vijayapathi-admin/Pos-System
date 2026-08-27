import React, { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { exportToExcel } from "../utils";

export default function Analytics() {
  const { sales, expenses, products } = useApp();
  const [mode, setMode] = useState("daily"); // daily | monthly
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Aggregate product sales stats
  const productStats = useMemo(() => {
    const map = {};
    const filteredSales = mode === "daily"
      ? sales.filter(s => s.date === selectedDate)
      : sales.filter(s => s.date?.startsWith(selectedMonth));

    filteredSales.forEach(sale => {
      sale.items?.forEach(item => {
        if (!map[item.name]) {
          map[item.name] = { name: item.name, qty: 0, profit: 0 };
        }
        const originalPrice = item.sellingPrice / (1 + (sale.commissionPercent || 0) / 100);
        map[item.name].qty += item.qty;
        map[item.name].profit += (originalPrice - item.purchasePrice) * item.qty;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [sales, mode, selectedDate, selectedMonth]);

  const topByVolume = productStats.slice(0, 8);
  const topByProfit = [...productStats].sort((a, b) => b.profit - a.profit).slice(0, 8);
  const maxVol = Math.max(...topByVolume.map(p => p.qty), 1);
  const maxProfit = Math.max(...topByProfit.map(p => p.profit), 1);

  // Summary stats
  const summaryStats = useMemo(() => {
    const filteredSales = mode === "daily"
      ? sales.filter(s => s.date === selectedDate)
      : sales.filter(s => s.date?.startsWith(selectedMonth));
    const filteredExpenses = mode === "daily"
      ? expenses.filter(e => e.date === selectedDate)
      : expenses.filter(e => e.date?.startsWith(selectedMonth));

    const totalSales = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalProfit = filteredSales.reduce((sum, s) => sum + (s.profit || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    return { totalSales, totalProfit, totalExpenses, billCount: filteredSales.length };
  }, [sales, expenses, mode, selectedDate, selectedMonth]);

  // Download CSV -> Excel
  const downloadReport = () => {
    let rows = [];
    let filename = "";

    if (mode === "daily") {
      const filteredSales = sales.filter(s => s.date === selectedDate);
      rows.push(["Bill#", "Time", "Customer", "Items", "Total", "Profit", "Commission %", "Commission (₹)", "Payment"]);
      filteredSales.forEach((sale, idx) => {
        const itemNames = sale.items?.map(i => `${i.qty}x ${i.name}`).join("; ") || "";
        rows.push([idx + 1, sale.time || "", sale.customerName || "Walk-in", itemNames, sale.total || 0, sale.profit || 0, sale.commissionPercent || 0, sale.commissionAmount || 0, sale.paymentMethod || ""]);
      });
      
      // Add expenses
      const filteredExpenses = expenses.filter(e => e.date === selectedDate);
      if (filteredExpenses.length > 0) {
        rows.push([]);
        rows.push(["Expenses"]);
        rows.push(["Reason", "Amount"]);
        filteredExpenses.forEach(exp => {
          rows.push([exp.reason, exp.amount || 0]);
        });
      }
      
      // Add summary
      rows.push([]);
      rows.push(["SUMMARY", ""]);
      rows.push(["Total Sales", summaryStats.totalSales]);
      rows.push(["Total Profit", summaryStats.totalProfit]);
      rows.push(["Total Expenses", summaryStats.totalExpenses]);
      rows.push(["Net", summaryStats.totalSales - summaryStats.totalExpenses]);
      
      filename = `vijayapathi_daily_report_${selectedDate}.xlsx`;
    } else {
      // Monthly: date-wise summary
      const dateMap = {};
      const filteredSales = sales.filter(s => s.date?.startsWith(selectedMonth));
      filteredSales.forEach(sale => {
        if (!dateMap[sale.date]) dateMap[sale.date] = { sales: 0, profit: 0, bills: 0 };
        dateMap[sale.date].sales += sale.total || 0;
        dateMap[sale.date].profit += sale.profit || 0;
        dateMap[sale.date].bills += 1;
      });
      
      const filteredExpenses = expenses.filter(e => e.date?.startsWith(selectedMonth));
      filteredExpenses.forEach(exp => {
        if (!dateMap[exp.date]) dateMap[exp.date] = { sales: 0, profit: 0, bills: 0 };
        dateMap[exp.date].expenses = (dateMap[exp.date].expenses || 0) + (exp.amount || 0);
      });

      rows.push(["Date", "Bills", "Sales", "Profit", "Expenses", "Net"]);
      Object.keys(dateMap).sort().forEach(date => {
        const d = dateMap[date];
        const net = (d.sales || 0) - (d.expenses || 0);
        rows.push([date, d.bills || 0, d.sales || 0, d.profit || 0, d.expenses || 0, net]);
      });
      
      rows.push([]);
      rows.push(["MONTHLY SUMMARY", ""]);
      rows.push(["Total Sales", summaryStats.totalSales]);
      rows.push(["Total Profit", summaryStats.totalProfit]);
      rows.push(["Total Expenses", summaryStats.totalExpenses]);
      rows.push(["Net", summaryStats.totalSales - summaryStats.totalExpenses]);
      
      filename = `vijayapathi_monthly_report_${selectedMonth}.xlsx`;
    }

    exportToExcel(filename, rows, "Report");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-sub">INSIGHTS</div>
          <h1 className="page-title">Analytics</h1>
        </div>
        <button className="btn-primary download-btn" onClick={downloadReport}>
          📥 DOWNLOAD REPORT
        </button>
      </div>

      {/* Mode toggle + date picker */}
      <div className="analytics-controls">
        <div className="analytics-mode-tabs">
          <button
            className={`cat-tab ${mode === "daily" ? "active" : ""}`}
            onClick={() => setMode("daily")}
          >DAILY</button>
          <button
            className={`cat-tab ${mode === "monthly" ? "active" : ""}`}
            onClick={() => setMode("monthly")}
          >MONTHLY</button>
        </div>
        <div className="analytics-date-input">
          {mode === "daily" ? (
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
            />
          ) : (
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
            />
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="analytics-summary-row">
        <div className="analytics-summary-item">
          <div className="analytics-summary-label">SALES</div>
          <div className="analytics-summary-val orange">₹{summaryStats.totalSales.toLocaleString()}</div>
        </div>
        <div className="analytics-summary-item">
          <div className="analytics-summary-label">PROFIT</div>
          <div className="analytics-summary-val green">₹{summaryStats.totalProfit.toLocaleString()}</div>
        </div>
        <div className="analytics-summary-item">
          <div className="analytics-summary-label">EXPENSES</div>
          <div className="analytics-summary-val red">₹{summaryStats.totalExpenses.toLocaleString()}</div>
        </div>
        <div className="analytics-summary-item">
          <div className="analytics-summary-label">BILLS</div>
          <div className="analytics-summary-val">{summaryStats.billCount}</div>
        </div>
      </div>

      <div className="analytics-grid">
        {/* Top Selling by Volume */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Top Selling Products</span>
            <span className="analytics-by-label">BY VOLUME</span>
          </div>
          <div className="horiz-bar-chart">
            {topByVolume.map((p, i) => (
              <div key={i} className="h-bar-row">
                <div className="h-bar-label">{p.name}</div>
                <div className="h-bar-track">
                  <div
                    className="h-bar-fill orange"
                    style={{ width: `${(p.qty / maxVol) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="analytics-list">
            {topByVolume.slice(0, 5).map((p, i) => (
              <div key={i} className="analytics-list-item">
                <span className="rank">#{i + 1}</span>
                <span className="prod-name">{p.name}</span>
                <span className="prod-stat"><strong>{p.qty} sold</strong></span>
              </div>
            ))}
          </div>
        </div>

        {/* Most Profitable */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <span className="analytics-card-title">Most Profitable</span>
            <span className="analytics-by-label green">₹ PROFIT</span>
          </div>
          <div className="horiz-bar-chart">
            {topByProfit.map((p, i) => (
              <div key={i} className="h-bar-row">
                <div className="h-bar-label">{p.name}</div>
                <div className="h-bar-track">
                  <div
                    className="h-bar-fill green"
                    style={{ width: `${(p.profit / maxProfit) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="analytics-list">
            {topByProfit.slice(0, 5).map((p, i) => (
              <div key={i} className="analytics-list-item">
                <span className="rank">#{i + 1}</span>
                <span className="prod-name">{p.name}</span>
                <span className="prod-stat green"><strong>₹{p.profit.toLocaleString()}</strong></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {productStats.length === 0 && (
        <div className="empty-state">No sales data for this period. Complete some sales to see analytics.</div>
      )}
    </div>
  );
}
