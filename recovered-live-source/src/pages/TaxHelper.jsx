import React, { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { exportToExcel } from "../utils";

export default function TaxHelper() {
  const { sales, purchases } = useApp();
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

  // Filter sales and purchases for the selected month
  const monthlySales = useMemo(() => {
    return sales.filter(s => s.date?.startsWith(selectedMonth));
  }, [sales, selectedMonth]);

  const monthlyPurchases = useMemo(() => {
    return purchases.filter(p => p.date?.startsWith(selectedMonth));
  }, [purchases, selectedMonth]);

  // Aggregate Tax Statistics
  const taxSummary = useMemo(() => {
    let salesTaxableVal = 0;
    let salesCgst = 0;
    let salesSgst = 0;
    let salesIgst = 0;
    let salesTotalGst = 0;

    // Process Sales (Output Tax Liability)
    monthlySales.forEach(s => {
      if (s.isGstBill) {
        const totalTax = s.totalGst || 0;
        salesTotalGst += totalTax;
        
        if (s.igst > 0) {
          salesIgst += s.igst;
        } else {
          salesCgst += s.cgst || (totalTax / 2);
          salesSgst += s.sgst || (totalTax / 2);
        }
        
        salesTaxableVal += s.subtotal - (s.discount || 0);
      }
    });

    // Process Purchases (Input Tax Credit - ITC)
    let purchaseTaxableVal = 0;
    let purchaseTotalGst = 0;
    let purchaseCgst = 0;
    let purchaseSgst = 0;
    let purchaseIgst = 0;

    monthlyPurchases.forEach(p => {
      // Calculate GST paid on purchase items
      let billGst = 0;
      let billTaxable = 0;
      
      p.items?.forEach(item => {
        const rate = parseFloat(item.gstRate) || 18; // Default 18% if not specified
        const cost = parseFloat(item.purchasePrice) || 0;
        const qty = parseInt(item.qty) || 0;
        const itemTaxable = cost * qty;
        const itemGst = itemTaxable * (rate / 100);
        
        billTaxable += itemTaxable;
        billGst += itemGst;
      });

      purchaseTaxableVal += billTaxable;
      purchaseTotalGst += billGst;
      
      // Assume local supply (CGST/SGST split) unless interstate supplier
      purchaseCgst += billGst / 2;
      purchaseSgst += billGst / 2;
    });

    const netGstPayable = salesTotalGst - purchaseTotalGst;

    return {
      salesTaxableVal,
      salesCgst,
      salesSgst,
      salesIgst,
      salesTotalGst,
      purchaseTaxableVal,
      purchaseCgst,
      purchaseSgst,
      purchaseIgst,
      purchaseTotalGst,
      netGstPayable
    };
  }, [monthlySales, monthlyPurchases]);

  // Export GSTR-1 Sales Data to Excel
  const handleExportGSTR1 = () => {
    const b2bRows = [["GSTIN/UIN of Recipient", "Receiver Name", "Invoice Number", "Invoice Date", "Invoice Value (₹)", "Place Of Supply", "Taxable Value (₹)", "Integrated Tax (₹)", "Central Tax (₹)", "State/UT Tax (₹)"]];
    const b2csRows = [["Type", "Place Of Supply", "Taxable Value (₹)", "Rate (%)", "Integrated Tax (₹)", "Central Tax (₹)", "State/UT Tax (₹)"]];
    
    let invoiceCount = 0;
    monthlySales.forEach(s => {
      if (s.isGstBill) {
        invoiceCount++;
        const taxable = s.subtotal - (s.discount || 0);
        const receiverName = s.customerName || "Walk-in Customer";
        
        if (s.customerGstin) {
          // B2B Sales
          b2bRows.push([
            s.customerGstin,
            receiverName,
            s.id.slice(-6).toUpperCase(), // simple invoice code
            s.date,
            s.total,
            s.placeOfSupply || "TAMIL NADU",
            taxable,
            s.igst || 0,
            s.cgst || (s.totalGst / 2),
            s.sgst || (s.totalGst / 2)
          ]);
        } else {
          // B2C Small Sales grouped
          b2csRows.push([
            "OE (Other than E-Commerce)",
            s.placeOfSupply || "TAMIL NADU",
            taxable,
            18, // Assume average GST rate
            s.igst || 0,
            s.cgst || (s.totalGst / 2),
            s.sgst || (s.totalGst / 2)
          ]);
        }
      }
    });

    if (invoiceCount === 0) {
      alert("No GST Tax Invoices found in this month to export.");
      return;
    }

    const wsData = [
      ["GSTR-1 SALES TAX REPORT - " + selectedMonth],
      [],
      ["B2B INVOICES (Sales to Registered Taxpayers)"],
      ...b2bRows,
      [],
      ["B2CS INVOICES (Sales to Consumer / Unregistered)"],
      ...b2csRows
    ];

    exportToExcel(`gstr1_report_${selectedMonth}.xlsx`, wsData, "GSTR-1");
    alert(`Successfully generated GSTR-1 Excel for ${invoiceCount} invoices!`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-sub">COMPLIANCE & TAXATION</div>
          <h1 className="page-title">GSTR Return Ledger</h1>
        </div>
        <button className="btn-primary" style={{ background: "#1b8a5a" }} onClick={handleExportGSTR1}>
          📥 DOWNLOAD GSTR-1 EXCEL
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
          Reporting Period: {new Date(selectedMonth + "-02").toLocaleString("en-IN", { month: "long", year: "numeric" }).toUpperCase()}
        </div>
      </div>

      {/* Tax Payable Summary Card */}
      <div className="expenses-summary" style={{ 
        background: taxSummary.netGstPayable > 0 ? "rgba(255, 71, 87, 0.08)" : "rgba(0, 201, 167, 0.08)",
        border: taxSummary.netGstPayable > 0 ? "1px solid rgba(255, 71, 87, 0.2)" : "1px solid rgba(0, 201, 167, 0.2)"
      }}>
        <div className="summary-label">ESTIMATED NET GST {taxSummary.netGstPayable > 0 ? "PAYABLE" : "CARRY FORWARD"}</div>
        <div className="summary-total" style={{ color: taxSummary.netGstPayable > 0 ? "#ff4757" : "#00c9a7" }}>
          ₹{Math.abs(taxSummary.netGstPayable).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className="entries-count">
          {taxSummary.netGstPayable > 0 
            ? "⚠️ Output Liability exceeds Input Credit" 
            : "🎉 Excess Input Credit — Carry forward as credit"}
        </div>
      </div>

      <div className="analytics-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        
        {/* Output Tax - Sales */}
        <div className="analytics-card">
          <div className="analytics-card-header" style={{ borderBottom: "1.5px dashed rgba(255,255,255,0.1)", paddingBottom: "12px", marginBottom: "15px" }}>
            <span className="analytics-card-title">💵 Output Tax (Sales Revenue)</span>
            <span className="analytics-by-label" style={{ color: "#2563eb" }}>LIABILITY</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
              <span>Total Taxable Value (Net Sales)</span>
              <strong>₹{taxSummary.salesTaxableVal.toLocaleString()}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", borderBottom: "1px solid rgba(120, 113, 108, 0.1)", paddingBottom: "6px" }}>
              <span>CGST Collected</span>
              <strong style={{ color: "#aaa" }}>₹{taxSummary.salesCgst.toLocaleString()}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", borderBottom: "1px solid rgba(120, 113, 108, 0.1)", paddingBottom: "6px" }}>
              <span>SGST Collected</span>
              <strong style={{ color: "#aaa" }}>₹{taxSummary.salesSgst.toLocaleString()}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", borderBottom: "1px solid rgba(120, 113, 108, 0.1)", paddingBottom: "6px" }}>
              <span>IGST Collected</span>
              <strong style={{ color: "#aaa" }}>₹{taxSummary.salesIgst.toLocaleString()}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: "bold", marginTop: "10px" }}>
              <span style={{ color: "#2563eb" }}>Total Output Tax Collected</span>
              <span style={{ color: "#2563eb" }}>₹{taxSummary.salesTotalGst.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Input Tax Credit - Purchases */}
        <div className="analytics-card">
          <div className="analytics-card-header" style={{ borderBottom: "1.5px dashed rgba(255,255,255,0.1)", paddingBottom: "12px", marginBottom: "15px" }}>
            <span className="analytics-card-title">🚚 Input Tax Credit (ITC - Purchases)</span>
            <span className="analytics-by-label green">CREDIT</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
              <span>Total Taxable Value (Purchases)</span>
              <strong>₹{taxSummary.purchaseTaxableVal.toLocaleString()}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", borderBottom: "1px solid rgba(120, 113, 108, 0.1)", paddingBottom: "6px" }}>
              <span>CGST Paid</span>
              <strong style={{ color: "#aaa" }}>₹{taxSummary.purchaseCgst.toLocaleString()}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", borderBottom: "1px solid rgba(120, 113, 108, 0.1)", paddingBottom: "6px" }}>
              <span>SGST Paid</span>
              <strong style={{ color: "#aaa" }}>₹{taxSummary.purchaseSgst.toLocaleString()}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", borderBottom: "1px solid rgba(120, 113, 108, 0.1)", paddingBottom: "6px" }}>
              <span>IGST Paid</span>
              <strong style={{ color: "#aaa" }}>₹{taxSummary.purchaseIgst.toLocaleString()}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: "bold", marginTop: "10px" }}>
              <span style={{ color: "#00c9a7" }}>Total Input Credit Claimable</span>
              <span style={{ color: "#00c9a7" }}>₹{taxSummary.purchaseTotalGst.toLocaleString()}</span>
            </div>
          </div>
        </div>

      </div>

      <div style={{ height: "40px" }} />
    </div>
  );
}
