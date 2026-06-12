import React from "react";

export default function ShopMap({ highlightZone = "" }) {
  // Mapping zones to descriptive names and hardware aisles
  const zones = [
    { id: "A", name: "AISLE A", desc: "Hardware & Hand Tools", color: "#3498db", x: 260, y: 30, w: 180, h: 100 },
    { id: "B", name: "AISLE B", desc: "Electricals & Lighting", color: "#f1c40f", x: 260, y: 155, w: 180, h: 100 },
    { id: "C", name: "AISLE C", desc: "Plumbing Pipes & Fittings", color: "#2ecc71", x: 260, y: 280, w: 180, h: 100 },
    { id: "D", name: "AISLE D", desc: "Ceramics & Sanitaryware", color: "#e74c3c", x: 30, y: 280, w: 180, h: 100 },
    { id: "E", name: "AISLE E", desc: "Bathroom Fittings & Motors", color: "#9b59b6", x: 30, y: 155, w: 180, h: 100 }
  ];

  return (
    <div className="shop-map-container" style={{ position: "relative", background: "#111", padding: "15px", borderRadius: "12px", border: "1.5px solid rgba(120, 113, 108, 0.15)", width: "100%", maxWidth: "600px", margin: "0 auto" }}>
      {/* Visual map style sheet injected inline */}
      <style>{`
        .map-grid-line { stroke: rgba(255,255,255,0.03); stroke-width: 1; }
        .map-wall { stroke: rgba(255,255,255,0.15); stroke-width: 3; fill: none; }
        .map-zone {
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          fill-opacity: 0.08;
          stroke-width: 1.5;
        }
        .map-zone:hover {
          fill-opacity: 0.18;
          stroke-width: 2.5;
        }
        .map-zone.active {
          fill-opacity: 0.35;
          stroke-width: 3.5;
          animation: mapPulse 1.8s infinite alternate ease-in-out;
        }
        .map-zone-text {
          font-family: 'Inter', system-ui, sans-serif;
          font-weight: 800;
          font-size: 11px;
          fill: #ffffff;
          pointer-events: none;
          letter-spacing: 1px;
        }
        .map-zone-desc {
          font-family: 'Inter', system-ui, sans-serif;
          font-size: 8.5px;
          fill: #888888;
          pointer-events: none;
        }
        .map-zone.active + .map-zone-text {
          fill: #ffffff;
          text-shadow: 0 0 10px rgba(255,255,255,0.8);
        }

        @keyframes mapPulse {
          0% {
            stroke-opacity: 0.6;
            filter: drop-shadow(0 0 2px var(--pulse-color));
          }
          100% {
            stroke-opacity: 1;
            filter: drop-shadow(0 0 15px var(--pulse-color));
          }
        }
      `}</style>

      {/* Blueprint background grid */}
      <svg
        viewBox="0 0 480 410"
        width="100%"
        height="100%"
        style={{ background: "#111", borderRadius: "8px" }}
      >
        {/* Draw blueprint grid */}
        {Array.from({ length: 16 }).map((_, i) => (
          <line key={`v-${i}`} x1={i * 30} y1={0} x2={i * 30} y2={410} className="map-grid-line" />
        ))}
        {Array.from({ length: 14 }).map((_, i) => (
          <line key={`h-${i}`} x1={0} y1={i * 30} x2={480} y2={i * 30} className="map-grid-line" />
        ))}

        {/* Shop outer boundaries */}
        <rect x={10} y={10} width={460} height={390} className="map-wall" rx={6} />

        {/* Shop Entrance & Counter Area */}
        <g>
          <rect x={30} y={30} width={180} height={100} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1.5} rx={4} strokeDasharray="4 4" />
          <rect x={60} y={60} width={120} height={40} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth={2} rx={2} />
          <text x={120} y={84} textAnchor="middle" fill="#888" fontSize="10" fontWeight="bold" letterSpacing="1">
            CHECKOUT COUNTER
          </text>
          {/* Main Entrance */}
          <line x1={80} y1={10} x2={160} y2={10} stroke="#2ecc71" strokeWidth={4} />
          <text x={120} y={23} textAnchor="middle" fill="#2ecc71" fontSize="8" fontWeight="bold" letterSpacing="0.5">
            MAIN ENTRANCE
          </text>
        </g>

        {/* Zones (Aisles) */}
        {zones.map(z => {
          const isActive = highlightZone?.toUpperCase() === z.id;
          return (
            <g key={z.id}>
              <rect
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                className={`map-zone ${isActive ? "active" : ""}`}
                style={{
                  "--pulse-color": z.color,
                  stroke: z.color,
                  fill: z.color
                }}
                rx={4}
              />
              {/* Text overlays */}
              <text x={z.x + z.w / 2} y={z.y + z.h / 2 - 4} textAnchor="middle" className="map-zone-text">
                {z.name}
              </text>
              <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 10} textAnchor="middle" className="map-zone-desc">
                {z.desc}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Map Legend */}
      <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "6px", borderTop: "1px solid rgba(120, 113, 108, 0.1)", paddingTop: "10px", fontSize: "10px" }}>
        {zones.map(z => (
          <div key={z.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: z.color, border: highlightZone === z.id ? "1.5px solid #fff" : "none" }}></span>
            <span style={{ color: highlightZone === z.id ? "#fff" : "#aaa", fontWeight: highlightZone === z.id ? "bold" : "normal" }}>
              {z.id}: {z.desc.split(" ")[0]} ({z.desc.includes("Plumbing") ? "Plumbing" : z.id === "A" ? "Hardware" : z.id === "B" ? "Electrical" : z.id === "D" ? "Sanitary" : "Bathroom"})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
