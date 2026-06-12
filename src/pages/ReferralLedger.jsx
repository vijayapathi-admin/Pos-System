import React, { useState, useMemo } from "react";
import { useApp } from "../AppContext";

export default function ReferralLedger() {
  const { sales, contacts, settleReferralCommission } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProf, setSelectedProf] = useState(null);
  const [settling, setSettling] = useState(false);

  // Filter professionals
  const professionals = useMemo(() => {
    const profs = (contacts || []).filter(c => c.designation && c.designation !== "Customer");
    return profs.filter(p => 
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone?.includes(searchTerm) ||
      p.designation?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [contacts, searchTerm]);

  // Calculate metrics by professional
  const statsMap = useMemo(() => {
    const map = {};
    (contacts || []).forEach(p => {
      if (p.designation === "Customer") return;
      const referredSales = (sales || []).filter(s => s.referrerId === p.id);
      const totalReferred = referredSales.reduce((sum, s) => sum + (s.total || 0), 0);
      const totalEarned = referredSales.reduce((sum, s) => sum + (s.commissionAmount || 0), 0);
      const totalSettled = referredSales.reduce((sum, s) => sum + (s.isCommissionPaid ? (s.commissionAmount || 0) : 0), 0);
      const outstanding = totalEarned - totalSettled;
      
      map[p.id] = {
        totalReferred,
        totalEarned,
        totalSettled,
        outstanding,
        salesCount: referredSales.length,
        referredSales
      };
    });
    return map;
  }, [contacts, sales]);

  const handleSettle = async (saleId) => {
    if (!confirm("Are you sure you want to mark this commission as fully paid?")) return;
    setSettling(true);
    try {
      await settleReferralCommission(saleId);
      alert("Referral commission marked as paid successfully!");
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSettling(false);
    }
  };

  const handleWhatsAppSlip = (prof, sale) => {
    const phone = prof.phone ? prof.phone.replace(/\D/g, "") : "";
    const msg = `*Vijayapathi Traders - Payout Slip*\n\n*Agent / Partner:* ${prof.name}\n*Designation:* ${prof.designation}\n*Contact:* ${prof.phone || "N/A"}\n\nWe have settled commission of *₹${(sale.commissionAmount || 0).toLocaleString()}* for referring POS Invoice *#${sale.id.slice(-6).toUpperCase()}* (Total Sale: ₹${sale.total.toLocaleString()}).\n\nThank you for your valuable partnership!\n\n_Vijayapathi Traders_`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  // Overall calculations
  const overallEarned = useMemo(() => {
    return Object.values(statsMap).reduce((sum, s) => sum + s.totalEarned, 0);
  }, [statsMap]);

  const overallSettled = useMemo(() => {
    return Object.values(statsMap).reduce((sum, s) => sum + s.totalSettled, 0);
  }, [statsMap]);

  const overallOutstanding = overallEarned - overallSettled;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-sub">PARTNER NETWORK</div>
          <h1 className="page-title">Referral Commission Book</h1>
        </div>
      </div>

      {/* Summary Widgets */}
      <div className="expenses-summary" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.02)' }}>
        <div>
          <div className="summary-label" style={{ color: '#00c9a7' }}>LIFETIME COMMISSIONS EARNED</div>
          <div className="summary-total" style={{ color: '#00c9a7' }}>₹{overallEarned.toLocaleString()}</div>
          <div className="entries-count">Across all referred jobs</div>
        </div>
        <div>
          <div className="summary-label" style={{ color: '#2563eb' }}>TOTAL COMMISSIONS SETTLED</div>
          <div className="summary-total" style={{ color: '#2563eb' }}>₹{overallSettled.toLocaleString()}</div>
          <div className="entries-count">Paid in cash/UPI</div>
        </div>
        <div>
          <div className="summary-label" style={{ color: '#ff4757' }}>OUTSTANDING UNPAID DUE</div>
          <div className="summary-total" style={{ color: '#ff4757' }}>₹{overallOutstanding.toLocaleString()}</div>
          <div className="entries-count">Waiting for settlement</div>
        </div>
      </div>

      {/* Search and grid layout */}
      <div className="search-bar" style={{ marginBottom: "20px" }}>
        <input 
          type="text" 
          placeholder="🔍 Search agents by name, designation, or phone..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
          style={{ width: "100%", padding: "12px 16px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "15px" }}
        />
      </div>

      <div className="suppliers-grid">
        {professionals.map(prof => {
          const stats = statsMap[prof.id] || { totalReferred: 0, totalEarned: 0, totalSettled: 0, outstanding: 0, salesCount: 0 };
          return (
            <div key={prof.id} className="supplier-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px' }}>
              <div>
                <div className="supplier-card-header">
                  <strong>{prof.name}</strong>
                  <span style={{ fontSize: '11px', background: 'rgba(37,99,235,0.1)', color: '#2563eb', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                    {prof.designation?.toUpperCase()}
                  </span>
                </div>
                {prof.phone && <div className="supplier-info">📞 {prof.phone}</div>}
                
                <div style={{ marginTop: '12px', borderTop: '1px dashed rgba(120, 113, 108, 0.15)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#aaa' }}>Referred Sales:</span>
                    <strong style={{ color: '#fff' }}>₹{stats.totalReferred.toLocaleString()} ({stats.salesCount} jobs)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#aaa' }}>Earned:</span>
                    <strong style={{ color: '#00c9a7' }}>₹{stats.totalEarned.toLocaleString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#aaa' }}>Outstanding Due:</span>
                    <strong style={{ color: stats.outstanding > 0 ? '#ff4757' : '#aaa' }}>₹{stats.outstanding.toLocaleString()}</strong>
                  </div>
                </div>
              </div>

              <button 
                className="btn-secondary" 
                onClick={() => {
                  setSelectedProf(prof);
                }}
                style={{ width: '100%', marginTop: '15px', padding: '8px', fontSize: '12px', fontWeight: '800', background: '#34495e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                📋 VIEW REFERRALS
              </button>
            </div>
          );
        })}
        {professionals.length === 0 && (
          <div className="empty-state">No agents or referrers found in directory.</div>
        )}
      </div>

      {/* Referrals Details Drawer/Modal */}
      {selectedProf && (() => {
        const stats = statsMap[selectedProf.id] || { totalReferred: 0, totalEarned: 0, totalSettled: 0, outstanding: 0, salesCount: 0, referredSales: [] };
        return (
          <div className="modal-overlay" onClick={() => setSelectedProf(null)}>
            <div className="modal-content" style={{ maxWidth: '850px', width: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="modal-stripe" style={{ background: '#2563eb' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2>Referred Jobs & Payouts: {selectedProf.name}</h2>
                <button className="btn-secondary" onClick={() => setSelectedProf(null)}>CLOSE</button>
              </div>

              <div style={{ display: 'flex', gap: '20px', marginBottom: '15px', fontSize: '14px', flexWrap: 'wrap' }}>
                <div><strong>Designation:</strong> {selectedProf.designation}</div>
                {selectedProf.phone && <div><strong>Phone:</strong> {selectedProf.phone}</div>}
                {selectedProf.location && <div><strong>Location:</strong> {selectedProf.location}</div>}
              </div>

              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(120, 113, 108, 0.1)' }}>
                  <div style={{ fontSize: '11px', color: '#aaa', fontWeight: 'bold' }}>TOTAL REFERRAL VALUE</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff', marginTop: '4px' }}>₹{stats.totalReferred.toLocaleString()}</div>
                </div>
                <div style={{ background: 'rgba(0, 201, 167, 0.05)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(0, 201, 167, 0.1)' }}>
                  <div style={{ fontSize: '11px', color: '#00c9a7', fontWeight: 'bold' }}>TOTAL COMMISSION EARNED</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#00c9a7', marginTop: '4px' }}>₹{stats.totalEarned.toLocaleString()}</div>
                </div>
                <div style={{ background: stats.outstanding > 0 ? 'rgba(255, 71, 87, 0.05)' : 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px', border: stats.outstanding > 0 ? '1px solid rgba(255, 71, 87, 0.1)' : '1px solid rgba(120, 113, 108, 0.1)' }}>
                  <div style={{ fontSize: '11px', color: stats.outstanding > 0 ? '#ff4757' : '#aaa', fontWeight: 'bold' }}>OUTSTANDING BALANCE DUE</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: stats.outstanding > 0 ? '#ff4757' : '#fff', marginTop: '4px' }}>₹{stats.outstanding.toLocaleString()}</div>
                </div>
              </div>

              {/* Referred Sales Table */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Referred Sales History</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>CUSTOMER</th>
                      <th style={{ textAlign: 'right' }}>SALE TOTAL</th>
                      <th style={{ textAlign: 'center' }}>COMMISSION %</th>
                      <th style={{ textAlign: 'right' }}>COMMISSION AMOUNT</th>
                      <th style={{ textAlign: 'center' }}>STATUS</th>
                      <th style={{ textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.referredSales.map(sale => (
                      <tr key={sale.id}>
                        <td>{sale.date}</td>
                        <td style={{ fontWeight: 'bold' }}>{sale.customerName || "Walk-in Customer"}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{sale.total.toLocaleString()}</td>
                        <td style={{ textAlign: 'center' }}>{sale.commissionPercent}%</td>
                        <td style={{ textAlign: 'right', color: '#00c9a7', fontWeight: 'bold' }}>₹{sale.commissionAmount.toLocaleString()}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            fontSize: '10px', 
                            fontWeight: 'bold',
                            background: sale.isCommissionPaid ? 'rgba(0, 201, 167, 0.15)' : 'rgba(255, 71, 87, 0.15)',
                            color: sale.isCommissionPaid ? '#00c9a7' : '#ff4757'
                          }}>
                            {sale.isCommissionPaid ? 'PAID' : 'PENDING'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          {!sale.isCommissionPaid ? (
                            <button 
                              className="btn-primary" 
                              onClick={() => handleSettle(sale.id)}
                              disabled={settling}
                              style={{ padding: '4px 10px', fontSize: '11px', background: '#00c9a7', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                              💵 SETTLE
                            </button>
                          ) : (
                            <button 
                              className="btn-secondary" 
                              onClick={() => handleWhatsAppSlip(selectedProf, sale)}
                              style={{ padding: '4px 10px', fontSize: '11px', background: '#34495e', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', color: '#fff' }}
                            >
                              💬 SLIP
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {stats.referredSales.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: '15px', color: '#888' }}>No referred jobs logged for this partner.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
