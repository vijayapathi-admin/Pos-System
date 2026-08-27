import React, { useEffect, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  createScannerSession,
  subscribeToScannerSession,
  closeScannerSession
} from "../services/ocrScannerService";

export default function PhoneScannerModal({ onClose, onCodeScanned, userEmail = "cashier@shopops.com" }) {
  const [sessionId, setSessionId] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastProcessedCodeId, setLastProcessedCodeId] = useState(null);
  const [scannedHistory, setScannedHistory] = useState([]);

  // 1. Initialize Scanner Session on Mount
  useEffect(() => {
    let active = true;

    async function initSession() {
      try {
        setLoading(true);
        const newSessionId = await createScannerSession(userEmail);
        if (active) {
          setSessionId(newSessionId);
        }
      } catch (err) {
        console.error("Failed to create scanner session:", err);
        if (active) setError(err.message || "Failed to initialize scanner session.");
      } finally {
        if (active) setLoading(false);
      }
    }

    initSession();

    return () => {
      active = false;
    };
  }, [userEmail]);

  // 2. Subscribe to Session Updates
  useEffect(() => {
    if (!sessionId) return;

    const unsubscribe = subscribeToScannerSession(sessionId, (data) => {
      setSessionData(data);

      if (data && data.lastScannedCode) {
        const scanObj = data.lastScannedCode;
        if (scanObj.id && scanObj.id !== lastProcessedCodeId) {
          setLastProcessedCodeId(scanObj.id);

          // Add to PC history list
          setScannedHistory(prev => [
            { code: scanObj.code, time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) },
            ...prev
          ]);

          // Trigger cart add on PC
          if (onCodeScanned) {
            onCodeScanned(scanObj.code);
          }
        }
      }
    });

    return () => {
      unsubscribe();
      closeScannerSession(sessionId);
    };
  }, [sessionId, lastProcessedCodeId, onCodeScanned]);

  const scannerUrl = sessionId
    ? `${window.location.origin}/mobile-scanner?session=${sessionId}`
    : "";

  const isConnected = sessionData && sessionData.status === "CONNECTED";

  return (
    <div className="modal-overlay" style={{ zIndex: 9995 }} onClick={onClose}>
      <div
        className="modal-content form-modal"
        style={{ maxWidth: "480px", width: "92%", padding: "24px", textAlign: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-stripe"></div>

        <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
          <span>📱 Phone OCR Camera Scanner</span>
          <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={onClose}>
            Close
          </button>
        </h2>

        {/* Live Session Status Header */}
        <div
          style={{
            margin: "12px 0 18px 0",
            padding: "8px 12px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            background: isConnected ? "rgba(34, 197, 94, 0.12)" : "rgba(245, 158, 11, 0.12)",
            color: isConnected ? "#22c55e" : "#f59e0b",
            border: `1.5px solid ${isConnected ? "rgba(34, 197, 94, 0.3)" : "rgba(245, 158, 11, 0.3)"}`
          }}
        >
          <span>{isConnected ? "🟢 Scanner Connected ✓" : "🟡 Scanner Disconnected"}</span>
          <span style={{ fontSize: "11px", opacity: 0.8 }}>
            ({isConnected ? `Phone Active` : "Waiting for phone pairing..."})
          </span>
        </div>

        {loading ? (
          <div style={{ padding: "30px", color: "#888" }}>Generating pair session QR...</div>
        ) : error ? (
          <div style={{ color: "#e74c3c", padding: "20px", fontSize: "13px" }}>⚠️ {error}</div>
        ) : (
          <div>
            {/* QR Code Container */}
            <div
              style={{
                background: "#fff",
                padding: "16px",
                borderRadius: "12px",
                display: "inline-block",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                margin: "5px 0 15px 0"
              }}
            >
              <QRCodeSVG value={scannerUrl} size={180} level="H" includeMargin={true} />
            </div>

            <div style={{ fontSize: "12px", color: "#bbb", marginBottom: "12px", lineHeight: "1.4" }}>
              <strong>How to Pair Phone:</strong><br />
              1. Open camera on your phone and scan the QR code above.<br />
              2. Point phone camera at product sticker (e.g. <code>BTH-123</code>).<br />
              3. Products will automatically add to this PC billing cart!
            </div>

            {/* Direct Link Share / Copy */}
            <div
              style={{
                background: "rgba(120,113,108,0.1)",
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "11px",
                color: "#aaa",
                wordBreak: "break-all",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                marginBottom: "15px"
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {scannerUrl}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(scannerUrl);
                  alert("Scanner URL copied to clipboard!");
                }}
                style={{
                  background: "#2563eb",
                  border: "none",
                  color: "#fff",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "10px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  whiteSpace: "nowrap"
                }}
              >
                Copy Link
              </button>
            </div>

            {/* Live Scanned History List */}
            {scannedHistory.length > 0 && (
              <div style={{ marginTop: "15px", borderTop: "1px dashed rgba(255,255,255,0.15)", paddingTop: "12px", textAlign: "left" }}>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: "#38bdf8", marginBottom: "6px" }}>
                  ⚡ Live Incoming Phone Scans ({scannedHistory.length})
                </div>
                <div style={{ maxHeight: "110px", overflowY: "auto" }}>
                  {scannedHistory.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: "12px",
                        padding: "4px 8px",
                        background: "rgba(34, 197, 94, 0.08)",
                        borderLeft: "3px solid #22c55e",
                        borderRadius: "3px",
                        marginBottom: "4px",
                        display: "flex",
                        justifyContent: "space-between"
                      }}
                    >
                      <span>Product Code: <strong>{item.code}</strong></span>
                      <span style={{ color: "#888", fontSize: "10px" }}>{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: "20px" }}>
          <button className="btn-secondary" style={{ width: "100%" }} onClick={onClose}>
            Done / Close Scanner Session
          </button>
        </div>
      </div>
    </div>
  );
}
