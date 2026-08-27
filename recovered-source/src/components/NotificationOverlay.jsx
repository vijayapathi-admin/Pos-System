import React from "react";
import { useApp } from "../AppContext";

export default function NotificationOverlay() {
  const { notifications, removeNotification } = useApp();

  if (notifications.length === 0) return null;

  return (
    <div className="notification-container" style={{
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: 10000,
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      pointerEvents: "none"
    }}>
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`notification-item ${n.type}`}
          style={{
            background: n.type === "warning" 
              ? "#fdf2e9" 
              : n.type === "error" 
                ? "#fdebeb" 
                : "#e6f6fd",
            color: n.type === "warning" ? "#856404" : n.type === "error" ? "#721c24" : "#0c5460",
            border: `1.5px solid ${n.type === "warning" ? "rgba(255, 193, 7, 0.3)" : n.type === "error" ? "rgba(220, 53, 69, 0.3)" : "rgba(23, 162, 184, 0.3)"}`,
            padding: "16px 20px 20px 20px",
            borderRadius: "8px",
            boxShadow: "0 8px 32px rgba(24, 18, 54, 0.12)",
            minWidth: "320px",
            maxWidth: "400px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            pointerEvents: "auto",
            animation: "slideIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both",
            position: "relative",
            overflow: "hidden"
          }}
        >
          <div style={{ flex: 1, paddingRight: "10px" }}>
            <div style={{ fontWeight: "800", fontSize: "14px", marginBottom: "4px", letterSpacing: "0.3px" }}>{n.title}</div>
            <div style={{ fontSize: "13px", lineHeight: "1.4", opacity: 0.9 }}>{n.message}</div>
          </div>
          <button
            onClick={() => removeNotification(n.id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "18px",
              padding: "0 0 0 12px",
              opacity: 0.5,
              color: "inherit",
              fontWeight: "bold",
              transition: "opacity 0.2s"
            }}
            onMouseOver={(e) => e.target.style.opacity = 1}
            onMouseOut={(e) => e.target.style.opacity = 0.5}
          >
            ×
          </button>
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: "4px",
            background: n.type === "warning" ? "#ffc107" : n.type === "error" ? "#dc3545" : "#17a2b8",
            animation: "progressShrink 5s linear forwards",
            width: "100%"
          }} />
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(110%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes progressShrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
