import React, { useState } from "react";
import { useApp } from "../AppContext";

const emptyForm = { name: "", phone: "", area: "", designation: "Customer" };

export default function Contacts() {
  const { contacts, addContact, updateContact, deleteContact, sales, settleCreditSale } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDesignation, setFilterDesignation] = useState("ALL");

  // CRM profile details states
  const [selectedContact, setSelectedContact] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileSettleModal, setProfileSettleModal] = useState({ show: false, sale: null, amount: "" });
  const [profileSettleMethod, setProfileSettleMethod] = useState("CASH");

  // CRM dynamic stats calculators
  const customerBills = React.useMemo(() => {
    if (!selectedContact) return [];
    const phoneClean = selectedContact.phone?.replace(/\D/g, "");
    return sales.filter(s => {
      const matchPhone = s.customerPhone && s.customerPhone.replace(/\D/g, "") === phoneClean;
      const matchName = s.customerName && s.customerName.toLowerCase().trim() === selectedContact.name?.toLowerCase().trim();
      return matchPhone || (selectedContact.name && matchName);
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, selectedContact]);

  const topProducts = React.useMemo(() => {
    const counts = {};
    customerBills.forEach(bill => {
      bill.items?.forEach(item => {
        const key = item.name;
        if (!counts[key]) counts[key] = { name: item.name, qty: 0, unit: item.unit || "Nos" };
        counts[key].qty += item.qty;
      });
    });
    return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [customerBills]);

  const stats = React.useMemo(() => {
    let totalPurchased = 0;
    let totalOutstanding = 0;
    let totalSettled = 0;
    
    customerBills.forEach(bill => {
      totalPurchased += bill.total || 0;
      if (bill.paymentMethod === "CREDIT") {
        const paid = bill.creditPaidAmount || 0;
        const due = (bill.total || 0) - paid;
        totalOutstanding += due;
        totalSettled += paid;
      }
    });

    return { totalPurchased, totalOutstanding, totalSettled };
  }, [customerBills]);

  const handleViewProfile = (contact) => {
    setSelectedContact(contact);
    setShowProfileModal(true);
  };

  const confirmProfileSettle = async () => {
    const amt = parseFloat(profileSettleModal.amount);
    if (!amt || amt <= 0) return alert("Enter a valid amount");
    
    try {
      await settleCreditSale(profileSettleModal.sale, amt, profileSettleMethod);
      setProfileSettleModal({ show: false, sale: null, amount: "" });
      alert("Credit payment settled successfully!");
    } catch (e) {
      alert("Error recording payment: " + e.message);
    }
  };

  const filteredContacts = contacts.filter(c => {
    const matchSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (c.phone && c.phone.includes(searchTerm)) ||
      (c.area && c.area.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchFilter = filterDesignation === "ALL" || c.designation === filterDesignation;
    return matchSearch && matchFilter;
  });

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setShowModal(true); };
  const openEdit = (c) => { 
    setForm({ 
      name: c.name || "", 
      phone: c.phone || "", 
      area: c.area || "",
      designation: c.designation || "Customer"
    }); 
    setEditingId(c.id); 
    setShowModal(true); 
  };

  const handleSave = async () => {
    if (!form.name || !form.phone) { alert("Name and Phone Number are required."); return; }
    setSaving(true);
    try {
      if (editingId) {
        await updateContact(editingId, form);
      } else {
        await addContact(form);
      }
      setShowModal(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete contact "${name}"?`)) return;
    await deleteContact(id);
  };

  return (
    <div className="page">
      {saved && <div className="save-toast">✓ Saved</div>}
      <div className="page-header">
        <div>
          <div className="page-sub">DIRECTORY</div>
          <h1 className="page-title">Contacts & Professionals</h1>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button className="btn-primary" onClick={openAdd}>+ ADD CONTACT</button>
        </div>
      </div>

      <div className="search-bar" style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
        <input 
          type="text" 
          placeholder="🔍 Search contacts by name, phone, or area..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
          style={{ flex: 1, padding: "12px 16px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "15px" }}
        />
        <select 
          value={filterDesignation} 
          onChange={e => setFilterDesignation(e.target.value)}
          style={{ padding: "12px 16px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "15px" }}
        >
          <option value="ALL">All Types</option>
          <option value="Customer">Customers</option>
          <option value="Electrician">Electricians</option>
          <option value="Plumber">Plumbers</option>
          <option value="Builder">Builders / Contractors</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div className="suppliers-grid">
        {filteredContacts.map(contact => (
          <div key={contact.id} className="supplier-card">
            <div className="supplier-card-header">
              <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                <strong>{contact.name}</strong>
                <span className={`pay-badge ${contact.designation === 'Customer' ? 'upi' : 'cash'}`} style={{fontSize: "9px"}}>
                  {contact.designation?.toUpperCase() || 'CUSTOMER'}
                </span>
              </div>
              <div className="supplier-actions" style={{ display: 'flex', gap: '5px' }}>
                <button 
                  onClick={() => handleViewProfile(contact)}
                  style={{
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: '800',
                    background: 'rgba(37, 99, 235, 0.05)',
                    color: '#2563eb',
                    border: '1.5px solid rgba(37, 99, 235, 0.15)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    margin: 0
                  }}
                  title="View Purchase Profile & Ledger"
                >
                  📊 PROFILE
                </button>
                <button className="edit-btn" onClick={() => openEdit(contact)}>✏️</button>
                <button className="delete-btn" onClick={() => handleDelete(contact.id, contact.name)}>🗑</button>
              </div>
            </div>
            {contact.phone && <div className="supplier-info">📞 {contact.phone}</div>}
            {contact.area && <div className="supplier-info">📍 {contact.area}</div>}
          </div>
        ))}
        {filteredContacts.length === 0 && (
          <div className="empty-state">No contacts found in this category.</div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content form-modal" onClick={e => e.stopPropagation()}>
            <h2>{editingId ? "Edit Contact" : "Add Contact"}</h2>
            <div className="form-group">
              <label>Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ramesh" />
            </div>
            <div className="form-group">
              <label>Phone Number *</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+919876543210" />
            </div>
            <div className="form-group">
              <label>Designation</label>
              <select value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })}>
                <option value="Customer">Customer</option>
                <option value="Electrician">Electrician</option>
                <option value="Plumber">Plumber</option>
                <option value="Builder">Builder / Contractor</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Area / Location</label>
              <input value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} placeholder="e.g. Gandhipuram" />
            </div>
            <div className="modal-btns">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update" : "Add Contact"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer CRM Profile Modal */}
      {showProfileModal && selectedContact && (
        <div className="modal-overlay" onClick={() => setShowProfileModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "800px", width: "95vw", padding: "24px", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe"></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1.5px solid rgba(0,0,0,0.06)", paddingBottom: "15px", marginBottom: "20px" }}>
              <div>
                <span className={`pay-badge ${selectedContact.designation === 'Customer' ? 'upi' : 'cash'}`} style={{ fontSize: "10px", textTransform: "uppercase", padding: "4px 8px", fontWeight: "800" }}>
                  {selectedContact.designation || "Customer"}
                </span>
                <h2 style={{ margin: "5px 0 0 0", fontSize: "20px", fontWeight: "900", color: "var(--text-color, #1c1917)" }}>
                  👤 {selectedContact.name}
                </h2>
              </div>
              <button className="btn-secondary" onClick={() => setShowProfileModal(false)}>CLOSE</button>
            </div>

            {/* Profile Overview */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "20px" }}>
              <div style={{ fontSize: "13px", lineHeight: "1.6", color: "#555" }}>
                <div>📞 **Phone Number:** {selectedContact.phone || "Not Specified"}</div>
                <div>📍 **Location / Area:** {selectedContact.area || "Not Specified"}</div>
                <div style={{ marginTop: "10px", fontSize: "11px", color: "#888" }}>*Linked automatically by matching contact name or phone with past sales receipts.*</div>
              </div>
              <div style={{ background: "rgba(24, 18, 54, 0.02)", padding: "15px", borderRadius: "8px", border: "1.5px solid rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#777", fontWeight: "800" }}>LIFETIME SPEND:</span>
                  <strong style={{ fontSize: "13px", color: "var(--text-color, #1c1917)" }}>₹{stats.totalPurchased.toLocaleString()}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", color: "#777", fontWeight: "800" }}>ACTIVE CREDIT DUE:</span>
                  <strong style={{ fontSize: "13px", color: stats.totalOutstanding > 0 ? "#ff4757" : "#00c9a7" }}>
                    ₹{stats.totalOutstanding.toLocaleString()}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", color: "#777", fontWeight: "800" }}>CREDIT SETTLED:</span>
                  <strong style={{ fontSize: "13px", color: "#00c9a7" }}>₹{stats.totalSettled.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px", marginTop: "24px" }}>
              {/* Left Column: Top Bought Products */}
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "800", borderBottom: "1.5px solid rgba(0,0,0,0.05)", paddingBottom: "8px", marginBottom: "12px", color: "#2563eb" }}>
                  📦 Top Purchased Products
                </h3>
                {topProducts.length === 0 ? (
                  <div style={{ color: "#999", fontSize: "12px", fontStyle: "italic", textAlign: "center", padding: "30px 10px" }}>
                    No purchase history found.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {topProducts.map((p, idx) => (
                      <div key={idx} style={{ background: "rgba(0, 0, 0, 0.01)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(0,0,0,0.03)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "bold", marginBottom: "4px" }}>
                          <span>{p.name}</span>
                          <span style={{ color: "#2563eb" }}>{p.qty} {p.unit}</span>
                        </div>
                        {/* Simple progress-like visual indicator */}
                        <div style={{ width: "100%", height: "4px", background: "rgba(0,0,0,0.05)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, (p.qty / topProducts[0].qty) * 100)}%`, height: "100%", background: "#2563eb" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Statement / Past Bills */}
              <div>
                <h3 style={{ fontSize: "14px", fontWeight: "800", borderBottom: "1.5px solid rgba(0,0,0,0.05)", paddingBottom: "8px", marginBottom: "12px", color: "#2563eb" }}>
                  📜 Lifetime Bills ({customerBills.length})
                </h3>
                {customerBills.length === 0 ? (
                  <div style={{ color: "#999", fontSize: "12px", fontStyle: "italic", textAlign: "center", padding: "30px 10px" }}>
                    No bills associated with this contact.
                  </div>
                ) : (
                  <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {customerBills.map((bill, i) => {
                      const due = bill.paymentMethod === "CREDIT" ? (bill.total || 0) - (bill.creditPaidAmount || 0) : 0;
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", border: "1px solid rgba(0,0,0,0.05)", borderRadius: "6px", fontSize: "12px", background: "#fff" }}>
                          <div>
                            <strong>{bill.date}</strong> <span style={{ color: "#777" }}>{bill.time}</span>
                            <div style={{ marginTop: "2px" }}>
                              <span className={`pay-badge ${bill.paymentMethod?.toLowerCase()}`} style={{ padding: "1px 5px", fontSize: "9px" }}>
                                {bill.paymentMethod}
                              </span>
                              {due > 0 && <span style={{ color: "#ff4757", fontWeight: "bold", marginLeft: "8px" }}>Due: ₹{due.toLocaleString()}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <strong style={{ fontSize: "13px" }}>₹{bill.total?.toLocaleString()}</strong>
                            {due > 0 && (
                              <button 
                                className="btn-primary" 
                                style={{ padding: "3px 8px", fontSize: "10px", background: "#00c9a7", margin: 0, fontWeight: "800" }}
                                onClick={() => setProfileSettleModal({ show: true, sale: bill, amount: due })}
                              >
                                PAY
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit Settlement from Profile Modal */}
      {profileSettleModal.show && (
        <div className="modal-overlay" style={{ zIndex: 9995 }} onClick={() => setProfileSettleModal({ show: false, sale: null, amount: "" })}>
          <div className="modal-content form-modal" style={{ maxWidth: "450px", width: "90%" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe"></div>
            <h2>Record Credit Payment</h2>
            
            <div style={{ marginBottom: "15px", fontSize: "13px", padding: "10px", background: "rgba(0,0,0,0.02)", borderRadius: "4px" }}>
              <strong>Remaining Due:</strong> <span style={{ color: "#ff4757", fontWeight: "bold" }}>₹{((profileSettleModal.sale?.total || 0) - (profileSettleModal.sale?.creditPaidAmount || 0)).toLocaleString()}</span>
            </div>

            <div className="form-group">
              <label>Amount Received (₹)</label>
              <input 
                type="number" 
                value={profileSettleModal.amount} 
                onChange={e => setProfileSettleModal({ ...profileSettleModal, amount: e.target.value })} 
                placeholder="e.g. 1000"
              />
            </div>
            
            <div className="form-group">
              <label>Payment Method</label>
              <select value={profileSettleMethod} onChange={e => setProfileSettleMethod(e.target.value)}>
                <option value="CASH">💵 CASH</option>
                <option value="UPI">📱 UPI</option>
              </select>
            </div>

            <div className="modal-btns" style={{ marginTop: "20px" }}>
              <button className="btn-secondary" onClick={() => setProfileSettleModal({ show: false, sale: null, amount: "" })}>Cancel</button>
              <button className="btn-primary" style={{ background: "#00c9a7" }} onClick={confirmProfileSettle}>
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
