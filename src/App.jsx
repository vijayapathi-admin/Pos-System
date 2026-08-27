import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./AppContext";
import Topbar from "./components/Topbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Daybook from "./pages/Daybook";
import Billing from "./pages/Billing";
import Inventory from "./pages/Inventory";
import Analytics from "./pages/Analytics";
import Demand from "./pages/Demand";
import Expenses from "./pages/Expenses";
import CreditBook from "./pages/CreditBook";
import Suppliers from "./pages/Suppliers";
import Estimations from "./pages/Estimations";
import Purchases from "./pages/Purchases";
import Contacts from "./pages/Contacts";
import NotificationOverlay from "./components/NotificationOverlay";
import TaxHelper from "./pages/TaxHelper";
import PLBoard from "./pages/PLBoard";
import ReferralLedger from "./pages/ReferralLedger";
import BarcodeDatabase from "./pages/BarcodeDatabase";
import MobileOcrScanner from "./pages/MobileOcrScanner";
import "./styles.css";


function ProtectedLayout({ children }) {
  const { user, loading } = useApp();

  if (loading) return <div className="loading-screen"><div className="loader" /><div>Loading Vijayapathi Traders...</div></div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-layout">
      <Topbar />
      <main className="main-content">{children}</main>
    </div>
  );
}

function AppRoutes() {
  const { user, userRole } = useApp();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <ProtectedLayout>
          {userRole === "staff" ? <Navigate to="/billing" replace /> : <Dashboard />}
        </ProtectedLayout>
      } />
      <Route path="/daybook" element={<ProtectedLayout><Daybook /></ProtectedLayout>} />
      <Route path="/billing" element={<ProtectedLayout><Billing /></ProtectedLayout>} />
      <Route path="/inventory" element={<ProtectedLayout><Inventory /></ProtectedLayout>} />
      <Route path="/analytics" element={<ProtectedLayout><Analytics /></ProtectedLayout>} />
      <Route path="/demand" element={<ProtectedLayout><Demand /></ProtectedLayout>} />
      <Route path="/expenses" element={<ProtectedLayout><Expenses /></ProtectedLayout>} />
      <Route path="/creditbook" element={<ProtectedLayout><CreditBook /></ProtectedLayout>} />
      <Route path="/suppliers" element={<ProtectedLayout><Suppliers /></ProtectedLayout>} />
      <Route path="/purchases" element={<ProtectedLayout><Purchases /></ProtectedLayout>} />
      <Route path="/estimations" element={<ProtectedLayout><Estimations /></ProtectedLayout>} />
      <Route path="/contacts" element={<ProtectedLayout><Contacts /></ProtectedLayout>} />
      <Route path="/tax-helper" element={<ProtectedLayout><TaxHelper /></ProtectedLayout>} />
      <Route path="/p-and-l" element={<ProtectedLayout><PLBoard /></ProtectedLayout>} />
      <Route path="/referral-ledger" element={<ProtectedLayout><ReferralLedger /></ProtectedLayout>} />
      <Route path="/barcode-db" element={<ProtectedLayout><BarcodeDatabase /></ProtectedLayout>} />
      <Route path="/mobile-scanner" element={<MobileOcrScanner />} />
      <Route path="*" element={<Navigate to="/" replace />} />

    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <NotificationOverlay />
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
