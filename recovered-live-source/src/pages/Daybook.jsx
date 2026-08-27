import React, { useState, useMemo, useRef } from "react";
import { useApp } from "../AppContext";
import { exportToExcel } from "../utils";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function Daybook() {
  const { 
    sales, expenses, daySessions, dailyReports, setEditingSale, addAuditLog,
    openDay, closeDay, reopenDay, userRole
  } = useApp();
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [viewingReport, setViewingReport] = useState(null);
  const [expandedBill, setExpandedBill] = useState(null);
  const [viewingBill, setViewingBill] = useState(null);
  const receiptRef = useRef(null);

  // Cash Register states
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [physicalCashInput, setPhysicalCashInput] = useState("");
  const [sessionSaving, setSessionSaving] = useState(false);

  const viewingBillWithRoundOff = useMemo(() => {
    if (!viewingBill) return null;
    const roundedTotal = Math.round(viewingBill.total);
    const roundOff = roundedTotal - viewingBill.total;
    return { ...viewingBill, roundedTotal, roundOff };
  }, [viewingBill]);

  const handlePrint = () => {
    if (!receiptRef.current) return;
    const printWindow = window.open("", "_blank", "width=800,height=600");
    printWindow.document.write(`
      <html>
      <head>
        <title>Receipt - VIJAYAPATHI TRADERS</title>
        <style>
          @page { size: A5 portrait; margin: 5mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #000; background: #fff; }
          .a5-container { width: 148mm; min-height: 200mm; margin: 0 auto; padding: 10mm 15mm; }
          .receipt-header { text-align: center; border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
          .receipt-header h2 { font-size: 20px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
          .receipt-header p { font-size: 12px; }
          .customer-details { border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 10px; font-size: 12px; }
          .table-container { min-height: 150px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 12px; }
          th { background: #f0f0f0; font-weight: bold; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .totals-table { margin-top: 10px; width: 50%; float: right; border-collapse: collapse; }
          .totals-table td { border: none; padding: 4px 8px; font-size: 12px; border-bottom: 1px solid #eee; }
          .totals-table tr:last-child td { border-bottom: none; font-weight: bold; font-size: 14px; border-top: 1px solid #000; }
          .clearfix::after { content: ""; clear: both; display: table; }
          .receipt-footer { text-align: center; margin-top: 30px; border-top: 1px solid #000; padding-top: 10px; font-size: 11px; font-weight: bold; }
          .tagline { margin-top: 8px; font-size: 12px; text-transform: uppercase; text-decoration: underline; }
        </style>
      </head>
      <body>
        ${receiptRef.current.innerHTML}
        <script>window.onload = function() { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadPDF = async () => {
    if (!receiptRef.current) return;
    try {
      const canvas = await html2canvas(receiptRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdfWidth = 148;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Bill_${viewingBill.date}_${viewingBill.customerName || "Customer"}.pdf`);
    } catch (err) {
      console.error(err);
      alert("PDF Error");
    }
  };

  const handleWhatsApp = async (resultObj = viewingBillWithRoundOff) => {
    if (!resultObj) return;
    
    const existingPhone = resultObj.customerPhone ? resultObj.customerPhone.replace(/\D/g, "") : "";
    const enteredPhone = window.prompt("Confirm or enter customer WhatsApp number:", existingPhone);
    
    if (!enteredPhone) return;
    const phone = enteredPhone.replace(/\D/g, "");

    const isCredit = resultObj.paymentMethod === "CREDIT";
    
    // Header
    const header = isCredit 
      ? "📝 *VIJAYAPATHI TRADERS - CREDIT LEDGER NOTE*" 
      : "💐 *VIJAYAPATHI TRADERS - BILL RECEIPT*";

    // Itemized list
    const items = resultObj.items.map((i, idx) => {
      const rateStr = parseFloat(i.sellingPrice).toFixed(2);
      const totalStr = (i.sellingPrice * i.qty).toFixed(2);
      return `• *${i.name}*\n  Qty: ${i.qty} ${i.unit || "Nos"} × ₹${rateStr} = *₹${totalStr}*`;
    }).join("\n\n");
    
    // GST Details
    const gstInfo = resultObj.isGstBill 
      ? `\n• GST Tax (Inc): ₹${parseFloat(resultObj.totalGst || 0).toFixed(2)}\n  (CGST: ₹${parseFloat(resultObj.cgst || 0).toFixed(2)} | SGST: ₹${parseFloat(resultObj.sgst || 0).toFixed(2)})` 
      : "";

    // Project Site
    const siteInfo = resultObj.siteName ? `\n🏡 *Project Site:* ${resultObj.siteName}` : "";

    // Compile clean draft
    const msg = `
${header}
------------------------------
👤 *Customer:* ${resultObj.customerName || "Valued Customer"}
📱 *Phone:* ${resultObj.customerPhone || "-"}${siteInfo}
📅 *Date:* ${resultObj.date}
------------------------------
🛒 *ITEMS BILLED:*

${items}

------------------------------
💰 *BILL SUMMARY:*
• Subtotal: ₹${parseFloat(resultObj.subtotal || resultObj.total).toFixed(2)}
• Discount: -₹${parseFloat(resultObj.discount || 0).toFixed(2)}${gstInfo}

💵 *GRAND TOTAL: ₹${resultObj.roundedTotal || Math.round(resultObj.total)}*
💳 *Status:* ${isCredit ? "Notebook CREDIT (UNPAID)" : "PAID (CASH/UPI) - THANK YOU"}
------------------------------
✨ _Thank you for choosing Vijayapathi Traders! For any queries, contact us at +91 94432 55677._ ✨
    `.trim();

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  };

  const daySales = useMemo(() =>
    sales.filter(s => s.date === selectedDate).sort((a, b) => (b.time || "").localeCompare(a.time || "")),
    [sales, selectedDate]);

  const dayExpenses = useMemo(() =>
    expenses.filter(e => e.date === selectedDate),
    [expenses, selectedDate]);

  const daySession = useMemo(() =>
    daySessions.find(s => s.date === selectedDate),
    [daySessions, selectedDate]);

  const dayReport = useMemo(() =>
    dailyReports.find(r => r.date === selectedDate),
    [dailyReports, selectedDate]);

  const cashSales = useMemo(() => 
    daySales.filter(s => s.paymentMethod === "CASH").reduce((sum, s) => sum + (s.total || 0), 0),
    [daySales]);
  const upiSales = useMemo(() => 
    daySales.filter(s => s.paymentMethod === "UPI").reduce((sum, s) => sum + (s.total || 0), 0),
    [daySales]);

  const totalSales = daySales.reduce((sum, s) => sum + (s.total || 0), 0);
  const totalProfit = daySales.reduce((sum, s) => sum + (s.profit || 0), 0);
  const totalExpenses = dayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const formattedDate = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  const goDay = (offset) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + offset);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  // Session managers
  const handleOpenSession = async () => {
    const opening = parseFloat(openingCashInput) || 0;
    setSessionSaving(true);
    try {
      await openDay(selectedDate, opening);
      await addAuditLog("OPEN_SESSION", `Opened cash register for ${selectedDate} with starting ₹${opening}`);
      alert("Daily register started successfully!");
      setOpeningCashInput("");
    } catch(err) {
      alert("Error starting register: " + err.message);
    } finally {
      setSessionSaving(false);
    }
  };

  const handleCloseSession = async () => {
    if (!physicalCashInput) {
      alert("Please enter the actual physical cash counted in your drawer.");
      return;
    }
    const actual = parseFloat(physicalCashInput) || 0;
    const expected = (daySession?.openingCash || 0) + cashSales - totalExpenses;
    const mismatch = actual - expected;

    const reportData = {
      date: selectedDate,
      openingCash: daySession?.openingCash || 0,
      cashSales,
      upiSales,
      expenses: totalExpenses,
      totalProfit,
      systemClosingCash: expected,
      actualClosingCash: actual,
      mismatch
    };

    setSessionSaving(true);
    try {
      await closeDay(daySession.id, actual, reportData);
      await addAuditLog("CLOSE_SESSION", `Closed register for ${selectedDate}. Cash mismatch: ₹${mismatch}`);
      alert("Daily register closed and reconciled!");
      setPhysicalCashInput("");
    } catch(err) {
      alert("Error closing register: " + err.message);
    } finally {
      setSessionSaving(false);
    }
  };

  const handleReopenSession = async () => {
    if (!confirm("⚠️ Are you sure you want to RE-OPEN this cash register? This will wipe the closing balance log until you re-reconcile.")) return;
    setSessionSaving(true);
    try {
      await reopenDay(daySession.id);
      await addAuditLog("REOPEN_SESSION", `Reopened cash register for ${selectedDate}`);
      alert("Register re-opened successfully!");
    } catch(err) {
      alert("Error reopening register: " + err.message);
    } finally {
      setSessionSaving(false);
    }
  };

  const exportDaybook = () => {
    const rows = [["Type", "Time", "Reason/Customer", "Amount (₹)", "Payment Method", "Commission %", "Commission (₹)"]];
    
    // Add Sales
    daySales.forEach(s => {
      rows.push(["SALE", s.time || "", s.customerName || "Walk-in", s.total || 0, s.paymentMethod, s.commissionPercent || 0, s.commissionAmount || 0]);
    });
    
    // Add Expenses
    dayExpenses.forEach(e => {
      rows.push(["EXPENSE", "", e.reason, e.amount || 0, "CASH", "", ""]);
    });

    // Add empty row separator
    rows.push([]);
    rows.push(["SUMMARY", "", "", "", "", "", ""]);
    rows.push(["TOTAL SALES", "", "", totalSales, "", "", ""]);
    rows.push(["TOTAL EXPENSES", "", "", totalExpenses, "", "", ""]);
    rows.push(["NET CHANGE", "", "", totalSales - totalExpenses, "", "", ""]);
    rows.push(["PROFIT", "", "", totalProfit, "", "", ""]);

    exportToExcel(`daybook_${selectedDate}.xlsx`, rows, "Daybook");
  };

  const handlePrintReport = (report) => {
    const printWindow = window.open("", "_blank", "width=800,height=600");
    printWindow.document.write(`
      <html>
      <head>
        <title>Daily Closing Report - VIJAYAPATHI TRADERS</title>
        <style>
          body { font-family: sans-serif; padding: 40px; color: #333; }
          .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { color: #2563eb; margin: 0; }
          .date { font-size: 1.2rem; color: #666; margin-top: 5px; }
          .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .summary-item { padding: 15px; background: #f9f9f9; border-radius: 8px; }
          .label { font-size: 0.9rem; color: #777; text-transform: uppercase; }
          .value { font-size: 1.4rem; font-weight: bold; margin-top: 5px; }
          .mismatch { margin-top: 20px; padding: 20px; border-radius: 8px; text-align: center; font-size: 1.2rem; font-weight: bold; }
          .mismatch.ok { background: #e8f5e9; color: #2e7d32; }
          .mismatch.error { background: #ffebee; color: #c62828; }
          .footer { margin-top: 50px; text-align: center; font-size: 0.8rem; color: #aaa; border-top: 1px solid #eee; paddingTop: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>VIJAYAPATHI TRADERS</h1>
          <div class="date">Daily Closing Report - ${new Date(report.date).toLocaleDateString("en-IN")}</div>
        </div>
        <div class="summary-grid">
          <div class="summary-item">
            <div class="label">Opening Cash</div>
            <div class="value">₹${report.openingCash?.toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="label">Cash Sales</div>
            <div class="value">₹${report.cashSales?.toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="label">UPI / Card Sales</div>
            <div class="value">₹${report.upiSales?.toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="label">Total Expenses</div>
            <div class="value">₹${report.expenses?.toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="label">Profit / Loss</div>
            <div class="value">₹${report.totalProfit?.toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="label">System Expected Cash</div>
            <div class="value">₹${report.systemClosingCash?.toLocaleString()}</div>
          </div>
          <div class="summary-item">
            <div class="label">Physical Cash (Actual)</div>
            <div class="value">₹${report.actualClosingCash?.toLocaleString()}</div>
          </div>
        </div>
        <div class="mismatch ${report.mismatch === 0 ? 'ok' : 'error'}">
          ${report.mismatch === 0 ? "✅ CASH MATCHED" : `⚠️ MISMATCH: ₹${report.mismatch?.toLocaleString()}`}
        </div>
        <script>window.onload = function() { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };


  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-sub">RECORDS</div>
          <h1 className="page-title">Daybook</h1>
        </div>
        <button className="btn-secondary" onClick={exportDaybook}>📥 DOWNLOAD CSV</button>
      </div>

      {/* Date Navigation */}
      <div className="daybook-date-nav">
        <button className="btn-secondary daybook-nav-btn" onClick={() => goDay(-1)}>← Prev</button>
        <div className="daybook-date-picker">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={new Date().toISOString().split("T")[0]}
          />
          <div className="daybook-date-label">{formattedDate}</div>
        </div>
        <button
          className="btn-secondary daybook-nav-btn"
          onClick={() => goDay(1)}
          disabled={selectedDate >= new Date().toISOString().split("T")[0]}
        >
          Next →
        </button>
      </div>

      {/* Day Session Status & Cash Reconciliation Drawer */}
      <div className="daybook-session-bar" style={{ display: "flex", flexDirection: "column", gap: "15px", padding: "20px", background: "var(--card-bg, #fff)", border: "1.5px solid rgba(0,0,0,0.06)", borderRadius: "10px", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "18px" }}>💰</span>
            <span style={{ fontSize: "14px", fontWeight: "800", color: "var(--text-color, #1c1917)", letterSpacing: "0.5px" }}>DAILY CASH REGISTER</span>
            {daySession ? (
              <span className={`day-status-badge ${daySession.status}`}>
                {daySession.status?.toUpperCase()}
              </span>
            ) : (
              <span className="day-status-badge closed" style={{ background: "rgba(0,0,0,0.05)", color: "#666" }}>
                NOT STARTED
              </span>
            )}
          </div>
          {daySession && daySession.status === "closed" && (
            <div style={{ display: "flex", gap: "10px" }}>
              <button 
                className="btn-primary" 
                style={{ background: "#2c3e50", padding: "6px 12px", fontSize: "11px", margin: 0, fontWeight: "800" }}
                onClick={() => {
                  if (dayReport) {
                    setViewingReport(dayReport);
                  } else {
                    alert("No detailed closing report found for this day.");
                  }
                }}
              >
                👁️ closing report
              </button>
              {userRole === "admin" && (
                <button 
                  className="btn-close-text" 
                  style={{ color: "#ff4757", border: "1.5px solid rgba(255, 71, 87, 0.2)", padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: "800", background: "rgba(255, 71, 87, 0.03)" }}
                  onClick={handleReopenSession}
                  disabled={sessionSaving}
                >
                  🔓 RE-OPEN REGISTER
                </button>
              )}
            </div>
          )}
        </div>

        {/* 1. Register Not Started State */}
        {!daySession && (
          <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap", background: "rgba(24, 18, 54, 0.02)", padding: "15px", borderRadius: "8px", border: "1px dashed rgba(24, 18, 54, 0.1)" }}>
            <div style={{ flex: 1, minWidth: "250px", fontSize: "12px", color: "#666", fontWeight: "normal" }}>
              Daybook cash register has not been initialized for this date. Enter the starting cash balance in your drawer to begin recording cash drawer reconciliations.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#666", fontWeight: "bold" }}>₹</span>
                <input 
                  type="number"
                  placeholder="Opening Cash"
                  value={openingCashInput}
                  onChange={e => setOpeningCashInput(e.target.value)}
                  style={{ width: "130px", padding: "8px 8px 8px 22px", border: "1.5px solid #ddd", borderRadius: "6px", fontSize: "13px", fontWeight: "bold" }}
                />
              </div>
              <button 
                className="btn-primary" 
                onClick={handleOpenSession}
                disabled={sessionSaving}
                style={{ background: "#2563eb", padding: "8px 16px", margin: 0, fontSize: "12px" }}
              >
                {sessionSaving ? "Starting..." : "🚀 Start Register"}
              </button>
            </div>
          </div>
        )}

        {/* 2. Register Open & Active State */}
        {daySession && daySession.status === "open" && (
          <div style={{ background: "rgba(0, 201, 167, 0.02)", padding: "16px", borderRadius: "8px", border: "1px solid rgba(0, 201, 167, 0.15)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "16px", marginBottom: "15px" }}>
              <div>
                <div style={{ fontSize: "10px", color: "#888", fontWeight: "800", textTransform: "uppercase" }}>Drawer Opening Cash</div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--text-color, #1c1917)", marginTop: "4px" }}>₹{daySession.openingCash?.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#888", fontWeight: "800", textTransform: "uppercase" }}>Total Cash Sales Today</div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "#00c9a7", marginTop: "4px" }}>+₹{cashSales.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#888", fontWeight: "800", textTransform: "uppercase" }}>Total Expenses Today</div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "#ff4757", marginTop: "4px" }}>-₹{totalExpenses.toLocaleString()}</div>
              </div>
              <div style={{ borderLeft: "1.5px dashed rgba(0,0,0,0.1)", paddingLeft: "15px" }}>
                <div style={{ fontSize: "10px", color: "#888", fontWeight: "800", textTransform: "uppercase" }}>System Expected Drawer Cash</div>
                <div style={{ fontSize: "16px", fontWeight: "900", color: "#2563eb", marginTop: "4px" }}>
                  ₹{(daySession.openingCash + cashSales - totalExpenses).toLocaleString()}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(0, 0, 0, 0.05)", paddingTop: "15px", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ fontSize: "12px", color: "#666", fontWeight: "normal", flex: 1, minWidth: "260px" }}>
                Count the actual currency in your physical cash drawer at closing, enter it below, and click the close button to verify reconciliation.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#666", fontWeight: "bold" }}>₹</span>
                  <input 
                    type="number"
                    placeholder="Physical Cash"
                    value={physicalCashInput}
                    onChange={e => setPhysicalCashInput(e.target.value)}
                    style={{ width: "130px", padding: "8px 8px 8px 22px", border: "1.5px solid #ddd", borderRadius: "6px", fontSize: "13px", fontWeight: "bold" }}
                  />
                </div>
                <button 
                  className="btn-primary" 
                  onClick={handleCloseSession}
                  disabled={sessionSaving}
                  style={{ background: "#e67e22", padding: "8px 16px", margin: 0, fontSize: "12px" }}
                >
                  {sessionSaving ? "Reconciling..." : "🔒 Close & Reconcile"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. Register Closed State Summary Banner */}
        {daySession && daySession.status === "closed" && (
          <div style={{ background: "rgba(44, 62, 80, 0.02)", padding: "16px", borderRadius: "8px", border: "1px solid rgba(44, 62, 80, 0.15)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
              <div>
                <div style={{ fontSize: "10px", color: "#888", fontWeight: "800", textTransform: "uppercase" }}>System Expected Cash</div>
                <div style={{ fontSize: "15px", fontWeight: "bold", color: "#777", marginTop: "4px" }}>
                  ₹{(daySession.openingCash + cashSales - totalExpenses).toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#888", fontWeight: "800", textTransform: "uppercase" }}>Physical Cash Counted</div>
                <div style={{ fontSize: "15px", fontWeight: "bold", color: "var(--text-color, #1c1917)", marginTop: "4px" }}>
                  ₹{daySession.closingCash?.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "10px", color: "#888", fontWeight: "800", textTransform: "uppercase" }}>Discrepancy (Reconciliation)</div>
                {(() => {
                  const expected = (daySession.openingCash || 0) + cashSales - totalExpenses;
                  const discrepancy = (daySession.closingCash || 0) - expected;
                  const isBalanced = Math.abs(discrepancy) < 0.01;
                  return (
                    <div style={{ fontSize: "15px", fontWeight: "900", color: isBalanced ? "#00c9a7" : "#ff4757", marginTop: "4px" }}>
                      {isBalanced ? "✅ BALANCED (₹0)" : `${discrepancy > 0 ? "🎉 SURPLUS: +" : "⚠️ SHORTAGE: -"}₹${Math.abs(discrepancy).toLocaleString()}`}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="daybook-summary">
        <div className="daybook-summary-card">
          <div className="daybook-summary-label">TOTAL SALES</div>
          <div className="daybook-summary-value orange">₹{totalSales.toLocaleString()}</div>
          <div className="daybook-summary-sub">{daySales.length} bills</div>
        </div>
        <div className="daybook-summary-card">
          <div className="daybook-summary-label">PROFIT</div>
          <div className="daybook-summary-value green">₹{totalProfit.toLocaleString()}</div>
        </div>
        <div className="daybook-summary-card">
          <div className="daybook-summary-label">EXPENSES</div>
          <div className="daybook-summary-value red">₹{totalExpenses.toLocaleString()}</div>
          <div className="daybook-summary-sub">{dayExpenses.length} entries</div>
        </div>
        <div className="daybook-summary-card">
          <div className="daybook-summary-label">NET</div>
          <div className="daybook-summary-value" style={{ color: (totalSales - totalExpenses) >= 0 ? "#00c9a7" : "#e74c3c" }}>
            ₹{(totalSales - totalExpenses).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="daybook-section">
        <div className="section-label">SALES / BILLS ({daySales.length})</div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>TIME</th>
                <th>CUSTOMER</th>
                <th>ITEMS</th>
                <th>PAYMENT</th>
                <th>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {daySales.map((sale, idx) => (
                <React.Fragment key={sale.id}>
                  <tr
                    className="daybook-bill-row"
                    onClick={() => setExpandedBill(expandedBill === sale.id ? null : sale.id)}
                  >
                    <td>{idx + 1}</td>
                    <td>{sale.time || "—"}</td>
                    <td>{sale.customerName || "Walk-in"}</td>
                    <td>{sale.items?.length || 0} items</td>
                    <td>
                      <span className={`pay-badge ${sale.paymentMethod?.toLowerCase()}`}>
                        {sale.paymentMethod}
                      </span>
                    </td>
                    <td><strong>₹{(sale.total || 0).toLocaleString()}</strong></td>
                  </tr>
                  {expandedBill === sale.id && (
                    <tr className="bill-detail-row">
                      <td colSpan="6">
                        <div className="bill-detail-content">
                          {sale.items?.map((item, i) => (
                            <div key={i} className="bill-detail-item">
                              <span>{item.qty}× {item.name}</span>
                              <span>₹{(item.sellingPrice * item.qty).toLocaleString()}</span>
                            </div>
                          ))}
                          {sale.discount > 0 && (
                            <div className="bill-detail-item discount-row">
                              <span>Discount</span>
                              <span>-₹{sale.discount.toLocaleString()}</span>
                            </div>
                          )}
                          {sale.commissionAmount > 0 && (
                            <div className="bill-detail-item" style={{ color: '#e74c3c' }}>
                              <span>Agent Commission ({sale.commissionPercent || 0}%)</span>
                              <span>-₹{sale.commissionAmount.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="bill-detail-item total-detail">
                            <span>Total</span>
                            <span>₹{(sale.total || 0).toLocaleString()}</span>
                          </div>
                          {sale.customerPhone && (
                            <div className="bill-detail-phone">📞 {sale.customerPhone}</div>
                          )}
                          <div style={{ marginTop: '12px', borderTop: '1px solid #eee', paddingTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn-secondary" onClick={(e) => { 
                              e.stopPropagation(); 
                              setEditingSale(sale); 
                              navigate("/billing"); 
                            }} style={{ padding: '6px 16px', fontSize: '12px', margin: 0, borderColor: '#3498db', color: '#3498db' }}>
                              ✏️ EDIT BILL
                            </button>
                            <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); setViewingBill(sale); }} style={{ padding: '6px 16px', fontSize: '12px', margin: 0 }}>
                              👁️ VIEW & PRINT BILL
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {daySales.length === 0 && (
                <tr><td colSpan="6" className="empty-row">No sales on this day.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="daybook-section" style={{ marginTop: "24px" }}>
        <div className="section-label">EXPENSES ({dayExpenses.length})</div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>REASON</th>
                <th>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {dayExpenses.map((exp, idx) => (
                <tr key={exp.id}>
                  <td>{idx + 1}</td>
                  <td>{exp.reason}</td>
                  <td><strong>₹{(exp.amount || 0).toLocaleString()}</strong></td>
                </tr>
              ))}
              {dayExpenses.length === 0 && (
                <tr><td colSpan="3" className="empty-row">No expenses on this day.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill View Modal */}
      {viewingBillWithRoundOff && (
        <div className="modal-overlay" onClick={() => setViewingBill(null)}>
          {/* ... Modal content ... */}
          <div className="modal-content" style={{ maxWidth: '650px', width: '90%', padding: '20px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" />
            <div className="sale-completed-label" style={{ marginBottom: '20px' }}>BILL PREVIEW</div>
            
            <div style={{ background: '#fff', padding: '10px' }}>
              <div ref={receiptRef} className="a5-container" style={{ margin: '0 auto', width: '100%', maxWidth: '148mm', padding: '15px', background: '#fff', color: '#000', border: '1.5px solid #000', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
                <div className="receipt-header" style={{ textAlign: 'center', borderBottom: '1.5px solid #000', paddingBottom: '10px', marginBottom: '15px' }}>
                  <h2 style={{ fontSize: "20px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px 0" }}>VIJAYAPATHI TRADERS</h2>
                  <p style={{ fontSize: "12px", margin: "2px 0" }}>{viewingBillWithRoundOff.isGstBill ? "TAX INVOICE" : "BILL OF SUPPLY"}</p>
                  <p style={{ fontSize: "11px", margin: "2px 0", color: "#444" }}>Date: {viewingBillWithRoundOff.date} &nbsp;&nbsp;|&nbsp;&nbsp; Time: {viewingBillWithRoundOff.time}</p>
                </div>

                {(viewingBillWithRoundOff.customerName || viewingBillWithRoundOff.customerPhone) && (
                  <div className="customer-details" style={{ borderBottom: "1.5px solid #000", paddingBottom: "10px", marginBottom: "15px", fontSize: "12px", lineHeight: "1.5" }}>
                    <strong>Billed To:</strong><br/>
                    {viewingBillWithRoundOff.customerName || "Walk-in Customer"}<br/>
                    {viewingBillWithRoundOff.customerPhone ? `Phone: ${viewingBillWithRoundOff.customerPhone}` : ""}
                    {viewingBillWithRoundOff.siteName && <div>🏡 Site: {viewingBillWithRoundOff.siteName}</div>}
                  </div>
                )}

                <div className="table-container" style={{ minHeight: '150px' }}>
                  <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '11px', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center', width: '35px' }}>S.No</th>
                        <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '11px', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'left' }}>Product Name</th>
                        {viewingBillWithRoundOff.isGstBill && <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '11px', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'left', width: '45px' }}>HSN</th>}
                        <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '11px', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center', width: '55px' }}>Qty</th>
                        <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '11px', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'right', width: '65px' }}>Rate (₹)</th>
                        {viewingBillWithRoundOff.isGstBill && <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '11px', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'right', width: '45px' }}>GST %</th>}
                        <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '11px', background: '#f0f0f0', fontWeight: 'bold', textAlign: 'right', width: '80px' }}>Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingBillWithRoundOff.items?.map((item, i) => (
                        <tr key={i}>
                          <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '11px', textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '11px', textAlign: 'left', fontWeight: 'bold', wordBreak: 'break-word', whiteSpace: 'normal' }}>{item.name}</td>
                          {viewingBillWithRoundOff.isGstBill && <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '11px', textAlign: 'left' }}>{item.hsnCode}</td>}
                          <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '11px', textAlign: 'center' }}>{item.qty} {item.unit || 'Nos'}</td>
                          <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '11px', textAlign: 'right' }}>{parseFloat(item.sellingPrice).toFixed(2)}</td>
                          {viewingBillWithRoundOff.isGstBill && <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '11px', textAlign: 'right' }}>{item.gstRate}%</td>}
                          <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '11px', textAlign: 'right', fontWeight: 'bold' }}>{(parseFloat(item.sellingPrice) * item.qty).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="clearfix" style={{ marginTop: '15px' }}>
                  <table style={{ width: '50%', marginLeft: 'auto', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4px 6px', fontSize: '11px', borderBottom: '1.5px solid #eee', textAlign: 'left' }}>Subtotal</td>
                        <td style={{ padding: '4px 6px', fontSize: '11px', borderBottom: '1.5px solid #eee', textAlign: 'right', fontWeight: 'bold' }}>₹{viewingBillWithRoundOff.subtotal?.toFixed(2) || viewingBillWithRoundOff.items?.reduce((sum, item) => sum + parseFloat(item.sellingPrice) * item.qty, 0).toFixed(2)}</td>
                      </tr>
                      {viewingBillWithRoundOff.discount > 0 && (
                        <tr>
                          <td style={{ padding: '4px 6px', fontSize: '11px', borderBottom: '1.5px solid #eee', textAlign: 'left' }}>Discount</td>
                          <td style={{ padding: '4px 6px', fontSize: '11px', borderBottom: '1.5px solid #eee', textAlign: 'right', color: '#e74c3c', fontWeight: 'bold' }}>-₹{viewingBillWithRoundOff.discount.toFixed(2)}</td>
                        </tr>
                      )}
                      {viewingBillWithRoundOff.isGstBill && (
                        <>
                          <tr>
                            <td style={{ padding: '4px 6px', fontSize: '11px', borderBottom: '1.5px solid #eee', textAlign: 'left' }}>CGST</td>
                            <td style={{ padding: '4px 6px', fontSize: '11px', borderBottom: '1.5px solid #eee', textAlign: 'right' }}>+₹{viewingBillWithRoundOff.cgst?.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '4px 6px', fontSize: '11px', borderBottom: '1.5px solid #eee', textAlign: 'left' }}>SGST</td>
                            <td style={{ padding: '4px 6px', fontSize: '11px', borderBottom: '1.5px solid #eee', textAlign: 'right' }}>+₹{viewingBillWithRoundOff.sgst?.toFixed(2)}</td>
                          </tr>
                        </>
                      )}
                      {viewingBillWithRoundOff.roundOff !== 0 && (
                        <tr>
                          <td style={{ padding: '4px 6px', fontSize: '11px', borderBottom: '1.5px solid #eee', textAlign: 'left' }}>Round Off</td>
                          <td style={{ padding: '4px 6px', fontSize: '11px', borderBottom: '1.5px solid #eee', textAlign: 'right' }}>{viewingBillWithRoundOff.roundOff > 0 ? "+" : ""}₹{viewingBillWithRoundOff.roundOff.toFixed(2)}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ padding: '6px 6px', fontSize: '13px', fontWeight: 'bold', borderTop: '1.5px solid #000', borderBottom: '2px double #000', textAlign: 'left' }}>Grand Total</td>
                        <td style={{ padding: '6px 6px', fontSize: '13px', fontWeight: 'bold', borderTop: '1.5px solid #000', borderBottom: '2px double #000', textAlign: 'right', color: '#2563eb' }}>₹{viewingBillWithRoundOff.roundedTotal?.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="receipt-footer" style={{ textAlign: 'center', marginTop: '30px', borderTop: '1.5px solid #000', paddingTop: '10px', fontSize: '11px' }}>
                  <p style={{ margin: "2px 0", fontWeight: "bold" }}>Payment Mode: {viewingBillWithRoundOff.paymentMethod}</p>
                  <p style={{ margin: "2px 0" }}>Thank you for your business!</p>
                  <p className="tagline" style={{ margin: "6px 0 0 0", fontSize: "11px", textTransform: "uppercase", textDecoration: "underline", fontWeight: "bold" }}>NO RETURN{viewingBillWithRoundOff.paymentMethod === "CREDIT" ? "" : ", NO CREDIT"}</p>
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '30px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button className="btn-print" onClick={handlePrint} style={{ padding: '12px', background: '#2c3e50', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                🖨️ PRINT
              </button>
              <button className="btn-whatsapp" onClick={() => handleWhatsApp()} style={{ padding: '12px', background: '#25D366', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                💬 WHATSAPP
              </button>
              <button className="btn-print" onClick={handleDownloadPDF} style={{ padding: '12px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                📥 PDF
              </button>
              <button className="btn-secondary" onClick={() => setViewingBill(null)} style={{ padding: '12px', border: '1px solid #ccc', background: 'transparent', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report View Modal */}
      {viewingReport && (
        <div className="modal-overlay" onClick={() => setViewingReport(null)}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" />
            <div className="page-sub">DAILY REPORT</div>
            <h2 className="page-title">{new Date(viewingReport.date).toLocaleDateString("en-IN", { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
            
            <div className="report-summary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', margin: '20px 0' }}>
              <div className="report-item">
                <label>Opening Cash</label>
                <div className="val">₹{viewingReport.openingCash?.toLocaleString()}</div>
              </div>
              <div className="report-item">
                <label>Cash Sales</label>
                <div className="val green">+₹{viewingReport.cashSales?.toLocaleString()}</div>
              </div>
              <div className="report-item">
                <label>UPI Sales</label>
                <div className="val blue">₹{viewingReport.upiSales?.toLocaleString()}</div>
              </div>
              <div className="report-item">
                <label>Expenses</label>
                <div className="val red">-₹{viewingReport.expenses?.toLocaleString()}</div>
              </div>
              <div className="report-item">
                <label>Expected Cash</label>
                <div className="val">₹{viewingReport.systemClosingCash?.toLocaleString()}</div>
              </div>
              <div className="report-item">
                <label>Physical Cash</label>
                <div className="val">₹{viewingReport.actualClosingCash?.toLocaleString()}</div>
              </div>
            </div>

            <div style={{ 
              padding: '12px', 
              borderRadius: '6px', 
              background: viewingReport.mismatch === 0 ? '#e8f5e9' : '#fff3e0',
              color: viewingReport.mismatch === 0 ? '#2e7d32' : '#e65100',
              fontWeight: 'bold',
              textAlign: 'center',
              marginBottom: '20px'
            }}>
              {viewingReport.mismatch === 0 ? "✅ CASH MATCHED" : `⚠️ MISMATCH: ₹${viewingReport.mismatch?.toLocaleString()}`}
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-primary" onClick={() => handlePrintReport(viewingReport)} style={{ flex: 1 }}>
                🖨️ PRINT REPORT
              </button>
              <button className="btn-secondary" onClick={() => setViewingReport(null)} style={{ flex: 1 }}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
