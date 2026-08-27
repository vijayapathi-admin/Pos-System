import React, { useEffect, useState, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { normalizeOcrCode } from "../services/ocrScannerService";


export default function BarcodeScannerModal({ onClose, onScan }) {
  const [manualCode, setManualCode] = useState("");
  const [devices, setDevices] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [cameraError, setCameraError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const html5QrcodeRef = useRef(null);

  // 1. Fetch available cameras on mount (triggered by user opening the modal)
  useEffect(() => {
    let active = true;

    // Fast listing of camera devices
    Html5Qrcode.getCameras()
      .then((cameraDevices) => {
        if (!active) return;
        if (cameraDevices && cameraDevices.length > 0) {
          setDevices(cameraDevices);
          
          // Locate the rear/back/environment camera
          const backCamera = cameraDevices.find(device => 
            device.label?.toLowerCase().includes("back") || 
            device.label?.toLowerCase().includes("rear") ||
            device.label?.toLowerCase().includes("environment") || 
            device.label?.toLowerCase().includes("camera 1") ||
            device.label?.toLowerCase().includes("facing back")
          ) || cameraDevices[cameraDevices.length - 1]; // Fallback to last device (usually back camera on phone)
          
          setSelectedCameraId(backCamera.id);
          setCameraError(null);
        } else {
          // If list is empty, default to facingMode: environment
          setSelectedCameraId("environment");
          setCameraError("No specific camera devices listed. Using environment camera.");
        }
      })
      .catch((err) => {
        console.warn("getCameras failed, falling back to facingMode:", err);
        if (!active) return;
        // Strict fallback to default rear camera
        setSelectedCameraId("environment");
      })
      .finally(() => {
        if (active) {
          setIsInitializing(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // 2. Control starting/stopping scanner based on selectedCameraId
  useEffect(() => {
    if (!selectedCameraId) return;

    let isSubscribed = true;
    let html5QrcodeInstance = null;

    const startScanner = async () => {
      // Ensure the scanner element is fully rendered in DOM
      const element = document.getElementById("scanner-reader");
      if (!element) {
        // Retry in a bit if not ready
        setTimeout(startScanner, 50);
        return;
      }

      try {
        // Always clean up existing instance first
        if (html5QrcodeRef.current) {
          if (html5QrcodeRef.current.isScanning) {
            await html5QrcodeRef.current.stop();
          }
          html5QrcodeRef.current = null;
        }

        if (!isSubscribed) return;

        // Initialize new scanner instance
        html5QrcodeInstance = new Html5Qrcode("scanner-reader");
        html5QrcodeRef.current = html5QrcodeInstance;

        const config = { 
          fps: 20, 
          qrbox: (width, height) => {
            // Optimized box shape for barcode reading (rectangular, elongated)
            const boxWidth = Math.min(width * 0.8, 320);
            const boxHeight = Math.min(height * 0.35, 120);
            return { x: (width - boxWidth) / 2, y: (height - boxHeight) / 2, width: boxWidth, height: boxHeight };
          }
        };

        const targetSource = selectedCameraId === "environment" 
          ? { facingMode: "environment" } 
          : selectedCameraId;

        await html5QrcodeInstance.start(
          targetSource,
          config,
          async (decodedText) => {
            if (html5QrcodeInstance.isScanning) {
              await html5QrcodeInstance.stop();
            }
            if (isSubscribed) {
              onScan(normalizeOcrCode(decodedText));
            }
          },

          () => {
            // Quiet fail during live scanning frame ticks
          }
        );
        
        if (isSubscribed) {
          setCameraError(null);
        }
      } catch (err) {
        console.error("Camera startup failed:", err);
        if (isSubscribed) {
          setCameraError(
            `Could not start camera. Please verify camera permissions are allowed and you are on a secure (HTTPS) connection.`
          );
        }
      }
    };

    // Small delay to let the DOM settle before scanner mounts
    const startTimer = setTimeout(() => {
      startScanner();
    }, 150);

    return () => {
      isSubscribed = false;
      clearTimeout(startTimer);
      if (html5QrcodeInstance && html5QrcodeInstance.isScanning) {
        html5QrcodeInstance.stop().catch(err => console.warn("Stop on clean up failed:", err));
      }
    };
  }, [selectedCameraId, onScan]);

  // 3. Overall Cleanup on Modal Unmount
  useEffect(() => {
    return () => {
      if (html5QrcodeRef.current && html5QrcodeRef.current.isScanning) {
        html5QrcodeRef.current.stop().catch(err => console.warn("Cleanup stop failed:", err));
      }
    };
  }, []);

  return (
    <div className="modal-overlay" style={{ zIndex: 9995 }} onClick={onClose}>
      <div className="modal-content form-modal" style={{ maxWidth: "460px", width: "90%", padding: "20px" }} onClick={e => e.stopPropagation()}>
        <div className="modal-stripe"></div>
        <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
          <span>📷 Barcode Camera Scanner</span>
          <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={onClose}>Close</button>
        </h2>

        {/* Camera Selector Dropdown (visible if multiple sources exist) */}
        {!isInitializing && devices.length > 1 && (
          <div style={{ margin: "10px 0" }}>
            <label style={{ display: "block", fontSize: "11px", color: "#aaa", marginBottom: "4px", fontWeight: "bold" }}>
              🔄 Switch Camera Source:
            </label>
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "rgba(120, 113, 108, 0.1)",
                border: "1.5px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "13px",
                fontWeight: "bold",
                outline: "none"
              }}
            >
              {devices.map((device, idx) => (
                <option key={device.id} value={device.id} style={{ background: "#1c1917" }}>
                  {device.label || `Camera ${idx + 1}`}
                </option>
              ))}
              <option value="environment" style={{ background: "#1c1917" }}>
                Default Rear Camera
              </option>
            </select>
          </div>
        )}

        <div style={{ background: "#1c1917", borderRadius: "10px", overflow: "hidden", margin: "15px 0", border: "1px solid rgba(255,255,255,0.15)", position: "relative" }}>
          <div id="scanner-reader" style={{ width: "100%", minHeight: "260px" }}></div>
          {isInitializing && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(11, 7, 29, 0.9)", color: "#fff", fontSize: "14px" }}>
              Scanning for cameras...
            </div>
          )}
        </div>

        {/* Error Alert Display */}
        {cameraError && (
          <div className="bulk-help-box" style={{ background: "rgba(231, 76, 60, 0.08)", color: "#e74c3c", borderColor: "rgba(231, 76, 60, 0.2)", fontSize: "11px", textAlign: "left", marginBottom: "15px", padding: "10px" }}>
            ⚠️ **Scanner Status:** {cameraError}
          </div>
        )}

        <div className="bulk-help-box" style={{ background: "rgba(37, 99, 235, 0.08)", color: "#2563eb", borderColor: "rgba(37, 99, 235, 0.2)", fontSize: "12px", textAlign: "center", marginBottom: "15px" }}>
          ⚡ **Pro Tip:** Align the product's barcode inside the frame. Hold your camera steady about 10-15cm away.
        </div>

        {/* Manual Keyboard Code Fallback */}
        <div style={{ margin: "15px 0", borderTop: "1.5px dashed rgba(255,255,255,0.15)", paddingTop: "15px" }}>
          <div style={{ fontSize: "12px", color: "#aaa", marginBottom: "8px", fontWeight: "bold" }}>⌨️ Or Enter Product Code Manually:</div>
          <form onSubmit={(e) => { e.preventDefault(); if (manualCode.trim()) onScan(normalizeOcrCode(manualCode)); }} style={{ display: "flex", gap: "10px" }}>

            <input 
              type="text" 
              placeholder="e.g. HRD-001" 
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              style={{ flex: 1, padding: "8px 12px", background: "rgba(120, 113, 108, 0.1)", border: "1.5px solid rgba(255,255,255,0.15)", borderRadius: "6px", color: "#fff", fontSize: "13px", fontWeight: "bold" }}
            />
            <button type="submit" className="btn-primary" style={{ margin: 0, padding: "8px 16px", background: "#2563eb", fontSize: "12px", fontWeight: "800" }}>
              SUBMIT
            </button>
          </form>
        </div>

        {/* Camera Access Diagnostic Helpers */}
        <div className="bulk-help-box" style={{ background: "rgba(255,255,255,0.02)", color: "#bbb", borderColor: "rgba(255, 255, 255, 0.1)", fontSize: "11px", textAlign: "left", padding: "10px", lineHeight: "1.4" }}>
          🔧 **Mobile Camera Quick Checklist:**<br/>
          • Access via secure **HTTPS** link. Browsers block cameras on plain HTTP links.<br/>
          • Check your **Site Settings & Permissions** (Ensure camera access is not "Blocked" in browser settings).<br/>
          • If the image is pitch black, try switching the camera source via the dropdown above.
        </div>
      </div>
    </div>
  );
}
