import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useApp } from "../AppContext";

export default function Topbar() {
  const { user, userRole, logout, offlineSales } = useApp();
  const navigate = useNavigate();

  const [theme, setTheme] = React.useState(() => {
    const saved = localStorage.getItem("theme");
    return saved || "light";
  });

  const [activeDropdown, setActiveDropdown] = useState(null);

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

  const userName = user?.email?.split("@")[0]?.replace("admin", "Admin")?.replace("staff", "Staff User") || "Admin";
  const avatarInitial = userName.charAt(0).toUpperCase();

  return (
    <header className="vt-topbar">
      <div className="vt-topbar-left">
        {/* VT Vijayapathi Traders Logo */}
        <div className="vt-brand" onClick={() => navigate("/")} style={{ cursor: "pointer" }}>
          <div className="vt-logo-badge">VT</div>
          <span className="vt-brand-name">VIJAYAPATHI TRADERS</span>
        </div>

        {/* Header Navigation Links */}
        <nav className="vt-nav-links">
          <NavLink to="/" end className={({ isActive }) => `vt-nav-item ${isActive ? "active" : ""}`}>
            <span className="vt-nav-icon">⊞</span>
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/daybook" className={({ isActive }) => `vt-nav-item ${isActive ? "active" : ""}`}>
            <span className="vt-nav-icon">📖</span>
            <span>Daybook</span>
          </NavLink>

          <NavLink to="/billing" className={({ isActive }) => `vt-nav-item ${isActive ? "active" : ""}`}>
            <span className="vt-nav-icon">🛒</span>
            <span>POS Billing</span>
            <span className="vt-caret">▾</span>
          </NavLink>

          <NavLink to="/inventory" className={({ isActive }) => `vt-nav-item ${isActive ? "active" : ""}`}>
            <span className="vt-nav-icon">📦</span>
            <span>Stocks</span>
          </NavLink>

          <NavLink to="/purchases" className={({ isActive }) => `vt-nav-item ${isActive ? "active" : ""}`}>
            <span className="vt-nav-icon">🛍️</span>
            <span>Purchases</span>
          </NavLink>

          {/* Dropdown for Reports */}
          <div 
            className={`vt-nav-dropdown ${activeDropdown === "reports" ? "open" : ""}`}
            onMouseEnter={() => setActiveDropdown("reports")}
            onMouseLeave={() => setActiveDropdown(null)}
          >
            <button className="vt-nav-item vt-dropdown-trigger">
              <span className="vt-nav-icon">📊</span>
              <span>Reports</span>
              <span className="vt-caret">▾</span>
            </button>
            {activeDropdown === "reports" && (
              <div className="vt-dropdown-menu">
                <NavLink to="/analytics" onClick={() => setActiveDropdown(null)}>Analytics & Insights</NavLink>
                <NavLink to="/p-and-l" onClick={() => setActiveDropdown(null)}>P&L Statement</NavLink>
                <NavLink to="/expenses" onClick={() => setActiveDropdown(null)}>Expense Register</NavLink>
                <NavLink to="/tax-helper" onClick={() => setActiveDropdown(null)}>Tax Ledger (GST)</NavLink>
                <NavLink to="/demand" onClick={() => setActiveDropdown(null)}>Demand & Shortage</NavLink>
              </div>
            )}
          </div>

          {/* Dropdown for Customers / Directory */}
          <div 
            className={`vt-nav-dropdown ${activeDropdown === "customers" ? "open" : ""}`}
            onMouseEnter={() => setActiveDropdown("customers")}
            onMouseLeave={() => setActiveDropdown(null)}
          >
            <button className="vt-nav-item vt-dropdown-trigger">
              <span className="vt-nav-icon">👥</span>
              <span>Customers</span>
              <span className="vt-caret">▾</span>
            </button>
            {activeDropdown === "customers" && (
              <div className="vt-dropdown-menu">
                <NavLink to="/contacts" onClick={() => setActiveDropdown(null)}>Customer Directory</NavLink>
                <NavLink to="/creditbook" onClick={() => setActiveDropdown(null)}>Credit Ledger</NavLink>
                <NavLink to="/referral-ledger" onClick={() => setActiveDropdown(null)}>Commission Book</NavLink>
                <NavLink to="/suppliers" onClick={() => setActiveDropdown(null)}>Suppliers</NavLink>
                <NavLink to="/estimations" onClick={() => setActiveDropdown(null)}>Estimations</NavLink>
              </div>
            )}
          </div>

          {/* Dropdown for Settings / Barcode */}
          <div 
            className={`vt-nav-dropdown ${activeDropdown === "settings" ? "open" : ""}`}
            onMouseEnter={() => setActiveDropdown("settings")}
            onMouseLeave={() => setActiveDropdown(null)}
          >
            <button className="vt-nav-item vt-dropdown-trigger">
              <span className="vt-nav-icon">⚙️</span>
              <span>Settings</span>
              <span className="vt-caret">▾</span>
            </button>
            {activeDropdown === "settings" && (
              <div className="vt-dropdown-menu">
                <NavLink to="/barcode-db" onClick={() => setActiveDropdown(null)}>Barcode Database</NavLink>
                <a href="#logout" onClick={(e) => { e.preventDefault(); handleLogout(); }}>Logout ({userName})</a>
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* Right Controls */}
      <div className="vt-topbar-right">
        {offlineSales && offlineSales.length > 0 && (
          <div className="vt-offline-badge" title="Waiting for internet sync">
            ⚠️ {offlineSales.length} OFFLINE
          </div>
        )}

        {/* Theme toggle button */}
        <button className="vt-icon-btn" onClick={toggleTheme} title="Toggle Dark/Light Mode">
          {theme === "light" ? "🌙" : "☀️"}
        </button>

        {/* Notification Bell with Badge */}
        <button className="vt-icon-btn vt-notif-btn" title="3 New Notifications">
          <span className="vt-bell-icon">🔔</span>
          <span className="vt-notif-badge">3</span>
        </button>

        {/* User Profile Circle & Name */}
        <div className="vt-user-profile" title={`Logged in as ${userName}`}>
          <div className="vt-user-avatar">{avatarInitial}</div>
          <span className="vt-user-name">{userName}</span>
        </div>
      </div>
    </header>
  );
}

