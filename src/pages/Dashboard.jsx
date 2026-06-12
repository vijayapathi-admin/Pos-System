import React, { useMemo, useState } from "react";
import { useApp } from "../AppContext";

const StatCard = ({ icon, iconBg, label, value }) => (
  <div className="stat-card">
    <div className="stat-icon" style={{ background: iconBg }}>{icon}</div>
    <div className="stat-label">{label}</div>
    <div className="stat-value">{value}</div>
  </div>
);

export default function Dashboard() {
  const { getTodayStats, addExpense, sales, products, createBackup, restoreBackup, restoreProductsFromBackup, backupsList } = useApp();
  const stats = getTodayStats();

  // Smart Insights: Basic prediction based on last 30 days
  const smartInsights = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const recentSales = sales.filter(s => s.date >= thirtyDaysAgoStr);

    const productStats = {};
    recentSales.forEach(sale => {
      sale.items?.forEach(item => {
        if (!productStats[item.productId]) {
          productStats[item.productId] = 0;
        }
        productStats[item.productId] += item.qty;
      });
    });

    const insights = products.map(p => {
      const soldLast30 = productStats[p.id] || 0;
      const avgDaily = soldLast30 / 30;
      const stock = p.stock || 0;
      const daysLeft = avgDaily > 0 ? stock / avgDaily : 999;
      
      return {
        ...p,
        soldLast30,
        predictedNextDay: avgDaily,
        daysLeft,
      };
    });

    // Top 3 products to restock
    const topRestock = insights
      .filter(p => p.predictedNextDay > 0)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 3);

    return { topRestock };
  }, [sales, products]);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const todayStr = new Date().toISOString().split("T")[0];

  const handleAddExpense = async () => {
    const reason = window.prompt("Expense Reason / Description:");
    if (!reason) return;
    
    const amountStr = window.prompt("Expense Amount (₹):");
    if (!amountStr) return;
    
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) return alert("Invalid amount.");
    
    try {
      await addExpense(reason, amount, todayStr);
    } catch (e) {
      alert("Error adding expense: " + e.message);
    }
  };

  // Last 7 days chart data
  const last7Days = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const daySales = sales.filter(s => s.date === dateStr);
      days.push({
        label: `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`,
        sales: daySales.reduce((sum, s) => sum + (s.total || 0), 0),
        profit: daySales.reduce((sum, s) => sum + (s.profit || 0), 0)
      });
    }
    return days;
  }, [sales]);

  const maxVal = Math.max(...last7Days.map(d => d.sales), 1000);

  // Category breakdown
  const categoryMap = useMemo(() => {
    const map = {};
    sales.forEach(sale => {
      sale.items?.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const cat = product?.category || "Other";
        map[cat] = (map[cat] || 0) + item.sellingPrice * item.qty;
      });
    });
    return map;
  }, [sales, products]);

  const catTotal = Object.values(categoryMap).reduce((a, b) => a + b, 0);
  const COLORS = ["#2563eb", "#00c9a7", "#1e90ff", "#ff4757"];
  const catEntries = Object.entries(categoryMap);

  const pieSlices = useMemo(() => {
    let cumulative = 0;
    return catEntries.map(([cat, val], i) => {
      const pct = catTotal > 0 ? val / catTotal : 0;
      const start = cumulative;
      cumulative += pct;
      return { cat, val, pct, start, color: COLORS[i % COLORS.length] };
    });
  }, [categoryMap]);

  const monthSales = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    return sales.filter(s => s.date?.startsWith(month)).reduce((sum, s) => sum + (s.profit || 0), 0);
  }, [sales]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-sub">OVERVIEW</div>
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="page-date">{today}</div>
      </div>

      {/* Day Session Card Removed */}

      <div className="stats-grid">
        <StatCard icon="₹" iconBg="#2563eb" label="TOTAL SALES (CASH+UPI)" value={`₹${stats.totalSales.toLocaleString()}`} />
        <StatCard icon="📈" iconBg="#00c9a7" label="TODAY'S PROFIT" value={`₹${stats.totalProfit.toLocaleString()}`} />
        <StatCard icon="💸" iconBg="#e74c3c" label="TODAY'S EXPENSES" value={`₹${stats.totalExpenses.toLocaleString()}`} />
        <StatCard icon="🧾" iconBg="#3498db" label="TRANSACTIONS" value={stats.transactions} />
        <StatCard icon="📦" iconBg="#2c3e50" label="PRODUCTS" value={stats.products} />
        <StatCard icon="⚠" iconBg="#f39c12" label="LOW STOCK" value={stats.lowStock} />
      </div>

      <div className="dashboard-row">
        <div className="stat-card month-card">
          <div className="stat-label" style={{ color: "#2563eb" }}>MONTH TOTAL</div>
          <div className="month-profit">Profit ₹{monthSales.toLocaleString()}</div>
        </div>
      </div>

      <div className="page-sub" style={{ marginTop: "24px" }}>PREDICTIONS</div>
      <h2 className="page-title">🔮 Smart Insights (Top 3 to Restock)</h2>

      <div className="insights-grid">
        {smartInsights.topRestock.length > 0 ? (
          smartInsights.topRestock.map((p) => (
            <div key={p.id} className="stat-card" style={{ padding: "16px", borderLeft: p.daysLeft <= 3 ? "4px solid #e74c3c" : "4px solid #f39c12", display: "flex", flexDirection: "column" }}>
              <div style={{ fontWeight: "bold", fontSize: "16px", marginBottom: "8px" }}>{p.name}</div>
              
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                <span style={{ background: p.daysLeft <= 3 ? "#e74c3c" : "#f39c12", color: "#fff", padding: "4px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}>
                  {p.daysLeft <= 3 ? "Critical Restock" : "Restock Soon"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "8px" }}>
                <span style={{ color: "#7f8c8d" }}>Current Stock:</span>
                <span style={{ fontWeight: "bold" }}>{p.stock || 0}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", marginBottom: "8px" }}>
                <span style={{ color: "#7f8c8d" }}>Predicted Next Day Sales:</span>
                <span style={{ fontWeight: "bold" }}>{p.predictedNextDay.toFixed(1)} units</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px" }}>
                <span style={{ color: "#7f8c8d" }}>Estimated Days Left:</span>
                <span style={{ fontWeight: "bold" }}>{p.daysLeft.toFixed(1)} days</span>
              </div>
            </div>
          ))
        ) : (
          <div className="stat-card" style={{ padding: "20px", textAlign: "center", gridColumn: "1 / -1" }}>
            No restock suggestions currently. Stock levels look good based on recent sales.
          </div>
        )}
      </div>

      <div className="chart-row" style={{ marginTop: "32px" }}>
        <div className="chart-card">
          <div className="chart-header">
            <span className="chart-title">Last 7 Days (Sales vs Profit)</span>
            <span className="chart-legend" style={{ fontSize: '11px', display: 'flex', gap: '10px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#2563eb", borderRadius: "50%" }}></span> Sales
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ display: "inline-block", width: "8px", height: "8px", background: "#00c9a7", borderRadius: "50%" }}></span> Profit
              </span>
            </span>
          </div>
          <div style={{ marginTop: "15px" }}>
            {(() => {
              const svgWidth = 500;
              const svgHeight = 150;
              const padding = 20;
              
              const pointsSales = last7Days.map((d, i) => {
                const x = padding + (i * (svgWidth - padding * 2)) / 6;
                const y = svgHeight - padding - (d.sales / maxVal) * (svgHeight - padding * 2 - 10);
                return `${x},${y}`;
              }).join(" ");

              const pointsProfit = last7Days.map((d, i) => {
                const x = padding + (i * (svgWidth - padding * 2)) / 6;
                const y = svgHeight - padding - (d.profit / maxVal) * (svgHeight - padding * 2 - 10);
                return `${x},${y}`;
              }).join(" ");

              return (
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
                  <defs>
                    <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25"/>
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00c9a7" stopOpacity="0.25"/>
                      <stop offset="100%" stopColor="#00c9a7" stopOpacity="0"/>
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guideline */}
                  <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="rgba(120, 113, 108, 0.15)" strokeWidth="1.5" />
                  <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3,3" />

                  {/* Shaded Area Polygons */}
                  {pointsSales && (
                    <polygon 
                      points={`${padding},${svgHeight - padding} ${pointsSales} ${svgWidth - padding},${svgHeight - padding}`} 
                      fill="url(#gradSales)" 
                    />
                  )}
                  {pointsProfit && (
                    <polygon 
                      points={`${padding},${svgHeight - padding} ${pointsProfit} ${svgWidth - padding},${svgHeight - padding}`} 
                      fill="url(#gradProfit)" 
                    />
                  )}

                  {/* Colored Stroke Lines */}
                  {pointsSales && <polyline fill="none" stroke="#2563eb" strokeWidth="2.5" points={pointsSales} strokeLinecap="round" strokeLinejoin="round" />}
                  {pointsProfit && <polyline fill="none" stroke="#00c9a7" strokeWidth="2.5" points={pointsProfit} strokeLinecap="round" strokeLinejoin="round" />}

                  {/* Interactive Nodes and X-Axis Labels */}
                  {last7Days.map((d, i) => {
                    const x = padding + (i * (svgWidth - padding * 2)) / 6;
                    const ySales = svgHeight - padding - (d.sales / maxVal) * (svgHeight - padding * 2 - 10);
                    const yProfit = svgHeight - padding - (d.profit / maxVal) * (svgHeight - padding * 2 - 10);
                    
                    return (
                      <g key={i}>
                        <circle cx={x} cy={ySales} r="3" fill="#2563eb" stroke="#fff" strokeWidth="1" />
                        <circle cx={x} cy={yProfit} r="3" fill="#00c9a7" stroke="#fff" strokeWidth="1" />
                        
                        <text x={x} y={svgHeight - 4} fontSize="8" fill="#888" textAnchor="middle" fontWeight="bold">
                          {d.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-title">Category Sales (Month)</div>
          <div className="pie-container">
            <svg viewBox="0 0 100 100" className="pie-chart">
              {pieSlices.map((slice, i) => {
                const startAngle = slice.start * 2 * Math.PI - Math.PI / 2;
                const endAngle = (slice.start + slice.pct) * 2 * Math.PI - Math.PI / 2;
                const x1 = 50 + 40 * Math.cos(startAngle);
                const y1 = 50 + 40 * Math.sin(startAngle);
                const x2 = 50 + 40 * Math.cos(endAngle);
                const y2 = 50 + 40 * Math.sin(endAngle);
                const large = slice.pct > 0.5 ? 1 : 0;
                if (slice.pct === 0) return null;
                return (
                  <path
                    key={i}
                    d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${large} 1 ${x2} ${y2} Z`}
                    fill={slice.color}
                    stroke="#fff"
                    strokeWidth="1"
                  />
                );
              })}
            </svg>
            <div className="pie-legend">
              {pieSlices.map((s, i) => (
                <div key={i} className="pie-legend-item">
                  <span className="pie-dot" style={{ background: s.color }} />
                  <span>{s.cat}: ₹{s.val.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="dashboard-grid" style={{ marginTop: '20px' }}>
        <div className="dash-card">
          <div className="card-header">
            <h3>System Backups</h3>
            <span style={{fontSize: "12px", color: "#888"}}>{backupsList?.length || 0} Backups Found</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{fontSize: "12px", color: "#666", lineHeight: 1.5}}>Daily auto-backups are securely stored in Firebase. You can also manually trigger a backup or download an existing one to safely restore data if needed.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-primary" onClick={() => createBackup("MANUAL")}>☁️ BACKUP NOW</button>
            </div>
            {backupsList?.length > 0 && (
              <div style={{ marginTop: '10px', maxHeight: '120px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '6px', padding: '10px' }}>
                {backupsList.slice(0, 5).map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div style={{fontSize: "12px"}}>
                      <strong>{b.date}</strong> <span style={{color: "#888"}}>({b.type})</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => restoreProductsFromBackup(b.id)} style={{ background: "#ff4757", color: "white", border: "none", borderRadius: "4px", padding: "4px 8px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}>⚠️ Restore Data</button>
                      <button onClick={() => restoreBackup(b.id)} style={{ background: "none", border: "1px solid #ddd", borderRadius: "4px", padding: "4px 8px", fontSize: "11px", cursor: "pointer" }}>📥 Download</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
