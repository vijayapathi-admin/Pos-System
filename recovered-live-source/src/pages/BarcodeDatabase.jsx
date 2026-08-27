import React, { useState, useRef, useEffect } from "react";
import { useApp } from "../AppContext";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import BarcodeGenerator from "../components/BarcodeGenerator";
import ShopMap from "../components/ShopMap";

const CATEGORIES = ["HARDWARE", "ELECTRICAL", "PLUMBING", "SANITARYWARE", "BATHROOM FITTINGS", "MOTORS", "HOUSE APPLIANCES"];

const CATEGORY_PREFIXES = {
  "HARDWARE": "HRD",
  "ELECTRICAL": "ELE",
  "PLUMBING": "PLM",
  "SANITARYWARE": "SAN",
  "BATHROOM FITTINGS": "BTH",
  "MOTORS": "MOT",
  "HOUSE APPLIANCES": "HAP"
};

const TALLY_UNITS = ["nos", "FEET", "MTR", "KG", "GRAM", "LTR", "SET", "RS"];

export default function BarcodeDatabase() {
  const { products, addProduct, updateProduct, suppliers, addNotification } = useApp();
  
  const [scanValue, setScanValue] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [matchedProduct, setMatchedProduct] = useState(null);
  const [isSearched, setIsSearched] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Quick Edit States
  const [editPrice, setEditPrice] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editRack, setEditRack] = useState("");
  const [showMap, setShowMap] = useState(false);
  
  // Quick Create Form States (when scanned code doesn't exist)
  const [createForm, setCreateForm] = useState({
    name: "",
    category: "HARDWARE",
    purchasePrice: "",
    sellingPrice: "",
    stock: "",
    unit: "nos",
    supplier: "",
    lowStockThreshold: ""
  });

  // Auto-lookup as user types or on submit
  useEffect(() => {
    if (!scanValue.trim()) {
      setMatchedProduct(null);
      setIsSearched(false);
      return;
    }
    
    let query = scanValue.trim().toLowerCase();
    // Strip start/stop asterisks from barcode scanners (e.g., *BTH-123* -> bth-123)
    if (query.startsWith("*") && query.endsWith("*") && query.length > 1) {
      query = query.substring(1, query.length - 1);
    } else if (query.startsWith("*")) {
      query = query.substring(1);
    } else if (query.endsWith("*")) {
      query = query.substring(0, query.length - 1);
    }
    
    const found = products.find(p => 
      p.productCode?.trim().toLowerCase() === query ||
      p.id?.trim().toLowerCase() === query
    );
    
    if (found) {
      setMatchedProduct(found);
      setEditPrice(found.sellingPrice || "");
      setEditStock(found.stock || "");
      setEditRack(found.shelfLocation || "");
      setShowMap(false);
    } else {
      setMatchedProduct(null);
    }
    setIsSearched(true);
  }, [scanValue, products]);

  const handleBarcodeScan = (scannedCode) => {
    setShowScanner(false);
    if (scannedCode) {
      let codeClean = scannedCode.trim();
      if (codeClean.startsWith("*") && codeClean.endsWith("*") && codeClean.length > 1) {
        codeClean = codeClean.substring(1, codeClean.length - 1);
      }
      setScanValue(codeClean);
    }
  };

  const handleQuickSave = async () => {
    if (!matchedProduct) return;
    setSaving(true);
    try {
      const updatedData = {
        sellingPrice: parseFloat(editPrice) || 0,
        stock: parseFloat(editStock) || 0,
        shelfLocation: editRack.trim()
      };
      
      await updateProduct(matchedProduct.id, updatedData);
      addNotification("Product Updated", `Successfully updated ${matchedProduct.name}`, "success");
    } catch (err) {
      alert("Error saving: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const suggestProductCode = (cat) => {
    const prefix = CATEGORY_PREFIXES[cat.toUpperCase()] || "PRD";
    const catProducts = products.filter(p => p.category?.toUpperCase() === cat.toUpperCase());
    
    let maxNum = 0;
    catProducts.forEach(p => {
      if (p.productCode && p.productCode.startsWith(prefix + "-")) {
        const numPart = p.productCode.split("-")[1];
        const num = parseInt(numPart);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    
    return `${prefix}-${(maxNum + 1).toString().padStart(3, '0')}`;
  };

  const handleQuickCreate = async (e) => {
    e.preventDefault();
    if (!createForm.name || !createForm.sellingPrice || !createForm.purchasePrice) {
      alert("Please fill in name, purchase price, and selling price.");
      return;
    }
    
    setSaving(true);
    try {
      const barcodeCode = scanValue.trim().toUpperCase();
      
      const newProductData = {
        name: createForm.name,
        category: createForm.category,
        purchasePrice: parseFloat(createForm.purchasePrice) || 0,
        sellingPrice: parseFloat(createForm.sellingPrice) || 0,
        stock: parseFloat(createForm.stock) || 0,
        unit: createForm.unit || "nos",
        supplier: createForm.supplier || "",
        productCode: barcodeCode,
        hsnCode: "",
        gstRate: 18,
        lowStockThreshold: parseInt(createForm.lowStockThreshold) || (["CPVC", "PVC", "UPVC"].includes(createForm.category?.toUpperCase()) ? 20 : 40),
        shelfLocation: "",
        totalSold: 0
      };
      
      await addProduct(newProductData);
      addNotification("Product Created", `Successfully added ${createForm.name} under code ${barcodeCode}!`, "success");
      
      // Clear form and refocus
      setCreateForm({
        name: "",
        category: "HARDWARE",
        purchasePrice: "",
        sellingPrice: "",
        stock: "",
        unit: "nos",
        supplier: "",
        lowStockThreshold: ""
      });
    } catch (err) {
      alert("Error creating product: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Calculations for Markup / Margin
  const markupPercent = matchedProduct && matchedProduct.purchasePrice
    ? (((parseFloat(editPrice) || matchedProduct.sellingPrice) - matchedProduct.purchasePrice) / matchedProduct.purchasePrice * 100).toFixed(1)
    : 0;

  const profitMargin = matchedProduct && editPrice
    ? (((parseFloat(editPrice) || matchedProduct.sellingPrice) - matchedProduct.purchasePrice) / (parseFloat(editPrice) || matchedProduct.sellingPrice) * 100).toFixed(1)
    : 0;

  const getHighlightZone = (product) => {
    if (!product) return "";
    const loc = String(product.shelfLocation || "").toUpperCase();
    if (loc.includes("AISLE A") || loc.includes("RACK A") || loc.includes("HARDWARE")) return "A";
    if (loc.includes("AISLE B") || loc.includes("RACK B") || loc.includes("ELECTRICAL")) return "B";
    if (loc.includes("AISLE C") || loc.includes("RACK C") || loc.includes("PLUMBING") || loc.includes("CPVC") || loc.includes("PVC") || loc.includes("UPVC")) return "C";
    if (loc.includes("AISLE D") || loc.includes("RACK D") || loc.includes("SANITARY")) return "D";
    if (loc.includes("AISLE E") || loc.includes("RACK E") || loc.includes("BATHROOM") || loc.includes("MOTOR")) return "E";
    
    const cat = String(product.category || "").toUpperCase();
    if (cat === "HARDWARE") return "A";
    if (cat === "ELECTRICAL") return "B";
    if (["CPVC", "PVC", "UPVC"].includes(cat)) return "C";
    if (cat === "SANITARYWARE" || cat === "SANITARY") return "D";
    if (["BATHROOM FITTINGS", "MOTORS", "HOUSE APPLIANCES"].includes(cat)) return "E";
    
    return "A";
  };

  return (
    <div className="page barcode-db-page" style={{ paddingBottom: "40px" }}>
      <div className="page-header" style={{ marginBottom: "25px" }}>
        <div>
          <div className="page-sub">ENTERPRISE INVENTORY</div>
          <h1 className="page-title">🏷️ Barcode Lookup & Database</h1>
        </div>
        <button 
          className="btn-primary" 
          onClick={() => setShowScanner(true)}
          style={{ background: "#2563eb", padding: "10px 20px", display: "inline-flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}
        >
          📷 SCAN BARCODE VIA PHONE
        </button>
      </div>

      {/* Main Search Panel */}
      <div className="stat-card" style={{ background: "rgba(24, 18, 54, 0.6)", border: "1.5px solid rgba(37, 99, 235, 0.15)", padding: "24px", borderRadius: "12px", marginBottom: "25px" }}>
        <h3 style={{ margin: "0 0 10px 0", color: "#2563eb", fontWeight: "800", fontSize: "15px", letterSpacing: "1px" }}>🚀 SCAN OR TYPE BARCODE / PRODUCT CODE</h3>
        <div style={{ display: "flex", gap: "10px", alignItems: "stretch" }}>
          <input
            type="text"
            placeholder="Scan barcode with phone, laser scanner, or type code here... (e.g. PLM-001)"
            value={scanValue}
            onChange={e => setScanValue(e.target.value)}
            style={{ fontSize: "16px", padding: "12px 16px", flex: 1 }}
            autoFocus
          />
          {scanValue && (
            <button 
              className="btn-secondary" 
              onClick={() => setScanValue("")}
              style={{ padding: "0 20px" }}
            >
              CLEAR
            </button>
          )}
        </div>
      </div>

      {/* Results Section */}
      {isSearched && scanValue.trim() && (
        <div className="results-container">
          {matchedProduct ? (
            /* PRODUCT DETAILS & LIVE RACK / PRICE QUICK EDIT CARD */
            <div className="barcode-db-grid">
              
              {/* Product Dashboard Card */}
              <div className="stat-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div style={{ borderBottom: "1.5px solid rgba(120, 113, 108, 0.15)", paddingBottom: "15px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span style={{ fontSize: "11px", background: "rgba(0, 201, 167, 0.15)", color: "#00c9a7", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold", textTransform: "uppercase" }}>
                      {matchedProduct.category}
                    </span>
                    <h2 style={{ margin: "8px 0 4px 0", color: "#fff" }}>{matchedProduct.name}</h2>
                    <span style={{ fontSize: "12px", color: "#888", fontFamily: "monospace" }}>ID: {matchedProduct.id}</span>
                  </div>
                  <BarcodeGenerator value={matchedProduct.productCode} showText={true} height={50} />
                </div>

                <div className="barcode-three-grid">
                  <div className="detail-pill" style={{ background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.04)", padding: "12px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "10px", color: "#888", display: "block", marginBottom: "4px" }}>COST PRICE</span>
                    <strong style={{ fontSize: "16px", color: "#fff" }}>₹{matchedProduct.purchasePrice}</strong>
                  </div>
                  <div className="detail-pill" style={{ background: "rgba(255, 255, 255, 0.01)", border: "1px solid rgba(255, 255, 255, 0.04)", padding: "12px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "10px", color: "#888", display: "block", marginBottom: "4px" }}>SELLING PRICE</span>
                    <strong style={{ fontSize: "16px", color: "#2563eb" }}>₹{matchedProduct.sellingPrice}</strong>
                  </div>
                  <div className="detail-pill" style={{ background: "rgba(255, 255, 255, 0.01)", border: "1px solid rgba(255, 255, 255, 0.04)", padding: "12px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "10px", color: "#888", display: "block", marginBottom: "4px" }}>CURRENT STOCK</span>
                    <strong style={{ fontSize: "16px", color: matchedProduct.stock <= (matchedProduct.lowStockThreshold || 5) ? "#ff4757" : "#2ecc71" }}>
                      {matchedProduct.stock} {matchedProduct.unit || "nos"}
                    </strong>
                  </div>
                </div>

                <div className="barcode-two-grid">
                  <div className="detail-pill" style={{ background: "rgba(255, 255, 255, 0.01)", border: "1px solid rgba(255, 255, 255, 0.04)", padding: "12px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "10px", color: "#888", display: "block", marginBottom: "4px" }}>ASSIGNED SUPPLIER</span>
                    <strong style={{ fontSize: "14px", color: "#fff" }}>🚚 {matchedProduct.supplier || "Unassigned"}</strong>
                  </div>
                  <div className="detail-pill" style={{ background: "rgba(255, 255, 255, 0.01)", border: "1px solid rgba(255, 255, 255, 0.04)", padding: "12px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "10px", color: "#888", display: "block", marginBottom: "4px" }}>TOTAL UNITS SOLD</span>
                    <strong style={{ fontSize: "14px", color: "#fff" }}>📈 {matchedProduct.totalSold || 0} {matchedProduct.unit || "nos"}</strong>
                  </div>
                </div>

                <div style={{ padding: "15px", borderRadius: "8px", background: "rgba(0, 201, 167, 0.03)", border: "1.5px dashed rgba(0, 201, 167, 0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: "13px", color: "#00c9a7", display: "block" }}>💸 Estimated Profit Breakdown:</strong>
                    <span style={{ fontSize: "11px", color: "#aaa" }}>Markup: {markupPercent}% | Profit Margin: {profitMargin}%</span>
                  </div>
                  <strong style={{ fontSize: "16px", color: "#00c9a7" }}>
                    +₹{((parseFloat(editPrice) || matchedProduct.sellingPrice) - matchedProduct.purchasePrice).toFixed(2)} / item
                  </strong>
                </div>
              </div>

              {/* Quick Adjustment & Live Rack Locator Card */}
              <div className="stat-card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <h3 style={{ margin: 0, color: "#fff", borderBottom: "1.5px solid rgba(120, 113, 108, 0.15)", paddingBottom: "10px" }}>✏️ Quick Adjustment Panel</h3>
                
                <div className="barcode-half-grid">
                  <div className="form-group">
                    <label>Modify Selling Price (₹)</label>
                    <input 
                      type="number" 
                      value={editPrice} 
                      onChange={e => setEditPrice(e.target.value)} 
                      placeholder="Selling Price"
                    />
                  </div>
                  <div className="form-group">
                    <label>Modify Stock Quantity</label>
                    <div style={{ display: "flex", gap: "5px" }}>
                      <input 
                        type="number" 
                        step="any"
                        value={editStock} 
                        onChange={e => setEditStock(e.target.value)} 
                        placeholder="Stock Quantity"
                        style={{ flex: 1 }}
                      />
                      <span style={{ padding: "8px", fontSize: "12px", background: "rgba(120, 113, 108, 0.1)", borderRadius: "4px", display: "flex", alignItems: "center" }}>
                        {matchedProduct.unit || "nos"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Shelf Location (Aisle/Rack)</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input 
                      value={editRack} 
                      onChange={e => setEditRack(e.target.value)} 
                      placeholder="e.g. Rack A-3, Shelf 2"
                      style={{ flex: 1 }}
                    />
                    <button 
                      className="btn-secondary" 
                      onClick={() => setShowMap(!showMap)}
                      style={{ padding: "0 15px", whiteSpace: "nowrap" }}
                    >
                      {showMap ? "Hide Map" : "📍 Locate Rack"}
                    </button>
                  </div>
                </div>

                {showMap && (
                  <div style={{ marginTop: "10px", padding: "10px", borderRadius: "8px", background: "rgba(0,0,0,0.15)" }}>
                    <strong style={{ display: "block", fontSize: "12px", marginBottom: "8px", color: "#2563eb" }}>
                      Highlighting Zone: {getHighlightZone(matchedProduct)} (Rack: {editRack || "A-Aisle"})
                    </strong>
                    <ShopMap highlightZone={getHighlightZone(matchedProduct)} />
                  </div>
                )}

                <button 
                  className="btn-primary" 
                  onClick={handleQuickSave} 
                  disabled={saving}
                  style={{ width: "100%", marginTop: "auto", fontWeight: "bold" }}
                >
                  {saving ? "SAVING..." : "💾 SAVE CHANGES TO DATABASE"}
                </button>
              </div>

            </div>
          ) : (
            /* QUICK CREATION FORM FOR UNSCANNED / NEW BARCODE */
            <div className="stat-card" style={{ border: "2px dashed #2563eb", background: "rgba(37,99,235,0.01)", padding: "30px", borderRadius: "12px" }}>
              <div className="success-icon" style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb", width: "50px", height: "50px", fontSize: "24px" }}>⚠️</div>
              <h2 style={{ color: "#fff", marginTop: "15px", marginBottom: "8px" }}>New Barcode Code Detected!</h2>
              <p style={{ color: "#aaa", fontSize: "14px", margin: 0 }}>
                Scanned barcode code <strong style={{ color: "#2563eb", fontFamily: "monospace" }}>"{scanValue.toUpperCase()}"</strong> was not found in the inventory database. Fill out the form below to quickly register this item now!
              </p>
              
              <form onSubmit={handleQuickCreate} style={{ marginTop: "25px", display: "flex", flexDirection: "column", gap: "20px" }}>
                <div className="barcode-create-grid-1">
                  <div className="form-group">
                    <label>Product Name *</label>
                    <input 
                      value={createForm.name} 
                      onChange={e => setCreateForm({ ...createForm, name: e.target.value })} 
                      placeholder="e.g. Supreme UPVC Pipe 1.25 inch"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select 
                      value={createForm.category} 
                      onChange={e => setCreateForm({ ...createForm, category: e.target.value })}
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="barcode-create-grid-2">
                  <div className="form-group">
                    <label>Purchase Cost Price (₹) *</label>
                    <input 
                      type="number" 
                      value={createForm.purchasePrice} 
                      onChange={e => setCreateForm({ ...createForm, purchasePrice: e.target.value })} 
                      placeholder="Cost Price"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Selling Price (₹) *</label>
                    <input 
                      type="number" 
                      value={createForm.sellingPrice} 
                      onChange={e => setCreateForm({ ...createForm, sellingPrice: e.target.value })} 
                      placeholder="Selling Price"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Stock Quantity & Unit</label>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <input 
                        type="number" 
                        step="any"
                        value={createForm.stock} 
                        onChange={e => setCreateForm({ ...createForm, stock: e.target.value })} 
                        placeholder="Quantity"
                        style={{ flex: 2 }}
                      />
                      <select 
                        value={createForm.unit} 
                        onChange={e => setCreateForm({ ...createForm, unit: e.target.value })}
                        style={{ flex: 1 }}
                      >
                        {TALLY_UNITS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="barcode-create-grid-3">
                  <div className="form-group">
                    <label>Supplier Name</label>
                    <input 
                      list="create-suppliers-list"
                      value={createForm.supplier} 
                      onChange={e => setCreateForm({ ...createForm, supplier: e.target.value })} 
                      placeholder="Select or enter supplier..."
                    />
                    <datalist id="create-suppliers-list">
                      {suppliers.map(s => (
                        <option key={s.id} value={s.name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>Low Stock Threshold Alert level</label>
                    <input 
                      type="number" 
                      value={createForm.lowStockThreshold} 
                      onChange={e => setCreateForm({ ...createForm, lowStockThreshold: e.target.value })} 
                      placeholder={["PLUMBING", "CPVC", "PVC", "UPVC"].includes(createForm.category?.toUpperCase()) ? "20" : "40"}
                    />
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ background: "#2563eb", alignSelf: "flex-end", padding: "12px 28px", fontWeight: "bold" }}
                  disabled={saving}
                >
                  {saving ? "Creating Product..." : `➕ QUICK CREATE PRODUCT WITH BARCODE: "${scanValue.toUpperCase()}"`}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Barcode Scanner Modal overlay */}
      {showScanner && (
        <BarcodeScannerModal 
          onClose={() => setShowScanner(false)} 
          onScan={handleBarcodeScan} 
        />
      )}
    </div>
  );
}
