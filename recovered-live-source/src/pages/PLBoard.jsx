import React, { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { exportToExcel } from "../utils";

export default function PLBoard() {
  const { sales, expenses } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Filter sales and expenses for the selected month
  const monthlySales = useMemo(() => {
    return sales.filter(s => s.date?.startsWith(selectedMonth));
  }, [sales, selectedMonth]);

  const monthlyExpenses = useMemo(() => {
    return expenses.filter(e => e.date?.startsWith(selectedMonth));
  }, [expenses, selectedMonth]);

  // Dynamic P&L Calculation
  const plSummary = useMemo(() => {
    let grossRevenue = 0;
    let cogs = 0;
    
    // Process Sales & COGS
    monthlySales.forEach(s => {
      grossRevenue += s.subtotal - (s.discount || 0); // Sales value before commission adjustments
      
      s.items?.forEach(item => {
        const pPrice = parseFloat(item.purchasePrice) || 0;
        const qty = parseFloat(item.qty) || 0;
        cogs += pPrice * qty; // Total purchase cost of the items sold
      });
    });

    const grossProfit = grossRevenue - cogs;
    
    // Process Operating Expenses
    const totalExpenses = monthlyExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const netProfit = grossProfit - totalExpenses;

    const grossProfitMargin = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;
    const netProfitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

    return {
      grossRevenue,
      cogs,
      grossProfit,
      totalExpenses,
      netProfit,
      grossProfitMargin,
      netProfitMargin
    };
  }, [monthlySales, monthlyExpenses]);

  // Export P&L Ledger to Excel
  const handleExportPL = () => {
    const periodName = new Date(selectedMonth + "-02").toLocaleString("en-IN", { month: "long", year: "numeric" });
    const rows = [
      ["VIJAYAPATHI TRADERS - PROFIT & LOSS STATEMENT"],
      ["Reporting Period: " + periodName],
      [],
      ["FINANCIAL ACCOUNT CATEGORY", "VALUE (₹)"],
      ["-------------------------------------------------", ""],
      ["Operating Revenue", ""],
      ["  Gross Sales Revenue", plSummary.grossRevenue],
      ["Less: Cost of Sales", ""],
      ["  Cost of Goods Sold (COGS)", -plSummary.cogs],
      ["-------------------------------------------------", ""],
      ["GROSS PROFIT", plSummary.grossProfit],
      ["  Gross Margin (%)", `${plSummary.grossProfitMargin.toFixed(1)}%`],
      ["-------------------------------------------------", ""],
      ["Operating Expenses", ""],
      ...monthlyExpenses.map(e => ["  Expense: " + e.reason, -parseFloat(e.amount)]),
      ["  Total Operating Expenses", -plSummary.totalExpenses],
      ["-------------------------------------------------", ""],
      ["NET OPERATING PROFIT", plSummary.netProfit],
      ["  Net Profit Margin (%)", `${plSummary.netProfitMargin.toFixed(1)}%`],
      ["-------------------------------------------------", ""]
    ];

    exportToExcel(`profit_and_loss_${selectedMonth}.xlsx`, rows, "P&L_Statement");
    alert("Profit & Loss sheet downloaded successfully!");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-sub">BUSINESS PERFORMANCE</div>
          <h1 className="page-title">Profit & Loss Sheet</h1>
        </div>
        <button className="btn-primary" style={{ background: "#2563eb" }} onClick={handleExportPL}>
          📥 EXPORT P&L REPORT
        </button>
      </div>

      <div className="analytics-controls">
        <div className="analytics-date-input">
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          />
        </div>
        <div style={{ fontSize: "14px", fontWeight: "800", color: "#888" }}>
          Statement Period: {new Date(selectedMonth + "-02").toLocaleString("en-IN", { month: "long", year: "numeric" }).toUpperCase()}
        </div>
      </div>

      {/* Net Profit Summary Panel */}
      <div className="expenses-summary" style={{ 
        background: plSummary.netProfit > 0 ? "rgba(0, 201, 167, 0.08)" : "rgba(255, 71, 87, 0.08)",
        border: plSummary.netProfit > 0 ? "1px solid rgba(0, 201, 167, 0.2)" : "1px solid rgba(255, 71, 87, 0.2)"
      }}>
        <div className="summary-label">NET PROFIT FOR THE PERIOD</div>
        <div className="summary-total" style={{ color: plSummary.netProfit > 0 ? "#00c9a7" : "#ff4757" }}>
          ₹{plSummary.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="entries-count">
          {plSummary.netProfit > 0 
            ? `🎉 Profit Margin is positive at ${plSummary.netProfitMargin.toFixed(1)}%` 
            : `⚠️ Operating at a net loss of ${Math.abs(plSummary.netProfitMargin).toFixed(1)}%`}
        </div>
      </div>

      <div className="table-container" style={{ padding: "20px", background: "rgba(255,255,255,0.01)" }}>
        <h2 style={{ fontSize: "18px", fontWeight: "800", marginBottom: "15px", borderBottom: "1.5px solid rgba(255,255,255,0.1)", paddingBottom: "10px" }}>
          📋 Profit & Loss Account Ledger
        </h2>
        
        <table className="data-table" style={{ fontSize: "14px", borderCollapse: "collapse" }}>
          <tbody>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              <td><strong>Operating Revenue</strong></td>
              <td></td>
            </tr>
            <tr>
              <td style={{ paddingLeft: "30px", color: "#aaa" }}>Gross Sales Revenue (excluding commissions)</td>
              <td style={{ textAlign: "right", color: "#00c9a7", fontWeight: "bold" }}>₹{plSummary.grossRevenue.toLocaleString()}</td>
            </tr>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              <td><strong>Cost of Goods Sold (COGS)</strong></td>
              <td></td>
            </tr>
            <tr>
              <td style={{ paddingLeft: "30px", color: "#aaa" }}>Purchase Cost of Inventory Sold</td>
              <td style={{ textAlign: "right", color: "#ff4757" }}>-₹{plSummary.cogs.toLocaleString()}</td>
            </tr>
            <tr style={{ borderTop: "2px solid rgba(255,255,255,0.15)", borderBottom: "2px solid rgba(255,255,255,0.15)", background: "rgba(37, 99, 235, 0.05)" }}>
              <td><strong>GROSS OPERATING PROFIT</strong></td>
              <td style={{ textAlign: "right", fontWeight: "bold", color: "#2563eb", fontSize: "16px" }}>
                ₹{plSummary.grossProfit.toLocaleString()} ({plSummary.grossProfitMargin.toFixed(1)}%)
              </td>
            </tr>
            
            <tr style={{ height: "15px" }}><td colSpan="2"></td></tr>

            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              <td><strong>Operating Expenses</strong></td>
              <td></td>
            </tr>
            {monthlyExpenses.map((exp, idx) => (
              <tr key={idx}>
                <td style={{ paddingLeft: "30px", color: "#aaa" }}>💼 Expense: {exp.reason} ({exp.date})</td>
                <td style={{ textAlign: "right", color: "#ff4757" }}>-₹{(parseFloat(exp.amount) || 0).toLocaleString()}</td>
              </tr>
            ))}
            {monthlyExpenses.length === 0 && (
              <tr>
                <td style={{ paddingLeft: "30px", color: "#888", fontStyle: "italic" }}>No operating expenses recorded this month.</td>
                <td style={{ textAlign: "right", color: "#aaa" }}>₹0</td>
              </tr>
            )}
            <tr style={{ borderTop: "1.5px solid rgba(255,255,255,0.1)" }}>
              <td style={{ paddingLeft: "30px" }}><strong>Total Operating Expenses</strong></td>
              <td style={{ textAlign: "right", color: "#ff4757", fontWeight: "bold" }}>-₹{plSummary.totalExpenses.toLocaleString()}</td>
            </tr>

            <tr style={{ height: "20px" }}><td colSpan="2"></td></tr>

            <tr style={{ borderTop: "2.5px double rgba(255,255,255,0.25)", borderBottom: "2.5px double rgba(255,255,255,0.25)", background: "rgba(0, 201, 167, 0.08)" }}>
              <td><strong style={{ fontSize: "18px" }}>NET OPERATING PROFIT</strong></td>
              <td style={{ textAlign: "right", fontWeight: "bold", color: "#00c9a7", fontSize: "18px" }}>
                ₹{plSummary.netProfit.toLocaleString()} ({plSummary.netProfitMargin.toFixed(1)}%)
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ height: "40px" }} />
    </div>
  );
}
