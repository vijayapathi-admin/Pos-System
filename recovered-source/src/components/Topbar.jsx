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

export default function Topbar() {
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

  return (
    <header className="topbar">
      <div className="topbar-header" style={{ padding: "6px 0" }}>
        <div className="topbar-logo" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img src="/vijayapathi-logo.jpg" alt="Vijayapathi Traders Logo" style={{ height: "42px", borderRadius: "6px", border: "1px solid rgba(255, 255, 255, 0.15)", background: "#fff", padding: "2px" }} />
        </div>

        <div className="topbar-actions">
          {offlineSales && offlineSales.length > 0 && (
            <div style={{ background: '#f8d7da', color: '#721c24', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }} title="Waiting for internet sync">
              ⚠️ {offlineSales.length} OFFLINE
            </div>
          )}

          <div className="topbar-user">
            <span className="topbar-username">
              {user?.email?.split("@")[0]?.replace("admin", "Admin")?.replace("staff", "Staff User")}
            </span>
            <span className={`topbar-role ${userRole}`}>
              {userRole?.toUpperCase()}
            </span>
          </div>

          <button 
            className="topbar-btn"
            onClick={toggleTheme} 
            title="Toggle Light/Dark Theme"
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>

          <button 
            className="topbar-btn"
            onClick={handleLogout}
            style={{ borderColor: "#e74c3c" }}
            title="Logout"
          >
            ⇒ LOGOUT
          </button>
        </div>
      </div>

      <nav className="topbar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) => `topbar-nav-item ${isActive ? "active" : ""}`}
          >
            <span className="topbar-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
