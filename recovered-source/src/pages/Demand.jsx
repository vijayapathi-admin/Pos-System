import React, { useState, useMemo } from "react";
import { useApp } from "../AppContext";
import ShopMap from "../components/ShopMap";
import SearchableSelect from "../components/SearchableSelect";

const FILTERS = ["ALL", "URGENT", "WARNING", "OK", "DEAD_STOCK", "FAST", "SLOW"];
const SHORTAGE_STATUSES = ["ALL", "REQUESTED", "ORDERED", "RECEIVED", "FULFILLED"];

function SalesForecastChart({ forecast }) {
  if (!forecast || forecast.length === 0) {
    return (
      <div style={{ color: "#888", fontSize: "12px", fontStyle: "italic", padding: "10px", background: "rgba(0,0,0,0.15)", border: "1px dashed rgba(120, 113, 108, 0.15)", borderRadius: "6px" }}>
        No ARIMA time-series data available. Connect AI server and run sync to populate.
      </div>
    );
  }

  const width = 500;
  const height = 150;
  const paddingLeft = 35;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 25;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const peak = Math.max(1, ...forecast.map(f => f.predicted));

  // Compute points coordinate array
  const points = forecast.map((f, i) => {
    const x = paddingLeft + i * (chartWidth / 6);
    const y = paddingTop + chartHeight - (f.predicted / peak) * chartHeight;
    return { x, y, value: f.predicted, date: f.date };
  });

  // Generate curved Bezier paths
  let pathD = "";
  let areaD = "";
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    areaD = `M ${points[0].x} ${paddingTop + chartHeight} L ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpX1 = prev.x + (curr.x - prev.x) / 2;
      const cpY1 = prev.y;
      const cpX2 = prev.x + (curr.x - prev.x) / 2;
      const cpY2 = curr.y;
      pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
      areaD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
    }
    areaD += ` L ${points[points.length - 1].x} ${paddingTop + chartHeight} Z`;
  }

  return (
    <div className="forecast-chart-container" style={{ width: "100%", maxWidth: "500px", background: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(120, 113, 108, 0.1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "10px", color: "#aaa" }}>
        <span>📈 7-DAY FORECAST DEMAND WINDOW</span>
        <span style={{ color: "#00c9a7", fontWeight: "bold" }}>Peak: {peak.toFixed(1)}/day</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00c9a7" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00c9a7" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00c9a7" />
            <stop offset="100%" stopColor="#00f2fe" />
          </linearGradient>
        </defs>

        {/* Faint Horizontal Grids */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const yVal = paddingTop + chartHeight * ratio;
          const val = peak * (1 - ratio);
          return (
            <g key={idx}>
              <line x1={paddingLeft} y1={yVal} x2={width - paddingRight} y2={yVal} stroke="rgba(120, 113, 108, 0.1)" strokeDasharray="2 2" />
              <text x={paddingLeft - 6} y={yVal + 3} textAnchor="end" fill="#666" fontSize="8">{val.toFixed(1)}</text>
            </g>
          );
        })}

        {/* Shaded Area under curve */}
        {areaD && <path d={areaD} fill="url(#chartGradient)" />}

        {/* Dynamic Curved Spline */}
        {pathD && <path d={pathD} fill="none" stroke="url(#lineGradient)" strokeWidth="3" strokeLinecap="round" />}

        {/* Nodes & Text Labels */}
        {points.map((p, i) => {
          const d = new Date(p.date);
          const dayLabel = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="5" fill="#111" stroke="#00c9a7" strokeWidth="2.5" />
              <circle cx={p.x} cy={p.y} r="2.5" fill="#fff" />
              <text x={p.x} y={p.y - 8} textAnchor="middle" fill="#fff" fontSize="8" fontWeight="bold">{p.value.toFixed(1)}</text>
              <text x={p.x} y={height - 6} textAnchor="middle" fill="#555" fontSize="8">{dayLabel}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Demand() {
  const { 
    getDemandData, 
    fetchAiPredictions, 
    loadingPredictions, 
    suppliers,
    products,
    shortages, 
    addShortage, 
    updateShortage, 
    deleteShortage,
    weekendList, 
    addWeekendItem, 
    updateWeekendItem, 
    deleteWeekendItem
  } = useApp();

  const [activeTab, setActiveTab] = useState("ai_demand"); // "ai_demand" | "shortage_book" | "weekend_planner"

  // AI Tab State
  const [filter, setFilter] = useState("ALL");
  const [expandedProductId, setExpandedProductId] = useState(null);
  const [locateProduct, setLocateProduct] = useState(null);
  const [showAiReorderModal, setShowAiReorderModal] = useState(false);

  // Shortages Tab State
  const [shortageFilter, setShortageFilter] = useState("ALL");
  const [shortageSearch, setShortageSearch] = useState("");
  const [showAddShortageModal, setShowAddShortageModal] = useState(false);
  const [newShortageIsCustom, setNewShortageIsCustom] = useState(true);
  const [newShortageProductId, setNewShortageProductId] = useState("");
  const [newShortageItemName, setNewShortageItemName] = useState("");
  const [newShortageQty, setNewShortageQty] = useState(1);
  const [newShortageCustomerName, setNewShortageCustomerName] = useState("");
  const [newShortageCustomerPhone, setNewShortageCustomerPhone] = useState("");
  const [newShortageNotes, setNewShortageNotes] = useState("");

  const catalogProductOptions = useMemo(() => {
    return products.map(p => ({
      value: p.id,
      label: `${p.name} (Code: ${p.productCode || "-"} | Stock: ${p.stock})`
    }));
  }, [products]);


  // Weekend Planner State
  const [showAddWeekendModal, setShowAddWeekendModal] = useState(false);
  const [newWeekendName, setNewWeekendName] = useState("");
  const [newWeekendQty, setNewWeekendQty] = useState(1);
  const [newWeekendCategory, setNewWeekendCategory] = useState("Hardware");
  const [newWeekendNotes, setNewWeekendNotes] = useState("");
  const [checkedAiIds, setCheckedAiIds] = useState(new Set()); // Local checkbox state for dynamic AI alerts

  const demandData = getDemandData();

  // Urgent counts
  const urgent = demandData.filter(d => d.status === "urgent").length;
  const lowStockCount = demandData.filter(d => d.status === "warning").length;
  const dead = demandData.filter(d => d.status === "dead").length;
  const fast = demandData.filter(d => d.speed === "fast").length;
  const slow = demandData.filter(d => d.speed === "slow").length;

  const filtered = demandData.filter(d => {
    if (filter === "ALL") return true;
    if (filter === "URGENT") return d.status === "urgent";
    if (filter === "WARNING") return d.status === "warning";
    if (filter === "OK") return d.status === "ok";
    if (filter === "DEAD_STOCK") return d.status === "dead";
    if (filter === "FAST") return d.speed === "fast";
    if (filter === "SLOW") return d.speed === "slow";
    return true;
  });

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

  const StatusBadge = ({ status }) => {
    if (status === "urgent") return <span className="badge urgent">⚠ REORDER URGENT</span>;
    if (status === "warning") return <span className="badge warning">⚡ LOW STOCK</span>;
    if (status === "dead") return <span className="badge" style={{ background: "#000", color: "#fff" }}>☠ DEAD STOCK</span>;
    return <span className="badge ok">✓ STOCK OK</span>;
  };

  const SpeedBadge = ({ speed }) => (
    <span className={`speed-badge ${speed}`}>⚡ {speed.toUpperCase()}</span>
  );

  // Shortage Book logic
  const handleSaveShortage = async () => {
    if (newShortageIsCustom && !newShortageItemName.trim()) {
      alert("Please enter the requested item name");
      return;
    }
    if (!newShortageIsCustom && !newShortageProductId) {
      alert("Please select a product from catalog");
      return;
    }

    let finalName = newShortageItemName;
    if (!newShortageIsCustom) {
      const prod = products.find(p => p.id === newShortageProductId);
      finalName = prod ? prod.name : "";
    }

    const shortageDataObj = {
      itemName: finalName,
      productId: newShortageIsCustom ? "" : newShortageProductId,
      qty: parseInt(newShortageQty) || 1,
      customerName: newShortageCustomerName || "Walk-in Customer",
      customerPhone: newShortageCustomerPhone || "",
      notes: newShortageNotes,
      status: "REQUESTED",
      isCustom: newShortageIsCustom
    };

    try {
      await addShortage(shortageDataObj);
      setShowAddShortageModal(false);
      // Reset inputs
      setNewShortageItemName("");
      setNewShortageProductId("");
      setNewShortageQty(1);
      setNewShortageCustomerName("");
      setNewShortageCustomerPhone("");
      setNewShortageNotes("");
    } catch (e) {
      alert("Error logging shortage: " + e.message);
    }
  };

  const handleWhatsAppShortage = (item) => {
    if (!item || !item.customerPhone) return;
    const cleanPhone = item.customerPhone.replace(/\D/g, "");
    const msg = `Hello *${item.customerName}*,\n\nGood news! The item *${item.itemName}* you requested from *Vijayapathi Traders* has arrived and is now in stock!\n\nWe have reserved *${item.qty} Nos* for you. Please visit the shop to collect it at your earliest convenience.\n\nThank you!\n_Vijayapathi Traders_`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const filteredShortages = (shortages || []).filter(item => {
    const matchesSearch = item.itemName?.toLowerCase().includes(shortageSearch.toLowerCase()) || 
                          item.customerName?.toLowerCase().includes(shortageSearch.toLowerCase()) || 
                          item.customerPhone?.includes(shortageSearch);
    const matchesStatus = shortageFilter === "ALL" || item.status === shortageFilter;
    return matchesSearch && matchesStatus;
  });

  const getShortageStatusBadge = (status) => {
    switch (status) {
      case "REQUESTED":
        return <span className="badge warning" style={{ background: "#f39c12", color: "#fff" }}>🟡 REQUESTED</span>;
      case "ORDERED":
        return <span className="badge info" style={{ background: "#2980b9", color: "#fff" }}>🔵 ORDERED</span>;
      case "RECEIVED":
        return <span className="badge ok" style={{ background: "#27ae60", color: "#fff" }}>🟢 IN STOCK</span>;
      case "FULFILLED":
        return <span className="badge" style={{ background: "#555", color: "#fff" }}>⚫ FULFILLED</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  // Weekend Planner logic
  const handleSaveWeekendItem = async () => {
    if (!newWeekendName.trim()) {
      alert("Please enter the item name");
      return;
    }
    const itemData = {
      name: newWeekendName,
      qty: parseInt(newWeekendQty) || 1,
      category: newWeekendCategory,
      notes: newWeekendNotes,
      checked: false
    };

    try {
      await addWeekendItem(itemData);
      setShowAddWeekendModal(false);
      setNewWeekendName("");
      setNewWeekendQty(1);
      setNewWeekendNotes("");
    } catch (e) {
      alert("Error adding manual item: " + e.message);
    }
  };

  const pendingShortages = (shortages || []).filter(s => s.status === "REQUESTED" || s.status === "ORDERED");
  
  // Dynamic AI alerts list
  const aiAlerts = demandData.filter(d => d.daysLeft < 10 && d.stock < (d.avgPerDay * 15 || 15));

  const handlePrintWeekendChecklist = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    
    const activeAiAlerts = aiAlerts.filter(alert => !checkedAiIds.has(alert.id));

    printWindow.document.write(`
      <html>
      <head>
        <title>Weekend Purchase Checklist - Vijayapathi Traders</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #111; background-color: #fff; }
          h1 { border-bottom: 2.5px solid #111; padding-bottom: 12px; margin-bottom: 5px; font-size: 24px; text-transform: uppercase; }
          .meta { font-size: 13px; color: #666; margin-bottom: 25px; }
          h2 { color: #222; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 30px; border-bottom: 1.5px solid #222; padding-bottom: 6px; }
          ul { list-style: none; padding-left: 0; margin: 0; }
          li { padding: 10px 0; border-bottom: 1px dashed #ccc; display: flex; align-items: center; font-size: 13px; }
          .checkbox { width: 18px; height: 18px; border: 1.5px solid #111; margin-right: 12px; display: inline-block; border-radius: 3px; flex-shrink: 0; }
          .qty { font-weight: bold; margin-right: 10px; color: #000; background: #eee; padding: 2px 6px; border-radius: 3px; font-size: 11px; }
          .details { color: #555; font-size: 11px; margin-left: auto; font-style: italic; }
          .empty-msg { padding: 12px 0; color: #888; font-size: 12px; font-style: italic; }
          @media print {
            body { padding: 10px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>Vijayapathi Traders</h1>
        <div class="meta">Weekend Purchase Order Slip & Checklist | Date: ${new Date().toLocaleDateString("en-IN")}</div>
        
        <h2>1. Customer Shortages (B2B Lockout Requests)</h2>
        <ul>
          ${pendingShortages.map(item => `
            <li>
              <div class="checkbox"></div>
              <span class="qty">${item.qty} Nos</span>
              <span style="font-weight: 500;">${item.itemName}</span>
              <span class="details">For: ${item.customerName} | Status: ${item.status}</span>
            </li>
          `).join("")}
          ${pendingShortages.length === 0 ? '<div class="empty-msg">No pending customer requests for this weekend.</div>' : ""}
        </ul>

        <h2>2. AI Predicted Low Stock Restocks</h2>
        <ul>
          ${activeAiAlerts.map(item => {
            const optimalQty = Math.max(50, Math.round(item.avgPerDay * 30));
            return `
              <li>
                <div class="checkbox"></div>
                <span class="qty">${optimalQty} ${item.unit || "Nos"}</span>
                <span style="font-weight: 500;">${item.name}</span>
                <span class="details">Stock: ${item.stock} | Supplier: ${item.supplier || 'Unassigned'}</span>
              </li>
            `;
          }).join("")}
          ${activeAiAlerts.length === 0 ? '<div class="empty-msg">No urgent low stock alerts to buy.</div>' : ""}
        </ul>

        <h2>3. Manual Shop & Miscellaneous Checklist</h2>
        <ul>
          ${(weekendList || []).filter(w => !w.checked).map(item => `
            <li>
              <div class="checkbox"></div>
              <span class="qty">${item.qty || 1} Nos</span>
              <span style="font-weight: 500;">${item.name}</span>
              <span class="details">Category: ${item.category} ${item.notes ? `| ${item.notes}` : ""}</span>
            </li>
          `).join("")}
          ${(weekendList || []).filter(w => !w.checked).length === 0 ? '<div class="empty-msg">No manual notes added.</div>' : ""}
        </ul>

        <script>window.onload = function() { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleWhatsAppWeekendList = () => {
    const dateStr = new Date().toLocaleDateString("en-IN");
    
    // Aggregate AI alerts
    const activeAiAlerts = aiAlerts.filter(alert => !checkedAiIds.has(alert.id));

    let msg = `*Vijayapathi Traders - Weekend B2B Shopping List*\n`;
    msg += `*Date:* ${dateStr}\n\n`;

    msg += `👥 *CUSTOMER SHORTAGE REQUESTS:*\n`;
    if (pendingShortages.length === 0) {
      msg += `_None_\n`;
    } else {
      pendingShortages.forEach(item => {
        msg += `• [ ] ${item.qty}x ${item.itemName} (For: ${item.customerName})\n`;
      });
    }
    msg += `\n`;

    msg += `📉 *AI REORDER RECOMMENDATIONS:*\n`;
    if (activeAiAlerts.length === 0) {
      msg += `_None_\n`;
    } else {
      activeAiAlerts.forEach(item => {
        const optimalQty = Math.max(50, Math.round(item.avgPerDay * 30));
        msg += `• [ ] ${optimalQty}x ${item.name} (Supplier: ${item.supplier || "Unassigned"})\n`;
      });
    }
    msg += `\n`;

    msg += `📝 *MANUAL CHECKLIST & SUPPLIES:*\n`;
    const manualUnchecked = (weekendList || []).filter(w => !w.checked);
    if (manualUnchecked.length === 0) {
      msg += `_None_\n`;
    } else {
      manualUnchecked.forEach(item => {
        msg += `• [ ] ${item.qty || 1}x ${item.name} (${item.category})\n`;
      });
    }

    navigator.clipboard.writeText(msg);
    alert("Weekend shopping checklist compiled and copied to clipboard! Opening WhatsApp...");
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleToggleAiAlertChecked = (id) => {
    const nextSet = new Set(checkedAiIds);
    if (nextSet.has(id)) {
      nextSet.delete(id);
    } else {
      nextSet.add(id);
    }
    setCheckedAiIds(nextSet);
  };

  return (
    <div className="page" style={{ paddingBottom: "40px" }}>
      <div className="page-header" style={{ marginBottom: "20px" }}>
        <div>
          <div className="page-sub">VIJAYAPATHI TRADERS B2B</div>
          <h1 className="page-title">Demand & Procurement Hub</h1>
        </div>
        
        <div style={{ display: "flex", gap: "10px" }}>
          {activeTab === "ai_demand" && (
            <>
              <button 
                className="btn-primary" 
                style={{ background: "#e67e22" }}
                onClick={() => setShowAiReorderModal(true)}
              >
                📋 AI REORDER SHEET
              </button>
              <button 
                className="btn-primary" 
                style={{ background: "#8e44ad" }}
                onClick={fetchAiPredictions}
                disabled={loadingPredictions}
              >
                {loadingPredictions ? "⚡ SYNCING ARIMA MODELS..." : "🤖 SYNC AI FORECAST"}
              </button>
            </>
          )}

          {activeTab === "shortage_book" && (
            <button 
              className="btn-primary" 
              style={{ background: "#27ae60" }}
              onClick={() => setShowAddShortageModal(true)}
            >
              📝 LOG LOST SALE / REQUEST
            </button>
          )}

          {activeTab === "weekend_planner" && (
            <>
              <button 
                className="btn-primary" 
                style={{ background: "#2980b9" }}
                onClick={() => setShowAddWeekendModal(true)}
              >
                ➕ ADD MANUAL NOTE
              </button>
              <button 
                className="btn-primary" 
                style={{ background: "#25d366" }}
                onClick={handleWhatsAppWeekendList}
              >
                💬 SHARE ON WHATSAPP
              </button>
              <button 
                className="btn-primary" 
                style={{ background: "#e74c3c" }}
                onClick={handlePrintWeekendChecklist}
              >
                🖨️ PRINT PDF SLIP
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="tabs" style={{ display: "flex", gap: "10px", marginBottom: "25px", borderBottom: "1.5px solid rgba(120, 113, 108, 0.15)", paddingBottom: "10px" }}>
        <button 
          className={`tab-btn ${activeTab === "ai_demand" ? "active" : ""}`} 
          onClick={() => setActiveTab("ai_demand")}
          style={{ fontSize: "14px", fontWeight: "bold", padding: "10px 16px", borderRadius: "6px 6px 0 0", cursor: "pointer" }}
        >
          📈 ARIMA AI Forecasts
        </button>
        <button 
          className={`tab-btn ${activeTab === "shortage_book" ? "active" : ""}`} 
          onClick={() => setActiveTab("shortage_book")}
          style={{ fontSize: "14px", fontWeight: "bold", padding: "10px 16px", borderRadius: "6px 6px 0 0", cursor: "pointer" }}
        >
          📝 Shortage Book
        </button>
        <button 
          className={`tab-btn ${activeTab === "weekend_planner" ? "active" : ""}`} 
          onClick={() => setActiveTab("weekend_planner")}
          style={{ fontSize: "14px", fontWeight: "bold", padding: "10px 16px", borderRadius: "6px 6px 0 0", cursor: "pointer" }}
        >
          📅 Weekend Purchase Planner
        </button>
      </div>

      {/* Tab Content 1: AI Forecasting */}
      {activeTab === "ai_demand" && (
        <>
          <div className="demand-stats">
            <div className="demand-stat-card urgent-card">
              <div className="demand-stat-icon">⚠</div>
              <div className="demand-stat-label">URGENT REORDER</div>
              <div className="demand-stat-val">{urgent}</div>
            </div>
            <div className="demand-stat-card warning-card">
              <div className="demand-stat-icon">📉</div>
              <div className="demand-stat-label">LOW STOCK</div>
              <div className="demand-stat-val">{lowStockCount}</div>
            </div>
            <div className="demand-stat-card fast-card">
              <div className="demand-stat-icon">⚡</div>
              <div className="demand-stat-label">FAST MOVERS</div>
              <div className="demand-stat-val">{fast}</div>
            </div>
            <div className="demand-stat-card slow-card">
              <div className="demand-stat-icon">❄</div>
              <div className="demand-stat-label">SLOW MOVERS</div>
              <div className="demand-stat-val">{slow}</div>
            </div>
            <div className="demand-stat-card" style={{ background: "#222", color: "#fff" }}>
              <div className="demand-stat-icon">☠</div>
              <div className="demand-stat-label" style={{ color: "#aaa" }}>DEAD STOCK</div>
              <div className="demand-stat-val" style={{ color: "#fff" }}>{dead}</div>
            </div>
          </div>

          <div className="demand-filters">
            {FILTERS.map(f => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>STATUS</th>
                  <th>PRODUCT</th>
                  <th>CATEGORY</th>
                  <th>STOCK</th>
                  <th>SOLD</th>
                  <th>FORECAST / DAY</th>
                  <th>DAYS LEFT</th>
                  <th>SPEED</th>
                  <th>SHELF</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(product => {
                  const isExpanded = expandedProductId === product.id;
                  return (
                    <React.Fragment key={product.id}>
                      <tr 
                        style={{ cursor: "pointer", background: isExpanded ? "rgba(255,255,255,0.02)" : "transparent" }}
                        onClick={() => setExpandedProductId(isExpanded ? null : product.id)}
                      >
                        <td><StatusBadge status={product.status} /></td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <strong>{product.name}</strong>
                            <span style={{ fontSize: "10px", color: "#777" }}>Code: {product.productCode}</span>
                          </div>
                        </td>
                        <td>{product.category}</td>
                        <td>{product.stock} {product.unit || "Nos"}</td>
                        <td>{product.totalSold || 0}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontWeight: "bold" }}>{product.avgPerDay}</span>
                            {product.isAiModelUsed ? (
                              <span style={{ fontSize: "8px", fontWeight: "bold", color: "#00c9a7", border: "1px solid #00c9a7", padding: "1px 4px", borderRadius: "3px", letterSpacing: "0.5px" }}>ARIMA</span>
                            ) : (
                              <span style={{ fontSize: "8px", color: "#888" }}>AVG</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <strong className={product.daysLeft < 5 ? "days-urgent" : product.daysLeft < 10 ? "days-warning" : ""}>
                              {product.daysLeft >= 999 ? "∞" : `${product.daysLeft} Days`}
                            </strong>
                            {product.daysLeft < 999 && product.daysLeft > 0 && (
                              <span style={{ fontSize: "9px", color: product.daysLeft < 5 ? "#ff4757" : "#e67e22", fontWeight: "bold", marginTop: "2px" }}>
                                Out: {new Date(Date.now() + product.daysLeft * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </div>
                        </td>
                        <td><SpeedBadge speed={product.speed} /></td>
                        <td>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center" }} onClick={e => e.stopPropagation()}>
                            {product.shelfLocation ? (
                              <button 
                                className="btn-secondary" 
                                style={{ padding: "4px 8px", fontSize: "10px", margin: 0 }}
                                onClick={() => setLocateProduct(product)}
                              >
                                📍 {product.shelfLocation}
                              </button>
                            ) : "-"}
                          </div>
                        </td>
                      </tr>
                      
                      {isExpanded && (
                        <tr style={{ background: "rgba(255,255,255,0.01)" }}>
                          <td colSpan="9" style={{ padding: "15px 30px" }}>
                            <div style={{ display: "flex", gap: "30px", flexWrap: "wrap", justifyContent: "space-between" }}>
                              
                              {/* ARIMA Details Text Box */}
                              <div style={{ flex: "1 1 300px", minWidth: "250px" }}>
                                <h4 style={{ color: product.isAiModelUsed ? "#00c9a7" : "#2563eb", fontSize: "13px", fontWeight: "bold", marginBottom: "10px", letterSpacing: "0.5px" }}>
                                  {product.isAiModelUsed ? "🤖 TIME-SERIES ANALYSIS SUMMARY (ARIMA)" : "⚙️ STANDALONE METRICS"}
                                </h4>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px", color: "#ccc" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "4px" }}>
                                    <span>Mathematical Prediction Basis:</span>
                                    <strong>{product.isAiModelUsed ? "7-Day ARIMA TSA Model" : "30-Day Store Sales Average"}</strong>
                                  </div>
                                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "4px" }}>
                                    <span>Peak Demand Day (Projected):</span>
                                    <strong style={{ color: "#f1c40f" }}>{product.peakDay ? new Date(product.peakDay).toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" }) : "-"}</strong>
                                  </div>
                                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "4px" }}>
                                    <span>Peak Predicted Volume:</span>
                                    <strong>{product.peakValue ? `${product.peakValue.toFixed(1)} units/day` : "-"}</strong>
                                  </div>
                                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: "4px" }}>
                                    <span>Projected 7-Day Cumulative Sales:</span>
                                    <strong style={{ color: "#00f2fe" }}>{product.totalPredictedDemand ? `${product.totalPredictedDemand.toFixed(1)} ${product.unit || "Nos"}` : "-"}</strong>
                                  </div>
                                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span>Action Recommendation:</span>
                                    <strong>
                                      {product.daysLeft < 5 ? (
                                        <span style={{ color: "#ff4757", fontWeight: "bold" }}>🚨 RESTOCK IMMEDIATELY</span>
                                      ) : product.daysLeft < 10 ? (
                                        <span style={{ color: "#e67e22" }}>📉 PREPARE PURCHASE ORDER</span>
                                      ) : product.isDeadStock ? (
                                        <span style={{ color: "#f1c40f" }}>🏷️ OFFER SALE / BUNDLE DISCOUNT</span>
                                      ) : (
                                        <span style={{ color: "#2ecc71" }}>✅ STOCK LEVELS SECURE</span>
                                      )}
                                    </strong>
                                  </div>
                                </div>
                              </div>

                              {/* Dynamic SVG Spline Chart */}
                              <SalesForecastChart forecast={product.arimaForecast} />

                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan="9" className="empty-row">No products found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tab Content 2: Customer Shortage Book */}
      {activeTab === "shortage_book" && (
        <div style={{ background: "rgba(255,255,255,0.02)", padding: "20px", borderRadius: "8px", border: "1px solid rgba(120, 113, 108, 0.1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "15px" }}>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {SHORTAGE_STATUSES.map(status => (
                <button
                  key={status}
                  className={`filter-btn ${shortageFilter === status ? "active" : ""}`}
                  onClick={() => setShortageFilter(status)}
                  style={{ textTransform: "uppercase" }}
                >
                  {status}
                </button>
              ))}
            </div>
            
            <div className="search-box" style={{ width: "300px", margin: 0 }}>
              <span>🔍</span>
              <input 
                placeholder="Search requests, customers..." 
                value={shortageSearch}
                onChange={e => setShortageSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>STATUS</th>
                  <th>ITEM NAME</th>
                  <th>QUANTITY</th>
                  <th>CUSTOMER INFO</th>
                  <th>DATE LOGGED</th>
                  <th>NOTES</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredShortages.map(item => (
                  <tr key={item.id}>
                    <td>{getShortageStatusBadge(item.status)}</td>
                    <td>
                      <div>
                        <strong>{item.itemName}</strong>
                        {item.isCustom ? (
                          <span style={{ fontSize: "9px", color: "#e67e22", display: "block", marginTop: "2px", fontWeight: "bold" }}>⚠️ CUSTOM ITEM (NOT IN CATALOG)</span>
                        ) : (
                          <span style={{ fontSize: "9px", color: "#2ecc71", display: "block", marginTop: "2px" }}>✓ CONNECTED TO CATALOG</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: "bold" }}>{item.qty} Nos</td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span>{item.customerName || "Walk-in Customer"}</span>
                        {item.customerPhone && (
                          <span style={{ fontSize: "11px", color: "#aaa" }}>📞 {item.customerPhone}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {item.createdAt?.seconds 
                        ? new Date(item.createdAt.seconds * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) 
                        : "N/A"
                      }
                    </td>
                    <td style={{ color: "#aaa", fontSize: "12px", maxBreakWidth: "200px" }}>{item.notes || "-"}</td>
                    <td>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {item.status === "REQUESTED" && (
                          <button 
                            className="btn-secondary" 
                            style={{ background: "#2980b9", color: "#fff", padding: "4px 8px", fontSize: "11px", margin: 0 }}
                            onClick={() => updateShortage(item.id, { status: "ORDERED" })}
                          >
                            Mark Ordered
                          </button>
                        )}
                        {(item.status === "REQUESTED" || item.status === "ORDERED") && (
                          <button 
                            className="btn-secondary" 
                            style={{ background: "#27ae60", color: "#fff", padding: "4px 8px", fontSize: "11px", margin: 0 }}
                            onClick={() => updateShortage(item.id, { status: "RECEIVED" })}
                          >
                            Mark In Stock
                          </button>
                        )}
                        {item.status === "RECEIVED" && (
                          <>
                            <button 
                              className="btn-secondary" 
                              style={{ background: "#555", color: "#fff", padding: "4px 8px", fontSize: "11px", margin: 0 }}
                              onClick={() => updateShortage(item.id, { status: "FULFILLED" })}
                            >
                              Fulfill
                            </button>
                            {item.customerPhone && (
                              <button 
                                className="btn-primary" 
                                style={{ background: "#25d366", padding: "4px 8px", fontSize: "11px", margin: 0 }}
                                onClick={() => handleWhatsAppShortage(item)}
                              >
                                💬 Alert Customer
                              </button>
                            )}
                          </>
                        )}
                        {item.status === "FULFILLED" && (
                          <span style={{ fontSize: "11px", color: "#666" }}>Closed ✓</span>
                        )}
                        <button 
                          className="btn-secondary" 
                          style={{ background: "#e74c3c", color: "#fff", padding: "4px 8px", fontSize: "11px", margin: 0 }}
                          onClick={() => {
                            if (window.confirm("Are you sure you want to delete this shortage request?")) {
                              deleteShortage(item.id);
                            }
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredShortages.length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-row" style={{ textAlign: "center", padding: "30px", color: "#aaa" }}>
                      No shortage entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content 3: Weekend Planner */}
      {activeTab === "weekend_planner" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", flexWrap: "wrap" }}>
          
          {/* Left Column: Customer Requests & AI Alerts */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Checklist 1: Customer shortages */}
            <div className="stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(120, 113, 108, 0.1)", padding: "20px", borderRadius: "8px" }}>
              <h3 style={{ margin: "0 0 15px 0", color: "#e67e22", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>👥 B2B Customer Shortages</span>
                <span style={{ fontSize: "12px", background: "rgba(230,126,34,0.15)", padding: "2px 8px", borderRadius: "10px", color: "#e67e22" }}>
                  {pendingShortages.length} Items
                </span>
              </h3>
              <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                {pendingShortages.map(item => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", justifyItems: "center", padding: "10px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "6px" }}>
                    <input 
                      type="checkbox" 
                      style={{ width: "18px", height: "18px", marginRight: "12px", cursor: "pointer" }}
                      onChange={() => {
                        // Mark as Received when checked
                        if (window.confirm(`Mark ${item.itemName} as RECEIVED in stock?`)) {
                          updateShortage(item.id, { status: "RECEIVED" });
                        }
                      }}
                    />
                    <div style={{ flexGrow: 1 }}>
                      <strong style={{ fontSize: "13px" }}>{item.itemName}</strong>
                      <span style={{ fontSize: "11px", color: "#888", display: "block" }}>
                        Qty: <strong>{item.qty} Nos</strong> | For: {item.customerName} | Status: <span style={{ color: item.status === "ORDERED" ? "#2980b9" : "#e67e22" }}>{item.status}</span>
                      </span>
                    </div>
                  </div>
                ))}
                {pendingShortages.length === 0 && (
                  <div style={{ color: "#777", fontSize: "12px", fontStyle: "italic", padding: "10px", textAlign: "center" }}>
                    🎉 No pending customer shortages!
                  </div>
                )}
              </div>
            </div>

            {/* Checklist 2: AI Predicted Reorders */}
            <div className="stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(120, 113, 108, 0.1)", padding: "20px", borderRadius: "8px" }}>
              <h3 style={{ margin: "0 0 15px 0", color: "#8e44ad", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>🤖 AI Stockout Reorders</span>
                <span style={{ fontSize: "12px", background: "rgba(142,68,173,0.15)", padding: "2px 8px", borderRadius: "10px", color: "#8e44ad" }}>
                  {aiAlerts.length} Products
                </span>
              </h3>
              <div style={{ color: "#aaa", fontSize: "11px", marginBottom: "10px" }}>
                Uncheck products that you do *NOT* want to order this weekend:
              </div>
              <div style={{ maxHeight: "350px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                {aiAlerts.map(item => {
                  const optimalQty = Math.max(50, Math.round(item.avgPerDay * 30));
                  const isExcluded = checkedAiIds.has(item.id);
                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "10px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "6px", opacity: isExcluded ? 0.4 : 1 }}>
                      <input 
                        type="checkbox" 
                        checked={!isExcluded}
                        style={{ width: "18px", height: "18px", marginRight: "12px", cursor: "pointer" }}
                        onChange={() => handleToggleAiAlertChecked(item.id)}
                      />
                      <div style={{ flexGrow: 1 }}>
                        <strong style={{ fontSize: "13px", textDecoration: isExcluded ? "line-through" : "none" }}>{item.name}</strong>
                        <span style={{ fontSize: "11px", color: "#888", display: "block" }}>
                          Supplier: <strong>{item.supplier || "Unassigned"}</strong> | Current Stock: <strong>{item.stock}</strong> | Suggests Qty: <strong>{optimalQty}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
                {aiAlerts.length === 0 && (
                  <div style={{ color: "#777", fontSize: "12px", fontStyle: "italic", padding: "10px", textAlign: "center" }}>
                    ✓ Inventory levels are robust! No ARIMA stockouts predicted.
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Column: Custom Shopping List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            
            <div className="stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(120, 113, 108, 0.1)", padding: "20px", borderRadius: "8px", flexGrow: 1 }}>
              <h3 style={{ margin: "0 0 15px 0", color: "#27ae60", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>📝 Manual Procurement Checklist</span>
                <span style={{ fontSize: "12px", background: "rgba(39,174,96,0.15)", padding: "2px 8px", borderRadius: "10px", color: "#27ae60" }}>
                  {(weekendList || []).length} Entries
                </span>
              </h3>
              
              <div style={{ maxHeight: "600px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                {(weekendList || []).map(item => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "10px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "6px" }}>
                    <input 
                      type="checkbox" 
                      checked={item.checked || false}
                      style={{ width: "18px", height: "18px", marginRight: "12px", cursor: "pointer" }}
                      onChange={() => updateWeekendItem(item.id, { checked: !item.checked })}
                    />
                    <div style={{ flexGrow: 1, opacity: item.checked ? 0.5 : 1 }}>
                      <strong style={{ fontSize: "13px", textDecoration: item.checked ? "line-through" : "none", color: item.checked ? "#777" : "#fff" }}>
                        {item.name}
                      </strong>
                      <span style={{ fontSize: "11px", color: "#888", display: "block" }}>
                        Qty: <strong>{item.qty || 1} Nos</strong> | Category: <strong>{item.category}</strong> {item.notes ? `| Notes: ${item.notes}` : ""}
                      </span>
                    </div>
                    <button
                      className="btn-secondary"
                      style={{ background: "#e74c3c", color: "#fff", padding: "4px 8px", fontSize: "11px", margin: 0 }}
                      onClick={() => deleteWeekendItem(item.id)}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                {(weekendList || []).length === 0 && (
                  <div style={{ color: "#777", fontSize: "12px", fontStyle: "italic", padding: "30px", textAlign: "center" }}>
                    No custom items added for this weekend yet.<br/>
                    Click "ADD MANUAL NOTE" above to add supplies.
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Shop Map Locator Modal */}
      {locateProduct && (
        <div className="modal-overlay" onClick={() => setLocateProduct(null)}>
          <div className="modal-content form-modal" style={{ maxWidth: "600px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#8e44ad" }}></div>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📍 Shelf Location: {locateProduct.shelfLocation || getHighlightZone(locateProduct)}</span>
              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => setLocateProduct(null)}>Close</button>
            </h2>

            <div style={{ padding: "10px 0", textAlign: "center" }}>
              <strong style={{ fontSize: "16px", color: "#fff" }}>{locateProduct.name}</strong>
              <div style={{ color: "#aaa", fontSize: "13px", marginTop: "4px" }}>
                Code: {locateProduct.productCode || "-"} | Category: {locateProduct.category}
              </div>
            </div>

            <ShopMap highlightZone={getHighlightZone(locateProduct)} />

            <div className="modal-btns" style={{ marginTop: "20px" }}>
              <button className="btn-secondary" style={{ width: "100%" }} onClick={() => setLocateProduct(null)}>Got It</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Smart Reorder Modal */}
      {showAiReorderModal && (
        <div className="modal-overlay" onClick={() => setShowAiReorderModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "800px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#e67e22" }}></div>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🧠 ARIMA Smart Reorder Sheets</span>
              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => setShowAiReorderModal(false)}>Close</button>
            </h2>

            <div className="bulk-help-box">
              <strong>💡 AI Projections Reorders:</strong> Below are reorder sheets computed mathematically. It tracks items predicted to run out within 7 days based on ARIMA forecast rates, grouped by supplier.
            </div>

            <div style={{ maxHeight: "60vh", overflowY: "auto", marginTop: "15px" }}>
              {(() => {
                const urgentItems = demandData.filter(d => d.daysLeft < 10);
                
                if (urgentItems.length === 0) {
                  return <div className="empty-state">🎉 All systems stable! No stockouts projected within the next 10 days.</div>;
                }

                const reorderGroups = {};
                urgentItems.forEach(item => {
                  const sName = item.supplier || "Unassigned Supplier";
                  if (!reorderGroups[sName]) reorderGroups[sName] = [];
                  reorderGroups[sName].push(item);
                });

                return Object.entries(reorderGroups).map(([suppName, items]) => {
                  const suppObj = suppliers.find(s => s.name?.toLowerCase() === suppName.toLowerCase());
                  const contactNum = suppObj?.contact || "";

                  return (
                    <div key={suppName} className="stat-card" style={{ marginBottom: "20px", border: "1px solid rgba(255,255,255,0.06)", padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1.5px solid rgba(255,255,255,0.1)", paddingBottom: "10px", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                        <div>
                          <strong style={{ fontSize: "16px" }}>🚚 {suppName}</strong>
                          {contactNum && <span style={{ fontSize: "12px", color: "#888", marginLeft: "10px" }}>📞 {contactNum}</span>}
                        </div>
                        <button 
                          className="btn-primary" 
                          style={{ background: "#25d366", fontSize: "12px", padding: "6px 12px" }}
                          onClick={() => {
                            const dateStr = new Date().toLocaleDateString("en-IN");
                            const lines = items.map(item => {
                              const qtyVal = document.getElementById(`ai-reorder-qty-${item.id}`)?.value || 50;
                              return `• ${qtyVal}x ${item.name} (Code: ${item.productCode || "-"})`;
                            }).join("\n");
                            
                            const msg = `*Vijayapathi Traders - AI ARIMA Restock Order*\n\n*Supplier:* ${suppName}\n*Date:* ${dateStr}\n\n*Items (Forecasted stockouts in 7-Days):*\n${lines}\n\nPlease confirm stock levels and send the invoice. Thank you!`;
                            const cleanPhone = contactNum.replace(/\D/g, "");
                            const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
                            const link = document.createElement("a");
                            link.href = url;
                            link.target = "_blank";
                            link.click();
                          }}
                        >
                          💬 Send WhatsApp Order
                        </button>
                      </div>
                      <table className="data-table" style={{ fontSize: "11px" }}>
                        <thead>
                          <tr>
                            <th>CODE</th>
                            <th>PRODUCT</th>
                            <th>STOCK</th>
                            <th>AI DAILY RATE</th>
                            <th>DAYS LEFT</th>
                            <th style={{ width: "120px" }}>REORDER QTY</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(item => {
                            // Automatically calculate optimal restock volume (e.g. 30 days of predicted demand)
                            const optimalQty = Math.max(50, Math.round(item.avgPerDay * 30));
                            return (
                              <tr key={item.id}>
                                <td>{item.productCode || "-"}</td>
                                <td><strong>{item.name}</strong></td>
                                <td style={{ color: "#ff4757", fontWeight: "bold" }}>{item.stock} {item.unit || "Nos"}</td>
                                <td>{item.avgPerDay} / day</td>
                                <td style={{ color: item.daysLeft < 5 ? "#ff4757" : "#e67e22", fontWeight: "bold" }}>{item.daysLeft} Days</td>
                                <td>
                                  <input 
                                    id={`ai-reorder-qty-${item.id}`}
                                    type="number"
                                    defaultValue={optimalQty}
                                    min={1}
                                    style={{ width: "85px", padding: "4px 8px", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.2)", color: "#fff", borderRadius: "4px", fontSize: "11px" }}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Add Shortage Modal */}
      {showAddShortageModal && (
        <div className="modal-overlay" onClick={() => setShowAddShortageModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "500px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#27ae60" }}></div>
            <h2>Log Customer Shortage / Request</h2>
            
            <div className="form-group" style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "8px" }}>Item Classification</label>
              <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input 
                    type="radio" 
                    name="shortageType" 
                    checked={newShortageIsCustom}
                    onChange={() => setNewShortageIsCustom(true)}
                  />
                  Custom / New Brand
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input 
                    type="radio" 
                    name="shortageType" 
                    checked={!newShortageIsCustom}
                    onChange={() => setNewShortageIsCustom(false)}
                  />
                  Catalog Product
                </label>
              </div>
            </div>

            {newShortageIsCustom ? (
              <div className="form-group" style={{ marginBottom: "15px" }}>
                <label>Requested Item Name *</label>
                <input 
                  type="text"
                  placeholder="e.g. Ashirvad CPVC Elbow 1 inch"
                  value={newShortageItemName}
                  onChange={e => setNewShortageItemName(e.target.value)}
                />
              </div>
            ) : (
              <div className="form-group" style={{ marginBottom: "15px" }}>
                <label>Select Product from Catalog *</label>
                <SearchableSelect
                  options={catalogProductOptions}
                  value={newShortageProductId}
                  onChange={setNewShortageProductId}
                  placeholder="-- Select Product --"
                  accentColor="#27ae60"
                />
              </div>
            )}

            <div className="form-group" style={{ marginBottom: "15px" }}>
              <label>Quantity Demanded *</label>
              <input 
                type="number"
                min={1}
                value={newShortageQty}
                onChange={e => setNewShortageQty(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "15px" }}>
              <label>Customer Name</label>
              <input 
                type="text"
                placeholder="Customer or Contractor Name"
                value={newShortageCustomerName}
                onChange={e => setNewShortageCustomerName(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "15px" }}>
              <label>Customer Phone (For WhatsApp Alerts)</label>
              <input 
                type="text"
                placeholder="e.g. 9876543210"
                value={newShortageCustomerPhone}
                onChange={e => setNewShortageCustomerPhone(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "15px" }}>
              <label>Special Instructions / Price Quoted Notes</label>
              <textarea 
                placeholder="Any special remarks..."
                value={newShortageNotes}
                onChange={e => setNewShortageNotes(e.target.value)}
                rows={3}
                style={{ width: "100%", padding: "8px", background: "#111", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px" }}
              />
            </div>

            <div className="modal-btns" style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddShortageModal(false)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 1, background: "#27ae60" }} onClick={handleSaveShortage}>Log Request</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Weekend Note Modal */}
      {showAddWeekendModal && (
        <div className="modal-overlay" onClick={() => setShowAddWeekendModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "450px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#2980b9" }}></div>
            <h2>Add Custom Shopping Note</h2>

            <div className="form-group" style={{ marginBottom: "15px" }}>
              <label>Item Name / Supply *</label>
              <input 
                type="text"
                placeholder="e.g. Teflon Tape, Office snacks"
                value={newWeekendName}
                onChange={e => setNewWeekendName(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "15px" }}>
              <label>Quantity *</label>
              <input 
                type="number"
                min={1}
                value={newWeekendQty}
                onChange={e => setNewWeekendQty(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "15px" }}>
              <label>Category Group</label>
              <select 
                value={newWeekendCategory}
                onChange={e => setNewWeekendCategory(e.target.value)}
                style={{ width: "100%", padding: "10px", background: "#111", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px" }}
              >
                <option value="Hardware">🔩 Hardware</option>
                <option value="Electrical">🔌 Electrical</option>
                <option value="CPVC">🚰 CPVC</option>
                <option value="PVC">🚰 PVC</option>
                <option value="UPVC">🚰 UPVC</option>
                <option value="Sanitary">🛁 Sanitary</option>
                <option value="Shop Supplies">📦 Shop Supplies</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: "15px" }}>
              <label>Instructions / Supplier Reference</label>
              <input 
                type="text"
                placeholder="e.g. Buy Supreme brand only"
                value={newWeekendNotes}
                onChange={e => setNewWeekendNotes(e.target.value)}
              />
            </div>

            <div className="modal-btns" style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddWeekendModal(false)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 1, background: "#2980b9" }} onClick={handleSaveWeekendItem}>Add Item</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
