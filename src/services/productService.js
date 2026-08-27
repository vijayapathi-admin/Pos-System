import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  startAfter,
  doc,
  getDoc
} from "firebase/firestore";
import { db } from "../firebase";

// In-memory cache for fast product lookup by productCode / ID
const productCacheByCode = new Map();
const productCacheById = new Map();

/**
 * Direct lookup for a single product by human-readable productCode or barcode.
 * Downloads ONLY 1 document from Firestore instead of the full database.
 */
export async function getProductByCode(rawCode) {
  if (!rawCode || typeof rawCode !== "string") return null;

  const cleanCode = rawCode.trim().toUpperCase();

  // Check in-memory cache first
  if (productCacheByCode.has(cleanCode)) {
    return productCacheByCode.get(cleanCode);
  }

  try {
    // 1. Try querying by productCode
    const qCode = query(
      collection(db, "products"),
      where("productCode", "==", cleanCode),
      limit(1)
    );
    const snapCode = await getDocs(qCode);

    if (!snapCode.empty) {
      const docSnap = snapCode.docs[0];
      const product = { id: docSnap.id, ...docSnap.data() };
      productCacheByCode.set(cleanCode, product);
      productCacheById.set(product.id, product);
      return product;
    }

    // 2. Try querying by barcode if not found by productCode
    const qBarcode = query(
      collection(db, "products"),
      where("barcode", "==", cleanCode),
      limit(1)
    );
    const snapBarcode = await getDocs(qBarcode);

    if (!snapBarcode.empty) {
      const docSnap = snapBarcode.docs[0];
      const product = { id: docSnap.id, ...docSnap.data() };
      productCacheByCode.set(cleanCode, product);
      productCacheById.set(product.id, product);
      return product;
    }

    // 3. Direct document ID fetch if code matches Firestore doc ID format
    try {
      const docRef = doc(db, "products", rawCode.trim());
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const product = { id: docSnap.id, ...docSnap.data() };
        productCacheById.set(product.id, product);
        if (product.productCode) productCacheByCode.set(String(product.productCode).toUpperCase(), product);
        return product;
      }
    } catch (_) {
      // Ignore if rawCode is not a valid doc path
    }

    return null;
  } catch (error) {
    console.error("Error fetching product by code:", error);
    throw error;
  }
}

/**
 * Paginated product fetch for scalable UI display.
 */
export async function fetchProductsPaginated({
  pageSize = 50,
  lastDoc = null,
  category = "ALL",
  search = "",
  brand = ""
} = {}) {
  try {
    let constraints = [];

    // Filter by Category
    if (category && category.toUpperCase() !== "ALL") {
      const selCat = category.toUpperCase();
      if (["PLUMBING", "CPVC", "PVC", "UPVC"].includes(selCat)) {
        constraints.push(where("category", "in", ["PLUMBING", "CPVC", "PVC", "UPVC", "Plumbing", "Cpvc", "Pvc", "Upvc"]));
      } else {
        constraints.push(where("category", "==", category));
      }
    }

    // Filter by Brand if provided
    if (brand && brand.trim() !== "") {
      constraints.push(where("brand", "==", brand.trim()));
    }

    // Sorting and pagination
    constraints.push(orderBy("name", "asc"));
    if (lastDoc) {
      constraints.push(startAfter(lastDoc));
    }
    constraints.push(limit(pageSize));

    const q = query(collection(db, "products"), ...constraints);
    const snap = await getDocs(q);

    const products = [];
    snap.docs.forEach((docSnap) => {
      const p = { id: docSnap.id, ...docSnap.data() };
      products.push(p);
      // Cache item
      if (p.productCode) productCacheByCode.set(String(p.productCode).toUpperCase(), p);
      productCacheById.set(p.id, p);
    });

    return {
      products,
      lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
      hasMore: snap.docs.length === pageSize
    };
  } catch (error) {
    console.error("Error in fetchProductsPaginated:", error);
    // Fallback: simple query if index is building or composite fails
    const simpleQ = query(collection(db, "products"), limit(pageSize));
    const snap = await getDocs(simpleQ);
    const products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return {
      products,
      lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
      hasMore: snap.docs.length === pageSize
    };
  }
}

/**
 * Clear or invalidate in-memory cache
 */
export function invalidateProductCache(productId = null) {
  if (productId) {
    const p = productCacheById.get(productId);
    if (p && p.productCode) productCacheByCode.delete(String(p.productCode).toUpperCase());
    productCacheById.delete(productId);
  } else {
    productCacheByCode.clear();
    productCacheById.clear();
  }
}
