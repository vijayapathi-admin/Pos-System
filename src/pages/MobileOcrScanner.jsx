import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { createWorker } from "tesseract.js";
import {
  connectPhoneToSession,
  sendScannedCodeToSession,
  normalizeOcrCode,
  isValidProductCodePattern,
  lookupOcrProduct
} from "../services/ocrScannerService";

export default function MobileOcrScanner() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get("session");

  const [connected, setConnected] = useState(false);
  const [sessionError, setSessionError] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [isScanning, setIsScanning] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("Initializing camera & OCR worker...");
  const [lastDetectedCode, setLastDetectedCode] = useState("");
  const [lastProductResult, setLastProductResult] = useState(null);

  // Camera settings
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const mediaStreamRef = useRef(null);
  const videoTrackRef = useRef(null);

  // Ambiguity Modal
  const [ambiguousCode, setAmbiguousCode] = useState(null);
  const workerRef = useRef(null);
  const processingRef = useRef(false);
  const scanTimerRef = useRef(null);

  // Audio Beep
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  };

  // 1. Connect to Session on Mount
  useEffect(() => {
    if (!sessionId) {
      setSessionError("No session ID provided. Please scan the QR code from the PC Billing screen.");
      return;
    }

    connectPhoneToSession(sessionId, navigator.userAgent)
      .then(() => setConnected(true))
      .catch((err) => setSessionError(err.message || "Failed to pair with PC scanner session."));
  }, [sessionId]);

  // 2. Initialize Tesseract Worker
  useEffect(() => {
    let active = true;

    async function initTesseract() {
      try {
        setOcrStatus("Loading OCR Engine...");
        const worker = await createWorker("eng");
        await worker.setParameters({
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
          tessedit_pageseg_mode: "7" // PSM 7: Treat the image as a single text line
        });
        if (active) {
          workerRef.current = worker;
          setOcrStatus("Ready to scan product code stickers!");
        }
      } catch (err) {
        console.warn("Tesseract init failed, falling back to standard OCR parameters:", err);
        try {
          const worker = await createWorker("eng");
          if (active) workerRef.current = worker;
        } catch (_) {}
      }
    }

    initTesseract();

    return () => {
      active = false;
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // 3. Initialize Camera Stream
  useEffect(() => {
    let isSubscribed = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            focusMode: { ideal: "continuous" }
          }
        });

        if (!isSubscribed) return;
        mediaStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const track = stream.getVideoTracks()[0];
        videoTrackRef.current = track;

        // Check torch capabilities
        if (track && track.getCapabilities) {
          const capabilities = track.getCapabilities();
          if (capabilities.torch) {
            setHasTorch(true);
          }
        }
        setIsScanning(true);
      } catch (err) {
        console.error("Camera access failed:", err);
        setSessionError("Could not access camera. Please allow camera permissions and use HTTPS.");
      }
    }

    startCamera();

    return () => {
      isSubscribed = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!videoTrackRef.current || !hasTorch) return;
    try {
      const nextState = !torchOn;
      await videoTrackRef.current.applyConstraints({
        advanced: [{ torch: nextState }]
      });
      setTorchOn(nextState);
    } catch (e) {
      console.warn("Failed to toggle torch:", e);
    }
  };

  // 4. Periodic OCR Capture & Frame Processing
  const captureAndScanFrame = async () => {
    if (processingRef.current || !videoRef.current || !canvasRef.current || !workerRef.current || ambiguousCode) {
      return;
    }

    processingRef.current = true;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      const vW = video.videoWidth;
      const vH = video.videoHeight;

      if (!vW || !vH) {
        processingRef.current = false;
        return;
      }

      // Crop viewport box center region
      const cropW = Math.round(vW * 0.7);
      const cropH = Math.round(vH * 0.35);
      const cropX = Math.round((vW - cropW) / 2);
      const cropY = Math.round((vH - cropH) / 2);

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      // Contrast enhancement / thresholding
      const imgData = ctx.getImageData(0, 0, cropW, cropH);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const v = avg > 128 ? 255 : 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
      ctx.putImageData(imgData, 0, 0);

      // Recognize text with Tesseract
      const { data: { text, confidence } } = await workerRef.current.recognize(canvas);
      const rawDetected = text ? text.trim() : "";
      const normalized = normalizeOcrCode(rawDetected);

      if (normalized && normalized.length >= 3) {
        setOcrStatus(`Detected: ${normalized} (${Math.round(confidence)}% confidence)`);

        // Ambiguity check: If low confidence (<60%) or contains prone OCR errors ('I' vs '1', 'O' vs '0')
        if (confidence < 60 && (normalized.includes("I") || normalized.includes("O") || normalized.includes("0") || normalized.includes("1"))) {
          setAmbiguousCode({ raw: normalized, confidence: Math.round(confidence) });
          processingRef.current = false;
          return;
        }

        if (isValidProductCodePattern(normalized)) {
          await handleSuccessfulScan(normalized);
        }
      }
    } catch (err) {
      console.warn("OCR capture tick exception:", err);
    } finally {
      processingRef.current = false;
    }
  };

  // Run periodic loop every 750ms
  useEffect(() => {
    if (!isScanning || !connected || ambiguousCode) return;

    scanTimerRef.current = setInterval(() => {
      captureAndScanFrame();
    }, 750);

    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };
  }, [isScanning, connected, ambiguousCode]);

  // Handle Confirmed Scan Transmission
  const handleSuccessfulScan = async (code) => {
    setLastDetectedCode(code);
    playBeep();

    // Query product info to give feedback to mobile user
    try {
      const res = await lookupOcrProduct(code);
      if (res.success && res.product) {
        setLastProductResult({
          success: true,
          product: res.product,
          code
        });
      } else {
        setLastProductResult({
          success: false,
          reason: `Code "${code}" not found in database.`,
          code
        });
      }

      // Send to PC Billing session via Firestore
      if (sessionId) {
        await sendScannedCodeToSession(sessionId, code);
      }
    } catch (err) {
      console.error("Transmission failed:", err);
    }

    // Auto reset state after 2 seconds for quick sequential scanning
    setTimeout(() => {
      setLastProductResult(null);
      setOcrStatus("Ready to scan next product sticker!");
    }, 2000);
  };

  return (
    <div style={{ background: "#0c0a09", color: "#fff", minHeight: "100vh", fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Header Bar */}
      <div style={{ background: "#1c1917", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "15px", color: "#38bdf8", fontWeight: "bold" }}>📱 Phone OCR Product Scanner</h3>
          <div style={{ fontSize: "11px", color: connected ? "#2ecc71" : "#f1c40f", marginTop: "2px" }}>
            {connected ? `Connected to PC Session (${sessionId?.substring(0, 8)}...)` : "Connecting to PC session..."}
          </div>
        </div>
        <button
          onClick={() => navigate("/")}
          style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}
        >
          Exit
        </button>
      </div>

      {/* Main Scanner Viewport */}
      <div style={{ flex: 1, position: "relative", background: "#000", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {/* Viewfinder Bounding Box Guide Overlay */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            width: "75%",
            height: "140px",
            border: "2px dashed #f59e0b",
            borderRadius: "12px",
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(245, 158, 11, 0.05)",
            position: "relative"
          }}>
            {/* Corner Bracket Decorations */}
            <div style={{ position: "absolute", top: -2, left: -2, width: 20, height: 20, borderTop: "4px solid #f59e0b", borderLeft: "4px solid #f59e0b" }} />
            <div style={{ position: "absolute", top: -2, right: -2, width: 20, height: 20, borderTop: "4px solid #f59e0b", borderRight: "4px solid #f59e0b" }} />
            <div style={{ position: "absolute", bottom: -2, left: -2, width: 20, height: 20, borderBottom: "4px solid #f59e0b", borderLeft: "4px solid #f59e0b" }} />
            <div style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderBottom: "4px solid #f59e0b", borderRight: "4px solid #f59e0b" }} />

            <div style={{ color: "#f59e0b", fontSize: "11px", fontWeight: "bold", letterSpacing: "1px", background: "rgba(0,0,0,0.7)", padding: "4px 10px", borderRadius: "20px" }}>
              ALIGN STICKER CODE HERE
            </div>
            <div style={{ color: "#aaa", fontSize: "10px", marginTop: "4px" }}>e.g. BTH-123 or PVC-001</div>
          </div>
        </div>

        {/* Scanner Action Buttons Overlay */}
        <div style={{ position: "absolute", top: "15px", right: "15px", display: "flex", gap: "10px" }}>
          {hasTorch && (
            <button
              onClick={toggleTorch}
              style={{
                background: torchOn ? "#f59e0b" : "rgba(0,0,0,0.6)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "50%",
                width: "44px",
                height: "44px",
                fontSize: "18px",
                cursor: "pointer"
              }}
            >
              ⚡
            </button>
          )}
        </div>

        {/* Snap Manual Scan Button */}
        <div style={{ position: "absolute", bottom: "20px", display: "flex", gap: "12px", zIndex: 10 }}>
          <button
            onClick={() => captureAndScanFrame()}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              padding: "12px 24px",
              borderRadius: "30px",
              fontSize: "14px",
              fontWeight: "bold",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.4)",
              cursor: "pointer"
            }}
          >
            📸 SNAP & SCAN CODE
          </button>
        </div>
      </div>

      {/* Footer Status & Result Card */}
      <div style={{ background: "#1c1917", padding: "15px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        {sessionError ? (
          <div style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", padding: "10px", fontSize: "12px", textAlign: "center" }}>
            ⚠️ {sessionError}
          </div>
        ) : lastProductResult ? (
          <div style={{
            background: lastProductResult.success ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1.5px solid ${lastProductResult.success ? "#22c55e" : "#ef4444"}`,
            borderRadius: "10px",
            padding: "12px",
            textAlign: "center"
          }}>
            {lastProductResult.success ? (
              <>
                <div style={{ fontSize: "16px", fontWeight: "900", color: "#22c55e" }}>✓ SENT TO PC CART</div>
                <div style={{ fontSize: "14px", fontWeight: "bold", color: "#fff", marginTop: "2px" }}>{lastProductResult.product.name}</div>
                <div style={{ fontSize: "12px", color: "#aaa" }}>Code: {lastProductResult.code} | Price: ₹{lastProductResult.product.sellingPrice} | Stock: {lastProductResult.product.stock}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: "14px", fontWeight: "bold", color: "#ef4444" }}>❌ PRODUCT NOT FOUND</div>
                <div style={{ fontSize: "12px", color: "#aaa", marginTop: "2px" }}>Code: "{lastProductResult.code}" does not exist in inventory.</div>
              </>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "12px", color: "#aaa", fontWeight: "bold" }}>🔍 OCR STATUS</div>
            <div style={{ fontSize: "13px", color: "#38bdf8", fontWeight: "bold", marginTop: "2px" }}>{ocrStatus}</div>
          </div>
        )}
      </div>

      {/* Ambiguity Confirmation Modal */}
      {ambiguousCode && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", zIndex: 9999 }}>
          <div style={{ background: "#1c1917", borderRadius: "12px", border: "1.5px solid #f59e0b", padding: "20px", maxWidth: "340px", width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>❓</div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", color: "#f59e0b" }}>Ambiguous OCR Detected</h3>
            <p style={{ fontSize: "13px", color: "#bbb", margin: "0 0 15px 0" }}>
              OCR detected code: <strong style={{ color: "#fff", fontSize: "16px" }}>"{ambiguousCode.raw}"</strong> ({ambiguousCode.confidence}% match).
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setAmbiguousCode(null)}
                style={{ flex: 1, padding: "10px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "6px", color: "#fff", fontWeight: "bold" }}
              >
                🔄 Re-scan
              </button>
              <button
                onClick={() => {
                  const code = ambiguousCode.raw;
                  setAmbiguousCode(null);
                  handleSuccessfulScan(code);
                }}
                style={{ flex: 1, padding: "10px", background: "#f59e0b", border: "none", borderRadius: "6px", color: "#000", fontWeight: "bold" }}
              >
                ✓ Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
