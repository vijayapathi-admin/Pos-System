import React, { createContext, useContext, useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  increment,
  setDoc
} from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { db, auth } from "./firebase";
import { getProductByCode, fetchProductsPaginated } from "./services/productService";
import { executeAtomicSaleTransaction, cancelSaleTransaction } from "./services/billingService";
import { adjustStockTransaction, fetchStockMovements } from "./services/inventoryService";
import { lookupOcrProduct } from "./services/ocrScannerService";


const AppContext = createContext();

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // Force credentials entry on every fresh app opening
  useEffect(() => {
    const isSessionActive = sessionStorage.getItem("app_session_active");
    if (!isSessionActive) {
      signOut(auth).finally(() => {
        sessionStorage.setItem("app_session_active", "true");
      });
    }
  }, []);

  const addNotification = (title, message, type = "info") => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, title, message, type }]);
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const sanitizeData = (obj) => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
      return obj.map(item => (typeof item === "object" ? sanitizeData(item) : item));
    }
    if (typeof obj !== "object") return obj;
    if (obj.constructor !== Object) return obj;

    const copy = { ...obj };
    Object.keys(copy).forEach(key => {
      if (copy[key] === undefined) {
        delete copy[key];
      } else if (typeof copy[key] === "object") {
        copy[key] = sanitizeData(copy[key]);
      }
    });
    return copy;
  };

  const getStockThreshold = (p) => {
    if (p.lowStockThreshold && p.lowStockThreshold !== "") return parseInt(p.lowStockThreshold);
    if (["PLUMBING", "CPVC", "PVC", "UPVC"].includes(p.category?.toUpperCase())) return 20;
    return 40;
  };

  const checkLowStock = (updatedProducts) => {
    updatedProducts.forEach(p => {
      const threshold = getStockThreshold(p);
      if (p.stock < threshold && p.stock >= 0) {
        addNotification("Low Stock Warning", `${p.name} is low on stock (${p.stock} remaining).`, "warning");
      }
    });
  };
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [daySessions, setDaySessions] = useState([]);
  const [estimations, setEstimations] = useState([]); // New state for estimations
  const [purchases, setPurchases] = useState([]); // New state for purchases
  const [dailyReports, setDailyReports] = useState([]); // New state for daily reports
  const [backupsList, setBackupsList] = useState([]);
  const [editingSale, setEditingSale] = useState(null); // New state for sale being edited
  const [contacts, setContacts] = useState([]); // New state for contacts
  const [purchaseOrders, setPurchaseOrders] = useState([]); // New state for purchase orders
  const [shortages, setShortages] = useState([]); // New state for customer shortages
  const [weekendList, setWeekendList] = useState([]); // New state for weekend shopping list manual entries
  const [arimaPredictions, setArimaPredictions] = useState(null);
  const [loadingPredictions, setLoadingPredictions] = useState(false);
  const [offlineSales, setOfflineSales] = useState(() => {
    const saved = localStorage.getItem("offlineSales");
    return saved ? JSON.parse(saved) : [];
  });

  const fetchAiPredictions = async () => {
    setLoadingPredictions(true);
    try {
      const response = await fetch("http://localhost:5000/predict");
      if (!response.ok) throw new Error("Server returned error status");
      const result = await response.json();
      if (result.message === "Success" && result.data) {
        setArimaPredictions(result.data);
        addNotification("AI Predictions Synced", "ARIMA time-series forecasting data loaded successfully.", "success");
        return result.data;
      } else {
        throw new Error("Invalid format from AI backend");
      }
    } catch (err) {
      console.warn("AI backend offline or error:", err);
      setArimaPredictions(null);
      addNotification("AI Standalone Mode", "Could not reach ARIMA server. Standalone estimation rules applied.", "warning");
      return null;
    } finally {
      setLoadingPredictions(false);
    }
  };

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const role = firebaseUser.email?.includes("staff") ? "staff" : "admin";
        setUserRole(role);
      } else {
        setUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Initial data fetch and sync
  useEffect(() => {
    if (user) {
      const init = async () => {
        try {
          // 1. Fetch Products first to check low stock
          const data = await fetchProducts();
          
          // 2. Check for existing low stock on login
          if (data && data.length > 0) {
            const low = data.filter(p => {
              const threshold = getStockThreshold(p);
              return p.stock < threshold && p.stock > 0;
            });
            if (low.length > 0) {
              addNotification("Inventory Summary", `You have ${low.length} items with low stock.`, "info");
            }
          }

          // 3. Fetch all other data concurrently
          await Promise.all([
            fetchSales(),
            fetchExpenses(),
            fetchSuppliers(),
            fetchEstimations(),
            fetchDaySessions(),
            fetchDailyReports(),
            fetchBackups(),
            fetchContacts(),
            fetchPurchases(),
            fetchPurchaseOrders(),
            fetchShortages(),
            fetchWeekendList()
          ]);

          // 4. Attempt sync on load if online
          if (navigator.onLine && offlineSales.length > 0) {
            syncOfflineSales();
          }
        } catch (err) {
          console.error("Initialization error:", err);
        }
      };
      init();
    }
  }, [user]);

  // Fetch all data
  const fetchPurchases = async () => {
    try {
      const snap = await getDocs(collection(db, "purchases"));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sortedData = data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setPurchases(sortedData);
      return sortedData;
    } catch (e) {
      console.error("fetchPurchases error:", e);
      return [];
    }
  };

  const addPurchaseBill = async (purchaseData) => {
    try {
      await addDoc(collection(db, "purchases"), {
        ...purchaseData,
        createdAt: serverTimestamp()
      });

      const promises = purchaseData.items.map(item => {
        return updateDoc(doc(db, "products", item.productId), {
          stock: increment(item.qty),
          purchasePrice: parseFloat(item.purchasePrice)
        });
      });
      await Promise.all(promises);

      // Auto-update matching customer requests / shortages to RECEIVED IN STOCK!
      try {
        const matchingShortages = shortages.filter(s => 
          s.status === "REQUESTED" || s.status === "ORDERED"
        );
        const shortagePromises = [];
        purchaseData.items.forEach(item => {
          matchingShortages.forEach(s => {
            if (s.productId === item.productId || s.itemName?.toLowerCase() === item.name?.toLowerCase()) {
              shortagePromises.push(updateDoc(doc(db, "shortages", s.id), {
                status: "RECEIVED",
                updatedAt: serverTimestamp()
              }));
            }
          });
        });
        if (shortagePromises.length > 0) {
          await Promise.all(shortagePromises);
          await fetchShortages();
        }
      } catch (err) {
        console.warn("Auto shortage update skipped:", err);
      }

      await Promise.all([fetchPurchases(), fetchProducts()]);
      addNotification("Purchase Success", `Recorded purchase bill from ${purchaseData.supplier}`, "success");
    } catch (e) {
      console.error("addPurchaseBill error:", e);
      throw e;
    }
  };

  const triggerExcelSync = async () => {
    try {
      await fetch("http://localhost:5000/sync_excel", { method: "POST" });
    } catch (e) {
      console.warn("Excel sync failed. Python backend is likely offline:", e);
    }
  };

  const fetchProducts = async () => {
    try {
      const snap = await getDocs(collection(db, "products"));
      const data = snap.docs.map(d => {
        const item = { id: d.id, ...d.data() };
        const cat = String(item.category || "").toUpperCase();
        if (["PLUMBING", "CPVC", "PVC", "UPVC"].includes(cat)) {
          item.category = "PLUMBING";
        }
        return item;
      });
      const sortedData = data.sort((a, b) => a.name?.localeCompare(b.name));
      setProducts(sortedData);
      
      // Auto-synchronize Firestore products to the local excel file
      triggerExcelSync();
      
      return sortedData;
    } catch (e) { 
      console.error("fetchProducts error:", e); 
      return [];
    }
  };

  const fetchSuppliers = async () => {
    try {
      const snap = await getDocs(collection(db, "suppliers"));
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("fetchSuppliers error:", e); }
  };

  const fetchSales = async () => {
    try {
      const snap = await getDocs(collection(db, "sales"));
      setSales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("fetchSales error:", e); }
  };

  const fetchExpenses = async () => {
    try {
      const snap = await getDocs(collection(db, "expenses"));
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("fetchExpenses error:", e); }
  };

  const fetchDaySessions = async () => {
    try {
      const snap = await getDocs(collection(db, "daySessions"));
      setDaySessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("fetchDaySessions error:", e); }
  };

  const fetchDailyReports = async () => {
    try {
      const snap = await getDocs(collection(db, "dailyReports"));
      setDailyReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("fetchDailyReports error:", e); }
  };

  const fetchEstimations = async () => {
    try {
      const snap = await getDocs(collection(db, "estimations"));
      setEstimations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("fetchEstimations error:", e); }
  };

  const fetchBackups = async () => {
    try {
      const snap = await getDocs(collection(db, "backups"));
      setBackupsList(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => b.timestamp - a.timestamp));
    } catch (e) { console.error("fetchBackups error:", e); }
  };

  const fetchContacts = async () => {
    try {
      const snap = await getDocs(collection(db, "contacts"));
      setContacts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("fetchContacts error:", e); }
  };

  const fetchPurchaseOrders = async () => {
    try {
      const snap = await getDocs(collection(db, "purchaseOrders"));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sortedData = data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setPurchaseOrders(sortedData);
      return sortedData;
    } catch (e) {
      console.error("fetchPurchaseOrders error:", e);
      return [];
    }
  };

  const fetchShortages = async () => {
    try {
      const snap = await getDocs(collection(db, "shortages"));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sortedData = data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setShortages(sortedData);
      return sortedData;
    } catch (e) {
      console.error("fetchShortages error:", e);
      return [];
    }
  };

  const fetchWeekendList = async () => {
    try {
      const snap = await getDocs(collection(db, "weekendList"));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setWeekendList(data);
      return data;
    } catch (e) {
      console.error("fetchWeekendList error:", e);
      return [];
    }
  };

  const syncOfflineSales = async () => {
    if (!navigator.onLine || offlineSales.length === 0) return;
    try {
      const remainingSales = [...offlineSales];
      const syncedIds = [];

      for (const sale of offlineSales) {
        try {
          const { isOffline, id, createdAt, ...cleanSale } = sale;
          
          // Ensure all items are properly structured
          cleanSale.items = (cleanSale.items || []).map(i => ({
            productId: i.productId || i.id || "",
            name: i.name || "Unknown Product",
            qty: parseFloat(i.qty) || 0,
            sellingPrice: parseFloat(i.sellingPrice) || 0,
            purchasePrice: parseFloat(i.purchasePrice) || 0,
            hsnCode: i.hsnCode || "",
            gstRate: parseFloat(i.gstRate) || 0
          }));

          cleanSale.createdAt = serverTimestamp();
          
          await addDoc(collection(db, "sales"), cleanSale);

          // Safe, concurrent stock reconciliation for individual items
          const stockUpdates = cleanSale.items
            .filter(item => {
              const idStr = String(item.productId);
              return idStr && idStr !== "undefined" && idStr !== "null" && idStr !== "" && !idStr.startsWith("custom_");
            })
            .map(async (item) => {
              try {
                await updateDoc(doc(db, "products", item.productId), {
                  stock: increment(-item.qty),
                  totalSold: increment(item.qty)
                });
              } catch (err) {
                console.warn(`Sync warning: stock update skipped for product ${item.productId}`, err);
              }
            });
          await Promise.all(stockUpdates);

          syncedIds.push(sale.id);
        } catch (saleErr) {
          console.error(`Failed to sync individual offline sale ${sale.id}:`, saleErr);
        }
      }

      // Sync local storage state to hold only the remaining un-synced sales
      const newOfflineSales = remainingSales.filter(s => !syncedIds.includes(s.id));
      setOfflineSales(newOfflineSales);
      if (newOfflineSales.length > 0) {
        localStorage.setItem("offlineSales", JSON.stringify(newOfflineSales));
      } else {
        localStorage.removeItem("offlineSales");
      }

      await fetchSales();
      await fetchProducts();
      console.log(`Offline sales sync cycle complete. Synced ${syncedIds.length} of ${offlineSales.length} sales.`);
    } catch (e) {
      console.error("Sync loop failed:", e);
    }
  };

  useEffect(() => {
    const handleOnline = () => syncOfflineSales();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [offlineSales]);



  // Auto Backup Check
  useEffect(() => {
    if (user && products.length > 0 && backupsList.length > 0 !== null) {
      const today = new Date().toISOString().split("T")[0];
      const hasTodayAutoBackup = backupsList.some(b => b.date === today && b.type === "AUTO");
      if (!hasTodayAutoBackup) {
        // We delay auto backup slightly to ensure data is fully loaded
        setTimeout(() => createBackup("AUTO"), 5000);
      }
    } else if (user && products.length > 0 && backupsList.length === 0) {
       setTimeout(() => createBackup("AUTO"), 5000);
    }
  }, [user, products, backupsList]);

  // System Backup
  const createBackup = async (type = "MANUAL") => {
    try {
      const backupData = {
        date: new Date().toISOString().split("T")[0],
        timestamp: Date.now(),
        type,
        data: JSON.stringify({
          products, suppliers, sales, expenses, daySessions, estimations, dailyReports
        })
      };
      await addDoc(collection(db, "backups"), backupData);
      await fetchBackups();
      if (type === "MANUAL") alert("Backup created successfully!");
    } catch (e) {
      console.error("Backup failed", e);
      if (type === "MANUAL") alert("Backup failed: " + e.message);
    }
  };

  const restoreBackup = async (backupId) => {
    const backup = backupsList.find(b => b.id === backupId);
    if (!backup) return;
    try {
      const parsed = JSON.parse(backup.data);
      // To "not disturb existing data structure" and prevent massive writes, 
      // we provide a download of the JSON file so the user can keep it or manually inspect it.
      // Modifying the entire database structure dynamically is dangerous for accounting without a dedicated cloud function.
      const blob = new Blob([backup.data], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Vijayapathi_Backup_${backup.date}_${backup.type}.json`;
      link.click();
      alert("Backup downloaded! Use a database admin tool to safely restore data if needed.");
    } catch(e) {
      alert("Restore failed: " + e.message);
    }
  };

  const restoreProductsFromBackup = async (backupId) => {
    const backup = backupsList.find(b => b.id === backupId);
    if (!backup) return;
    try {
      if (!confirm("⚠️ This will restore all products from the backup to the database. Proceed?")) return;
      const parsed = JSON.parse(backup.data);
      const backupProducts = parsed.products || [];
      if (backupProducts.length === 0) {
         alert("No products found in this backup.");
         return;
      }
      
      const chunkSize = 100;
      let count = 0;
      for (let i = 0; i < backupProducts.length; i += chunkSize) {
        const chunk = backupProducts.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (prod) => {
          const { id, ...prodData } = prod; 
          return setDoc(doc(db, "products", id), {
            ...prodData
          });
        }));
        count += chunk.length;
      }
      await fetchProducts();
      alert(`Successfully restored ${count} products from backup!`);
    } catch(e) {
      alert("Restore failed: " + e.message);
      console.error(e);
    }
  };

  // Auth
  const login = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  };
  const register = async (email, password) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };
  const logout = async () => {
    await signOut(auth);
    setProducts([]); setSuppliers([]); setSales([]); setExpenses([]); setDaySessions([]); setEstimations([]);
  };

  // Daily Sessions
  const openDay = async (date, openingCash) => {
    await addDoc(collection(db, "daySessions"), {
      date,
      openingCash: parseFloat(openingCash),
      closingCash: null,
      status: "open",
      openedAt: serverTimestamp(),
      closedAt: null
    });
    await fetchDaySessions();
  };

  const closeDay = async (sessionId, closingCash, reportData = null) => {
    await updateDoc(doc(db, "daySessions", sessionId), {
      closingCash: parseFloat(closingCash),
      status: "closed",
      closedAt: serverTimestamp()
    });

    if (reportData) {
      await addDoc(collection(db, "dailyReports"), {
        ...reportData,
        sessionId,
        createdAt: serverTimestamp()
      });
      await fetchDailyReports();
    }

    await fetchDaySessions();
  };

  const updateClosingCash = async (sessionId, closingCash) => {
    await updateDoc(doc(db, "daySessions", sessionId), {
      closingCash: parseFloat(closingCash)
    });
    await fetchDaySessions();
  };

  const reopenDay = async (sessionId) => {
    await updateDoc(doc(db, "daySessions", sessionId), {
      status: "open",
      closingCash: null,
      closedAt: null
    });
    await fetchDaySessions();
  };

  const getTodaySession = () => {
    const today = new Date().toISOString().split("T")[0];
    return daySessions.find(s => s.date === today) || null;
  };

  // Audit Logs
  const addAuditLog = async (action, details) => {
    await addDoc(collection(db, "auditLogs"), {
      action,
      details,
      timestamp: serverTimestamp(),
      user: user?.email || "Unknown"
    });
  };

  // Purchase Orders CRUD
  const addPurchaseOrder = async (poData) => {
    try {
      const docRef = await addDoc(collection(db, "purchaseOrders"), {
        ...poData,
        createdAt: serverTimestamp()
      });
      await fetchPurchaseOrders();
      addNotification("PO Saved", `Purchase Order ${poData.poNumber} created successfully`, "success");
      return docRef.id;
    } catch (e) {
      console.error("addPurchaseOrder error:", e);
      throw e;
    }
  };

  const updatePurchaseOrder = async (id, data) => {
    try {
      await updateDoc(doc(db, "purchaseOrders", id), {
        ...data,
        updatedAt: serverTimestamp()
      });
      await fetchPurchaseOrders();
      addNotification("PO Updated", `Purchase Order updated successfully`, "success");
    } catch (e) {
      console.error("updatePurchaseOrder error:", e);
      throw e;
    }
  };

  const deletePurchaseOrder = async (id) => {
    try {
      await deleteDoc(doc(db, "purchaseOrders", id));
      await fetchPurchaseOrders();
      addNotification("PO Deleted", `Purchase Order deleted`, "info");
    } catch (e) {
      console.error("deletePurchaseOrder error:", e);
      throw e;
    }
  };

  // Shortages CRUD
  const addShortage = async (data) => {
    try {
      const docRef = await addDoc(collection(db, "shortages"), {
        ...data,
        createdAt: serverTimestamp()
      });
      await fetchShortages();
      addNotification("Request Logged", `Customer request noted for ${data.itemName}`, "success");
      return docRef.id;
    } catch (e) {
      console.error("addShortage error:", e);
      throw e;
    }
  };

  const updateShortage = async (id, data) => {
    try {
      await updateDoc(doc(db, "shortages", id), {
        ...data,
        updatedAt: serverTimestamp()
      });
      await fetchShortages();
    } catch (e) {
      console.error("updateShortage error:", e);
      throw e;
    }
  };

  const deleteShortage = async (id) => {
    try {
      await deleteDoc(doc(db, "shortages", id));
      await fetchShortages();
    } catch (e) {
      console.error("deleteShortage error:", e);
      throw e;
    }
  };

  // Weekend List CRUD
  const addWeekendItem = async (data) => {
    try {
      const docRef = await addDoc(collection(db, "weekendList"), {
        ...data,
        createdAt: serverTimestamp()
      });
      await fetchWeekendList();
      return docRef.id;
    } catch (e) {
      console.error("addWeekendItem error:", e);
      throw e;
    }
  };

  const updateWeekendItem = async (id, data) => {
    try {
      await updateDoc(doc(db, "weekendList", id), data);
      await fetchWeekendList();
    } catch (e) {
      console.error("updateWeekendItem error:", e);
      throw e;
    }
  };

  const deleteWeekendItem = async (id) => {
    try {
      await deleteDoc(doc(db, "weekendList", id));
      await fetchWeekendList();
    } catch (e) {
      console.error("deleteWeekendItem error:", e);
      throw e;
    }
  };

  // Contacts CRUD
  const addContact = async (contactData) => {
    await addDoc(collection(db, "contacts"), {
      ...contactData,
      createdAt: serverTimestamp()
    });
    await fetchContacts();
  };

  const updateContact = async (id, data) => {
    await updateDoc(doc(db, "contacts", id), data);
    await fetchContacts();
  };

  const deleteContact = async (id) => {
    await deleteDoc(doc(db, "contacts", id));
    await fetchContacts();
  };

  // Products CRUD
  const addProduct = async (productData) => {
    const docRef = await addDoc(collection(db, "products"), {
      ...productData,
      totalSold: 0,
      createdAt: serverTimestamp()
    });
    await fetchProducts();
    return docRef.id;
  };
  const updateProduct = async (id, data) => {
    await updateDoc(doc(db, "products", id), data);
    await fetchProducts();
  };
  const deleteProduct = async (id) => {
    await deleteDoc(doc(db, "products", id));
    await fetchProducts();
  };

  const batchUpdateProducts = async (updates) => {
    try {
      const promises = updates.map(update => updateDoc(doc(db, "products", update.id), update.data));
      await Promise.all(promises);
      await fetchProducts();
    } catch(e) {
      console.error("batchUpdateProducts error:", e);
      throw e;
    }
  };
  
  const deleteAllProducts = async () => {
    try {
      const snap = await getDocs(collection(db, "products"));
      const docsToDelete = snap.docs;
      const chunkSize = 50;
      for (let i = 0; i < docsToDelete.length; i += chunkSize) {
        const chunk = docsToDelete.slice(i, i + chunkSize);
        await Promise.all(chunk.map(d => deleteDoc(doc(db, "products", d.id))));
      }
      await fetchProducts();
    } catch (e) {
      console.error("deleteAllProducts error:", e);
      throw e;
    }
  };

  const importProductsBatch = async (productsDataArray) => {
    try {
      const chunkSize = 50;
      for (let i = 0; i < productsDataArray.length; i += chunkSize) {
        const chunk = productsDataArray.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (prod) => {
          return addDoc(collection(db, "products"), {
            ...prod,
            totalSold: 0,
            createdAt: serverTimestamp()
          });
        }));
      }
      await fetchProducts();
    } catch(err) {
      console.error(err);
      throw err;
    }
  };

  // Sales (Atomic Transaction backed)
  const completeSale = async (cartItems, paymentMethod, customerName, customerPhone, discount, commissionPct, commissionAmt, isGstBill = false, gstDetails = {}) => {
    if (!navigator.onLine) {
      // Offline fallback mode
      const rawSubtotal = cartItems.reduce((sum, item) => sum + item.sellingPrice * item.qty, 0);
      const itemRatio = (item) => (item.sellingPrice * item.qty) / (rawSubtotal || 1);
      const totalGst = gstDetails.totalGst || (isGstBill ? cartItems.reduce((sum, item) => {
        const taxable = (item.sellingPrice * item.qty) - ((discount || 0) * itemRatio(item));
        return sum + (taxable * (parseFloat(item.gstRate) || 0) / 100);
      }, 0) : 0);
      const total = rawSubtotal - (discount || 0) + totalGst;
      const profit = cartItems.reduce((sum, item) => sum + (item.sellingPrice - item.purchasePrice) * item.qty, 0) - (discount || 0) - (commissionAmt || 0);
      const now = new Date();

      const offlineDoc = { 
        items: cartItems.map(i => ({ productId: i.id, name: i.name, qty: i.qty, sellingPrice: i.sellingPrice, purchasePrice: i.purchasePrice, hsnCode: i.hsnCode || "", gstRate: parseFloat(i.gstRate) || 0 })),
        total, profit, discount: discount || 0, isGstBill, totalGst, subtotal: rawSubtotal, paymentMethod, customerName: customerName || "", customerPhone: customerPhone || "", date: now.toISOString().split("T")[0], time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        id: "offline_" + Date.now(), 
        isOffline: true, 
        createdAt: new Date().toISOString() 
      };
      
      const newOfflineSales = [...offlineSales, offlineDoc];
      setOfflineSales(newOfflineSales);
      localStorage.setItem("offlineSales", JSON.stringify(newOfflineSales));

      setSales(prev => [...prev, offlineDoc]);
      setProducts(prev => prev.map(p => {
        const cartItem = cartItems.find(i => i.id === p.id);
        if (cartItem) return { ...p, stock: p.stock - cartItem.qty, totalSold: (p.totalSold || 0) + cartItem.qty };
        return p;
      }));
      return offlineDoc;
    }

    try {
      // Execute Atomic Transaction on Firebase
      const savedSaleDoc = await executeAtomicSaleTransaction({
        cartItems,
        paymentMethod,
        customerName,
        customerPhone,
        discount,
        commissionPct,
        commissionAmt,
        isGstBill,
        gstDetails,
        userEmail: user?.email || "cashier@shopops.com"
      });

      // Update local React state to reflect immediately
      setSales(prev => [savedSaleDoc, ...prev]);
      setProducts(prev => prev.map(p => {
        const cartItem = cartItems.find(i => i.id === p.id);
        if (cartItem) return { ...p, stock: p.stock - cartItem.qty, totalSold: (p.totalSold || 0) + cartItem.qty };
        return p;
      }));

      // Async background refresh of sales & products state
      Promise.all([fetchProducts(), fetchSales()]).catch(err => console.warn("Background refresh warning:", err));

      return savedSaleDoc;
    } catch (e) {
      console.error("Atomic transaction failed:", e);
      throw e;
    }
  };


  const settleCreditSale = async (sale, amountPaid, paymentMethod = "CASH") => {
    const currentPaid = sale.creditPaidAmount || 0;
    const newPaid = currentPaid + amountPaid;
    const isFullyPaid = newPaid >= (sale.total || 0);

    const newPayment = {
      date: new Date().toISOString().split("T")[0],
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      amount: parseFloat(amountPaid),
      method: paymentMethod
    };

    const currentPayments = sale.creditPayments || [];
    const updatedPayments = [...currentPayments, newPayment];

    await updateDoc(doc(db, "sales", sale.id), {
      creditPaidAmount: newPaid,
      isCreditPaid: isFullyPaid,
      creditPaidDate: new Date().toISOString(),
      creditPayments: updatedPayments
    });
    await fetchSales();
  };

  const settleSupplierCreditBill = async (purchase, amountPaid, paymentMethod = "CASH") => {
    const currentPaid = purchase.creditPaidAmount || 0;
    const newPaid = currentPaid + amountPaid;
    const isFullyPaid = newPaid >= (purchase.total || 0);

    const newPayment = {
      date: new Date().toISOString().split("T")[0],
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      amount: parseFloat(amountPaid),
      method: paymentMethod
    };

    const currentPayments = purchase.creditPayments || [];
    const updatedPayments = [...currentPayments, newPayment];

    await updateDoc(doc(db, "purchases", purchase.id), {
      creditPaidAmount: newPaid,
      isCreditPaid: isFullyPaid,
      creditPaidDate: new Date().toISOString(),
      creditPayments: updatedPayments
    });
    await fetchPurchases();
  };

  const settleReferralCommission = async (saleId) => {
    await updateDoc(doc(db, "sales", saleId), {
      isCommissionPaid: true,
      commissionPaidDate: new Date().toISOString()
    });
    await fetchSales();
  };

  const updateSale = async (saleId, originalItems, newSaleData) => {
    // 1. Calculate stock differences
    const stockChanges = {};

    // Restore stock from original items
    (originalItems || []).forEach(item => {
      if (item && item.productId) {
        stockChanges[item.productId] = (stockChanges[item.productId] || 0) + item.qty;
      }
    });

    // Deduct stock for new items
    ((newSaleData && newSaleData.items) || []).forEach(item => {
      if (item && item.productId) {
        stockChanges[item.productId] = (stockChanges[item.productId] || 0) - item.qty;
      }
    });

    // 2. Update Firestore products concurrently
    const stockPromises = Object.entries(stockChanges)
      .filter(([productId]) => {
        const idStr = String(productId);
        return idStr && idStr !== "undefined" && idStr !== "null" && idStr !== "" && !idStr.startsWith("custom_");
      })
      .map(async ([productId, change]) => {
        if (change === 0) return;
        try {
          await updateDoc(doc(db, "products", productId), {
            stock: increment(change),
            totalSold: increment(-change)
          });
        } catch (err) {
          console.warn(`Failed to update stock for product ${productId}:`, err);
        }
      });
    await Promise.all(stockPromises);

    // 3. Update the sale document
    const { id, ...cleanSaleData } = newSaleData;
    const sanitizedSaleData = sanitizeData(cleanSaleData);
    await updateDoc(doc(db, "sales", saleId), {
      ...sanitizedSaleData,
      updatedAt: serverTimestamp()
    });

    const [freshProducts] = await Promise.all([fetchProducts(), fetchSales()]);
    
    // Check for low stock in the fresh data
    const affectedIds = Object.keys(stockChanges);
    const lowStockItems = freshProducts.filter(p => {
      const threshold = getStockThreshold(p);
      return affectedIds.includes(p.id) && p.stock < threshold;
    });
    if (lowStockItems.length > 0) {
      lowStockItems.forEach(p => {
        const threshold = getStockThreshold(p);
        addNotification("Low Stock Alert", `${p.name} has dropped below ${threshold} units (${p.stock} left).`, "warning");
      });
    }
  };

  // Estimations (Quotes)
  const saveEstimation = async (cartItems, estimationName, customerName, customerPhone, discount, isGstBill = false, siteName = "") => {
    const rawSubtotal = cartItems.reduce((sum, item) => sum + item.sellingPrice * item.qty, 0);
    const itemRatio = (item) => (item.sellingPrice * item.qty) / (rawSubtotal || 1);
    
    const totalGst = isGstBill ? cartItems.reduce((sum, item) => {
      const taxable = (item.sellingPrice * item.qty) - ((discount || 0) * itemRatio(item));
      return sum + (taxable * (parseFloat(item.gstRate) || 0) / 100);
    }, 0) : 0;

    const total = rawSubtotal - (discount || 0) + totalGst;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    const estimationDoc = {
      estimationName: estimationName || "Standard Estimate",
      items: cartItems.map(i => ({
        productId: i.id, name: i.name, qty: i.qty, sellingPrice: i.sellingPrice,
        hsnCode: i.hsnCode || "", gstRate: parseFloat(i.gstRate) || 0
      })),
      total, discount: discount || 0,
      isGstBill, totalGst, cgst: totalGst / 2, sgst: totalGst / 2, subtotal: rawSubtotal,
      customerName: customerName || "", customerPhone: customerPhone || "",
      siteName: siteName || "",
      date: dateStr, time: timeStr, createdAt: serverTimestamp()
    };

    await addDoc(collection(db, "estimations"), estimationDoc);
    await fetchEstimations();
    return { ...estimationDoc };
  };

  const updateEstimation = async (id, updatedData) => {
    await updateDoc(doc(db, "estimations", id), {
      ...updatedData,
      updatedAt: serverTimestamp()
    });
    await fetchEstimations();
  };

  const deleteEstimation = async (id) => {
    await deleteDoc(doc(db, "estimations", id));
    await fetchEstimations();
  };

  // Expenses
  const addExpense = async (reason, amount, date) => {
    const dateStr = date || new Date().toISOString().split("T")[0];
    await addDoc(collection(db, "expenses"), {
      reason, amount: parseFloat(amount), date: dateStr, createdAt: serverTimestamp()
    });
    await fetchExpenses();
  };
  const deleteExpense = async (id) => {
    await deleteDoc(doc(db, "expenses", id));
    await fetchExpenses();
  };

  // Suppliers CRUD
  const addSupplier = async (data) => {
    await addDoc(collection(db, "suppliers"), { ...data, createdAt: serverTimestamp() });
    await fetchSuppliers();
  };
  const updateSupplier = async (id, data) => {
    await updateDoc(doc(db, "suppliers", id), data);
    await fetchSuppliers();
  };
  const deleteSupplier = async (id) => {
    await deleteDoc(doc(db, "suppliers", id));
    await fetchSuppliers();
  };

  const importSuppliersBatch = async (suppliersDataArray) => {
    try {
      const chunkSize = 50;
      for (let i = 0; i < suppliersDataArray.length; i += chunkSize) {
        const chunk = suppliersDataArray.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (supp) => {
          return addDoc(collection(db, "suppliers"), {
            ...supp,
            createdAt: serverTimestamp()
          });
        }));
      }
      await fetchSuppliers();
    } catch(err) {
      console.error(err);
      throw err;
    }
  };

  // Demand prediction
  const getDemandData = () => {
    // Build a map of productId -> lastSold timestamp
    const lastSoldMap = {};
    sales.forEach(sale => {
      const saleTime = new Date(sale.date + "T" + (sale.time || "00:00")).getTime() || new Date(sale.date).getTime();
      sale.items?.forEach(item => {
        if (!lastSoldMap[item.productId] || saleTime > lastSoldMap[item.productId]) {
          lastSoldMap[item.productId] = saleTime;
        }
      });
    });

    const now = Date.now();

    return products.map(product => {
      const createdTime = product.createdAt ? product.createdAt.seconds * 1000 : now - (30 * 24 * 60 * 60 * 1000);
      const daysSinceCreation = Math.max(1, Math.ceil((now - createdTime) / (1000 * 60 * 60 * 24)));
      
      let avgPerDay = (product.totalSold || 0) / daysSinceCreation;
      let daysLeft = avgPerDay > 0 ? (product.stock || 0) / avgPerDay : 999;
      
      const lastSoldTime = lastSoldMap[product.id] || createdTime;
      const daysSinceLastSale = Math.max(0, Math.ceil((now - lastSoldTime) / (1000 * 60 * 60 * 24)));
      
      let arimaForecast = null;
      let peakDay = "";
      let peakValue = 0;
      let totalPredictedDemand = 0;
      let isAiModelUsed = false;
      
      if (arimaPredictions && arimaPredictions[product.id]) {
        const arimaData = arimaPredictions[product.id];
        arimaForecast = arimaData.forecast || [];
        peakDay = arimaData.peakDay || "";
        peakValue = arimaData.peakValue || 0;
        totalPredictedDemand = arimaData.totalPredictedDemand || 0;
        isAiModelUsed = true;
        
        // Calculate daily average based on 7-day predictive window
        avgPerDay = totalPredictedDemand / 7;
        
        // Calculate days left using daily countdown of forecasted quantities
        let tempStock = product.stock || 0;
        let dayCount = 0;
        let ranOut = false;
        
        for (let idx = 0; idx < arimaForecast.length; idx++) {
          tempStock -= arimaForecast[idx].predicted;
          if (tempStock <= 0) {
            dayCount = idx + 1;
            ranOut = true;
            break;
          }
        }
        
        if (ranOut) {
          daysLeft = dayCount;
        } else {
          daysLeft = avgPerDay > 0 ? 7 + (tempStock / avgPerDay) : 999;
        }
      }

      let status = "ok"; let speed = "slow";
      let isDeadStock = false;

      if (product.stock > 0 && daysSinceLastSale >= 30) {
        status = "dead";
        isDeadStock = true;
      } else if (daysLeft < 5) {
        status = "urgent";
      } else if (daysLeft < 10) {
        status = "warning";
      }

      if (avgPerDay >= 1) speed = "fast";
      else if (isDeadStock) speed = "dead";

      return {
        ...product,
        avgPerDay: parseFloat(avgPerDay.toFixed(1)),
        daysLeft: parseFloat(daysLeft.toFixed(0)) === Infinity ? 999 : parseFloat(daysLeft.toFixed(0)),
        daysSinceLastSale,
        status, 
        speed,
        isDeadStock,
        arimaForecast,
        peakDay,
        peakValue,
        totalPredictedDemand,
        isAiModelUsed
      };
    });
  };

  // Today's stats (with split Cash vs UPI logic)
  const getTodayStats = () => {
    const today = new Date().toISOString().split("T")[0];
    const todaySales = sales.filter(s => s.date === today);
    const todayExpenses = expenses.filter(e => e.date === today);
    
    const totalSales = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalProfit = todaySales.reduce((sum, s) => sum + (s.profit || 0), 0);
    
    // Split purely for cash drawer calculation
    const cashSales = todaySales.filter(s => s.paymentMethod === "CASH").reduce((sum, s) => sum + (s.total || 0), 0);
    const upiSales = todaySales.filter(s => s.paymentMethod === "UPI").reduce((sum, s) => sum + (s.total || 0), 0);
    
    // Assume all expenses are paid from cash drawer
    const totalExpenses = todayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const lowStock = products.filter(p => (p.stock || 0) <= 5).length;

    return {
      totalSales, cashSales, upiSales, totalProfit, totalExpenses,
      transactions: todaySales.length, products: products.length, lowStock
    };
  };

  // Stats for any date
  const getDateStats = (dateStr) => {
    const dateSales = sales.filter(s => s.date === dateStr);
    const dateExpenses = expenses.filter(e => e.date === dateStr);
    const totalSales = dateSales.reduce((sum, s) => sum + (s.total || 0), 0);
    const cashSales = dateSales.filter(s => s.paymentMethod === "CASH").reduce((sum, s) => sum + (s.total || 0), 0);
    const upiSales = dateSales.filter(s => s.paymentMethod === "UPI").reduce((sum, s) => sum + (s.total || 0), 0);
    const totalProfit = dateSales.reduce((sum, s) => sum + (s.profit || 0), 0);
    const totalExpenses = dateExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    return { totalSales, cashSales, upiSales, totalProfit, totalExpenses, transactions: dateSales.length, sales: dateSales, expenses: dateExpenses };
  };

  const value = {
    user, userRole, loading,
    products, suppliers, sales, expenses, daySessions, estimations,
    login, register, logout,
    addProduct, updateProduct, deleteProduct, deleteAllProducts, batchUpdateProducts,
    completeSale, saveEstimation, updateEstimation, deleteEstimation,
    addExpense, deleteExpense,
    addSupplier, updateSupplier, deleteSupplier,
    getDemandData, getTodayStats, getDateStats,
    openDay, closeDay, getTodaySession, updateClosingCash, reopenDay,
    fetchProducts, fetchSales, fetchExpenses, fetchDaySessions, fetchEstimations, fetchDailyReports,
    importProductsBatch, importSuppliersBatch, settleCreditSale, updateSale, settleSupplierCreditBill, settleReferralCommission,
    dailyReports, editingSale, setEditingSale, addAuditLog,
    backupsList, createBackup, restoreBackup, restoreProductsFromBackup,
    contacts, addContact, updateContact, deleteContact,
    purchaseOrders, addPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, fetchPurchaseOrders,
    shortages, addShortage, updateShortage, deleteShortage, fetchShortages,
    weekendList, addWeekendItem, updateWeekendItem, deleteWeekendItem, fetchWeekendList,
    offlineSales, syncOfflineSales,
    notifications, addNotification, removeNotification, checkLowStock, getStockThreshold,
    purchases, addPurchaseBill, fetchPurchases,
    arimaPredictions, loadingPredictions, fetchAiPredictions,
    getProductByCode, fetchProductsPaginated, adjustStockTransaction, fetchStockMovements, lookupOcrProduct, cancelSaleTransaction
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

