import React, { useState, useMemo, useRef, useEffect } from "react";
import { useApp } from "../AppContext";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import PhoneScannerModal from "../components/PhoneScannerModal";
import ShopMap from "../components/ShopMap";

import Shelf360Viewer from "../components/Shelf360Viewer";
import SearchableSelect from "../components/SearchableSelect";
import ReceiptTemplate from "../components/ReceiptTemplate";
import { matchesProductSearch } from "../utils";

const CATEGORIES = ["ALL", "HARDWARE", "ELECTRICAL", "PLUMBING", "SANITARY", "MOTORS", "HOUSE APPLIANCES"];

export default function Billing() {
  const { products, completeSale, editingSale, setEditingSale, updateSale, contacts, addNotification, lookupOcrProduct, getProductByCode } = useApp();

  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [plumbingFilter, setPlumbingFilter] = useState("ALL");
  const [locatorTab, setLocatorTab] = useState("map"); // map | shelf
  const [showScanner, setShowScanner] = useState(false);
  const [showPhoneScanner, setShowPhoneScanner] = useState(false);

  const handlePhoneCodeScanned = async (scannedCode) => {
    if (!scannedCode) return;
    const cleanCode = scannedCode.trim().toUpperCase();

    let product = products.find(p =>
      p.productCode?.trim().toUpperCase() === cleanCode ||
      p.id?.trim().toUpperCase() === cleanCode ||
      p.barcode?.trim().toUpperCase() === cleanCode
    );

    if (!product) {
      try {
        product = await getProductByCode(cleanCode);
      } catch (err) {
        console.warn("Product code fetch exception:", err);
      }
    }

    if (product) {
      const maxAllowed = getMaxAllowedQty(product.id);
      if (maxAllowed <= 0 && addNotification) {
        addNotification("Low Stock Warning", `"${product.name}" (${cleanCode}) has 0 stock remaining.`, "warning");
      } else if (addNotification) {
        addNotification("Phone OCR Scan", `Added "${product.name}" (${cleanCode}) to cart!`, "success");
      }
      addToCart(product);
    } else {
      if (addNotification) {
        addNotification("Scanner Error", `No product found for code "${cleanCode}"`, "warning");
      }
    }
  };

  const [cart, setCart] = useState([]);
  const [receivedAmount, setReceivedAmount] = useState("0.00");
  const [heldSales, setHeldSales] = useState([]);
  const [showQuickAddMenu, setShowQuickAddMenu] = useState(false);
  
  const [currentTime, setCurrentTime] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' }) + " " + d.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setCurrentTime(d.toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' }) + " " + d.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Smart Bulk Add states
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [bulkItems, setBulkItems] = useState([]);
  const [isEditingBulk, setIsEditingBulk] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [referrerId, setReferrerId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [commissionPct, setCommissionPct] = useState(0);
  const [isGstBill, setIsGstBill] = useState(false);
  const [saleResult, setSaleResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showFullCart, setShowFullCart] = useState(false);
  const receiptRef = useRef(null);
  const [locateProduct, setLocateProduct] = useState(null);
  const [siteName, setSiteName] = useState("");
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [showPaymentGateway, setShowPaymentGateway] = useState(false);
  const [showBillPreview, setShowBillPreview] = useState(false);
  const [showCheckoutConfirmModal, setShowCheckoutConfirmModal] = useState(false);

  // Quick Add Autocomplete states
  const [quickSearch, setQuickSearch] = useState("");
  const [showQuickSuggestions, setShowQuickSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const quickAddInputRef = useRef(null);
  const containerRef = useRef(null);
  const suggestionsContainerRef = useRef(null);

  // Deterministic internal scroll alignment for suggestion dropdown (no page shift, perfect fitting)
  useEffect(() => {
    const container = suggestionsContainerRef.current;
    if (!container) return;
    const activeItem = container.children[activeSuggestionIndex];
    if (activeItem) {
      const itemTop = activeItem.offsetTop;
      const itemBottom = itemTop + activeItem.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;

      if (itemTop < viewTop) {
        container.scrollTop = itemTop;
      } else if (itemBottom > viewBottom) {
        container.scrollTop = itemBottom - container.clientHeight;
      }
    }
  }, [activeSuggestionIndex]);

  // Focus quick add input on mount
  useEffect(() => {
    if (quickAddInputRef.current) {
      quickAddInputRef.current.focus();
    }
  }, []);

  // Click outside to close quick-add suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowQuickSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Compute matching autocomplete suggestions
  const quickSuggestions = useMemo(() => {
    if (!quickSearch.trim()) return [];
    
    // Match by name, category, or code using matchesProductSearch
    const filteredProducts = products.filter(p => matchesProductSearch(p, quickSearch));
    
    const topSuggestions = filteredProducts.slice(0, 100);
    
    // Add dynamic custom item option at bottom
    topSuggestions.push({
      id: "custom-option",
      name: `Add custom item: "${quickSearch}"`,
      isCustomOption: true
    });
    
    return topSuggestions;
  }, [products, quickSearch]);



  const addCustomItem = (name) => {
    if (!name) return;
    setCart(prev => {
      const existing = prev.find(i => i.name.toLowerCase() === name.toLowerCase() && i.isCustom);
      if (existing) {
        return prev.map(i => i.id === existing.id ? { ...i, qty: i.qty + 1 } : i);
      }
      const idx = prev.length;
      const customItem = {
        id: `custom_${Date.now()}_${idx}`,
        productId: `custom_${Date.now()}_${idx}`,
        name: name,
        qty: 1,
        sellingPrice: 0,
        purchasePrice: 0,
        gstRate: 18,
        unit: "Nos",
        hsnCode: "",
        category: "HARDWARE",
        productCode: "",
        isCustom: true,
        commission: commissionPct
      };
      return [...prev, customItem];
    });
  };

  const updateUnit = (id, newUnit) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, unit: newUnit } : i));
  };

  const updateHsn = (id, newHsn) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, hsnCode: newHsn } : i));
  };

  const focusBackwardCell = (currentIndex, currentField) => {
    if (currentField === "comm") {
      const unit = document.getElementById(`unit-input-${currentIndex}`);
      if (unit) unit.focus();
    } else if (currentField === "unit") {
      const qty = document.getElementById(`qty-input-${currentIndex}`);
      if (qty) { qty.focus(); qty.select(); }
    } else if (currentField === "qty") {
      const rate = document.getElementById(`rate-input-${currentIndex}`);
      if (rate) { rate.focus(); rate.select(); }
    } else if (currentField === "rate") {
      if (currentIndex > 0) {
        const prevComm = document.getElementById(`comm-input-${currentIndex - 1}`);
        if (prevComm) { prevComm.focus(); prevComm.select(); }
      } else if (quickAddInputRef.current) {
        quickAddInputRef.current.focus();
        quickAddInputRef.current.select();
      }
    }
  };

  const handleDeleteRowWithFocus = (itemId, index) => {
    removeFromCart(itemId);
    setTimeout(() => {
      if (cart.length > 1) {
        const nextIdx = index < cart.length - 1 ? index : Math.max(0, index - 1);
        const nextRate = document.getElementById(`rate-input-${nextIdx}`);
        if (nextRate) { nextRate.focus(); nextRate.select(); }
        else if (quickAddInputRef.current) quickAddInputRef.current.focus();
      } else if (quickAddInputRef.current) {
        quickAddInputRef.current.focus();
      }
    }, 60);
  };

  const handleSelectSuggestion = (selected) => {
    const targetIdx = cart.length;
    if (selected.isCustomOption) {
      addCustomItem(quickSearch.trim());
    } else {
      addToCart(selected);
    }
    setQuickSearch("");
    setShowQuickSuggestions(false);
    setTimeout(() => {
      const targetRateInput = document.getElementById(`rate-input-${targetIdx}`);
      if (targetRateInput) {
        targetRateInput.focus();
        targetRateInput.select();
      } else if (quickAddInputRef.current) {
        quickAddInputRef.current.focus();
      }
    }, 60);
  };

  const handleQuickSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (showQuickSuggestions && quickSuggestions.length > 0) {
        setActiveSuggestionIndex(prev => 
          Math.min(prev + 1, quickSuggestions.length - 1)
        );
      } else if (cart.length > 0) {
        const firstRate = document.getElementById("rate-input-0");
        if (firstRate) firstRate.focus();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (showQuickSuggestions && quickSuggestions.length > 0) {
        setActiveSuggestionIndex(prev => Math.max(prev - 1, 0));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showQuickSuggestions && quickSuggestions.length > 0 && quickSuggestions[activeSuggestionIndex]) {
        handleSelectSuggestion(quickSuggestions[activeSuggestionIndex]);
      } else if (quickSearch.trim()) {
        const queryTerm = quickSearch.trim();
        const exactMatch = products.find(p => 
          p.productCode?.toLowerCase() === queryTerm.toLowerCase() ||
          p.barcode?.toLowerCase() === queryTerm.toLowerCase() ||
          p.name?.toLowerCase() === queryTerm.toLowerCase()
        );
        if (exactMatch) {
          handleSelectSuggestion(exactMatch);
        } else {
          // Direct single-document Firestore lookup by product code
          getProductByCode(queryTerm).then((remoteProd) => {
            if (remoteProd) {
              addToCart(remoteProd);
              setQuickSearch("");
              setShowQuickSuggestions(false);
            } else {
              addCustomItem(queryTerm);
              setQuickSearch("");
              setShowQuickSuggestions(false);
            }
          }).catch(() => {
            addCustomItem(queryTerm);
            setQuickSearch("");
            setShowQuickSuggestions(false);
          });
        }
      } else if (cart.length > 0) {
        const receivedInput = document.getElementById("received-amount-input");
        if (receivedInput) {
          receivedInput.focus();
          receivedInput.select();
        }
      }
    } else if (e.key === "Escape") {

      setShowQuickSuggestions(false);
    }
  };

  // Shortage Book Quick Log states
  const { addShortage } = useApp();
  const [showShortageModal, setShowShortageModal] = useState(false);
  const [shortageItemName, setShortageItemName] = useState("");
  const [shortageQty, setShortageQty] = useState(1);
  const [shortageCustomerName, setShortageCustomerName] = useState("");
  const [shortageCustomerPhone, setShortageCustomerPhone] = useState("");
  const [shortageNotes, setShortageNotes] = useState("");
  const [shortageIsNewProduct, setShortageIsNewProduct] = useState(true);
  const [shortageSelectedProductId, setShortageSelectedProductId] = useState("");

  const shortageProductOptions = useMemo(() => {
    return products
      .filter(p => p.stock <= 0)
      .map(p => ({
        value: p.id,
        label: `${p.name} (Out of Stock)`
      }));
  }, [products]);


  const handleSaveShortage = async () => {
    if (!shortageItemName && shortageIsNewProduct) {
      alert("Please enter the requested product name.");
      return;
    }
    if (!shortageSelectedProductId && !shortageIsNewProduct) {
      alert("Please select a product.");
      return;
    }

    let finalItemName = shortageItemName;
    let finalProductId = "";

    if (!shortageIsNewProduct) {
      const prod = products.find(p => p.id === shortageSelectedProductId);
      if (prod) {
        finalItemName = prod.name;
        finalProductId = prod.id;
      }
    }

    const shortageData = {
      date: new Date().toISOString().split("T")[0],
      itemName: finalItemName,
      productId: finalProductId,
      qty: parseInt(shortageQty) || 1,
      customerName: shortageCustomerName || "Walk-in Customer",
      customerPhone: shortageCustomerPhone || "",
      notes: shortageNotes,
      status: "REQUESTED"
    };

    try {
      await addShortage(shortageData);
      setShowShortageModal(false);
      setShortageItemName("");
      setShortageQty(1);
      setShortageCustomerName("");
      setShortageCustomerPhone("");
      setShortageNotes("");
    } catch (err) {
      alert("Error saving request: " + err.message);
    }
  };

  const getHighlightZone = (product) => {
    if (!product) return "";
    const loc = String(product.shelfLocation || "").toUpperCase();
    if (loc.includes("AISLE A") || loc.includes("RACK A") || loc.includes("HARDWARE")) return "A";
    if (loc.includes("AISLE B") || loc.includes("RACK B") || loc.includes("ELECTRICAL")) return "B";
    if (loc.includes("AISLE C") || loc.includes("RACK C") || loc.includes("PLUMBING") || loc.includes("CPVC") || loc.includes("PVC") || loc.includes("UPVC")) return "C";
    if (loc.includes("AISLE D") || loc.includes("RACK D") || loc.includes("SANITARY")) return "D";
    if (loc.includes("AISLE E") || loc.includes("RACK E") || loc.includes("BATHROOM") || loc.includes("MOTOR")) return "E";
    
    const cat = String(product.category || "").toUpperCase();
    if (cat === "HARDWARE") return "A";
    if (cat === "ELECTRICAL") return "B";
    if (["CPVC", "PVC", "UPVC"].includes(cat)) return "C";
    if (cat === "SANITARYWARE" || cat === "SANITARY") return "D";
    if (["BATHROOM FITTINGS", "MOTORS", "HOUSE APPLIANCES"].includes(cat)) return "E";
    
    return "A";
  };

  const referrers = useMemo(() => {
    return (contacts || []).filter(c => c.designation && c.designation !== "Customer");
  }, [contacts]);

  // Populate if editing
  useEffect(() => {
    if (editingSale) {
      // items in sale have productId, name, qty, etc.
      // items in cart expect product-like structure
      const cartItems = editingSale.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
          ...product,
          ...item,
          id: item.productId // Ensure id matches what cart logic expects
        };
      });
      setCart(cartItems);
      setCustomerName(editingSale.customerName || "");
      setCustomerPhone(editingSale.customerPhone || "");
      setReferrerId(editingSale.referrerId || "");
      setDiscount(editingSale.discount || 0);
      setPaymentMethod(editingSale.paymentMethod || "CASH");
      setIsGstBill(editingSale.isGstBill || false);
      setCommissionPct(editingSale.commissionPercent || 0);
      setSiteName(editingSale.siteName || "");
      setShowCustomerDetails(true);
    }
  }, [editingSale, products]);

  // Auto-expand customer details if any fields have values
  useEffect(() => {
    if (customerName || customerPhone || referrerId || siteName || editingSale) {
      setShowCustomerDetails(true);
    }
  }, [customerName, customerPhone, referrerId, siteName, editingSale]);

  // Sync row commissions when global commission percent or referrer changes
  useEffect(() => {
    setCart(prev => prev.map(item => {
      if (item.id === "") return item;
      return {
        ...item,
        commission: item.commission !== undefined && item.commission !== 0 ? item.commission : commissionPct
      };
    }));
  }, [referrerId, commissionPct]);

  const handleGlobalCommissionChange = (val) => {
    const pct = parseFloat(val) || 0;
    setCommissionPct(pct);
    setCart(prev => prev.map(item => {
      if (item.id === "") return item;
      return {
        ...item,
        commission: pct
      };
    }));
  };

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch = matchesProductSearch(p, quickSearch);
      
      const pCat = String(p.category || "").toUpperCase();
      const selCat = category.toUpperCase();
      
      let matchCat = selCat === "ALL";
      if (!matchCat) {
        if (selCat === "PLUMBING") {
          matchCat = ["PLUMBING", "CPVC", "PVC", "UPVC"].includes(pCat);
        } else if (selCat === "SANITARY") {
          matchCat = ["SANITARY", "SANITARYWARE"].includes(pCat);
        } else {
          matchCat = pCat === selCat;
        }
      }

      let matchPlumbingType = true;
      if (selCat === "PLUMBING" && plumbingFilter !== "ALL") {
        const name = String(p.name || "").toUpperCase();
        if (plumbingFilter === "CPVC") {
          matchPlumbingType = name.includes("CPVC");
        } else if (plumbingFilter === "UPVC") {
          matchPlumbingType = name.includes("UPVC");
        } else if (plumbingFilter === "PVC") {
          matchPlumbingType = !name.includes("CPVC") && !name.includes("UPVC");
        }
      }

      return matchSearch && matchCat && matchPlumbingType;
    });
  }, [products, quickSearch, category, plumbingFilter]);


  // Frequently sold (top by totalSold)
  const frequent = useMemo(() =>
    [...products].sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0)).slice(0, 6),
    [products]);

  // Recently sold
  const recent = useMemo(() =>
    [...products].reverse().slice(0, 6),
    [products]);

  const getMaxAllowedQty = (itemId) => {
    const product = products.find(p => p.id === itemId);
    if (!product) return 9999; // For custom items or deleted products, allow any quantity during edit
    let allowed = product.stock || 0;
    if (editingSale && editingSale.items) {
      const originalItem = editingSale.items.find(item => item.productId === itemId);
      if (originalItem) {
        allowed += (originalItem.qty || 0);
      }
    }
    return allowed;
  };

  const addToCart = (product) => {
    if (!product) return;
    const maxAllowed = getMaxAllowedQty(product.id);
    if (maxAllowed <= 0 && addNotification) {
      addNotification("Stock Warning", `"${product.name}" has 0 recorded stock, but has been added to cart.`, "warning");
    }
    setCart(prev => {
      const prodId = product.id || product.productId;
      const existing = prev.find(i => i.id === prodId || i.productId === prodId);
      if (existing) {
        return prev.map(i => (i.id === prodId || i.productId === prodId) ? { ...i, qty: (parseFloat(i.qty) || 0) + 1 } : i);
      }
      return [...prev, {
        ...product,
        id: prodId,
        productId: prodId,
        qty: 1,
        commission: commissionPct,
        unit: product.unit || "NOS",
        sellingPrice: parseFloat(product.sellingPrice) || 0,
        purchasePrice: parseFloat(product.purchasePrice) || 0,
        gstRate: product.gstRate !== undefined ? parseFloat(product.gstRate) : 18
      }];
    });
  };


  const handleRowCommissionChange = (idx, value) => {
    const newCart = [...cart];
    newCart[idx].commission = value === "" ? "" : parseFloat(value) || 0;
    setCart(newCart);
  };

  const handleBarcodeScan = async (scannedCode) => {
    setShowScanner(false);
    if (!scannedCode) return;

    // Check local loaded state first
    let codeClean = scannedCode.trim().toLowerCase();
    if (codeClean.startsWith("*") && codeClean.endsWith("*") && codeClean.length > 1) {
      codeClean = codeClean.substring(1, codeClean.length - 1);
    }

    const localProduct = products.find(p => 
      p.productCode?.trim().toLowerCase() === codeClean ||
      p.id?.trim().toLowerCase() === codeClean ||
      p.barcode?.trim().toLowerCase() === codeClean
    );

    if (localProduct) {
      addToCart(localProduct);
      return;
    }

    // Direct single-document OCR lookup from Firestore backend
    try {
      const res = await lookupOcrProduct(scannedCode);
      if (res.success && res.product) {
        addToCart(res.product);
        if (res.note && addNotification) {
          addNotification("OCR Scanner", res.note, "info");
        }
      } else {
        alert(res.reason || `No product found in database with code: "${scannedCode}"`);
      }
    } catch (err) {
      alert(`Barcode lookup error: ${err.message}`);
    }
  };


  const updateQty = (id, delta) => {
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i;
      const newQty = i.qty + delta;
      if (newQty <= 0) return null;
      const maxAllowed = getMaxAllowedQty(id);
      if (newQty > maxAllowed) return i;
      return { ...i, qty: newQty };
    }).filter(Boolean));
  };

  const updatePrice = (id, newPrice) => {
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i;
      return { ...i, sellingPrice: newPrice === "" ? "" : parseFloat(newPrice) || 0 };
    }));
  };

  const setQtyExact = (id, newQtyStr) => {
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i;
      if (newQtyStr === "") return { ...i, qty: "" };
      const newQty = parseFloat(newQtyStr);
      if (isNaN(newQty)) return i;
      if (newQty < 0) return i; // don't allow negative
      const maxAllowed = getMaxAllowedQty(id);
      if (newQty > maxAllowed) {
        alert(`Only ${maxAllowed} items available in stock!`);
        return { ...i, qty: maxAllowed };
      }
      return { ...i, qty: newQty };
    }));
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(i => i.id !== id));

  // Smart Bulk Add helpers
  const handleBulkParse = () => {
    if (!bulkInput.trim()) return;
    const lines = bulkInput.split("\n").filter(l => l.trim());
    const items = [];
    
    lines.forEach((line, idx) => {
      const parts = line.split("\t");
      let name = line.trim();
      let qty = 1;
      let sellingPrice = 0;
      let gstRate = 18;
      let unit = "Nos";
      let matchedProduct = null;
      let hsnCode = "";
      let hasCustomPrice = false;

      if (line.includes("\t")) {
        name = parts[0].trim();
        if (parts.length > 1) {
          const val1 = parseFloat(parts[1].replace(/[^0-9.]/g, ""));
          if (!isNaN(val1)) {
            if (parts.length > 2) {
              const val2 = parseFloat(parts[2].replace(/[^0-9.]/g, ""));
              if (!isNaN(val2)) {
                if (val1 >= 100 || !Number.isInteger(val1) || val1 > val2) {
                  sellingPrice = val1;
                  qty = val2;
                  hasCustomPrice = true;
                } else {
                  qty = val1;
                  sellingPrice = val2;
                  hasCustomPrice = true;
                }
              }
            } else {
              let foundProduct = products.find(p => p.name?.toLowerCase() === name.toLowerCase());
              if (!foundProduct) {
                foundProduct = products.find(p => p.name?.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name?.toLowerCase()));
              }
              if (foundProduct) {
                qty = val1;
              } else {
                if (val1 <= 20) {
                  qty = val1;
                  sellingPrice = 0;
                } else {
                  qty = 1;
                  sellingPrice = val1;
                  hasCustomPrice = true;
                }
              }
            }
          }
        }
      } else {
        const spaceMatch = name.match(/^(.*?)\s+(\d+(?:\.\d+)?)$/);
        if (spaceMatch) {
          const potentialName = spaceMatch[1].trim();
          const potentialQty = parseFloat(spaceMatch[2]);
          
          let foundProduct = products.find(p => p.name?.toLowerCase() === potentialName.toLowerCase());
          if (!foundProduct) {
            foundProduct = products.find(p => p.name?.toLowerCase().includes(potentialName.toLowerCase()) || potentialName.toLowerCase().includes(p.name?.toLowerCase()));
          }
          
          if (foundProduct || potentialQty <= 100) {
            name = potentialName;
            qty = potentialQty;
          }
        }
      }

      let found = products.find(p => p.name?.toLowerCase() === name.toLowerCase());
      if (!found) {
        found = products.find(p => p.name?.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name?.toLowerCase()));
      }

      if (found) {
        matchedProduct = found;
        name = found.name;
        if (!hasCustomPrice) {
          sellingPrice = found.sellingPrice || 0;
        }
        gstRate = found.gstRate || 0;
        unit = found.unit || "Nos";
        hsnCode = found.hsnCode || "";
      }

      items.push({
        id: found ? found.id : `custom_${Date.now()}_${idx}`,
        productId: found ? found.id : `custom_${Date.now()}_${idx}`,
        name,
        qty,
        sellingPrice,
        gstRate,
        unit,
        hsnCode,
        category: found ? found.category : "Hardware",
        productCode: found ? found.productCode : "",
        isCustom: !found
      });
    });

    setBulkItems(items);
  };

  const handleBulkProductNameChange = (idx, nameValue) => {
    const newItems = [...bulkItems];
    newItems[idx].name = nameValue;
    
    const found = products.find(p => p.name?.toLowerCase() === nameValue.toLowerCase());
    if (found) {
      newItems[idx].id = found.id;
      newItems[idx].productId = found.id;
      newItems[idx].sellingPrice = found.sellingPrice || 0;
      newItems[idx].gstRate = found.gstRate || 0;
      newItems[idx].unit = found.unit || "Nos";
      newItems[idx].hsnCode = found.hsnCode || "";
      newItems[idx].category = found.category || "Hardware";
      newItems[idx].productCode = found.productCode || "";
      newItems[idx].isCustom = false;
    } else {
      if (!newItems[idx].isCustom) {
        newItems[idx].id = `custom_${Date.now()}_${idx}`;
        newItems[idx].productId = `custom_${Date.now()}_${idx}`;
        newItems[idx].isCustom = true;
      }
    }
    setBulkItems(newItems);
  };

  const openBulkAdd = () => {
    setIsEditingBulk(false);
    setBulkInput("");
    setBulkItems([]);
    setShowBulkModal(true);
  };

  const openBulkEdit = () => {
    setIsEditingBulk(true);
    const convertedItems = cart.map((item, idx) => {
      const found = products.find(p => p.id === item.id || p.id === item.productId || p.name?.toLowerCase() === item.name?.toLowerCase());
      return {
        id: item.id || item.productId || (found ? found.id : `custom_${Date.now()}_${idx}`),
        productId: item.productId || item.id || (found ? found.id : `custom_${Date.now()}_${idx}`),
        name: item.name,
        qty: item.qty || 1,
        sellingPrice: item.sellingPrice || 0,
        gstRate: item.gstRate !== undefined ? item.gstRate : (found ? found.gstRate : 18),
        unit: item.unit || (found ? found.unit : "Nos"),
        hsnCode: item.hsnCode || (found ? found.hsnCode : ""),
        category: item.category || (found ? found.category : "Hardware"),
        productCode: item.productCode || (found ? found.productCode : ""),
        isCustom: !found
      };
    });
    setBulkItems(convertedItems);
    setBulkInput("");
    setShowBulkModal(true);
  };

  const addEmptyBulkRow = () => {
    const idx = bulkItems.length;
    setBulkItems([
      ...bulkItems,
      {
        id: `custom_${Date.now()}_${idx}`,
        productId: `custom_${Date.now()}_${idx}`,
        name: "",
        qty: 1,
        sellingPrice: 0,
        gstRate: 18,
        unit: "Nos",
        hsnCode: "",
        category: "Hardware",
        productCode: "",
        isCustom: true
      }
    ]);
  };

  const handleBulkSave = () => {
    if (bulkItems.length === 0) return;
    
    if (isEditingBulk) {
      const newCart = bulkItems.map(item => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        sellingPrice: item.sellingPrice,
        gstRate: item.gstRate,
        unit: item.unit,
        hsnCode: item.hsnCode || "",
        category: item.category || "Hardware",
        productCode: item.productCode || ""
      }));
      setCart(newCart);
    } else {
      const newCart = [...cart];
      bulkItems.forEach(item => {
        const existingIdx = newCart.findIndex(i => i.id === item.id || i.productId === item.id);
        if (existingIdx !== -1) {
          newCart[existingIdx].qty = (parseFloat(newCart[existingIdx].qty) || 0) + item.qty;
        } else {
          newCart.push({
            id: item.id,
            productId: item.productId,
            name: item.name,
            qty: item.qty,
            sellingPrice: item.sellingPrice,
            gstRate: item.gstRate,
            unit: item.unit,
            hsnCode: item.hsnCode || "",
            category: item.category || "Hardware",
            productCode: item.productCode || ""
          });
        }
      });
      setCart(newCart);
    }
    
    setShowBulkModal(false);
    setBulkInput("");
    setBulkItems([]);
  };

  const rawSubtotal = cart.reduce((sum, i) => sum + (parseFloat(i.sellingPrice) || 0) * (parseFloat(i.qty) || 0), 0);
  const commissionAmt = cart.reduce((sum, i) => sum + (parseFloat(i.sellingPrice) || 0) * (parseFloat(i.qty) || 0) * ((parseFloat(i.commission) || 0) / 100), 0);
  const adjustedSubtotal = rawSubtotal + commissionAmt;

  const itemRatio = (item) => {
    const rate = parseFloat(item.sellingPrice) || 0;
    const qty = parseFloat(item.qty) || 0;
    const comm = parseFloat(item.commission) || 0;
    const itemSubtotal = rate * qty * (1 + comm / 100);
    return itemSubtotal / (adjustedSubtotal || 1);
  };
  
  const totalGst = isGstBill ? cart.reduce((sum, item) => {
    const rate = parseFloat(item.sellingPrice) || 0;
    const qty = parseFloat(item.qty) || 0;
    const comm = parseFloat(item.commission) || 0;
    const itemSubtotal = rate * qty * (1 + comm / 100);
    const taxable = itemSubtotal - ((discount || 0) * itemRatio(item));
    return sum + (taxable * (parseFloat(item.gstRate) || 0) / 100);
  }, 0) : 0;
  
  const total = adjustedSubtotal - (discount || 0) + totalGst;
  const profit = cart.reduce((sum, i) => sum + ((parseFloat(i.sellingPrice) || 0) - i.purchasePrice) * (parseFloat(i.qty) || 0), 0) - (discount || 0);

  const previewSaleResult = useMemo(() => {
    const roundedTotal = Math.round(total);
    const roundOff = roundedTotal - total;
    return {
      items: cart.map(i => {
        const originalPrice = parseFloat(i.sellingPrice) || 0;
        const adjustedPrice = originalPrice * (1 + (parseFloat(i.commission) || 0) / 100);
        return {
          ...i,
          qty: parseFloat(i.qty),
          sellingPrice: adjustedPrice
        };
      }),
      subtotal: rawSubtotal,
      discount: discount,
      commissionPercent: commissionPct,
      commissionAmount: commissionAmt,
      total: total,
      roundedTotal: roundedTotal,
      roundOff: roundOff,
      totalGst: totalGst,
      cgst: totalGst / 2,
      sgst: totalGst / 2,
      isGstBill: isGstBill,
      customerName: customerName || "Walk-in Customer",
      customerPhone: customerPhone,
      siteName: siteName,
      date: new Date().toLocaleDateString("en-IN"),
      time: new Date().toLocaleTimeString("en-IN"),
      paymentMethod: paymentMethod || "CASH"
    };
  }, [cart, total, rawSubtotal, discount, commissionPct, commissionAmt, totalGst, isGstBill, customerName, customerPhone, siteName, paymentMethod]);


  const handleCheckout = () => {
    const validItems = cart.filter(i => i.id !== "");
    if (validItems.length === 0) return;
    setShowCheckoutConfirmModal(true);
    setTimeout(() => {
      const confirmBtn = document.getElementById("confirm-checkout-btn");
      if (confirmBtn) confirmBtn.focus();
    }, 60);
  };

  const executeCheckout = async () => {
    setShowCheckoutConfirmModal(false);
    const validItems = cart.filter(i => i.id !== "");
    if (validItems.length === 0) return;
    setLoading(true);
    try {
      const cleanCart = cart
        .filter(i => i.id !== "" && parseFloat(i.qty) > 0)
        .map(i => {
          const originalPrice = parseFloat(i.sellingPrice) || 0;
          const adjustedPrice = originalPrice * (1 + (parseFloat(i.commission) || 0) / 100);
          return {
            ...i,
            qty: parseFloat(i.qty),
            sellingPrice: adjustedPrice,
            commissionPercent: parseFloat(i.commission) || 0
          };
        });

      let result;
      // If it's a regular sale edit, update it. If it's a converted estimation, treat as NEW sale.
      const isConvertedEstimation = editingSale && String(editingSale.id).startsWith("TEMP_EST_");
      const selectedRef = referrers.find(r => r.id === referrerId);

      if (editingSale && !isConvertedEstimation) {
        const updatedSaleData = {
          ...editingSale,
          items: cleanCart.map(i => ({
            productId: i.id, name: i.name, qty: i.qty, sellingPrice: i.sellingPrice, purchasePrice: i.purchasePrice,
            hsnCode: i.hsnCode || "", gstRate: parseFloat(i.gstRate) || 0,
            commissionPercent: i.commissionPercent || 0
          })),
          total, profit, discount,
          commissionPercent: commissionPct,
          commissionAmount: commissionAmt,
          paymentMethod, customerName, customerPhone,
          isGstBill, totalGst, cgst: totalGst / 2, sgst: totalGst / 2, subtotal: rawSubtotal,
          siteName,
          referrerId: selectedRef ? selectedRef.id : "",
          referrerName: selectedRef ? selectedRef.name : "",
          referrerPhone: selectedRef ? selectedRef.phone : "",
          referrerDesignation: selectedRef ? selectedRef.designation : "",
          isCommissionPaid: selectedRef ? (editingSale.isCommissionPaid || false) : false
        };
        await updateSale(editingSale.id, editingSale.items, updatedSaleData);
        alert("Sale updated successfully!");
        setEditingSale(null);
        setReferrerId("");
        setShowPaymentGateway(false);
        navigate("/daybook");
        return; 
      } else {
        const referrerDetails = selectedRef ? {
          referrerId: selectedRef.id || "",
          referrerName: selectedRef.name || "",
          referrerPhone: selectedRef.phone || "",
          referrerDesignation: selectedRef.designation || "",
          isCommissionPaid: false
        } : {};

        const saleOptions = {
          ...referrerDetails,
          siteName: siteName
        };

        result = await completeSale(cleanCart, paymentMethod, customerName, customerPhone, discount, commissionPct, commissionAmt, isGstBill, saleOptions);
        if (isConvertedEstimation) {
          // If we want to delete the estimation after checkout, we can do it here
          // For now, just clear the editing state
          setEditingSale(null);
        }
      }
      
      const roundedTotal = Math.round(result.total);
      const roundOff = roundedTotal - result.total;

      const finalResult = { 
        ...result, 
        roundedTotal, 
        roundOff,
        // For excel export, we simplify the items
        excelItems: result.items.map((item, i) => ({
          "S.No": i+1,
          "Product": item.name,
          "Qty": item.qty,
          "Rate": item.sellingPrice,
          "Total": item.sellingPrice * item.qty
        }))
      };
      setSaleResult(finalResult);
      
      if (paymentMethod === "CREDIT" && customerPhone) {
        handleWhatsApp(finalResult);
      }

      setCart([]);
      setDiscount(0);
      setCommissionPct(0);
      setCustomerName("");
      setCustomerPhone("");
      setReferrerId("");
      setSiteName("");
      setShowPaymentGateway(false);
    } catch (e) {
      alert("Error completing sale: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-focus confirmation button when checkout modal opens
  useEffect(() => {
    if (showCheckoutConfirmModal) {
      const timer = setTimeout(() => {
        const confirmBtn = document.getElementById("confirm-checkout-btn");
        if (confirmBtn) confirmBtn.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showCheckoutConfirmModal]);

  // Global Tally-style Keyboard Shortcuts Handler
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // If checkout confirmation modal is open
      if (showCheckoutConfirmModal) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          const cancelBtn = document.getElementById("cancel-checkout-btn");
          if (cancelBtn) cancelBtn.focus();
          return;
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          const confirmBtn = document.getElementById("confirm-checkout-btn");
          if (confirmBtn) confirmBtn.focus();
          return;
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (document.activeElement && document.activeElement.id === "cancel-checkout-btn") {
            setShowCheckoutConfirmModal(false);
          } else {
            executeCheckout();
          }
          return;
        } else if (e.key === "Escape" || e.key === "Backspace") {
          e.preventDefault();
          setShowCheckoutConfirmModal(false);
          return;
        }
      }

      // If preview modal is open, Enter key opens confirm modal, Escape closes preview
      if (showBillPreview) {
        if (e.key === "Enter") {
          e.preventDefault();
          setShowBillPreview(false);
          if (cart.length > 0 && !loading) handleCheckout();
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          setShowBillPreview(false);
          return;
        }
      }

      // F2 or Ctrl+F: Focus search input
      if (e.key === "F2" || (e.ctrlKey && e.key.toLowerCase() === "f")) {
        e.preventDefault();
        if (quickAddInputRef.current) quickAddInputRef.current.focus();
      }
      // F4: Toggle payment mode (Cash -> UPI -> Credit)
      else if (e.key === "F4") {
        e.preventDefault();
        setPaymentMethod(prev => prev === "CASH" ? "UPI" : prev === "UPI" ? "CREDIT" : "CASH");
      }
      // F8: Open Bill Preview
      else if (e.key === "F8") {
        e.preventDefault();
        if (cart.length > 0) setShowBillPreview(true);
      }
      // F9 or Ctrl+Enter: Complete Sale
      else if (e.key === "F9" || (e.ctrlKey && e.key === "Enter")) {
        e.preventDefault();
        if (cart.length > 0 && !loading) handleCheckout();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [cart, loading, showBillPreview, showCheckoutConfirmModal, handleCheckout]);

  const handleWhatsApp = async (resultObj = saleResult) => {
    if (!resultObj) return;
    
    const existingPhone = resultObj.customerPhone ? resultObj.customerPhone.replace(/\D/g, "") : "";
    const enteredPhone = window.prompt("Confirm or enter customer WhatsApp number:", existingPhone);
    
    if (!enteredPhone) return;
    const phone = enteredPhone.replace(/\D/g, "");

    const isCredit = resultObj.paymentMethod === "CREDIT";
    
    // Header
    const header = isCredit 
      ? "📝 *VIJAYAPATHI TRADERS - CREDIT LEDGER NOTE*" 
      : "💐 *VIJAYAPATHI TRADERS - TAX INVOICE*";

    // Itemized list
    const items = resultObj.items.map((i, idx) => {
      const rateStr = parseFloat(i.sellingPrice).toFixed(2);
      const totalStr = (i.sellingPrice * i.qty).toFixed(2);
      return `• *${i.name}*\n  Qty: ${i.qty} ${i.unit || "Nos"} × ₹${rateStr} = *₹${totalStr}*`;
    }).join("\n\n");
    
    // GST Details
    const gstInfo = resultObj.isGstBill 
      ? `\n• GST Tax (Inc): ₹${parseFloat(resultObj.totalGst || 0).toFixed(2)}\n  (CGST: ₹${parseFloat(resultObj.cgst || 0).toFixed(2)} | SGST: ₹${parseFloat(resultObj.sgst || 0).toFixed(2)})` 
      : "";

    // Project Site
    const siteInfo = resultObj.siteName ? `\n🏡 *Project Site:* ${resultObj.siteName}` : "";

    // Compile clean draft
    const msg = `
${header}
------------------------------
👤 *Customer:* ${resultObj.customerName || "Valued Customer"}
📱 *Phone:* ${resultObj.customerPhone || "-"}${siteInfo}
📅 *Date:* ${resultObj.date}
------------------------------
🛒 *ITEMS BILLED:*

${items}

------------------------------
💰 *BILL SUMMARY:*
• Subtotal: ₹${parseFloat(resultObj.subtotal || resultObj.total).toFixed(2)}
• Discount: -₹${parseFloat(resultObj.discount || 0).toFixed(2)}${gstInfo}

💵 *GRAND TOTAL: ₹${resultObj.roundedTotal || Math.round(resultObj.total)}*
💳 *Status:* ${isCredit ? "Notebook CREDIT (UNPAID)" : "PAID (CASH/UPI) - THANK YOU"}
------------------------------
✨ _Thank you for choosing Vijayapathi Traders! For any queries, contact us at +91 94432 55677._ ✨
    `.trim();

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  };

  const handleDownloadPDF = async () => {
    if (!receiptRef.current) return;
    setLoading(true);
    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        logging: false,
        useCORS: true,
        backgroundColor: "#ffffff"
      });
      const imgData = canvas.toDataURL("image/png");
      const pdfWidth = 148;
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: [pdfWidth, pdfHeight]
      });
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      
      const prefix = saleResult ? "Bill" : "Draft_Estimation";
      const customer = saleResult 
        ? (saleResult.customerName || "Customer") 
        : (previewSaleResult ? (previewSaleResult.customerName || "Customer") : "Customer");
      const dateStr = saleResult 
        ? saleResult.date 
        : (previewSaleResult ? previewSaleResult.date : new Date().toISOString().split("T")[0]);

      const safeCustomer = String(customer).replace(/[^a-zA-Z0-9_-]/g, "_");
      pdf.save(`${prefix}_${dateStr}_${safeCustomer}.pdf`);
    } catch (err) {
      console.error("PDF Error:", err);
      alert("Failed to generate PDF. Try printing instead.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!receiptRef.current) return;
    const printWindow = window.open("", "_blank", "width=850,height=700");
    if (!printWindow) return alert("Please allow popups to print receipt.");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice - VIJAYAPATHI TRADERS</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            width: 100%;
            background: #ffffff;
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            padding: 10px;
            display: flex;
            justify-content: center;
          }
          .a5-receipt-container {
            width: 140mm !important;
            max-width: 140mm !important;
            margin: 0 auto !important;
            box-sizing: border-box !important;
            border: 1.5px solid #0f172a !important;
            padding: 14px !important;
            background: #ffffff !important;
          }
          @media print {
            @page {
              size: A5 portrait;
              margin: 4mm;
            }
            body {
              padding: 0;
            }
            .a5-receipt-container {
              width: 100% !important;
              max-width: 100% !important;
            }
          }
        </style>
      </head>
      <body>
        ${receiptRef.current.outerHTML}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 250);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };




  const ProductCard = ({ product }) => {
    const cartItem = cart.find(i => i.id === product.id);
    const qtyInCart = cartItem ? cartItem.qty : 0;
    const remainingStock = product.stock - qtyInCart;

    return (
      <div
        className={`product-card ${remainingStock <= 0 ? "out-of-stock" : ""}`}
        onClick={() => addToCart(product)}
      >
        <div className="product-card-cat" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{product.category?.toUpperCase()}</span>
          {product.shelfLocation && (
            <span 
              className="shelf-badge-billing" 
              title="Show shelf on map" 
              onClick={(e) => { e.stopPropagation(); setLocateProduct(product); }}
              style={{ background: "rgba(255, 255, 255, 0.15)", padding: "2px 5px", borderRadius: "3px", fontSize: "9px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "2px" }}
            >
              📍 {product.shelfLocation}
            </span>
          )}
        </div>
        <div className="product-card-name">{product.name}</div>
        <div className="product-card-bottom">
          <span className="product-card-price">₹{product.sellingPrice?.toLocaleString()}</span>
          {remainingStock <= 0 ? (
            <span className="out-badge" style={{ background: "#e74c3c", color: "#fff", padding: "2px 6px", borderRadius: "4px", fontSize: "10px" }}>OUT OF STOCK</span>
          ) : remainingStock <= 5 ? (
            <span className="stock-warning">{remainingStock} left</span>
          ) : (
            <span style={{ fontSize: "11px", color: "#888" }}>{remainingStock} left</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="vt-billing-container">
      {/* 2-Column Main Billing Layout */}
      <div className="vt-billing-grid">

        {/* LEFT COLUMN: Current Sale Card & Product Picker */}
        <div className="vt-card">
          {/* Solid Blue Header Bar */}
          <div className="vt-card-blue-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontWeight: "800", fontSize: "13px" }}>
                {isGstBill ? "🧾 GST TAX INVOICE" : "📑 Non-GST Retail Bill"}
              </span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: isGstBill ? "#ffffff" : "rgba(255,255,255,0.2)", color: isGstBill ? "#1e3a8a" : "#ffffff", padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "800", cursor: "pointer", border: isGstBill ? "1px solid #93c5fd" : "1px solid transparent", transition: "all 0.2s" }}>
                <input
                  type="checkbox"
                  checked={isGstBill}
                  onChange={e => setIsGstBill(e.target.checked)}
                  style={{ accentColor: "#2563eb", cursor: "pointer" }}
                />
                {isGstBill ? "✓ TAX INVOICE ENABLED" : "ENABLE TAX INVOICE (GST)"}
              </label>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                onClick={() => setShowShortageModal(true)}
                style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", borderRadius: "4px", padding: "3px 10px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}
                title="Log Customer Request / Shortage"
              >
                + Request Product
              </button>
              {editingSale && (
                <button 
                  onClick={() => { setEditingSale(null); setCart([]); }}
                  style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", padding: "3px 10px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </div>

          {/* Search Bar & Quick Actions Row */}
          <div className="vt-search-bar-row">
            <div ref={containerRef} className="vt-search-input-box">
              <span className="vt-search-icon">🔍</span>
              <input
                ref={quickAddInputRef}
                type="text"
                placeholder="Search product by name, code or scan barcode..."
                value={quickSearch}
                onChange={e => {
                  setQuickSearch(e.target.value);
                  setShowQuickSuggestions(true);
                  setActiveSuggestionIndex(0);
                }}
                onFocus={() => setShowQuickSuggestions(true)}
                onKeyDown={handleQuickSearchKeyDown}
              />
              {quickSearch.trim() && (
                <button
                  onClick={() => {
                    setQuickSearch("");
                    setShowQuickSuggestions(false);
                    if (quickAddInputRef.current) quickAddInputRef.current.focus();
                  }}
                  style={{ position: "absolute", right: "12px", background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: "14px" }}
                >
                  ✕
                </button>
              )}

              {/* Autocomplete Suggestions Dropdown */}
              {showQuickSuggestions && quickSearch.trim() && quickSuggestions.length > 0 && (
                <div 
                  ref={suggestionsContainerRef}
                  className="quick-add-suggestions-dropdown" 
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: "0",
                    right: "0",
                    zIndex: 2000,
                    background: "#fff",
                    border: "2px solid #2563eb",
                    borderRadius: "8px",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)",
                    maxHeight: "340px",
                    overflowY: "auto",
                    marginTop: "6px"
                  }}
                >
                  {quickSuggestions.map((suggestion, index) => {
                    const isCustom = suggestion.isCustomOption;
                    const isSelected = index === activeSuggestionIndex;
                    return (
                      <div
                        key={suggestion.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(suggestion);
                        }}
                        onClick={() => handleSelectSuggestion(suggestion)}
                        onMouseEnter={() => setActiveSuggestionIndex(index)}
                        style={{
                          padding: "10px 14px",
                          background: isSelected ? "#2563eb" : "#ffffff",
                          color: isSelected ? "#ffffff" : "#1e293b",
                          fontWeight: isSelected ? "800" : "normal",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          borderBottom: "1px solid #f1f5f9",
                          transition: "all 0.1s ease"
                        }}
                      >
                        <div>
                          {isCustom ? (
                            <span style={{ color: isSelected ? "#fef08a" : "#d97706", fontWeight: "bold" }}>{suggestion.name}</span>
                          ) : (
                            <span style={{ color: isSelected ? "#ffffff" : "#1e293b", fontWeight: isSelected ? "800" : "600" }}>{suggestion.name}</span>
                          )}
                          {!isCustom && suggestion.category && (
                            <span style={{ 
                              fontSize: "10px", 
                              color: isSelected ? "#ffffff" : "#64748b", 
                              marginLeft: "8px", 
                              background: isSelected ? "rgba(255, 255, 255, 0.25)" : "#f1f5f9", 
                              padding: "2px 6px", 
                              borderRadius: "4px",
                              fontWeight: "700"
                            }}>
                              {suggestion.category}
                            </span>
                          )}
                        </div>
                        {!isCustom && (
                          <div style={{ textAlign: "right", fontSize: "12px" }}>
                            <span style={{ color: isSelected ? "#ffffff" : "#2563eb", fontWeight: "900" }}>₹{suggestion.sellingPrice}</span>
                            <span style={{ color: isSelected ? "#86efac" : "#16a34a", marginLeft: "10px", fontWeight: "800" }}>
                              Available
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button className="vt-btn-barcode-scan" onClick={() => setShowScanner(true)}>
              📊 Scan Barcode
            </button>

            <button
              className="vt-btn-barcode-scan"
              style={{ background: "#2563eb", color: "#fff", borderColor: "#1d4ed8" }}
              onClick={() => setShowPhoneScanner(true)}
              title="Pair Smartphone Camera for Sticker OCR Scanning"
            >
              📱 Phone OCR Scanner
            </button>


            <div style={{ position: "relative" }}>
              <button 
                className="vt-btn-quick-add-blue"
                onClick={() => setShowQuickAddMenu(prev => !prev)}
              >
                + Quick Add ▾
              </button>

              {showQuickAddMenu && (
                <div style={{
                  position: "absolute",
                  right: "0",
                  top: "100%",
                  marginTop: "6px",
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  zIndex: 2100,
                  minWidth: "160px",
                  padding: "4px 0"
                }}>
                  <div 
                    onClick={() => { openBulkAdd(); setShowQuickAddMenu(false); }}
                    style={{ padding: "8px 14px", fontSize: "13px", color: "#334155", cursor: "pointer", fontWeight: "600" }}
                  >
                    📦 Smart Bulk Add
                  </div>
                  <div 
                    onClick={() => { openBulkEdit(); setShowQuickAddMenu(false); }}
                    style={{ padding: "8px 14px", fontSize: "13px", color: "#334155", cursor: "pointer", fontWeight: "600" }}
                  >
                    ✏️ Bulk Edit Cart
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cart Table Container */}
          <div className="vt-table-container">
            <div className="vt-cart-table-card">
              <table className="vt-cart-table">
                <thead>
                  <tr>
                    <th style={{ width: "32px", textAlign: "center" }}>#</th>
                    <th>PRODUCT NAME</th>
                    <th style={{ width: "80px" }}>CODE</th>
                    {isGstBill && <th style={{ width: "75px", textAlign: "center" }}>HSN</th>}
                    <th style={{ width: "80px", textAlign: "right" }}>RATE (₹)</th>
                    <th style={{ width: "80px", textAlign: "center" }}>QTY</th>
                    <th style={{ width: "60px" }}>UNIT</th>
                    <th style={{ width: "70px", textAlign: "right" }}>COMM (%)</th>
                    {isGstBill && <th style={{ width: "60px", textAlign: "center" }}>GST %</th>}
                    <th style={{ width: "100px", textAlign: "right" }}>AMOUNT (₹)</th>
                    <th style={{ width: "45px", textAlign: "center" }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={isGstBill ? 11 : 9} style={{ textAlign: "center", padding: "60px 16px", color: "#94a3b8" }}>
                        Cart is empty. Search product by name, code or scan barcode to add items.
                      </td>
                    </tr>
                  ) : (
                    cart.map((item, index) => {
                      const rowAmount = (parseFloat(item.sellingPrice) || 0) * (parseFloat(item.qty) || 0) * (1 + (parseFloat(item.commission) || 0) / 100);
                      return (
                        <tr key={item.id || index}>
                          <td style={{ textAlign: "center", fontWeight: "bold", color: "#64748b" }}>
                            {index + 1}
                          </td>
                          <td>
                            <div className="vt-product-name-bold">{item.name}</div>
                            <span className="vt-tag-hardware">{item.category || "Hardware"}</span>
                          </td>
                          <td style={{ color: "#64748b", fontSize: "12px" }}>
                            {item.productCode || "HRD-001"}
                          </td>
                          {isGstBill && (
                            <td style={{ textAlign: "center" }}>
                              <input 
                                id={`hsn-input-${index}`}
                                type="text" 
                                value={item.hsnCode || "8481"} 
                                onChange={e => updateHsn(item.id, e.target.value)}
                                onFocus={e => e.target.select()}
                                style={{ width: "65px", padding: "3px 4px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "11px", fontWeight: "700", textAlign: "center" }}
                              />
                            </td>
                          )}
                          <td style={{ textAlign: "right" }}>
                            <input 
                              id={`rate-input-${index}`}
                              type="number" 
                              min="0" 
                              step="any"
                              value={item.sellingPrice} 
                              onChange={e => updatePrice(item.id, e.target.value)}
                              onFocus={e => e.target.select()}
                              onKeyDown={e => {
                                if (e.key === "Delete") {
                                  e.preventDefault();
                                  handleDeleteRowWithFocus(item.id, index);
                                } else if (e.key === "Backspace" && (e.target.value === "" || String(e.target.value).trim() === "")) {
                                  e.preventDefault();
                                  focusBackwardCell(index, "rate");
                                } else if (e.key === "Enter" || e.key === "Tab") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusBackwardCell(index, "rate");
                                  } else {
                                    const qtyInput = document.getElementById(`qty-input-${index}`);
                                    if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
                                  }
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  const nextRate = document.getElementById(`rate-input-${index + 1}`);
                                  if (nextRate) { nextRate.focus(); nextRate.select(); }
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  if (index > 0) {
                                    const prevRate = document.getElementById(`rate-input-${index - 1}`);
                                    if (prevRate) { prevRate.focus(); prevRate.select(); }
                                  } else if (quickAddInputRef.current) {
                                    quickAddInputRef.current.focus();
                                  }
                                }
                              }}
                              style={{ width: "65px", padding: "3px 6px", border: "1.5px solid #64748b", borderRadius: "4px", textAlign: "right", fontSize: "12px", fontWeight: "700", color: "#2563eb" }} 
                            />
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div className="vt-qty-stepper">
                              <button onClick={() => updateQty(item.id, -1)}>−</button>
                              <input 
                                id={`qty-input-${index}`}
                                type="text"
                                value={item.qty} 
                                onChange={e => setQtyExact(item.id, e.target.value)}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => {
                                  if (e.key === "Delete") {
                                    e.preventDefault();
                                    handleDeleteRowWithFocus(item.id, index);
                                  } else if (e.key === "Backspace" && (e.target.value === "" || String(e.target.value).trim() === "")) {
                                    e.preventDefault();
                                    focusBackwardCell(index, "qty");
                                  } else if (e.key === "Enter" || e.key === "Tab") {
                                    e.preventDefault();
                                    if (e.shiftKey) {
                                      focusBackwardCell(index, "qty");
                                    } else {
                                      const unitInput = document.getElementById(`unit-input-${index}`);
                                      if (unitInput) unitInput.focus();
                                    }
                                  } else if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    const nextQty = document.getElementById(`qty-input-${index + 1}`);
                                    if (nextQty) { nextQty.focus(); nextQty.select(); }
                                  } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    if (index > 0) {
                                      const prevQty = document.getElementById(`qty-input-${index - 1}`);
                                      if (prevQty) { prevQty.focus(); prevQty.select(); }
                                    }
                                  }
                                }}
                              />
                              <button onClick={() => updateQty(item.id, 1)}>+</button>
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <select
                              id={`unit-input-${index}`}
                              value={item.unit || "NOS"}
                              onChange={e => updateUnit(item.id, e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Delete") {
                                  e.preventDefault();
                                  handleDeleteRowWithFocus(item.id, index);
                                } else if (e.key === "Backspace") {
                                  e.preventDefault();
                                  focusBackwardCell(index, "unit");
                                } else if (e.key === "Enter" || e.key === "Tab") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusBackwardCell(index, "unit");
                                  } else {
                                    const commInput = document.getElementById(`comm-input-${index}`);
                                    if (commInput) { commInput.focus(); commInput.select(); }
                                  }
                                } else if (e.key === "ArrowDown" && !e.altKey) {
                                  e.preventDefault();
                                  const nextUnit = document.getElementById(`unit-input-${index + 1}`);
                                  if (nextUnit) nextUnit.focus();
                                } else if (e.key === "ArrowUp" && !e.altKey) {
                                  e.preventDefault();
                                  if (index > 0) {
                                    const prevUnit = document.getElementById(`unit-input-${index - 1}`);
                                    if (prevUnit) prevUnit.focus();
                                  }
                                }
                              }}
                              style={{ width: "55px", padding: "3px 4px", border: "1px solid #cbd5e1", borderRadius: "4px", fontSize: "11px", fontWeight: "700", color: "#1e293b" }}
                            >
                              <option value="NOS">NOS</option>
                              <option value="PCS">PCS</option>
                              <option value="KG">KG</option>
                              <option value="MTR">MTR</option>
                              <option value="SET">SET</option>
                              <option value="BOX">BOX</option>
                              <option value="PKT">PKT</option>
                            </select>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <input 
                              id={`comm-input-${index}`}
                              type="number" 
                              min="0" 
                              max="100"
                              value={item.commission !== undefined ? item.commission : 0} 
                              onChange={e => handleRowCommissionChange(index, e.target.value)}
                              onFocus={e => e.target.select()}
                              onKeyDown={e => {
                                if (e.key === "Delete") {
                                  e.preventDefault();
                                  handleDeleteRowWithFocus(item.id, index);
                                } else if (e.key === "Backspace" && (e.target.value === "" || String(e.target.value).trim() === "")) {
                                  e.preventDefault();
                                  focusBackwardCell(index, "comm");
                                } else if (e.key === "Enter" || e.key === "Tab") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusBackwardCell(index, "comm");
                                  } else {
                                    if (index < cart.length - 1) {
                                      const nextRate = document.getElementById(`rate-input-${index + 1}`);
                                      if (nextRate) { nextRate.focus(); nextRate.select(); }
                                    } else if (quickAddInputRef.current) {
                                      quickAddInputRef.current.focus();
                                    }
                                  }
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  const nextComm = document.getElementById(`comm-input-${index + 1}`);
                                  if (nextComm) { nextComm.focus(); nextComm.select(); }
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  if (index > 0) {
                                    const prevComm = document.getElementById(`comm-input-${index - 1}`);
                                    if (prevComm) { prevComm.focus(); prevComm.select(); }
                                  }
                                }
                              }}
                              style={{ width: "45px", padding: "3px 6px", border: "1px solid #cbd5e1", borderRadius: "4px", textAlign: "right", fontSize: "12px" }} 
                            />
                          </td>
                          {isGstBill && (
                            <td style={{ textAlign: "center", fontSize: "11px", fontWeight: "800", color: "#1d4ed8" }}>
                              {parseFloat(item.gstRate) || 18}%
                            </td>
                          )}
                          <td style={{ textAlign: "right" }}>
                            <span className="vt-amount-blue">
                              ₹{rowAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <button className="vt-btn-delete-row" onClick={() => removeFromCart(item.id)} title="Delete row">
                              🗑
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Left Footer Toolbar */}
          <div className="vt-left-card-footer">
            <div className="vt-left-actions">
              <button 
                className="vt-btn-clear-cart-red"
                onClick={() => {
                  if (window.confirm("Are you sure you want to clear all items in the cart?")) {
                    setCart([]);
                    setDiscount(0);
                    setCommissionPct(0);
                  }
                }}
              >
                🗑 Clear Cart
              </button>
              <button 
                className="vt-btn-hold-sale-gray"
                onClick={() => {
                  if (cart.length === 0) return alert("Cart is empty!");
                  setHeldSales(prev => [...prev, { date: new Date().toISOString(), cart, total }]);
                  setCart([]);
                  alert("Sale placed on hold!");
                }}
              >
                ⏸ Hold Sale
              </button>
            </div>

            <div className="vt-totals-summary-text">
              <span>Total Items: <strong>{cart.length}</strong></span>
              <span>Total Amount: <strong>₹{rawSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Bill Summary Card */}
        <div className="vt-card">
          {/* Solid Blue Header Bar */}
          <div className="vt-card-blue-header">
            <span>{isGstBill ? "Bill Summary (GST)" : "Bill Summary (Non-GST)"}</span>
          </div>

          {/* Bill Summary Body */}
          <div className="vt-summary-body">
            <div className="vt-summary-row">
              <span>Subtotal ({cart.length} Items)</span>
              <span style={{ fontWeight: "700" }}>₹{rawSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>

            {/* Discount Row */}
            <div className="vt-summary-row" style={{ fontSize: "13px" }}>
              <span>Discount (₹)</span>
              <input
                type="number"
                value={discount}
                onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                min="0"
                style={{ width: "90px", padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", textAlign: "right", fontSize: "12px", fontWeight: "700" }}
              />
            </div>

            {/* Commission % Row */}
            <div className="vt-summary-row" style={{ fontSize: "13px" }}>
              <span>Commission %</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number"
                  value={commissionPct}
                  onChange={e => handleGlobalCommissionChange(e.target.value)}
                  min="0"
                  max="100"
                  style={{ width: "55px", padding: "4px 6px", border: "1px solid #cbd5e1", borderRadius: "4px", textAlign: "right", fontSize: "12px", fontWeight: "700" }}
                />
                {commissionPct > 0 && (
                  <span style={{ fontSize: '11px', color: '#059669', fontWeight: 'bold' }}>
                    (+₹{commissionAmt.toFixed(2)})
                  </span>
                )}
              </div>
            </div>

            {/* Tax / GST Breakdown */}
            {isGstBill && (
              <div style={{ background: "#eff6ff", padding: "8px 10px", borderRadius: "6px", border: "1px solid #bfdbfe", display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#1e40af" }}>
                  <span>CGST (9%)</span>
                  <span>+₹{(totalGst / 2).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "#1e40af" }}>
                  <span>SGST (9%)</span>
                  <span>+₹{(totalGst / 2).toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "800", color: "#1d4ed8", borderTop: "1px dashed #93c5fd", paddingTop: "4px" }}>
                  <span>Total GST</span>
                  <span>+₹{totalGst.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Estimated Profit */}
            {profit > 0 && (
              <div className="vt-summary-row" style={{ color: "#059669", fontWeight: "700", fontSize: "12px" }}>
                <span>ESTIMATED PROFIT</span>
                <span>₹{profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}

            {/* Grand Total Row */}
            <div className="vt-grand-total-row" style={{ borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
              <span className="vt-grand-total-label">Grand Total</span>
              <span className="vt-grand-total-val">
                ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {/* Payment Mode Selector */}
            <div>
              <div className="vt-section-label">Payment Mode</div>
              <div className="vt-payment-mode-grid">
                <button
                  className={`vt-pay-btn ${paymentMethod === "CASH" ? "active-cash" : "inactive"}`}
                  onClick={() => setPaymentMethod("CASH")}
                >
                  💵 Cash
                </button>
                <button
                  className={`vt-pay-btn ${paymentMethod === "UPI" ? "active-cash" : "inactive"}`}
                  onClick={() => setPaymentMethod("UPI")}
                >
                  ⚡ UPI
                </button>
                <button
                  className={`vt-pay-btn ${paymentMethod === "CREDIT" ? "active-cash" : "inactive"}`}
                  onClick={() => setPaymentMethod("CREDIT")}
                >
                  💳 Credit
                </button>
              </div>
            </div>

            {/* Dynamic UPI QR Preview inside summary when UPI selected */}
            {paymentMethod === "UPI" && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px", padding: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`upi://pay?pa=vijayapathitraders@okaxis&pn=Vijayapathi%20Traders&am=${Math.round(total)}&cu=INR&tn=POS-Bill`)}`} 
                  alt="UPI QR Code" 
                  style={{ border: "2px solid #fff", borderRadius: "4px", width: "60px", height: "60px" }} 
                />
                <div style={{ fontSize: "11px", color: "#166534" }}>
                  <strong>⚡ Scan UPI QR</strong><br />
                  <span>Scan to pay <strong>₹{Math.round(total).toLocaleString()}</strong></span>
                </div>
              </div>
            )}

            {/* Received Amount Input */}
            <div>
              <div className="vt-section-label">Received Amount</div>
              <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #cbd5e1", borderRadius: "6px", background: "#ffffff", padding: "0 10px", marginTop: "2px" }}>
                <span style={{ fontSize: "14px", fontWeight: "800", color: "#2563eb", marginRight: "6px" }}>₹</span>
                <input
                  id="received-amount-input"
                  type="number"
                  min="0"
                  step="any"
                  className="vt-input-box"
                  value={receivedAmount}
                  onChange={e => setReceivedAmount(e.target.value)}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const completeBtn = document.getElementById("complete-sale-btn");
                      if (completeBtn) completeBtn.focus();
                    } else if (e.key === "Backspace" && (e.target.value === "" || e.target.value === "0")) {
                      e.preventDefault();
                      if (quickAddInputRef.current) quickAddInputRef.current.focus();
                    }
                  }}
                  placeholder="0.00"
                  style={{ border: "none", outline: "none", width: "100%", padding: "8px 0", fontSize: "14px", fontWeight: "700", background: "transparent" }}
                />
              </div>

              {/* Instant Change / Return Balance Indicator */}
              {receivedAmount !== "" && !isNaN(parseFloat(receivedAmount)) && (
                <div style={{
                  display: "flex",
                  justify: "space-between",
                  alignItems: "center",
                  fontSize: "12px",
                  marginTop: "6px",
                  padding: "5px 10px",
                  borderRadius: "6px",
                  background: parseFloat(receivedAmount) >= total ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${parseFloat(receivedAmount) >= total ? "#bbf7d0" : "#fecaca"}`
                }}>
                  <span style={{ fontWeight: "700", color: parseFloat(receivedAmount) >= total ? "#166534" : "#991b1b" }}>
                    {parseFloat(receivedAmount) >= total ? "💵 Change to Return:" : "⚠️ Balance Due:"}
                  </span>
                  <span style={{ fontWeight: "800", fontSize: "13px", color: parseFloat(receivedAmount) >= total ? "#15803d" : "#dc2626" }}>
                    ₹{Math.abs(parseFloat(receivedAmount) - total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            {/* Customer (Optional) Input */}
            <div>
              <div className="vt-section-label">Customer (Optional)</div>
              <div className="vt-customer-row">
                <input
                  type="text"
                  className="vt-input-box"
                  placeholder="Enter customer name..."
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                />
                <button 
                  className="vt-btn-user-add"
                  onClick={() => setShowCustomerDetails(prev => !prev)}
                  title="Toggle additional customer & agent details"
                >
                  👤+
                </button>
              </div>
            </div>

            {/* Expandable Extra Details (Phone, Site, Agent, Tax Invoice toggle) */}
            {showCustomerDetails && (
              <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>CUSTOMER PHONE</label>
                  <input
                    type="text"
                    className="vt-input-box"
                    placeholder="Mobile number"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    style={{ marginTop: "3px" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>PROJECT SITE</label>
                  <input
                    type="text"
                    className="vt-input-box"
                    placeholder="Site / Delivery address"
                    value={siteName}
                    onChange={e => setSiteName(e.target.value)}
                    style={{ marginTop: "3px" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>REFERRER / AGENT</label>
                  <select
                    className="vt-input-box"
                    value={referrerId}
                    onChange={e => {
                      setReferrerId(e.target.value);
                      if (e.target.value && commissionPct === 0) setCommissionPct(5);
                    }}
                    style={{ marginTop: "3px" }}
                  >
                    <option value="">-- No Referrer --</option>
                    {referrers.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.designation})</option>
                    ))}
                  </select>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: "700", cursor: "pointer", color: "#1e293b", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={isGstBill}
                    onChange={e => setIsGstBill(e.target.checked)}
                  />
                  TAX INVOICE (GST)
                </label>
              </div>
            )}

            {/* Divider Track before footer buttons */}
            <div style={{ marginTop: "auto", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }} />
          </div>

          {/* Right Card Bottom Action Buttons */}
          <div className="vt-summary-actions">
            <button className="vt-btn-preview-sq" onClick={() => setShowBillPreview(true)}>
              <span style={{ fontSize: "14px" }}>🔍</span>
              <span>PREVIEW</span>
            </button>

            <button 
              id="complete-sale-btn"
              className="vt-btn-complete-sale-green"
              onClick={handleCheckout}
              disabled={loading || cart.length === 0}
            >
              ✓ Complete Sale
            </button>
          </div>
        </div>
      </div>

      {/* Footer Status Bar */}
      <div className="vt-status-bar">
        <div>Cashier: Admin | Session: SESS-0001</div>
        <div>{currentTime}</div>
      </div>


      {/* Confirmation Modal before completing sale */}
      {showCheckoutConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowCheckoutConfirmModal(false)}>
          <div className="modal-content" style={{ maxWidth: "440px", width: "90vw", borderRadius: "12px", padding: "20px" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#059669" }} />
            
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: "38px", marginBottom: "6px" }}>🛍️</div>
              <h2 style={{ margin: "0 0 6px 0", fontSize: "19px", fontWeight: "900", color: "#1e293b" }}>
                Confirm Sale Completion
              </h2>
              <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                Are you sure you want to finalize this sale and issue receipt?
              </p>
            </div>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 14px", margin: "14px 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Total Billed Items:</span>
                <strong style={{ color: "#1e293b" }}>{cart.length} items</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Payment Mode:</span>
                <strong style={{ color: "#2563eb", textTransform: "uppercase" }}>{paymentMethod}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
                <span style={{ fontWeight: "800", color: "#1e293b" }}>Grand Total:</span>
                <strong style={{ fontSize: "18px", color: "#2563eb", fontWeight: "900" }}>
                  ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
              {receivedAmount !== "" && !isNaN(parseFloat(receivedAmount)) && (
                <div style={{ display: "flex", justifyContent: "space-between", color: parseFloat(receivedAmount) >= total ? "#15803d" : "#dc2626", fontWeight: "700" }}>
                  <span>{parseFloat(receivedAmount) >= total ? "Change to Return:" : "Balance Due:"}</span>
                  <span>₹{Math.abs(parseFloat(receivedAmount) - total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "10px", marginTop: "10px" }}>
              <button 
                id="cancel-checkout-btn"
                className="btn-secondary" 
                onClick={() => setShowCheckoutConfirmModal(false)}
                style={{ padding: "10px", fontSize: "13px", fontWeight: "700", border: "1px solid #cbd5e1", background: "#e5e7eb", cursor: "pointer", borderRadius: "6px" }}
              >
                ✕ Cancel
              </button>
              <button 
                id="confirm-checkout-btn"
                onClick={executeCheckout}
                disabled={loading}
                style={{ background: "#059669", color: "#fff", border: "none", borderRadius: "6px", padding: "10px", fontSize: "13px", fontWeight: "800", cursor: "pointer" }}
              >
                {loading ? "Processing..." : "✓ Yes, Complete Sale"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Checkout Bill Preview Modal */}
      {showBillPreview && (
        <div className="modal-overlay" onClick={() => setShowBillPreview(false)}>
          <div className="modal-content" style={{ maxWidth: "650px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#2563eb" }} />
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
              <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "900", color: "#1c1917" }}>
                🔍 Voucher Draft Preview
              </h2>
              <button 
                className="btn-secondary" 
                style={{ padding: "4px 8px", fontSize: "11px" }} 
                onClick={() => setShowBillPreview(false)}
              >
                Close Preview
              </button>
            </div>

            {/* Rendered receipt preview */}
            <div style={{ padding: "10px", background: "#fff", maxHeight: "420px", overflowY: "auto", marginBottom: "15px" }}>
              <ReceiptTemplate ref={receiptRef} sale={previewSaleResult} isDraft={true} />
            </div>

            <div className="modal-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button className="btn-print" onClick={handlePrint}>🖨️ PRINT BILL</button>
              <button className="btn-whatsapp" onClick={() => handleWhatsApp(previewSaleResult)}>💬 WHATSAPP BILL</button>
              <button className="btn-print" style={{ background: "#e74c3c" }} onClick={handleDownloadPDF} disabled={loading}>
                {loading ? "⌛..." : "📥 PDF BILL"}
              </button>
              <button className="btn-new-sale" onClick={() => setShowBillPreview(false)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Completed Modal */}
      {saleResult && (
        <div className="modal-overlay" onClick={() => { setSaleResult(null); setCustomerName(""); setCustomerPhone(""); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" />
            <div className="sale-completed-label">SALE COMPLETED</div>
            <div className="sale-total">₹{saleResult.roundedTotal?.toLocaleString()}</div>
            <div className="sale-meta">{saleResult.items?.length} items · {saleResult.paymentMethod}</div>
            <div className="sale-meta" style={{marginTop: '4px'}}>Subtotal: ₹{(saleResult.subtotal || saleResult.total)?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            {saleResult.isGstBill && (
              <div className="sale-meta">Total GST: +₹{saleResult.totalGst?.toFixed(2)}</div>
            )}
            {saleResult.roundOff !== 0 && (
              <div className="sale-meta">Round Off: {saleResult.roundOff > 0 ? "+" : ""}₹{saleResult.roundOff.toFixed(2)}</div>
            )}
            {saleResult.customerName && (
              <div className="sale-meta">Customer: {saleResult.customerName}</div>
            )}

            {saleResult.paymentMethod === "UPI" && (
              <div className="upi-payment-box" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(120, 113, 108, 0.15)", borderRadius: "8px", padding: "12px", margin: "15px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: "bold", color: "#00c9a7", letterSpacing: "1px" }}>⚡ DYNAMIC UPI QR TERMINAL</span>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`upi://pay?pa=vijayapathitraders@okaxis&pn=Vijayapathi%20Traders&am=${saleResult.roundedTotal || saleResult.total}&cu=INR&tn=Bill-${saleResult.date}`)}`} 
                  alt="UPI QR Code" 
                  style={{ border: "4px solid #fff", borderRadius: "6px", width: "160px", height: "160px" }} 
                />
                <span style={{ fontSize: "10px", color: "#888", textAlign: "center" }}>Scan to pay <strong>₹{(saleResult.roundedTotal || saleResult.total).toLocaleString()}</strong> to Vijayapathi Traders</span>
              </div>
            )}

            <div className="sale-items">
              {saleResult.items?.map((item, i) => (
                <div key={i} className="sale-item-row">
                  <span>{item.qty} {item.unit || "Nos"} × {item.name}</span>
                  <span>₹{(item.sellingPrice * item.qty).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>

            {/* Hidden receipt for printing & PDF */}
            <div style={{ position: "fixed", left: "0", top: "0", width: "148mm", opacity: "0.01", pointerEvents: "none", zIndex: -9999 }}>
              <ReceiptTemplate ref={receiptRef} sale={saleResult} isDraft={false} />
            </div>

            <div className="modal-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button className="btn-print" onClick={handlePrint}>🖨️ PRINT</button>
              <button className="btn-whatsapp" onClick={() => handleWhatsApp()}>💬 WHATSAPP</button>
              <button className="btn-print" style={{ background: "#e74c3c" }} onClick={handleDownloadPDF} disabled={loading}>
                {loading ? "⌛..." : "📥 PDF"}
              </button>
              <button className="btn-new-sale" onClick={() => setSaleResult(null)}>DONE</button>
            </div>
          </div>
        </div>
      )}
      {/* Payment Gateway Modal */}
      {showPaymentGateway && (
        <div className="modal-overlay" onClick={() => setShowPaymentGateway(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "550px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#2563eb" }} />
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: "#1c1917" }}>
                💳 POS Payment Gateway
              </h2>
              <button 
                className="btn-secondary" 
                style={{ padding: "4px 8px", fontSize: "11px" }} 
                onClick={() => setShowPaymentGateway(false)}
              >
                Back to Cart
              </button>
            </div>

            {/* Bill Calculations & Details */}
            <div className="payment-summary-box" style={{ borderRadius: "8px", padding: "16px", marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: "bold", color: "#888", letterSpacing: "1px", marginBottom: "12px" }}>
                BILLING SUMMARY ({cart.length} ITEMS)
              </div>
              
              <div className="cart-totals" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div className="cart-row">
                  <span>Subtotal</span>
                  <strong>₹{rawSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>

                <div className="cart-row">
                  <span>Discount (₹)</span>
                  <input
                    type="number"
                    className="discount-input"
                    value={discount}
                    onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                    min="0"
                    style={{ width: "110px", padding: "4px 8px", border: "1px solid #ccc", borderRadius: "4px" }}
                  />
                </div>

                <div className="cart-row">
                  <span>Commission %</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="number"
                      className="discount-input"
                      value={commissionPct}
                      onChange={e => handleGlobalCommissionChange(e.target.value)}
                      min="0"
                      max="100"
                      style={{ width: '65px', padding: '4px 8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    {commissionPct > 0 && (
                      <span style={{ fontSize: '12px', color: '#00c9a7', fontWeight: 'bold' }}>
                        (+₹{commissionAmt.toFixed(2)})
                      </span>
                    )}
                  </div>
                </div>

                <div className="cart-row" style={{ paddingTop: "8px", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}>
                    <input 
                      type="checkbox" 
                      checked={isGstBill} 
                      onChange={e => setIsGstBill(e.target.checked)} 
                      style={{ transform: 'scale(1.1)' }} 
                    />
                    Enable Tax Invoice (GST)
                  </label>
                </div>

                {isGstBill && (
                  <>
                    <div className="cart-row" style={{ color: '#555', fontSize: '12px', paddingLeft: "10px" }}>
                      <span>CGST (9%)</span>
                      <span>+₹{(totalGst / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="cart-row" style={{ color: '#555', fontSize: '12px', paddingLeft: "10px" }}>
                      <span>SGST (9%)</span>
                      <span>+₹{(totalGst / 2).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="cart-row" style={{ color: '#00c9a7', fontWeight: 'bold', paddingLeft: "10px" }}>
                      <span>Total GST</span>
                      <span>+₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}

                {profit > 0 && (
                  <div className="cart-row profit-row" style={{ color: "#00c9a7", fontWeight: "bold" }}>
                    <span>ESTIMATED PROFIT</span>
                    <span>₹{profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div className="cart-row total-row" style={{ borderTop: "2px solid #eaeaea", paddingTop: "12px", marginTop: "4px" }}>
                  <span style={{ fontSize: "16px", fontWeight: "bold" }}>Grand Total</span>
                  <span style={{ fontSize: "24px", fontWeight: "900", color: "#2563eb" }}>
                    ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "11px", fontWeight: "bold", color: "#888", letterSpacing: "1px", marginBottom: "10px" }}>
                SELECT PAYMENT MODE
              </div>
              <div className="payment-tabs" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                <button
                  className={`pay-tab ${paymentMethod === "CASH" ? "active" : ""}`}
                  onClick={() => setPaymentMethod("CASH")}
                  style={{ height: "42px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  💵 CASH
                </button>
                <button
                  className={`pay-tab ${paymentMethod === "UPI" ? "active" : ""}`}
                  onClick={() => setPaymentMethod("UPI")}
                  style={{ height: "42px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  ⚡ UPI QR
                </button>
                <button
                  className={`pay-tab ${paymentMethod === "CREDIT" ? "active" : ""}`}
                  onClick={() => setPaymentMethod("CREDIT")}
                  style={{ height: "42px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  📓 CREDIT BOOK
                </button>
              </div>
            </div>

            {/* Dynamic UPI QR Code */}
            {paymentMethod === "UPI" && (
              <div style={{ background: "rgba(37, 99, 235, 0.03)", border: "1px solid rgba(37, 99, 235, 0.1)", borderRadius: "8px", padding: "12px", marginBottom: "20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: "bold", color: "#2563eb", letterSpacing: "0.5px" }}>⚡ SCAN UPI TO PAY</span>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`upi://pay?pa=vijayapathitraders@okaxis&pn=Vijayapathi%20Traders&am=${Math.round(total)}&cu=INR&tn=POS-Bill`)}`} 
                  alt="UPI QR Code" 
                  style={{ border: "3px solid #fff", borderRadius: "6px", width: "130px", height: "130px" }} 
                />
                <span style={{ fontSize: "10px", color: "#666" }}>Scan to pay <strong>₹{Math.round(total).toLocaleString()}</strong></span>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
              <button
                className="checkout-btn"
                onClick={handleCheckout}
                disabled={loading}
                style={{ background: editingSale ? '#3498db' : '#2563eb', width: '100%', height: '48px', fontSize: '15px', fontWeight: 'bold' }}
              >
                {loading ? "PROCESSING..." : editingSale ? "💾 UPDATE SALES VOUCHER" : "🚀 COMPLETE SALES VOUCHER"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Cart View Modal */}
      {showFullCart && (
        <div className="modal-overlay" onClick={() => setShowFullCart(false)}>
          <div className="modal-content" style={{ maxWidth: '900px', width: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2>Billed Items ({cart.length})</h2>
              <button className="btn-secondary" onClick={() => setShowFullCart(false)}>CLOSE</button>
            </div>
            
            <table className="data-table tally-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th>Rate (₹)</th>
                  <th>Qty</th>
                  <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>Cart is empty</td>
                  </tr>
                ) : (
                  cart.map((item, idx) => (
                    <tr key={item.id}>
                      <td>{idx + 1}</td>
                      <td>{item.name}</td>
                      <td>{item.category}</td>
                      <td>
                        <input 
                          type="number" min="0" 
                          style={{width: '80px', padding: '4px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px'}} 
                          value={item.sellingPrice} 
                          onChange={e => updatePrice(item.id, e.target.value)} 
                        />
                      </td>
                      <td>
                        <div style={{display: 'flex', alignItems: 'center'}}>
                          <button className="qty-btn" onClick={() => updateQty(item.id, -1)}>−</button>
                          <input 
                            type="number" 
                            min="0"
                            step="any"
                            style={{width: '55px', textAlign: 'center', padding: '4px', fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px', margin: '0 4px'}}
                            value={item.qty}
                            onChange={(e) => setQtyExact(item.id, e.target.value)}
                            onBlur={(e) => {
                              const v = parseFloat(e.target.value);
                              if (isNaN(v) || v <= 0) {
                                 removeFromCart(item.id);
                              }
                            }}
                          />
                          <span style={{fontSize: "12px", color: "#888", minWidth: '30px'}}>{item.unit || "Nos"}</span>
                          <button className="qty-btn" onClick={() => updateQty(item.id, 1)}>+</button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        ₹{((parseFloat(item.sellingPrice) || 0) * (parseFloat(item.qty) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            
            <div style={{ marginTop: '20px', textAlign: 'right', fontSize: '18px', fontWeight: 'bold' }}>
              Subtotal: ₹{rawSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}
      {showScanner && (
        <BarcodeScannerModal 
          onClose={() => setShowScanner(false)} 
          onScan={handleBarcodeScan} 
        />
      )}

      {/* Shop Map Locator Modal */}
      {locateProduct && (
        <div className="modal-overlay" onClick={() => { setLocateProduct(null); setLocatorTab("map"); }}>
          <div className="modal-content form-modal" style={{ maxWidth: "600px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#2563eb" }}></div>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📍 Shelf Locator: {locateProduct.shelfLocation || getHighlightZone(locateProduct)}</span>
              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => { setLocateProduct(null); setLocatorTab("map"); }}>Close</button>
            </h2>

            <div style={{ padding: "10px 0", textAlign: "center" }}>
              <strong style={{ fontSize: "16px", color: "#fff" }}>{locateProduct.name}</strong>
              <div style={{ color: "#aaa", fontSize: "13px", marginTop: "4px" }}>
                Code: {locateProduct.productCode || "-"} | Category: {locateProduct.category}
              </div>
            </div>

            {/* Locator Tab Switcher inside Modal */}
            <div className="inventory-filters" style={{ background: "none", border: "none", padding: 0, margin: "5px 0 15px 0" }}>
              <div className="category-tabs" style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                <button 
                  className={`cat-tab ${locatorTab === "map" ? "active" : ""}`} 
                  onClick={() => setLocatorTab("map")}
                  style={{ flex: 1, padding: "8px 12px", fontSize: "12px", fontWeight: "bold" }}
                >
                  🗺️ 2D FLOOR BLUEPRINT
                </button>
                <button 
                  className={`cat-tab ${locatorTab === "shelf" ? "active" : ""}`} 
                  onClick={() => setLocatorTab("shelf")}
                  style={{ flex: 1, padding: "8px 12px", fontSize: "12px", fontWeight: "bold" }}
                >
                  🎥 360° VIRTUAL SHELF
                </button>
              </div>
            </div>

            {locatorTab === "map" ? (
              <ShopMap highlightZone={getHighlightZone(locateProduct)} />
            ) : (
              <Shelf360Viewer 
                highlightZone={getHighlightZone(locateProduct)} 
                products={products} 
                addToCart={addToCart} 
              />
            )}

            <div className="modal-btns" style={{ marginTop: "20px" }}>
              <button className="btn-secondary" style={{ width: "100%" }} onClick={() => { setLocateProduct(null); setLocatorTab("map"); }}>Got It</button>
            </div>
          </div>
        </div>
      )}
      {/* Shortage Book Quick Entry Modal */}
      {showShortageModal && (
        <div className="modal-overlay" onClick={() => setShowShortageModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "450px" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#8e44ad" }} />
            <h2>📝 Log Customer Request / Shortage</h2>

            <div className="form-group" style={{ marginTop: "15px" }}>
              <label>Product Request Type</label>
              <div className="payment-tabs" style={{ display: "flex", gap: "5px" }}>
                <button
                  type="button"
                  className={`pay-tab ${shortageIsNewProduct ? "active" : ""}`}
                  onClick={() => setShortageIsNewProduct(true)}
                  style={{ flex: 1, padding: '6px', fontSize: '11px', border: '1.5px solid #8e44ad', background: shortageIsNewProduct ? '#8e44ad' : 'transparent', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                >✨ NEW PRODUCT</button>
                <button
                  type="button"
                  className={`pay-tab ${!shortageIsNewProduct ? "active" : ""}`}
                  onClick={() => setShortageIsNewProduct(false)}
                  style={{ flex: 1, padding: '6px', fontSize: '11px', border: '1.5px solid #8e44ad', background: !shortageIsNewProduct ? '#8e44ad' : 'transparent', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                >📦 STOCKOUT PRODUCT</button>
              </div>
            </div>

            {shortageIsNewProduct ? (
              <div className="form-group">
                <label>Product Name / Brand Description *</label>
                <input 
                  value={shortageItemName} 
                  onChange={e => setShortageItemName(e.target.value)} 
                  placeholder="e.g. Ashirvad CPVC Pipe 1.25 inch" 
                />
              </div>
            ) : (
              <div className="form-group">
                <label>Select Stockout Product *</label>
                <SearchableSelect
                  options={shortageProductOptions}
                  value={shortageSelectedProductId}
                  onChange={setShortageSelectedProductId}
                  placeholder="Choose product..."
                  accentColor="#8e44ad"
                />
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className="form-group">
                <label>Qty Requested</label>
                <input 
                  type="number" 
                  min="1" 
                  value={shortageQty} 
                  onChange={e => setShortageQty(e.target.value)} 
                />
              </div>
              <div className="form-group">
                <label>Customer Name</label>
                <input 
                  value={shortageCustomerName} 
                  onChange={e => setShortageCustomerName(e.target.value)} 
                  placeholder="Customer Name"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Customer Phone (WhatsApp)</label>
              <input 
                value={shortageCustomerPhone} 
                onChange={e => setShortageCustomerPhone(e.target.value)} 
                placeholder="+919876543210"
              />
            </div>

            <div className="form-group">
              <label>Quoted Price / Special Notes</label>
              <input 
                value={shortageNotes} 
                onChange={e => setShortageNotes(e.target.value)} 
                placeholder="e.g. Quoted ₹180/pc. Needs by Friday"
              />
            </div>

            <div className="modal-btns" style={{ marginTop: "20px" }}>
              <button className="btn-secondary" onClick={() => setShowShortageModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveShortage} style={{ background: "#8e44ad" }}>Save Request</button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Bulk Add Modal */}
      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "95vw", width: "1200px" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#1c1917" }}></div>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {isEditingBulk ? "📝 Edit Billing Items" : "🚀 Smart Bulk Add to POS Billing"}
              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => setShowBulkModal(false)}>Close</button>
            </h2>
            
            {!isEditingBulk && (
              <>
                <div className="bulk-help-box">
                  <strong>💡 Pro Tip:</strong>
                  You can copy-paste multiple rows from <strong>Excel</strong> or <strong>Tally</strong>.
                  One item per line. Column order: <code>Product Name [Tab] Qty [Tab] Rate</code>. Or type simply: <code>cpvc pipe 2</code> (separates name and quantity)!
                </div>

                <textarea 
                  className="bulk-textarea"
                  placeholder="Paste billing items here...&#10;Example:&#10;Angle Grinder 4&quot;&#10;PVC Pipe 20mm	10	120&#10;cpvc pipe 32mm 5"
                  value={bulkInput}
                  onChange={e => setBulkInput(e.target.value)}
                  onBlur={handleBulkParse}
                />
              </>
            )}

            {bulkItems.length > 0 && (
              <div className="bulk-preview-container">
                <table className="bulk-preview-table">
                  <thead>
                    <tr>
                      <th style={{ width: "120px" }}>STATUS</th>
                      <th style={{ minWidth: "250px" }}>PRODUCT NAME (INVENTORY LOOKUP)</th>
                      <th style={{ width: "100px" }}>QTY</th>
                      <th style={{ width: "120px" }}>RATE (₹)</th>
                      <th style={{ width: "120px" }}>TOTAL (₹)</th>
                      <th style={{ width: "100px" }}>GST %</th>
                      <th style={{ width: "100px" }}>UNIT</th>
                      <th style={{ width: "50px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkItems.map((item, idx) => (
                      <tr key={idx}>
                        <td>
                          {item.isCustom ? (
                            <span style={{ color: "#d35400", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              ➕ Custom Item
                            </span>
                          ) : (
                            <span style={{ color: "#00c9a7", fontWeight: "bold", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              ✓ Matched
                            </span>
                          )}
                        </td>
                        <td>
                          <input 
                            value={item.name} 
                            list="billing-bulk-products-list"
                            onChange={e => handleBulkProductNameChange(idx, e.target.value)} 
                            placeholder="Type to search or enter custom name..."
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            value={item.qty} 
                            onChange={e => {
                              const newItems = [...bulkItems];
                              newItems[idx].qty = parseFloat(e.target.value) || 0;
                              setBulkItems(newItems);
                            }} 
                            placeholder="Qty"
                            min="0"
                            step="any"
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            value={item.sellingPrice} 
                            onChange={e => {
                              const newItems = [...bulkItems];
                              newItems[idx].sellingPrice = parseFloat(e.target.value) || 0;
                              setBulkItems(newItems);
                            }} 
                            placeholder="Rate"
                            min="0"
                            step="any"
                          />
                        </td>
                        <td style={{ fontWeight: "bold", paddingLeft: "12px", verticalAlign: "middle" }}>
                          ₹{(item.qty * item.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td>
                          <select 
                            value={item.gstRate} 
                            onChange={e => {
                              const newItems = [...bulkItems];
                              newItems[idx].gstRate = parseFloat(e.target.value) || 0;
                              setBulkItems(newItems);
                            }}
                          >
                            <option value={0}>0%</option>
                            <option value={5}>5%</option>
                            <option value={12}>12%</option>
                            <option value={18}>18%</option>
                            <option value={28}>28%</option>
                          </select>
                        </td>
                        <td>
                          <select 
                            value={item.unit} 
                            onChange={e => {
                              const newItems = [...bulkItems];
                              newItems[idx].unit = e.target.value;
                              setBulkItems(newItems);
                            }}
                          >
                            <option value="nos">nos</option>
                            <option value="FEET">FEET</option>
                            <option value="MTR">MTR</option>
                            <option value="KG">KG</option>
                            <option value="GRAM">GRAM</option>
                            <option value="LTR">LTR</option>
                            <option value="SET">SET</option>
                            <option value="RS">RS</option>
                          </select>
                        </td>
                        <td>
                          <button 
                            className="delete-btn" 
                            onClick={() => {
                              const newItems = bulkItems.filter((_, i) => i !== idx);
                              setBulkItems(newItems);
                            }}
                            title="Remove item"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <datalist id="billing-bulk-products-list">
              {products.map(p => (
                <option key={p.id} value={p.name}>
                  {p.productCode ? `${p.productCode} - ` : ''}₹{p.sellingPrice} ({p.category})
                </option>
              ))}
            </datalist>

            <div className="modal-btns" style={{ marginTop: "20px" }}>
              <span style={{ marginRight: "auto", fontSize: "12px", color: "#666", fontWeight: "700" }}>
                {bulkItems.length} items {isEditingBulk ? "in cart" : "parsed"}
              </span>
              <button className="btn-secondary" onClick={addEmptyBulkRow} style={{ marginRight: "10px" }}>➕ Add Row</button>
              <button 
                className="btn-secondary" 
                onClick={() => { 
                  if (!isEditingBulk || window.confirm("Are you sure you want to clear all items?")) {
                    setBulkInput(""); 
                    setBulkItems([]); 
                  }
                }}
                style={{ marginRight: "10px" }}
              >
                Clear
              </button>
              <button className="btn-primary" onClick={handleBulkSave} disabled={bulkItems.length === 0} style={{ background: "#1c1917" }}>
                🚀 {isEditingBulk ? "SAVE CHANGES" : "ADD TO BILLING CART"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phone OCR Scanner Modal */}
      {showPhoneScanner && (
        <PhoneScannerModal
          onClose={() => setShowPhoneScanner(false)}
          onCodeScanned={handlePhoneCodeScanned}
          userEmail={user?.email || "cashier@shopops.com"}
        />
      )}
    </div>
  );
}

