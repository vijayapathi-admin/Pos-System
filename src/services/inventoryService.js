import {
  doc,
  collection,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  increment
} from "firebase/firestore";
import { db } from "../firebase";
import { invalidateProductCache } from "./productService";

/**
 * Adjust stock atomically with stock movement history and audit log.
 * Movement types: PURCHASE, SALE, RETURN, ADJUSTMENT, DAMAGE, CANCELLATION
 */
export async function adjustStockTransaction({
  productId,
  qtyDelta,
  type = "ADJUSTMENT",
  reason = "",
  userEmail = "admin@shopops.com"
}) {
  if (!productId) throw new Error("Product ID is required for stock adjustment.");

  const pRef = doc(db, "products", productId);

  await runTransaction(db, async (transaction) => {
    const pSnap = await transaction.get(pRef);
    if (!pSnap.exists()) throw new Error("Product document not found.");

    const product = pSnap.data();
    const currentStock = parseFloat(product.stock) || 0;
    const delta = parseFloat(qtyDelta) || 0;
    const newStock = currentStock + delta;

    if (newStock < 0) {
      throw new Error(`Stock adjustment cannot result in negative stock. Current: ${currentStock}, Delta: ${delta}`);
    }

    // 1. Update product stock
    transaction.update(pRef, {
      stock: increment(delta),
      updatedAt: serverTimestamp()
    });

    // 2. Record stock movement
    const movementRef = doc(collection(db, "stockMovements"));
    transaction.set(movementRef, {
      productId: productId,
      productCode: product.productCode || "",
      productName: product.name || "",
      type: type.toUpperCase(),
      qty: delta,
      previousStock: currentStock,
      newStock: newStock,
      reason: reason || type,
      createdBy: userEmail,
      timestamp: serverTimestamp()
    });

    // 3. Audit Log
    const auditRef = doc(collection(db, "auditLogs"));
    transaction.set(auditRef, {
      action: "STOCK_ADJUSTED",
      details: `${type}: ${product.name} (${product.productCode || productId}). Prev Stock: ${currentStock}, Change: ${delta > 0 ? "+" + delta : delta}, New Stock: ${newStock}. Reason: ${reason || "Manual adjustment"}`,
      user: userEmail,
      timestamp: serverTimestamp()
    });
  });

  invalidateProductCache(productId);
  return true;
}

/**
 * Fetch stock movement history for a product
 */
export async function fetchStockMovements(productId = null, limitCount = 50) {
  try {
    let constraints = [];
    if (productId) {
      constraints.push(where("productId", "==", productId));
    }
    constraints.push(orderBy("timestamp", "desc"));
    constraints.push(limit(limitCount));

    const q = query(collection(db, "stockMovements"), ...constraints);
    const snap = await getDocs(q);

    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      dateStr: d.data().timestamp ? new Date(d.data().timestamp.seconds * 1000).toLocaleString("en-IN") : "Just now"
    }));
  } catch (error) {
    console.error("Error fetching stock movements:", error);
    return [];
  }
}
