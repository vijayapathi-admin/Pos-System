import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useApp } from "../AppContext";

const NAV = [
  { path: "/", label: "DASHBOARD", icon: "⊞" },
  { path: "/daybook", label: "DAYBOOK", icon: "📖" },
  { path: "/billing", label: "POS BILLING", icon: "🛒" },
  { path: "/estimations", label: "ESTIMATIONS", icon: "📑" },
  { path: "/inventory", label: "INVENTORY", icon: "📦" },
  { path: "/barcode-db", label: "BARCODE DATABASE", icon: "🏷️" },
  { path: "/analytics", label: "ANALYTICS", icon: "📊" },
  { path: "/demand", label: "DEMAND", icon: "📈" },
  { path: "/expenses", label: "EXPENSES", icon: "💰" },
  { path: "/purchases", label: "PURCHASES", icon: "📥" },
  { path: "/creditbook", label: "CREDIT BOOK", icon: "📓" },
  { path: "/referral-ledger", label: "COMMISSION BOOK", icon: "💸" },
  { path: "/suppliers", label: "SUPPLIERS", icon: "🚚" },
  { path: "/contacts", label: "DIRECTORY", icon: "👥" },
  { path: "/tax-helper", label: "TAX LEDGER", icon: "🧾" },
  { path: "/p-and-l", label: "P&L SHEET", icon: "💼" },
];

const STAFF_NAV = [
  { path: "/billing", label: "POS BILLING", icon: "🛒" },
  { path: "/barcode-db", label: "BARCODE DATABASE", icon: "🏷️" },
];

export default function Sidebar({ isOpen, onClose }) {
  const { user, userRole, logout, offlineSales } = useApp();
  const navigate = useNavigate();
  const navItems = userRole === "staff" ? STAFF_NAV : NAV;

  const [theme, setTheme] = React.useState(() => {
    const saved = localStorage.getItem("theme");
    return saved || "light";
  });

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleNavClick = () => {
    if (window.innerWidth <= 768) {
      onClose();
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <div className="sidebar-logo" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px" }}>
        <img src="/vijayapathi-logo.jpg" alt="Vijayapathi Traders Logo" style={{ height: "42px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "#fff", padding: "2px" }} />
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            onClick={handleNavClick}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        {offlineSales && offlineSales.length > 0 && (
          <div style={{ background: '#f8d7da', color: '#721c24', padding: '8px', borderRadius: '6px', fontSize: '11px', marginBottom: '10px', textAlign: 'center', fontWeight: 'bold' }}>
            {offlineSales.length} OFFLINE SALES
            <div style={{ fontSize: '9px', fontWeight: 'normal', marginTop: '2px' }}>Waiting for internet...</div>
          </div>
        )}
        <div className="user-info">
          <div className="signed-label">SIGNED IN</div>
          <div className="user-name">{user?.email?.split("@")[0]?.replace("admin", "Admin")?.replace("staff", "Staff User")}</div>
          <div className={`user-role ${userRole}`}>{userRole?.toUpperCase()}</div>
        </div>
        <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
          <button 
            className="theme-toggle-btn"
            onClick={toggleTheme} 
            style={{ 
              flex: 1, 
              padding: "8px 12px", 
              border: "1.5px solid #ddd", 
              borderRadius: "6px", 
              fontSize: "12px", 
              fontWeight: "800", 
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
          >
            {theme === "light" ? "🌙 DARK MODE" : "☀️ LIGHT MODE"}
          </button>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          <span>⇒</span> LOGOUT
        </button>
      </div>
    </aside>
  );
}
