import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../AppContext";

export default function Login() {
  const { login, register } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@shop.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      return setError("Please fill in email and password to register.");
    }
    setError("");
    setLoading(true);
    try {
      await register(email, password);
      navigate("/");
    } catch (err) {
      setError("Registration failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-logo" style={{ display: "flex", alignItems: "center", marginBottom: "30px" }}>
          <img src="/vijayapathi-logo.jpg" alt="Vijayapathi Traders Logo" style={{ height: "75px", borderRadius: "10px", border: "2px solid rgba(255, 255, 255, 0.25)", background: "#fff", padding: "3px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)" }} />
        </div>
        <div className="login-tagline-section">
          <div className="login-sub">POINT OF SALE</div>
          <h1 className="login-headline">Built for the<br />shop floor.</h1>
          <p className="login-desc">
            Hardware, electrical, plumbing and sanitary — one tough system for inventory, billing and demand prediction.
          </p>
        </div>
        <div className="login-version">v1.0 · secure · role-based</div>
      </div>

      <div className="login-right">
        <div className="login-form-container">
          <div className="welcome-text">WELCOME BACK</div>
          <h2 className="login-title">Sign in to your shop.</h2>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label>EMAIL OR PHONE</label>
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@shop.com"
                required
              />
            </div>
            <div className="form-group">
              <label>PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn-signin" disabled={loading} style={{ flex: 1 }}>
                {loading ? "..." : "SIGN IN"}
              </button>
              <button type="button" onClick={handleRegister} className="btn-signin" disabled={loading} style={{ flex: 1, backgroundColor: '#333', color: '#fff' }}>
                REGISTER
              </button>
            </div>
          </form>

          <div className="demo-accounts">
            <div className="demo-label">DEMO ACCOUNTS</div>
            <div>admin@shop.com / admin1223</div>
            <div>staff@shop.com / staff123</div>
          </div>
        </div>
      </div>
    </div>
  );
}
