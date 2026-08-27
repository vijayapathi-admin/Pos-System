import React, { useRef, useState, useEffect } from "react";

export default function Shelf360Viewer({ highlightZone = "", products = [], addToCart }) {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [selectedZone, setSelectedZone] = useState(null);

  // Aisle categories and descriptions mapped to absolute position on 1500px wide panorama
  const zones = [
    { id: "A", name: "AISLE A", desc: "Hardware & Hand Tools", color: "#3498db", x: 150, y: 170, cat: "HARDWARE" },
    { id: "B", name: "AISLE B", desc: "Electricals & Lighting", color: "#f1c40f", x: 450, y: 180, cat: "ELECTRICAL" },
    { id: "C", name: "AISLE C", desc: "Plumbing Pipes & Fittings", color: "#2ecc71", x: 750, y: 160, cat: "PLUMBING" },
    { id: "D", name: "AISLE D", desc: "Ceramics & Sanitaryware", color: "#e74c3c", x: 1050, y: 170, cat: "SANITARY" },
    { id: "E", name: "AISLE E", desc: "Bathroom & Motor Pumps", color: "#9b59b6", x: 1350, y: 180, cat: "MOTORS" }
  ];

  // Auto-center camera scroll to highlight zone on mount or highlight change
  useEffect(() => {
    if (!highlightZone || !containerRef.current) return;
    
    const zoneObj = zones.find(z => z.id === highlightZone.toUpperCase());
    if (!zoneObj) return;

    // Small delay to ensure container size is measured correctly
    const timer = setTimeout(() => {
      const containerWidth = containerRef.current.clientWidth;
      const targetScrollLeft = zoneObj.x - (containerWidth / 2);
      
      containerRef.current.scrollTo({
        left: Math.max(0, Math.min(1500 - containerWidth, targetScrollLeft)),
        behavior: "smooth"
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [highlightZone]);

  // Click & Drag panoramic physics
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // multiplier for scroll speed
    containerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Filter products on shelf
  const shelfProducts = selectedZone ? (() => {
    const zoneObj = zones.find(z => z.id === selectedZone);
    if (!zoneObj) return [];
    
    return products.filter(p => {
      const cat = p.category?.toUpperCase() || "";
      if (zoneObj.id === "C") {
        return ["CPVC", "PVC", "UPVC", "PLUMBING"].includes(cat);
      }
      if (zoneObj.id === "D") {
        return cat.includes("SANITARY");
      }
      if (zoneObj.id === "E") {
        return cat.includes("BATHROOM") || cat.includes("MOTOR") || cat.includes("APPLIANCE");
      }
      return cat === zoneObj.cat;
    });
  })() : [];

  return (
    <div className="shelf-360-container" style={{ position: "relative", width: "100%", maxWidth: "600px", margin: "0 auto", background: "#111", borderRadius: "12px", border: "1.5px solid rgba(120, 113, 108, 0.15)", overflow: "hidden" }}>
      {/* Dynamic styling for Pano drag, hotspots and sliding catalog list */}
      <style>{`
        .pano-viewport {
          width: 100%;
          height: 350px;
          overflow-x: scroll;
          overflow-y: hidden;
          position: relative;
          cursor: grab;
          user-select: none;
          scrollbar-width: none; /* Hide scrollbars Firefox */
        }
        .pano-viewport::-webkit-scrollbar {
          display: none; /* Hide scrollbars Chrome/Safari */
        }
        .pano-viewport:active {
          cursor: grabbing;
        }
        .pano-canvas {
          width: 1500px;
          height: 100%;
          position: relative;
          background: #111;
        }
        .pano-image {
          width: 1500px;
          height: 100%;
          object-fit: cover;
          pointer-events: none;
          opacity: 0.85;
        }
        .pano-hotspot {
          position: absolute;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transform: translate(-50%, -50%);
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
          transition: all 0.25s ease;
          border: 2px solid #fff;
          z-index: 10;
        }
        .pano-hotspot:hover {
          transform: translate(-50%, -50%) scale(1.2);
          box-shadow: 0 0 20px var(--glow-color);
          background: var(--glow-color);
        }
        .pano-hotspot.active {
          background: var(--glow-color);
          animation: hotspotPulse 1.6s infinite alternate ease-in-out;
        }
        .hotspot-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 2.5px solid var(--glow-color);
          animation: ringWave 1.6s infinite ease-out;
          pointer-events: none;
        }
        @keyframes hotspotPulse {
          0% { box-shadow: 0 0 4px var(--glow-color); }
          100% { box-shadow: 0 0 25px var(--glow-color); }
        }
        @keyframes ringWave {
          0% { transform: scale(0.9); opacity: 1; }
          100% { transform: scale(2.4); opacity: 0; }
        }

        .pano-instruction {
          position: absolute;
          bottom: 12px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.7);
          color: #fff;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 10px;
          pointer-events: none;
          letter-spacing: 0.5px;
          border: 1px solid rgba(255,255,255,0.15);
          z-index: 20;
          font-weight: bold;
        }

        .shelf-sliding-panel {
          position: absolute;
          top: 0;
          right: 0;
          width: 250px;
          height: 100%;
          background: #111216;
          border-left: 1.5px solid rgba(120, 113, 108, 0.15);
          z-index: 100;
          padding: 15px;
          display: flex;
          flex-direction: column;
          box-shadow: -5px 0 25px rgba(0,0,0,0.5);
          transform: translateX(100%);
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .shelf-sliding-panel.open {
          transform: translateX(0);
        }
        .shelf-product-list {
          flex: 1;
          overflow-y: auto;
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-right: 2px;
        }
        .shelf-product-list::-webkit-scrollbar {
          width: 4px;
        }
        .shelf-product-list::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.15);
          border-radius: 2px;
        }
      `}</style>

      {/* Panorama Viewport */}
      <div 
        className="pano-viewport"
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
      >
        <div className="pano-canvas">
          {/* Main Panorama Image */}
          <img src="/shop-360.png" alt="Indian Sanitary & Pipes Shop interior" className="pano-image" />

          {/* Absolute Hotspots overlaid */}
          {zones.map(z => {
            const isActive = highlightZone?.toUpperCase() === z.id;
            return (
              <div 
                key={z.id}
                className={`pano-hotspot ${isActive || selectedZone === z.id ? "active" : ""}`}
                style={{ 
                  left: z.x, 
                  top: z.y, 
                  "--glow-color": z.color 
                }}
                onClick={() => setSelectedZone(selectedZone === z.id ? null : z.id)}
                title={`Open Shelf: ${z.desc}`}
              >
                <span style={{ fontSize: "10px", fontWeight: "bold", color: "#fff" }}>📍</span>
                {(isActive || selectedZone === z.id) && <span className="hotspot-ring" style={{ "--glow-color": z.color }} />}
              </div>
            );
          })}
        </div>

        {/* Drag Instruction */}
        <div className="pano-instruction">
          ↔️ DRAG TO EXPLORE SHOP SHELVES
        </div>
      </div>

      {/* Sliding Glassmorphism Shelf Catalog drawer */}
      <div className={`shelf-sliding-panel ${selectedZone ? "open" : ""}`}>
        {selectedZone && (() => {
          const zoneObj = zones.find(z => z.id === selectedZone);
          return (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(120, 113, 108, 0.15)", paddingBottom: "8px" }}>
                <div>
                  <h4 style={{ color: "#fff", fontSize: "13px", margin: 0, fontWeight: "bold" }}>{zoneObj.name}</h4>
                  <span style={{ color: "#888", fontSize: "9.5px" }}>{zoneObj.desc}</span>
                </div>
                <button 
                  onClick={() => setSelectedZone(null)}
                  style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "14px", padding: "4px" }}
                >✕</button>
              </div>

              <div className="shelf-product-list">
                {shelfProducts.map(p => (
                  <div key={p.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", padding: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ color: "#fff", fontSize: "11px", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.name}>
                      {p.name}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#00c9a7", fontSize: "11px", fontWeight: "bold" }}>₹{p.sellingPrice}</span>
                      <span style={{ color: p.stock <= 5 ? "#ff4757" : "#aaa", fontSize: "9.5px" }}>Stock: {p.stock}</span>
                    </div>
                    
                    {addToCart && p.stock > 0 && (
                      <button 
                        onClick={() => {
                          addToCart(p);
                          // Pulse note
                        }}
                        style={{ width: "100%", padding: "5px", fontSize: "10px", background: zoneObj.color, border: "none", color: "#fff", borderRadius: "4px", fontWeight: "bold", cursor: "pointer" }}
                      >
                        🛒 ADD TO CART
                      </button>
                    )}
                    {p.stock <= 0 && (
                      <span style={{ textAlign: "center", color: "#ff4757", fontSize: "9.5px", fontWeight: "bold", padding: "4px" }}>OUT OF STOCK</span>
                    )}
                  </div>
                ))}
                {shelfProducts.length === 0 && (
                  <div style={{ textAlign: "center", color: "#666", fontSize: "11px", marginTop: "30px" }}>
                    No inventory products mapped to this shelf yet.
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
