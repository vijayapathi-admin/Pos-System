import {
  doc,
  collection,
  runTransaction,
  serverTimestamp,
  increment
} from "firebase/firestore";
import { db } from "../firebase";
import { invalidateProductCache } from "./productService";

/**
 * Executes a fully atomic sale transaction across Firestore.
 * Performs steps:
 * 1. Validate user and items
 * 2. Read product documents in transaction & validate stock availability
 * 3. Calculate and validate totals
 * 4. Write invoice/sale document
 * 5. Write stock movements (SALE)
 * 6. Update inventory (stock & totalSold)
 * 7. Update daily report aggregates
 * 8. Create audit log
 */
export async function executeAtomicSaleTransaction({
  cartItems,
  paymentMethod = "CASH",
  customerName = "",
  customerPhone = "",
  discount = 0,
  commissionPct = 0,
  commissionAmt = 0,
  isGstBill = false,
  gstDetails = {},
  userEmail = "cashier@shopops.com"
}) {
  if (!cartItems || cartItems.length === 0) {
    throw new Error("Cart is empty. Cannot process sale.");
  }

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const rawSubtotal = cartItems.reduce((sum, item) => sum + (parseFloat(item.sellingPrice) || 0) * (parseFloat(item.qty) || 0), 0);
  const itemRatio = (item) => ((parseFloat(item.sellingPrice) || 0) * (parseFloat(item.qty) || 0)) / (rawSubtotal || 1);

  const totalGst = gstDetails.totalGst || (isGstBill ? cartItems.reduce((sum, item) => {
    const taxable = ((parseFloat(item.sellingPrice) || 0) * (parseFloat(item.qty) || 0)) - ((discount || 0) * itemRatio(item));
    return sum + (taxable * (parseFloat(item.gstRate) || 0) / 100);
  }, 0) : 0);

  const total = rawSubtotal - (discount || 0) + totalGst;
  const profit = cartItems.reduce((sum, item) => sum + ((parseFloat(item.sellingPrice) || 0) - (parseFloat(item.purchasePrice) || 0)) * (parseFloat(item.qty) || 0), 0) - (discount || 0) - (commissionAmt || 0);

  const newSaleRef = doc(collection(db, "sales"));
  const saleId = newSaleRef.id;

  const saleDocData = {
    items: cartItems.map(i => ({
      productId: i.id || "",
      productCode: i.productCode || "",
      name: i.name || "Unknown",
      qty: parseFloat(i.qty) || 0,
      sellingPrice: parseFloat(i.sellingPrice) || 0,
      purchasePrice: parseFloat(i.purchasePrice) || 0,
      hsnCode: i.hsnCode || "",
      gstRate: parseFloat(i.gstRate) || 0
    })),
    total,
    profit,
    discount: discount || 0,
    isGstBill,
    totalGst,
    cgst: gstDetails.isInterState ? 0 : totalGst / 2,
    sgst: gstDetails.isInterState ? 0 : totalGst / 2,
    igst: gstDetails.isInterState ? totalGst : 0,
    subtotal: rawSubtotal,
    taxSummary: gstDetails.taxSummary || {},
    paymentMethod,
    customerName: customerName || "",
    customerPhone: customerPhone || "",
    customerGstin: gstDetails.customerGstin || "",
    customerAddress: gstDetails.customerAddress || "",
    placeOfSupply: gstDetails.placeOfSupply || "TAMIL NADU",
    referrerId: gstDetails.referrerId || "",
    referrerName: gstDetails.referrerName || "",
    referrerPhone: gstDetails.referrerPhone || "",
    referrerDesignation: gstDetails.referrerDesignation || "",
    isCommissionPaid: gstDetails.isCommissionPaid || false,
    siteName: gstDetails.siteName || "",
    commissionPercent: commissionPct || 0,
    commissionAmount: commissionAmt || 0,
    date: dateStr,
    time: timeStr,
    status: "ACTIVE",
    createdBy: userEmail,
    createdAt: serverTimestamp()
  };

  await runTransaction(db, async (transaction) => {
    // 1. Transaction Reads: Fetch all product docs & validate stock
    const productSnapshots = [];
    for (const item of cartItems) {
      if (item.id && !String(item.id).startsWith("custom_")) {
        const pRef = doc(db, "products", item.id);
        const pSnap = await transaction.get(pRef);
        productSnapshots.push({ item, pRef, pSnap });
      }
    }

    // Validate stock levels
    for (const { item, pSnap } of productSnapshots) {
      if (pSnap.exists()) {
        const currentStock = parseFloat(pSnap.data().stock) || 0;
        const requestedQty = parseFloat(item.qty) || 0;
        if (currentStock < requestedQty) {
          throw new Error(`Insufficient stock for "${item.name}". Required: ${requestedQty}, Available: ${currentStock}`);
        }
      }
    }

    // 2. Transaction Writes: Save sale document
    transaction.set(newSaleRef, saleDocData);

    // 3. Transaction Writes: Update product stock and write stockMovements
    for (const { item, pRef, pSnap } of productSnapshots) {
      const currentStock = pSnap.exists() ? (parseFloat(pSnap.data().stock) || 0) : 0;
      const qtyDelta = parseFloat(item.qty) || 0;
      const newStock = currentStock - qtyDelta;

      if (pSnap.exists()) {
        transaction.update(pRef, {
          stock: increment(-qtyDelta),
          totalSold: increment(qtyDelta),
          updatedAt: serverTimestamp()
        });
      }

      // Stock Movement Record
      const movementRef = doc(collection(db, "stockMovements"));
      transaction.set(movementRef, {
        productId: item.id || "",
        productCode: item.productCode || "",
        productName: item.name || "",
        type: "SALE",
        qty: -qtyDelta,
        previousStock: currentStock,
        newStock: newStock,
        referenceId: saleId,
        createdBy: userEmail,
        timestamp: serverTimestamp()
      });
    }

    // 4. Transaction Writes: Daily Report Aggregation
    const dailyReportRef = doc(db, "dailyReports", dateStr);
    const reportSnap = await transaction.get(dailyReportRef);

    const isCash = paymentMethod === "CASH";
    const isUpi = paymentMethod === "UPI";

    if (!reportSnap.exists()) {
      transaction.set(dailyReportRef, {
        date: dateStr,
        totalSales: total,
        cashSales: isCash ? total : 0,
        upiSales: isUpi ? total : 0,
        totalProfit: profit,
        transactionCount: 1,
        updatedAt: serverTimestamp()
      });
    } else {
      transaction.update(dailyReportRef, {
        totalSales: increment(total),
        cashSales: isCash ? increment(total) : increment(0),
        upiSales: isUpi ? increment(total) : increment(0),
        totalProfit: increment(profit),
        transactionCount: increment(1),
        updatedAt: serverTimestamp()
      });
    }

    // 5. Transaction Writes: Audit Log
    const auditLogRef = doc(collection(db, "auditLogs"));
    transaction.set(auditLogRef, {
      action: "INVOICE_CREATED",
      details: `Created Invoice ${saleId} for customer ${customerName || "Walk-in"} amounting to ₹${total.toFixed(2)}`,
      user: userEmail,
      timestamp: serverTimestamp()
    });
  });

  // Invalidate in-memory product cache for affected products
  cartItems.forEach(i => invalidateProductCache(i.id));

  return { id: saleId, ...saleDocData, createdAt: now.toISOString() };
}

/**
 * Cancels a sale and atomically restores product stock.
 */
export async function cancelSaleTransaction(saleId, reason = "Customer Cancellation", userEmail = "admin@shopops.com") {
  const saleRef = doc(db, "sales", saleId);

  await runTransaction(db, async (transaction) => {
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) throw new Error("Sale invoice not found.");

    const sale = saleSnap.data();
    if (sale.status === "CANCELLED") throw new Error("Sale is already cancelled.");

    // Update sale status
    transaction.update(saleRef, {
      status: "CANCELLED",
      cancelReason: reason,
      cancelledBy: userEmail,
      cancelledAt: serverTimestamp()
    });

    // Revert stock & record stock movements
    for (const item of (sale.items || [])) {
      if (item.productId && !String(item.productId).startsWith("custom_")) {
        const pRef = doc(db, "products", item.productId);
        const pSnap = await transaction.get(pRef);
        const currentStock = pSnap.exists() ? (parseFloat(pSnap.data().stock) || 0) : 0;
        const qtyToRestore = parseFloat(item.qty) || 0;

        if (pSnap.exists()) {
          transaction.update(pRef, {
            stock: increment(qtyToRestore),
            totalSold: increment(-qtyToRestore),
            updatedAt: serverTimestamp()
          });
        }

        const movementRef = doc(collection(db, "stockMovements"));
        transaction.set(movementRef, {
          productId: item.productId,
          productCode: item.productCode || "",
          productName: item.name || "",
          type: "CANCELLATION",
          qty: qtyToRestore,
          previousStock: currentStock,
          newStock: currentStock + qtyToRestore,
          referenceId: saleId,
          reason,
          createdBy: userEmail,
          timestamp: serverTimestamp()
        });
      }
    }

    // Write audit log
    const auditLogRef = doc(collection(db, "auditLogs"));
    transaction.set(auditLogRef, {
      action: "INVOICE_CANCELLED",
      details: `Cancelled Invoice ${saleId}. Reason: ${reason}`,
      user: userEmail,
      timestamp: serverTimestamp()
    });
  });

  return true;
}
