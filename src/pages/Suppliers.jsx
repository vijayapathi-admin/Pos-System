import React, { useState, useRef } from "react";
import { useApp } from "../AppContext";
import { exportToExcel } from "../utils";
import * as XLSX from "xlsx";

const emptyForm = { name: "", phone: "", location: "" };

export default function Suppliers() {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, importSuppliersBatch, purchases, settleSupplierCreditBill } = useApp();
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Ledger & Accounts Payable states
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [activePurchase, setActivePurchase] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [settleSaving, setSettleSaving] = useState(false);

  const getSupplierOutstanding = (supplierName) => {
    return (purchases || [])
      .filter(p => p.supplier?.toLowerCase() === supplierName?.toLowerCase() && p.paymentMethod === "CREDIT" && !p.isCreditPaid)
      .reduce((sum, p) => sum + ((p.grandTotal || 0) - (p.creditPaidAmount || 0)), 0);
  };

  const handleSettleSubmit = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) {
      alert("Please enter a valid amount.");
      return;
    }
    const amt = parseFloat(payAmount);
    const remaining = activePurchase.grandTotal - (activePurchase.creditPaidAmount || 0);
    if (amt > remaining) {
      alert(`Cannot pay more than the outstanding balance of ₹${remaining.toLocaleString()}.`);
      return;
    }
    setSettleSaving(true);
    try {
      await settleSupplierCreditBill(activePurchase, amt, payMethod);
      alert("Supplier credit payment logged successfully!");
      setShowSettleModal(false);
      setPayAmount("");
      
      // Keep active purchase up to date in view
      const updatedPurch = (purchases || []).find(p => p.id === activePurchase.id);
      if (updatedPurch) {
        setActivePurchase(updatedPurch);
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSettleSaving(false);
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.phone && s.phone.includes(searchTerm)) ||
    (s.location && s.location.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setShowModal(true); };
  const openEdit = (s) => { setForm({ name: s.name, phone: s.phone || "", location: s.location || "" }); setEditingId(s.id); setShowModal(true); };

  const handleSave = async () => {
    if (!form.name) { alert("Please enter supplier name."); return; }
    setSaving(true);
    try {
      if (editingId) {
        await updateSupplier(editingId, form);
      } else {
        await addSupplier(form);
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
    if (!confirm(`Delete supplier "${name}"?`)) return;
    await deleteSupplier(id);
  };

  const exportSuppliers = () => {
    const rows = [["#", "Supplier Name", "Contact", "Address", "Notes"]];
    suppliers.forEach((s, index) => {
      rows.push([
        index + 1,
        s.name,
        s.phone || s.contact || "",
        s.location || s.address || "",
        s.notes || ""
      ]);
    });
    exportToExcel("suppliers_master.xlsx", rows, "Suppliers");
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let validSuppliers = [];
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        
        let sheetsToProcess = [];
        const targetKeywords = [
          "supplier name", "supplier", "vendor name", "vendor", "name",
          "contact", "phone", "phone number", "mobile", "contact number",
          "address", "location", "city",
          "notes", "remarks", "note"
        ];

        for (const wsname of wb.SheetNames) {
          const ws = wb.Sheets[wsname];
          const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });
          if (!sheetData || sheetData.length === 0) continue;

          let headerRowIdx = 0;
          let maxMatches = 0;

          // Scan the first 15 rows for headers
          for (let i = 0; i < Math.min(15, sheetData.length); i++) {
            const row = sheetData[i];
            if (!row || !Array.isArray(row)) continue;

            let matches = 0;
            row.forEach(cell => {
              const val = String(cell || "").trim().toLowerCase();
              if (targetKeywords.some(kw => val.includes(kw))) {
                matches++;
              }
            });

            if (matches > maxMatches) {
              maxMatches = matches;
              headerRowIdx = i;
            }
          }

          // Require at least 2 keyword matches to process as a supplier sheet
          if (maxMatches >= 2) {
            sheetsToProcess.push({
              wsname,
              sheetData,
              headerRowIdx,
              maxMatches
            });
          }
        }

        // Fall back to first sheet if none met the threshold
        if (sheetsToProcess.length === 0 && wb.SheetNames.length > 0) {
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });
          if (sheetData && sheetData.length > 0) {
            let headerRowIdx = 0;
            let maxMatches = 0;

            for (let i = 0; i < Math.min(15, sheetData.length); i++) {
              const row = sheetData[i];
              if (!row || !Array.isArray(row)) continue;

              let matches = 0;
              row.forEach(cell => {
                const val = String(cell || "").trim().toLowerCase();
                if (targetKeywords.some(kw => val.includes(kw))) {
                  matches++;
                }
              });

              if (matches > maxMatches) {
                maxMatches = matches;
                headerRowIdx = i;
              }
            }

            sheetsToProcess.push({
              wsname,
              sheetData,
              headerRowIdx,
              maxMatches
            });
          }
        }

        const cleanString = (str) => {
          return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        };

        const findColumnIndex = (headersList, aliases) => {
          const cleanedHeaders = headersList.map(h => cleanString(h));
          const cleanedAliases = aliases.map(a => cleanString(a));

          // Try exact cleaned match first
          for (let i = 0; i < cleanedHeaders.length; i++) {
            if (cleanedHeaders[i] && cleanedAliases.includes(cleanedHeaders[i])) {
              return i;
            }
          }

          // Fall back to partial match
          for (let i = 0; i < cleanedHeaders.length; i++) {
            const hClean = cleanedHeaders[i];
            if (!hClean) continue;
            for (const alias of cleanedAliases) {
              if (alias && (hClean.includes(alias) || alias.includes(hClean))) {
                return i;
              }
            }
          }
          return -1;
        };

        const getVal = (row, idx, defaultValue = "") => {
          if (idx === undefined || idx === null || idx < 0 || idx >= row.length) {
            return defaultValue;
          }
          return row[idx];
        };

        // Process all matching sheets
        for (const sheetObj of sheetsToProcess) {
          const { sheetData, headerRowIdx, maxMatches } = sheetObj;

          // If we matched at least 2 headers, extract column offsets dynamically.
          // Otherwise, assume the sheet has no header row and uses standard export indices.
          const headers = (maxMatches >= 2 && sheetData[headerRowIdx])
            ? sheetData[headerRowIdx].map(h => String(h || "").trim().toLowerCase())
            : [];

          let nameIdx, phoneIdx, locationIdx, notesIdx;
          let startRowIdx = 1;

          if (maxMatches >= 2) {
            nameIdx = findColumnIndex(headers, ["supplier name", "supplier", "name", "vendor name", "vendor"]);
            phoneIdx = findColumnIndex(headers, ["contact", "phone", "phone number", "mobile", "contact number"]);
            locationIdx = findColumnIndex(headers, ["address", "location", "city"]);
            notesIdx = findColumnIndex(headers, ["notes", "remarks", "note"]);

            startRowIdx = headerRowIdx + 1;
          } else {
            nameIdx = 1;
            phoneIdx = 2;
            locationIdx = 3;
            notesIdx = 4;

            startRowIdx = 1;
          }

          for (let i = startRowIdx; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (!row || row.length === 0) continue;

            const supplierName = getVal(row, nameIdx, "")?.toString().trim() || "";
            // Skip header replica or empty name
            if (!supplierName || supplierName.toLowerCase() === "supplier name" || supplierName.toLowerCase() === "supplier") continue;

            validSuppliers.push({
              name: supplierName,
              phone: getVal(row, phoneIdx, "")?.toString().trim() || "",
              location: getVal(row, locationIdx, "")?.toString().trim() || "",
              notes: getVal(row, notesIdx, "")?.toString().trim() || ""
            });
          }
        }
      } catch (err) {
        console.error(err);
        alert("Error parsing Excel file. Make sure it is a valid Excel/CSV spreadsheet.");
        e.target.value = "";
        return;
      }
      
      if (validSuppliers.length === 0) {
        alert("No valid suppliers found to import. Make sure your sheet contains a column for Supplier Name.");
        e.target.value = "";
        return;
      }

      if (confirm(`Found ${validSuppliers.length} suppliers across matching sheet(s). Proceed with import?`)) {
        setSaving(true);
        try {
          await importSuppliersBatch(validSuppliers);
          alert("Import successful!");
        } catch (err) {
          console.error(err);
          alert("Error saving suppliers to database: " + err.message);
        } finally {
          setSaving(false);
          e.target.value = "";
        }
      } else {
        e.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="page">
      {saved && <div className="save-toast">✓ Saved</div>}
      <div className="page-header">
        <div>
          <div className="page-sub">SUPPLY CHAIN</div>
          <h1 className="page-title">Suppliers</h1>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button className="btn-secondary" onClick={exportSuppliers}>📥 EXPORT EXCEL</button>
          <button className="btn-secondary" onClick={() => fileInputRef.current.click()}>📤 IMPORT EXCEL</button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportExcel} 
            accept=".xlsx, .xls, .csv" 
            style={{ display: "none" }} 
          />
          <button className="btn-primary" onClick={openAdd}>+ ADD SUPPLIER</button>
        </div>
      </div>

      <div className="search-bar" style={{ marginBottom: "20px" }}>
        <input 
          type="text" 
          placeholder="🔍 Search suppliers by name, phone, or location..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
          style={{ width: "100%", padding: "12px 16px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "15px" }}
        />
      </div>

      <div className="suppliers-grid">
        {filteredSuppliers.map(supplier => (
          <div key={supplier.id} className="supplier-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px' }}>
            <div>
              <div className="supplier-card-header">
                <strong>{supplier.name}</strong>
                <div className="supplier-actions">
                  <button className="edit-btn" onClick={() => openEdit(supplier)}>✏️</button>
                  <button className="delete-btn" onClick={() => handleDelete(supplier.id, supplier.name)}>🗑</button>
                </div>
              </div>
              {supplier.phone && <div className="supplier-info">📞 {supplier.phone}</div>}
              {supplier.location && <div className="supplier-info">📍 {supplier.location}</div>}
              
              {/* Accounts Payable outstanding credit badge */}
              {(() => {
                const due = getSupplierOutstanding(supplier.name);
                if (due > 0) {
                  return (
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', background: 'rgba(255, 71, 87, 0.15)', color: '#ff4757', padding: '3px 8px', borderRadius: '4px', fontWeight: '800' }}>
                        OUTSTANDING DUE: ₹{due.toLocaleString()}
                      </span>
                    </div>
                  );
                } else {
                  return (
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', background: 'rgba(0, 201, 167, 0.15)', color: '#00c9a7', padding: '3px 8px', borderRadius: '4px', fontWeight: '800' }}>
                        NO OUTSTANDING DEBT
                      </span>
                    </div>
                  );
                }
              })()}
            </div>
            
            <button 
              className="btn-secondary" 
              onClick={() => {
                setSelectedSupplier(supplier);
                setShowLedgerModal(true);
              }}
              style={{ width: '100%', marginTop: '15px', padding: '8px', fontSize: '12px', fontWeight: '800', background: '#34495e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              📊 STATEMENTS & PAY
            </button>
          </div>
        ))}
        {filteredSuppliers.length === 0 && (
          <div className="empty-state">No suppliers found.</div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content form-modal" onClick={e => e.stopPropagation()}>
            <h2>{editingId ? "Edit Supplier" : "Add Supplier"}</h2>
            <div className="form-group">
              <label>Supplier Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sri Krishna Hardware Wholesale" />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+919876543210" />
            </div>
            <div className="form-group">
              <label>Location</label>
              <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Coimbatore, TN" />
            </div>
            <div className="modal-btns">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update" : "Add Supplier"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Supplier Ledger Modal */}
      {showLedgerModal && selectedSupplier && (() => {
        const supplierPurchases = (purchases || []).filter(p => p.supplier?.toLowerCase() === selectedSupplier.name?.toLowerCase());
        const totalSpend = supplierPurchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);
        const totalPaid = supplierPurchases.reduce((sum, p) => sum + (p.paymentMethod === 'CREDIT' ? (p.creditPaidAmount || 0) : (p.grandTotal || 0)), 0);
        const totalDebt = totalSpend - totalPaid;

        return (
          <div className="modal-overlay" onClick={() => { setShowLedgerModal(false); setSelectedSupplier(null); }}>
            <div className="modal-content" style={{ maxWidth: '850px', width: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="modal-stripe" style={{ background: '#34495e' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2>Supplier Ledger: {selectedSupplier.name}</h2>
                <button className="btn-secondary" onClick={() => { setShowLedgerModal(false); setSelectedSupplier(null); }}>CLOSE</button>
              </div>

              {selectedSupplier.phone && <div style={{ fontSize: '14px', marginBottom: '4px' }}><strong>Phone:</strong> {selectedSupplier.phone}</div>}
              {selectedSupplier.location && <div style={{ fontSize: '14px', marginBottom: '15px' }}><strong>Location:</strong> {selectedSupplier.location}</div>}

              {/* Summary Widgets */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.1)', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: 'bold' }}>LIFETIME PURCHASES</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563eb', marginTop: '4px' }}>₹{totalSpend.toLocaleString()}</div>
                </div>
                <div style={{ background: 'rgba(0, 201, 167, 0.05)', border: '1px solid rgba(0, 201, 167, 0.1)', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#00c9a7', fontWeight: 'bold' }}>CREDIT PAID / SETTLED</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#00c9a7', marginTop: '4px' }}>₹{totalPaid.toLocaleString()}</div>
                </div>
                <div style={{ background: 'rgba(255, 71, 87, 0.05)', border: '1px solid rgba(255, 71, 87, 0.1)', padding: '12px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', color: '#ff4757', fontWeight: 'bold' }}>OUTSTANDING AP DUE</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ff4757', marginTop: '4px' }}>₹{totalDebt.toLocaleString()}</div>
                </div>
              </div>

              {/* Purchase History Ledger */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Inward Purchases & Settlements</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>DATE</th>
                      <th>INVOICE NO.</th>
                      <th>PAYMENT MODE</th>
                      <th style={{ textAlign: 'right' }}>GRAND TOTAL</th>
                      <th style={{ textAlign: 'right' }}>PAID</th>
                      <th style={{ textAlign: 'right' }}>OUTSTANDING</th>
                      <th style={{ textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierPurchases.map(p => {
                      const paid = p.paymentMethod === 'CREDIT' ? (p.creditPaidAmount || 0) : (p.grandTotal || 0);
                      const due = (p.grandTotal || 0) - paid;
                      return (
                        <tr key={p.id}>
                          <td>{p.date}</td>
                          <td>{p.invoiceNumber || "-"}</td>
                          <td>
                            <span style={{ 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              fontSize: '10px', 
                              fontWeight: 'bold',
                              background: p.paymentMethod === 'CREDIT' ? 'rgba(0, 201, 167, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                              color: p.paymentMethod === 'CREDIT' ? '#00c9a7' : '#2563eb'
                            }}>
                              {p.paymentMethod === 'CREDIT' ? 'CREDIT' : 'CASH'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold' }}>₹{p.grandTotal?.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', color: '#00c9a7' }}>₹{paid.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', color: due > 0 ? '#ff4757' : '#888', fontWeight: due > 0 ? 'bold' : 'normal' }}>
                            ₹{due.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {p.paymentMethod === 'CREDIT' && due > 0 ? (
                              <button 
                                className="btn-primary" 
                                onClick={() => {
                                  setActivePurchase(p);
                                  setPayAmount(due.toString());
                                  setShowSettleModal(true);
                                }}
                                style={{ padding: '6px 12px', fontSize: '11px', background: '#ff4757', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                💵 PAY DUE
                              </button>
                            ) : (
                              <span style={{ color: '#00c9a7', fontSize: '12px', fontWeight: 'bold' }}>✓ SETTLED</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {supplierPurchases.length === 0 && (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: '15px', color: '#888' }}>No purchase statements recorded for this supplier.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Settle Outstanding Installment Popup */}
      {showSettleModal && activePurchase && (
        <div className="modal-overlay" style={{ zIndex: 9995 }} onClick={() => setShowSettleModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: '#00c9a7' }} />
            <h2>Pay Supplier Due</h2>
            <div style={{ marginBottom: '15px', fontSize: '13px', borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '10px', marginTop: '10px' }}>
              <div style={{ marginBottom: '4px' }}><strong>Supplier:</strong> {activePurchase.supplier}</div>
              <div style={{ marginBottom: '4px' }}><strong>Invoice:</strong> {activePurchase.invoiceNumber || "N/A"}</div>
              <div><strong>Outstanding Balance:</strong> <span style={{ color: '#ff4757', fontWeight: 'bold' }}>₹{((activePurchase.grandTotal || 0) - (activePurchase.creditPaidAmount || 0)).toLocaleString()}</span></div>
            </div>

            <div className="form-group">
              <label>Amount to Pay (₹) *</label>
              <input 
                type="number" 
                value={payAmount} 
                onChange={e => setPayAmount(e.target.value)} 
                placeholder="e.g. 5000"
                style={{ width: '100%', padding: '8px', fontSize: '13px', background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
              />
            </div>

            <div className="form-group">
              <label>Payment Method</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', padding: '8px', fontSize: '13px', background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                <option value="CASH" style={{ background: '#222', color: '#fff' }}>💵 CASH Drawer</option>
                <option value="UPI" style={{ background: '#222', color: '#fff' }}>📱 UPI / Bank Transfer</option>
              </select>
            </div>

            <div className="modal-btns" style={{ marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setShowSettleModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSettleSubmit} disabled={settleSaving} style={{ background: '#00c9a7' }}>
                {settleSaving ? "Logging Payout..." : "Save Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
