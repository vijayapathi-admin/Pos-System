import React, { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { exportToExcel } from "../utils";

export default function CreditBook() {
  const { sales, settleCreditSale } = useApp();
  const [filterMode, setFilterMode] = useState("unpaid"); // unpaid | paid | all
  const [settleModal, setSettleModal] = useState({ show: false, sale: null, amount: "" });
  const [settleMethod, setSettleMethod] = useState("CASH");
  const [viewingBill, setViewingBill] = useState(null);
  const receiptRef = React.useRef(null);

  // Get all credit sales
  const creditSales = useMemo(() => {
    return sales.filter(s => s.paymentMethod === "CREDIT");
  }, [sales]);

  // Group by customer
  const groupedCredits = useMemo(() => {
    const groups = {};
    creditSales.forEach(sale => {
      const isPaid = sale.isCreditPaid === true;
      if (filterMode === "unpaid" && isPaid) return;
      if (filterMode === "paid" && !isPaid) return;

      const customerKey = sale.customerPhone || sale.customerName || "Walk-in (No Name)";
      if (!groups[customerKey]) {
        groups[customerKey] = {
          name: sale.customerName || "Unknown",
          phone: sale.customerPhone || "",
          totalOwed: 0,
          totalPaid: 0,
          bills: []
        };
      }
      
      groups[customerKey].bills.push(sale);
      
      const paidAmt = sale.creditPaidAmount || 0;
      const dueAmt = (sale.total || 0) - paidAmt;
      
      groups[customerKey].totalPaid += paidAmt;
      groups[customerKey].totalOwed += dueAmt;
    });

    return Object.values(groups).sort((a, b) => b.totalOwed - a.totalOwed);
  }, [creditSales, filterMode]);

  const totalOutstanding = groupedCredits.reduce((sum, g) => sum + g.totalOwed, 0);

  const confirmSettle = async () => {
    const amt = parseFloat(settleModal.amount);
    if (!amt || amt <= 0) return alert("Enter a valid amount");
    
    try {
      await settleCreditSale(settleModal.sale, amt, settleMethod);
      setSettleModal({ show: false, sale: null, amount: "" });
    } catch (e) {
      alert("Error marking as paid: " + e.message);
    }
  };

  const exportLedger = () => {
    const rows = [["Customer", "Phone", "Date", "Bill Total (₹)", "Paid (₹)", "Due (₹)", "Status"]];
    groupedCredits.forEach(g => {
      g.bills.forEach(b => {
        rows.push([
          g.name,
          g.phone,
          b.date + " " + (b.time || ""),
          b.total,
          b.creditPaidAmount || 0,
          (b.total || 0) - (b.creditPaidAmount || 0),
          b.isCreditPaid ? "PAID" : "UNPAID"
        ]);
      });
    });
    rows.push([]);
    rows.push(["TOTAL OUTSTANDING", "", "", totalOutstanding, ""]);
    exportToExcel(`credit_ledger_${new Date().getTime()}.xlsx`, rows, "CreditLedger");
  };

  const handleSendWhatsAppReminder = (group) => {
    if (!group.phone) {
      alert("No phone number saved for this customer.");
      return;
    }
    const cleanPhone = group.phone.replace(/\D/g, "");
    const dateStr = new Date().toLocaleDateString("en-IN");
    
    const msg = `*Vijayapathi Traders - Payment Reminder*\n\n*Dear ${group.name},*\n\nThis is a friendly reminder regarding your outstanding balance with Vijayapathi Traders.\n\n*Outstanding Balance: ₹${group.totalOwed.toLocaleString()}*\n\nWe kindly request you to settle this balance via UPI or cash at your earliest convenience. Thank you for your continued business!\n\n_Generated on ${dateStr}_`;
    
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-sub">LEDGER</div>
          <h1 className="page-title">Credit Book</h1>
        </div>
        <button className="btn-secondary" onClick={exportLedger}>📥 DOWNLOAD CSV</button>
      </div>

      <div className="expense-filters">
        <div className="expense-filter-tabs">
          <button className={`cat-tab ${filterMode === "unpaid" ? "active" : ""}`} onClick={() => setFilterMode("unpaid")}>UNPAID (DUE)</button>
          <button className={`cat-tab ${filterMode === "paid" ? "active" : ""}`} onClick={() => setFilterMode("paid")}>PAID (SETTLED)</button>
          <button className={`cat-tab ${filterMode === "all" ? "active" : ""}`} onClick={() => setFilterMode("all")}>ALL CREDIT SALES</button>
        </div>
      </div>

      <div className="expenses-summary" style={{ background: filterMode === "unpaid" ? "rgba(255, 71, 87, 0.1)" : "rgba(0, 201, 167, 0.1)" }}>
        <div className="summary-label">TOTAL {filterMode.toUpperCase()} CREDIT</div>
        <div className="summary-total" style={{ color: filterMode === "unpaid" ? "#ff4757" : "#00c9a7" }}>
          ₹{totalOutstanding.toLocaleString()}
        </div>
        <div className="entries-count">{groupedCredits.length} customers</div>
      </div>

      <div className="daybook-section" style={{ marginTop: '20px' }}>
        {groupedCredits.map((group, idx) => (
          <div key={idx} className="expense-date-group" style={{ marginBottom: '20px', background: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
            <div className="expense-group-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{group.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  {group.phone && <span style={{ fontSize: '13px', color: '#666' }}>📞 {group.phone}</span>}
                  {group.phone && group.totalOwed > 0 && (
                    <button
                      onClick={() => handleSendWhatsAppReminder(group)}
                      style={{
                        background: '#25D366',
                        border: 'none',
                        color: 'white',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '800',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        margin: 0
                      }}
                      title="Send WhatsApp Payment Reminder"
                    >
                      💬 SEND REMINDER
                    </button>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {group.totalOwed > 0 && <div style={{ color: '#ff4757', fontWeight: 'bold', fontSize: '18px' }}>Due: ₹{group.totalOwed.toLocaleString()}</div>}
                {group.totalPaid > 0 && <div style={{ color: '#00c9a7', fontSize: '14px' }}>Settled: ₹{group.totalPaid.toLocaleString()}</div>}
              </div>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>DATE & TIME</th>
                  <th>ITEMS</th>
                  <th>BILL AMT</th>
                  <th>PAID</th>
                  <th>DUE</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {group.bills.sort((a,b) => b.date.localeCompare(a.date)).map(bill => {
                  const paid = bill.creditPaidAmount || 0;
                  const due = (bill.total || 0) - paid;
                  return (
                  <tr key={bill.id}>
                    <td>
                      <div>{bill.date} <span style={{color: '#888', fontSize: '12px'}}>{bill.time}</span></div>
                      {bill.siteName && (
                        <div style={{ fontSize: "10px", color: "#e67e22", fontWeight: "bold", marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                          🏡 Site: {bill.siteName}
                        </div>
                      )}
                    </td>
                    <td style={{fontSize: '12px'}}>{bill.items?.map(i => `${i.qty}x ${i.name}`).join(", ")}</td>
                    <td><strong>₹{(bill.total || 0).toLocaleString()}</strong></td>
                    <td style={{color: '#00c9a7'}}>₹{paid.toLocaleString()}</td>
                    <td style={{color: '#ff4757', fontWeight: 'bold'}}>₹{due.toLocaleString()}</td>
                    <td>
                      <span className={`pay-badge ${bill.isCreditPaid ? "cash" : "credit"}`} style={{ background: bill.isCreditPaid ? "rgba(0,201,167,0.1)" : "rgba(255,71,87,0.1)", color: bill.isCreditPaid ? "#00c9a7" : "#ff4757" }}>
                        {bill.isCreditPaid ? "SETTLED" : "UNPAID"}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: '8px' }}>
                      {!bill.isCreditPaid ? (
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '11px', borderColor: '#00c9a7', color: '#00c9a7' }} onClick={() => setSettleModal({ show: true, sale: bill, amount: due })}>
                          PAY
                        </button>
                      ) : (
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '11px', borderColor: '#888', color: '#888' }} onClick={() => setSettleModal({ show: true, sale: bill, amount: "" })}>
                          HISTORY
                        </button>
                      )}
                      <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => setViewingBill(bill)}>
                        VIEW
                      </button>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        ))}

        {groupedCredits.length === 0 && (
          <div className="empty-state">No credit records found for the selected filter.</div>
        )}
      </div>

      {/* Settle Modal */}
      {settleModal.show && (
        <div className="modal-overlay" onClick={() => setSettleModal({ show: false, sale: null, amount: "" })}>
          <div className="modal-content form-modal" style={{ maxWidth: "600px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe"></div>
            <h2>{settleModal.sale?.isCreditPaid ? "Payment History Ledger" : "Record Credit Payment"}</h2>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: '15px', padding: '12px', background: 'rgba(255,255,255,0.03)', border: "1px solid rgba(120, 113, 108, 0.15)", borderRadius: '6px', fontSize: '13px' }}>
              <div>
                <div><strong>Client:</strong> {settleModal.sale?.customerName || "Walk-in Customer"}</div>
                <div><strong>Phone:</strong> {settleModal.sale?.customerPhone || "-"}</div>
                <div><strong>Bill Date:</strong> {settleModal.sale?.date}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div><strong>Bill Total:</strong> ₹{settleModal.sale?.total?.toLocaleString()}</div>
                <div><strong>Already Paid:</strong> <span style={{ color: "#00c9a7", fontWeight: "bold" }}>₹{(settleModal.sale?.creditPaidAmount || 0).toLocaleString()}</span></div>
                <div style={{ color: '#ff4757', marginTop: '5px', fontSize: "14px" }}><strong>Remaining Due:</strong> <strong>₹{((settleModal.sale?.total || 0) - (settleModal.sale?.creditPaidAmount || 0)).toLocaleString()}</strong></div>
              </div>
            </div>

            {/* Micro-ledger of payments */}
            <div style={{ marginBottom: "20px" }}>
              <h3 style={{ fontSize: "14px", margin: "10px 0" }}>📜 Previous Payments</h3>
              {(!settleModal.sale?.creditPayments || settleModal.sale.creditPayments.length === 0) ? (
                <div style={{ color: "#888", fontSize: "12px", textAlign: "center", padding: "10px", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "4px" }}>
                  No previous payments recorded.
                </div>
              ) : (
                <table className="data-table" style={{ fontSize: "12px" }}>
                  <thead>
                    <tr>
                      <th>DATE & TIME</th>
                      <th>METHOD</th>
                      <th style={{ textAlign: "right" }}>AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settleModal.sale.creditPayments.map((pay, i) => (
                      <tr key={i}>
                        <td>{pay.date} <span style={{ color: "#888", fontSize: "10px" }}>{pay.time}</span></td>
                        <td>
                          <span className={`pay-badge ${pay.method?.toLowerCase() === "cash" ? "cash" : "upi"}`} style={{ padding: "2px 6px", fontSize: "10px" }}>
                            {pay.method || "CASH"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "bold", color: "#00c9a7" }}>₹{pay.amount?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Add new payment form */}
            {!settleModal.sale?.isCreditPaid && (
              <div style={{ borderTop: "1.5px solid rgba(255,255,255,0.1)", paddingTop: "15px" }}>
                <h3 style={{ fontSize: "14px", marginBottom: "12px" }}>💰 Record New Payment</h3>
                <div className="form-grid" style={{ marginBottom: "15px" }}>
                  <div className="form-group">
                    <label>Amount Received (₹)</label>
                    <input 
                      type="number" 
                      value={settleModal.amount} 
                      onChange={e => setSettleModal({ ...settleModal, amount: e.target.value })} 
                      placeholder="e.g. 1000"
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Method</label>
                    <select value={settleMethod} onChange={e => setSettleMethod(e.target.value)}>
                      <option value="CASH">💵 CASH</option>
                      <option value="UPI">📱 UPI</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="modal-btns" style={{ marginTop: "20px" }}>
              <button className="btn-secondary" onClick={() => setSettleModal({ show: false, sale: null, amount: "" })}>
                {settleModal.sale?.isCreditPaid ? "Close" : "Cancel"}
              </button>
              {!settleModal.sale?.isCreditPaid && (
                <button className="btn-primary" onClick={confirmSettle}>Confirm Payment</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bill View Modal */}
      {viewingBill && (
        <div className="modal-overlay" onClick={() => setViewingBill(null)}>
          <div className="modal-content" style={{ maxWidth: '650px', width: '90%', padding: '20px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" />
            <div className="sale-completed-label" style={{ marginBottom: '20px' }}>BILL PREVIEW</div>
            
            <div style={{ background: '#fff' }}>
              <div ref={receiptRef} className="a5-container" style={{ margin: '0 auto', width: '100%', maxWidth: '148mm', padding: '15px', background: '#fff', color: '#000', border: '1.5px solid #000', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
                <div className="receipt-header" style={{ textAlign: 'center', borderBottom: '1.5px solid #000', paddingBottom: '10px', marginBottom: '15px' }}>
                  <h2>VIJAYAPATHI TRADERS</h2>
                  <p style={{ fontSize: "12px", margin: "2px 0" }}>{viewingBill.isGstBill ? "TAX INVOICE" : "BILL OF SUPPLY"}</p>
                  <p style={{ fontSize: "11px", margin: "2px 0", color: "#444" }}>Date: {viewingBill.date} &nbsp;&nbsp;|&nbsp;&nbsp; Time: {viewingBill.time}</p>
                </div>

                {(viewingBill.customerName || viewingBill.customerPhone || viewingBill.siteName) && (
                  <div className="customer-details" style={{ borderBottom: "1.5px solid #000", paddingBottom: "10px", marginBottom: "15px", fontSize: "12px", lineHeight: "1.5" }}>
                    <strong>Billed To:</strong><br/>
                    {viewingBill.customerName || "Walk-in Customer"}<br/>
                    {viewingBill.customerPhone ? `Phone: ${viewingBill.customerPhone}` : ""}<br/>
                    {viewingBill.siteName && (
                      <div style={{ marginTop: "4px", color: "#e67e22", fontWeight: "bold", fontSize: "12px" }}>
                        🏡 Project Site: {viewingBill.siteName}
                      </div>
                    )}
                  </div>
                )}

                <div className="table-container" style={{ minHeight: 'auto' }}>
                  <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', background: '#f0f0f0', width: '35px', textAlign: 'center' }}>S.No</th>
                        <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', background: '#f0f0f0', textAlign: 'left' }}>Product Name</th>
                        {viewingBill.isGstBill && <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', background: '#f0f0f0', width: '45px', textAlign: 'left' }}>HSN</th>}
                        <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', background: '#f0f0f0', textAlign: 'center', width: '55px' }}>Qty</th>
                        <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', background: '#f0f0f0', textAlign: 'right', width: '65px' }}>Rate (₹)</th>
                        {viewingBill.isGstBill && <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', background: '#f0f0f0', textAlign: 'right', width: '45px' }}>GST %</th>}
                        <th style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', background: '#f0f0f0', textAlign: 'right', width: '80px' }}>Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingBill.items?.map((item, i) => (
                        <tr key={i}>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', textAlign: 'left', fontWeight: 'bold', wordBreak: 'break-word', whiteSpace: 'normal' }}>{item.name}</td>
                          {viewingBill.isGstBill && <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>{item.hsnCode}</td>}
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', textAlign: 'center' }}>{item.qty}</td>
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', textAlign: 'right' }}>{parseFloat(item.sellingPrice).toFixed(2)}</td>
                          {viewingBill.isGstBill && <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', textAlign: 'right' }}>{item.gstRate}%</td>}
                          <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', textAlign: 'right', fontWeight: 'bold' }}>{(parseFloat(item.sellingPrice) * item.qty).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="clearfix">
                  <table className="totals-table" style={{ marginTop: '10px', width: '50%', float: 'right', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4px 8px', fontSize: '12px', borderBottom: '1px solid #eee' }}>Subtotal</td>
                        <td style={{ padding: '4px 8px', fontSize: '12px', borderBottom: '1px solid #eee', textAlign: 'right' }}>₹{viewingBill.subtotal?.toFixed(2) || viewingBill.items?.reduce((sum, item) => sum + parseFloat(item.sellingPrice) * item.qty, 0).toFixed(2)}</td>
                      </tr>
                      {viewingBill.discount > 0 && (
                        <tr>
                          <td style={{ padding: '4px 8px', fontSize: '12px', borderBottom: '1px solid #eee' }}>Discount</td>
                          <td style={{ padding: '4px 8px', fontSize: '12px', borderBottom: '1px solid #eee', textAlign: 'right' }}>-₹{viewingBill.discount.toFixed(2)}</td>
                        </tr>
                      )}
                      {viewingBill.isGstBill && (
                        <>
                          <tr>
                            <td style={{ padding: '4px 8px', fontSize: '12px', borderBottom: '1px solid #eee' }}>CGST</td>
                            <td style={{ padding: '4px 8px', fontSize: '12px', borderBottom: '1px solid #eee', textAlign: 'right' }}>+₹{viewingBill.cgst?.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '4px 8px', fontSize: '12px', borderBottom: '1px solid #eee' }}>SGST</td>
                            <td style={{ padding: '4px 8px', fontSize: '12px', borderBottom: '1px solid #eee', textAlign: 'right' }}>+₹{viewingBill.sgst?.toFixed(2)}</td>
                          </tr>
                        </>
                      )}
                      <tr>
                        <td style={{ padding: '4px 8px', fontSize: '14px', fontWeight: 'bold', borderTop: '1px solid #000' }}>Grand Total</td>
                        <td style={{ padding: '4px 8px', fontSize: '14px', fontWeight: 'bold', borderTop: '1px solid #000', textAlign: 'right' }}>₹{viewingBill.total?.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="receipt-footer" style={{ textAlign: 'center', marginTop: '30px', borderTop: '1px solid #000', paddingTop: '10px', fontSize: '11px', fontWeight: 'bold' }}>
                  <p>Payment Mode: {viewingBill.paymentMethod}</p>
                  <p>Thank you for your business!</p>
                  <p className="tagline" style={{ marginTop: '8px', fontSize: '12px', textTransform: 'uppercase', textDecoration: 'underline' }}>NO RETURN{viewingBill.paymentMethod === "CREDIT" ? "" : ", NO CREDIT"}</p>
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '30px', display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" onClick={() => setViewingBill(null)} style={{ flex: 1, padding: '12px', border: '1px solid #ccc', background: 'transparent', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
