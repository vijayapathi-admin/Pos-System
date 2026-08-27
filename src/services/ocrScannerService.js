import {
  doc,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  getDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { getProductByCode } from "./productService";

/**
 * Normalizes scanned OCR text from phone camera or barcode scanner.
 * Converts to uppercase, trims whitespace, removes leading/trailing asterisks (*),
 * and cleans up common OCR character substitutions.
 */
export function normalizeOcrCode(rawInput) {
  if (!rawInput || typeof rawInput !== "string") return "";

  let cleaned = rawInput.trim();

  // Strip leading/trailing asterisks commonly present in barcode output
  if (cleaned.startsWith("*") && cleaned.endsWith("*") && cleaned.length > 1) {
    cleaned = cleaned.substring(1, cleaned.length - 1);
  } else if (cleaned.startsWith("*")) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.endsWith("*")) {
    cleaned = cleaned.substring(0, cleaned.length - 1);
  }

  // Remove line breaks & collapse spaces
  cleaned = cleaned.toUpperCase().replace(/[\r\n]+/g, " ").trim();

  // Remove unwanted punctuation except hyphens and alphanumeric characters
  cleaned = cleaned.replace(/[^A-Z0-9\-]/g, "");

  return cleaned;
}

/**
 * Validates if the scanned string matches expected product code formats.
 * Accepts formats such as: BTH-123, HRD-001, PVC-20, ELB-345, or alphanumeric string 3-15 chars.
 */
export function isValidProductCodePattern(code) {
  if (!code || typeof code !== "string") return false;
  const clean = code.trim().toUpperCase();
  if (clean.length < 3 || clean.length > 20) return false;

  // Pattern match e.g. ABC-123 or ABC123 or 10023
  const productCodeRegex = /^([A-Z0-9]{2,6}[-\s]?[A-Z0-9]{1,8})$/;
  return productCodeRegex.test(clean);
}

/**
 * Creates a new pairing session in Firestore for PC Billing <-> Phone Scanner.
 */
export async function createScannerSession(userId = "admin") {
  const sessionRef = doc(collection(db, "scannerSessions"));
  const sessionId = sessionRef.id;

  const sessionData = {
    id: sessionId,
    userId,
    status: "WAITING", // WAITING -> CONNECTED -> CLOSED
    phoneInfo: null,
    lastScannedCode: null,
    createdAt: serverTimestamp(),
    expiresAt: Date.now() + (2 * 60 * 60 * 1000) // 2 hours expiration
  };

  await setDoc(sessionRef, sessionData);
  return sessionId;
}

/**
 * Subscribes to real-time changes on a scanner session document.
 */
export function subscribeToScannerSession(sessionId, onUpdate) {
  if (!sessionId) return () => {};
  const sessionRef = doc(db, "scannerSessions", sessionId);
  return onSnapshot(sessionRef, (snap) => {
    if (snap.exists()) {
      onUpdate({ id: snap.id, ...snap.data() });
    } else {
      onUpdate(null);
    }
  }, (err) => {
    console.warn("Scanner session snapshot error:", err);
  });
}

/**
 * Connects phone scanner to session.
 */
export async function connectPhoneToSession(sessionId, userAgent = "Mobile Phone") {
  if (!sessionId) return false;
  const sessionRef = doc(db, "scannerSessions", sessionId);
  const snap = await getDoc(sessionRef);

  if (!snap.exists()) {
    throw new Error("Scanner pairing session not found or has expired.");
  }

  await updateDoc(sessionRef, {
    status: "CONNECTED",
    phoneInfo: userAgent,
    connectedAt: serverTimestamp()
  });

  return true;
}

/**
 * Phone sends detected scanned product code to the PC session.
 */
export async function sendScannedCodeToSession(sessionId, rawCode) {
  if (!sessionId) throw new Error("No active session ID.");
  const normalized = normalizeOcrCode(rawCode);

  if (!normalized) {
    throw new Error("Invalid or empty code detected.");
  }

  const sessionRef = doc(db, "scannerSessions", sessionId);
  await updateDoc(sessionRef, {
    lastScannedCode: {
      code: normalized,
      timestamp: Date.now(),
      id: "scan_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6)
    }
  });

  return normalized;
}

/**
 * Closes and cleans up a scanner session.
 */
export async function closeScannerSession(sessionId) {
  if (!sessionId) return;
  try {
    const sessionRef = doc(db, "scannerSessions", sessionId);
    await updateDoc(sessionRef, {
      status: "CLOSED",
      closedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn("Close scanner session error:", err);
  }
}

/**
 * Performs a targeted single-document product lookup based on OCR scanned string.
 * Requests ONLY the matching product document without downloading the full database.
 */
export async function lookupOcrProduct(rawInput) {
  const normalizedCode = normalizeOcrCode(rawInput);

  if (!normalizedCode) {
    return {
      success: false,
      reason: "Invalid or empty code scanned.",
      code: ""
    };
  }

  try {
    const product = await getProductByCode(normalizedCode);

    if (product) {
      return {
        success: true,
        product,
        code: normalizedCode
      };
    }

    // Try common OCR substitution fallbacks if exact code not found:
    // e.g. 'O' misread as '0' or 'I' misread as '1'
    const fallbacks = [];
    if (normalizedCode.includes("O")) fallbacks.push(normalizedCode.replace(/O/g, "0"));
    if (normalizedCode.includes("0")) fallbacks.push(normalizedCode.replace(/0/g, "O"));
    if (normalizedCode.includes("I")) fallbacks.push(normalizedCode.replace(/I/g, "1"));
    if (normalizedCode.includes("1")) fallbacks.push(normalizedCode.replace(/1/g, "I"));

    for (const altCode of fallbacks) {
      const altProd = await getProductByCode(altCode);
      if (altProd) {
        return {
          success: true,
          product: altProd,
          code: altCode,
          note: `OCR auto-corrected '${normalizedCode}' -> '${altCode}'`
        };
      }
    }

    return {
      success: false,
      reason: `No product found for code "${normalizedCode}"`,
      code: normalizedCode
    };
  } catch (error) {
    console.error("OCR Product lookup error:", error);
    return {
      success: false,
      reason: error.message || "Failed to query product from server.",
      code: normalizedCode
    };
  }
}
