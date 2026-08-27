import React from "react";

/**
 * Unified Standard A5 Bill / Tax Invoice Receipt Template for Vijayapathi Traders
 * Clean A5 format: No logo, no phone number, no "(DRAFT PREVIEW)" text.
 */
const ReceiptTemplate = React.forwardRef(({ sale }, ref) => {
  if (!sale) return null;

  const isGst = sale.isGstBill || false;
  const items = sale.items || [];

  const rawSubtotal = sale.subtotal !== undefined 
    ? sale.subtotal 
    : items.reduce((sum, i) => sum + (parseFloat(i.sellingPrice) || 0) * (parseFloat(i.qty) || 0), 0);

  const discountAmt = parseFloat(sale.discount) || 0;
  const totalGstAmt = parseFloat(sale.totalGst) || 0;
  const cgstAmt = parseFloat(sale.cgst) || (totalGstAmt / 2);
  const sgstAmt = parseFloat(sale.sgst) || (totalGstAmt / 2);
  const roundOffVal = parseFloat(sale.roundOff) || 0;
  const grandTotalVal = sale.roundedTotal || sale.total || (rawSubtotal - discountAmt + totalGstAmt);

  return (
    <div
      ref={ref}
      className="a5-receipt-container"
      style={{
        width: "100%",
        maxWidth: "148mm",
        margin: "0 auto",
        padding: "14px",
        background: "#ffffff",
        color: "#0f172a",
        border: "1.5px solid #0f172a",
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        boxSizing: "border-box",
        fontSize: "11px",
        lineHeight: "1.3"
      }}
    >
      {/* Header Section - Clean Text Only */}
      <div style={{ textAlign: "center", borderBottom: "1.5px solid #0f172a", paddingBottom: "8px", marginBottom: "10px" }}>
        <div style={{ fontSize: "18px", fontWeight: "900", color: "#0f172a", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 2px 0" }}>
          VIJAYAPATHI TRADERS
        </div>
        <div style={{ fontSize: "11px", fontWeight: "700", color: "#334155" }}>
          Sanitary, Hardware, Electrical & Plumbing Materials
        </div>
        {isGst && (
          <div style={{ fontSize: "11px", fontWeight: "800", color: "#0f172a", marginTop: "2px" }}>
            GSTIN: 33AAAAA1111A1Z1
          </div>
        )}
        <div style={{ marginTop: "4px", fontSize: "13px", fontWeight: "900", textDecoration: "underline", color: "#0f172a", letterSpacing: "0.5px" }}>
          {isGst ? "GST TAX INVOICE" : "RETAIL INVOICE / BILL OF SUPPLY"}
        </div>
      </div>

      {/* Bill Metadata Header */}
      <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1.5px solid #0f172a", paddingBottom: "8px", marginBottom: "10px", fontSize: "11px" }}>
        <div style={{ flex: 1, paddingRight: "10px" }}>
          <strong style={{ color: "#0f172a" }}>Billed To:</strong><br />
          <span style={{ fontSize: "12px", fontWeight: "800", color: "#0f172a" }}>
            {sale.customerName || "Walk-in Customer"}
          </span><br />
          {sale.customerPhone && <span>Phone: <strong>{sale.customerPhone}</strong><br /></span>}
          {sale.customerGstin && <span>Customer GSTIN: <strong>{sale.customerGstin}</strong><br /></span>}
          {sale.siteName && <span>Site: <strong>{sale.siteName}</strong></span>}
        </div>
        <div style={{ textAlign: "right", minWidth: "130px" }}>
          <strong style={{ color: "#0f172a" }}>Bill Information:</strong><br />
          Invoice No: <strong>{sale.id ? String(sale.id).slice(-8).toUpperCase() : "INV-001"}</strong><br />
          Date: <strong>{sale.date || new Date().toLocaleDateString("en-IN")}</strong><br />
          {sale.time && <span>Time: <strong>{sale.time}</strong><br /></span>}
          Payment Mode: <strong style={{ textTransform: "uppercase", color: "#2563eb" }}>{sale.paymentMethod || "CASH"}</strong>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", border: "1.5px solid #0f172a", marginBottom: "10px" }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            <th style={{ border: "1px solid #0f172a", padding: "4px 3px", fontSize: "10px", fontWeight: "800", textAlign: "center", width: "24px" }}>#</th>
            <th style={{ border: "1px solid #0f172a", padding: "4px 5px", fontSize: "10px", fontWeight: "800", textAlign: "left" }}>Item Description</th>
            {isGst && <th style={{ border: "1px solid #0f172a", padding: "4px 3px", fontSize: "10px", fontWeight: "800", textAlign: "center", width: "45px" }}>HSN</th>}
            <th style={{ border: "1px solid #0f172a", padding: "4px 3px", fontSize: "10px", fontWeight: "800", textAlign: "center", width: "42px" }}>Qty</th>
            <th style={{ border: "1px solid #0f172a", padding: "4px 5px", fontSize: "10px", fontWeight: "800", textAlign: "right", width: "55px" }}>Rate (₹)</th>
            {isGst && <th style={{ border: "1px solid #0f172a", padding: "4px 3px", fontSize: "10px", fontWeight: "800", textAlign: "center", width: "38px" }}>GST</th>}
            <th style={{ border: "1px solid #0f172a", padding: "4px 5px", fontSize: "10px", fontWeight: "800", textAlign: "right", width: "65px" }}>Total (₹)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const itemQty = parseFloat(item.qty) || 0;
            const itemPrice = parseFloat(item.sellingPrice) || 0;
            const itemTotal = itemQty * itemPrice;
            return (
              <tr key={index} style={{ background: index % 2 === 1 ? "#fafafa" : "#ffffff" }}>
                <td style={{ border: "1px solid #cbd5e1", padding: "4px 3px", fontSize: "10px", textAlign: "center", fontWeight: "600" }}>{index + 1}</td>
                <td style={{ border: "1px solid #cbd5e1", padding: "4px 5px", fontSize: "10px", textAlign: "left", fontWeight: "700", wordBreak: "break-word", overflowWrap: "anywhere" }}>{item.name}</td>
                {isGst && <td style={{ border: "1px solid #cbd5e1", padding: "4px 3px", fontSize: "10px", textAlign: "center", color: "#475569" }}>{item.hsnCode || "8481"}</td>}
                <td style={{ border: "1px solid #cbd5e1", padding: "4px 3px", fontSize: "10px", textAlign: "center" }}>{itemQty} {item.unit || "Nos"}</td>
                <td style={{ border: "1px solid #cbd5e1", padding: "4px 5px", fontSize: "10px", textAlign: "right" }}>{itemPrice.toFixed(2)}</td>
                {isGst && <td style={{ border: "1px solid #cbd5e1", padding: "4px 3px", fontSize: "10px", textAlign: "center", color: "#2563eb", fontWeight: "700" }}>{item.gstRate || 18}%</td>}
                <td style={{ border: "1px solid #cbd5e1", padding: "4px 5px", fontSize: "10px", textAlign: "right", fontWeight: "800" }}>{itemTotal.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals & Tax Summary Breakdown */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "8px", borderTop: "1.5px solid #0f172a", paddingTop: "8px" }}>
        {/* Left Side: Terms or Notes */}
        <div style={{ width: "48%", fontSize: "9px", color: "#64748b" }}>
          <strong style={{ color: "#0f172a" }}>Terms & Conditions:</strong><br />
          • Goods once sold cannot be returned or exchanged without bill.<br />
          • All disputes subject to local jurisdiction.<br />
          <div style={{ marginTop: "10px", color: "#0f172a", fontWeight: "bold" }}>
            For VIJAYAPATHI TRADERS
          </div>
        </div>

        {/* Right Side: Totals Calculation Table */}
        <div style={{ width: "48%", fontSize: "11px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
            <span>Subtotal:</span>
            <strong>₹{rawSubtotal.toFixed(2)}</strong>
          </div>

          {discountAmt > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#dc2626" }}>
              <span>Discount:</span>
              <strong>-₹{discountAmt.toFixed(2)}</strong>
            </div>
          )}

          {isGst && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#2563eb" }}>
                <span>CGST (9%):</span>
                <strong>+₹{cgstAmt.toFixed(2)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#2563eb" }}>
                <span>SGST (9%):</span>
                <strong>+₹{sgstAmt.toFixed(2)}</strong>
              </div>
            </>
          )}

          {roundOffVal !== 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: "#64748b" }}>
              <span>Round Off:</span>
              <strong>{roundOffVal > 0 ? "+" : ""}₹{roundOffVal.toFixed(2)}</strong>
            </div>
          )}

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "5px 8px",
            background: "#eff6ff",
            border: "1.5px solid #2563eb",
            borderRadius: "4px",
            marginTop: "4px",
            fontSize: "13px",
            fontWeight: "900",
            color: "#1e3a8a"
          }}>
            <span>Grand Total:</span>
            <span>₹{Math.round(grandTotalVal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", fontSize: "9px", marginTop: "12px", borderTop: "1px dashed #cbd5e1", paddingTop: "6px", color: "#64748b", fontWeight: "600" }}>
        Thank you for your business! — Vijayapathi Traders
      </div>
    </div>
  );
});

export default ReceiptTemplate;
