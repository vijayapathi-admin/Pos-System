import React, { useState, useMemo, useRef, useEffect } from "react";
import { useApp } from "../AppContext";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import ShopMap from "../components/ShopMap";
import Shelf360Viewer from "../components/Shelf360Viewer";
import SearchableSelect from "../components/SearchableSelect";

const CATEGORIES = ["ALL", "HARDWARE", "ELECTRICAL", "PLUMBING", "SANITARY", "MOTORS", "HOUSE APPLIANCES"];

export default function Billing() {
  const { products, completeSale, editingSale, setEditingSale, updateSale, contacts, addNotification } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [plumbingFilter, setPlumbingFilter] = useState("ALL");
  const [locatorTab, setLocatorTab] = useState("map"); // map | shelf
  const [showScanner, setShowScanner] = useState(false);
  const [cart, setCart] = useState([]);
  
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

  // Quick Add Autocomplete states
  const [quickSearch, setQuickSearch] = useState("");
  const [showQuickSuggestions, setShowQuickSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const quickAddInputRef = useRef(null);
  const containerRef = useRef(null);

  // Auto-focus quick add input on mount
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
    const searchClean = quickSearch.trim().toLowerCase();
    
    // Match by name, category, or code
    const filteredProducts = products.filter(p => 
      p.name?.toLowerCase().includes(searchClean) ||
      p.category?.toLowerCase().includes(searchClean) ||
      p.productCode?.toLowerCase().includes(searchClean)
    );
    
    const topSuggestions = filteredProducts.slice(0, 8);
    
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

  const handleSelectSuggestion = (selected) => {
    if (selected.isCustomOption) {
      addCustomItem(quickSearch.trim());
    } else {
      addToCart(selected);
    }
    setQuickSearch("");
    setShowQuickSuggestions(false);
    if (quickAddInputRef.current) {
      quickAddInputRef.current.focus();
    }
  };

  const handleQuickSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIndex(prev => 
        Math.min(prev + 1, quickSuggestions.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (quickSuggestions.length > 0 && activeSuggestionIndex >= 0) {
        const selected = quickSuggestions[activeSuggestionIndex];
        handleSelectSuggestion(selected);
      } else if (quickSearch.trim()) {
        const cleanSearch = quickSearch.trim().toLowerCase();
        const exactMatch = products.find(p => 
          p.productCode?.toLowerCase() === cleanSearch ||
          p.name?.toLowerCase() === cleanSearch
        );
        if (exactMatch) {
          addToCart(exactMatch);
        } else {
          addCustomItem(quickSearch.trim());
        }
        setQuickSearch("");
        setShowQuickSuggestions(false);
        if (quickAddInputRef.current) {
          quickAddInputRef.current.focus();
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
      const matchSearch = p.name?.toLowerCase().includes(quickSearch.toLowerCase()) ||
        p.category?.toLowerCase().includes(quickSearch.toLowerCase());
      const matchCat = category === "ALL" || p.category?.toUpperCase() === category;

      let matchPlumbingType = true;
      if (category === "PLUMBING" && plumbingFilter !== "ALL") {
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
    const maxAllowed = getMaxAllowedQty(product.id);
    if (maxAllowed <= 0) return;
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        if (existing.qty >= maxAllowed) return prev;
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1, commission: commissionPct }];
    });
  };

  const handleRowCommissionChange = (idx, value) => {
    const newCart = [...cart];
    newCart[idx].commission = value === "" ? "" : parseFloat(value) || 0;
    setCart(newCart);
  };

  const handleBarcodeScan = (scannedCode) => {
    setShowScanner(false);
    if (!scannedCode) return;

    let codeClean = scannedCode.trim().toLowerCase();
    // Strip start/stop asterisks (e.g. *BTH-123* -> bth-123)
    if (codeClean.startsWith("*") && codeClean.endsWith("*") && codeClean.length > 1) {
      codeClean = codeClean.substring(1, codeClean.length - 1);
    } else if (codeClean.startsWith("*")) {
      codeClean = codeClean.substring(1);
    } else if (codeClean.endsWith("*")) {
      codeClean = codeClean.substring(0, codeClean.length - 1);
    }

    const product = products.find(p => 
      p.productCode?.trim().toLowerCase() === codeClean ||
      p.id?.trim().toLowerCase() === codeClean
    );

    if (product) {
      const maxAllowed = getMaxAllowedQty(product.id);
      if (maxAllowed <= 0) {
        alert(`${product.name} is currently out of stock.`);
        return;
      }
      addToCart(product);
    } else {
      alert(`No product found in database with barcode / code: "${scannedCode}"`);
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


  const handleCheckout = async () => {
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
        useCORS: true
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
      
      pdf.save(`${prefix}_${dateStr}_${customer}.pdf`);
    } catch (err) {
      console.error("PDF Error:", err);
      alert("Failed to generate PDF. Try printing instead.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!receiptRef.current) return;
    const printWindow = window.open("", "_blank", "width=800,height=600");
    printWindow.document.write(`
      <html>
      <head>
        <title>Receipt - VIJAYAPATHI TRADERS</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; font-size: 13px; color: #000; }
          .a5-container { width: 148mm; margin: 0 auto; border: 1px solid #000; padding: 15px; }
          .receipt-header { text-align: center; border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
          .receipt-header h2 { font-size: 20px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
          .receipt-header p { font-size: 12px; }
          .customer-details { border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 10px; font-size: 12px; }
          .table-container { min-height: 150px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 12px; }
          th { background: #f0f0f0; font-weight: bold; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .totals-table { margin-top: 10px; width: 50%; float: right; border-collapse: collapse; }
          .totals-table td { border: none; padding: 4px 8px; font-size: 12px; border-bottom: 1px solid #eee; }
          .totals-table tr:last-child td { border-bottom: none; font-weight: bold; font-size: 14px; border-top: 1px solid #000; }
          .clearfix::after { content: ""; clear: both; display: table; }
          .receipt-footer { text-align: center; margin-top: 30px; border-top: 1px solid #000; padding-top: 10px; font-size: 11px; font-weight: bold; }
          .tagline { margin-top: 8px; font-size: 12px; text-transform: uppercase; text-decoration: underline; }
        </style>
      </head>
      <body>
        ${receiptRef.current.innerHTML}
        <script>window.onload = function() { window.print(); window.close(); }<\/script>
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
    <div className="tally-billing-container">
      {/* Voucher Header Card */}
      <div className="tally-header-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
          <div>
            <span style={{ fontSize: "11px", color: "#888", fontWeight: "bold", letterSpacing: "1px" }}>
              {editingSale ? "EDIT VOUCHER" : "CREATE VOUCHER"}
            </span>
            <h2 style={{ margin: "4px 0 0 0", fontSize: "20px", fontWeight: "900", color: "#1c1917" }}>
              {editingSale ? `Sales Invoice (Editing: ${editingSale.id})` : "Sales Invoice (Cash/Credit/UPI)"}
            </h2>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button 
              className="topbar-btn" 
              onClick={() => setShowScanner(true)}
              style={{ background: "#1c1917", color: "#fff", borderColor: "#1c1917" }}
              title="Scan Barcode via Camera"
            >
              📷 Barcode Scan
            </button>

            <button 
              className="topbar-btn" 
              onClick={() => {
                setShortageItemName("");
                setShowShortageModal(true);
              }}
              style={{ background: '#8e44ad', color: '#fff', borderColor: '#8e44ad' }}
              title="Log Customer Request / Shortage"
            >
              📝 + Request Product
            </button>
            {editingSale && (
              <button 
                className="topbar-btn" 
                onClick={() => { 
                  setEditingSale(null); 
                  setCart([]); 
                  setCustomerName(""); 
                  setCustomerPhone(""); 
                  setDiscount(0); 
                  setCommissionPct(0); 
                }}
                style={{ background: '#e74c3c', color: '#fff', borderColor: '#e74c3c' }}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>

        {/* Party / Customer details toggle */}
        <div 
          onClick={() => setShowCustomerDetails(prev => !prev)}
          style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            cursor: "pointer", 
            padding: "8px 12px",
            background: "rgba(37, 99, 235, 0.05)",
            border: "1px solid rgba(37, 99, 235, 0.15)",
            borderRadius: "6px",
            marginTop: "12px",
            userSelect: "none"
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: "bold", color: "#2563eb", display: "flex", alignItems: "center", gap: "6px" }}>
            👤 CUSTOMER & PROJECT SITE DETAILS {showCustomerDetails ? "▼" : "▶"}
          </span>
          <span style={{ fontSize: "11px", color: "#888" }}>
            {showCustomerDetails ? "Click to collapse" : "Click to enter customer details & agent referrer"}
          </span>
        </div>

        {/* Party / Customer details row */}
        {showCustomerDetails && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", borderTop: "1px solid #eee", paddingTop: "12px", marginTop: "12px" }}>
            <div className="form-group" style={{ gap: "4px" }}>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888" }}>PARTY NAME (CUSTOMER)</label>
              <input
                type="text"
                id="tally-customer-name"
                placeholder="Walk-in Customer / Business Name"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                style={{ padding: "6px 10px", fontSize: "13px" }}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === "ArrowDown") {
                    e.preventDefault();
                    const nextInput = document.getElementById("tally-customer-phone");
                    if (nextInput) {
                      nextInput.focus();
                      if (nextInput.select) nextInput.select();
                    }
                  }
                }}
              />
            </div>
            <div className="form-group" style={{ gap: "4px" }}>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888" }}>PHONE NUMBER</label>
              <input
                type="text"
                id="tally-customer-phone"
                placeholder="10-digit mobile number"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                style={{ padding: "6px 10px", fontSize: "13px" }}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === "ArrowDown") {
                    e.preventDefault();
                    const nextInput = document.getElementById("tally-site-name");
                    if (nextInput) {
                      nextInput.focus();
                      if (nextInput.select) nextInput.select();
                    }
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const prevInput = document.getElementById("tally-customer-name");
                    if (prevInput) {
                      prevInput.focus();
                      if (prevInput.select) prevInput.select();
                    }
                  }
                }}
              />
            </div>
            <div className="form-group" style={{ gap: "4px" }}>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888" }}>PROJECT SITE LOCATION</label>
              <input
                type="text"
                id="tally-site-name"
                placeholder="Site/Delivery address (optional)"
                value={siteName}
                onChange={e => setSiteName(e.target.value)}
                style={{ padding: "6px 10px", fontSize: "13px" }}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === "ArrowDown") {
                    e.preventDefault();
                    const nextInput = document.getElementById("tally-referrer-select");
                    if (nextInput) {
                      nextInput.focus();
                    }
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const prevInput = document.getElementById("tally-customer-phone");
                    if (prevInput) {
                      prevInput.focus();
                      if (prevInput.select) prevInput.select();
                    }
                  }
                }}
              />
            </div>
            <div className="form-group" style={{ gap: "4px" }}>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888" }}>REFERRER / AGENT</label>
              <select
                id="tally-referrer-select"
                value={referrerId}
                onChange={e => {
                  const rId = e.target.value;
                  setReferrerId(rId);
                  const refObj = referrers.find(r => r.id === rId);
                  if (refObj && commissionPct === 0) {
                    setCommissionPct(5);
                  }
                }}
                style={{ padding: "6px 10px", fontSize: "13px", height: "34px", background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: "6px" }}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === "ArrowDown") {
                    e.preventDefault();
                    const searchInput = document.querySelector('.billing-search input');
                    if (searchInput) {
                      searchInput.focus();
                    }
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const prevInput = document.getElementById("tally-site-name");
                    if (prevInput) {
                      prevInput.focus();
                      if (prevInput.select) prevInput.select();
                    }
                  }
                }}
              >
                <option value="">-- No Referrer --</option>
                {referrers.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.designation})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ gap: "4px", justifyContent: "center" }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none', height: "34px", marginTop: "16px" }}>
                <input 
                  type="checkbox" 
                  checked={isGstBill} 
                  onChange={e => setIsGstBill(e.target.checked)} 
                  style={{ transform: 'scale(1.2)' }} 
                />
                TAX INVOICE
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Standard split Grid & Sidebar View */}
      <div className="billing-layout" style={{ display: "flex", flex: 1, minHeight: 0, gap: "16px", marginTop: "4px", overflow: "hidden" }}>
        
        {/* Left: Products Grid */}
        <div className="billing-products">
          <div ref={containerRef} className="billing-search" style={{ position: "relative" }}>
            <span className="search-icon">🔍</span>
            <input
              ref={quickAddInputRef}
              type="text"
              placeholder="Search catalog or scan code to add..."
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
                style={{
                  position: "absolute",
                  right: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#888",
                  fontSize: "14px",
                  cursor: "pointer"
                }}
              >
                ✕
              </button>
            )}

            {/* Suggestions Dropdown */}
            {showQuickSuggestions && quickSearch.trim() && quickSuggestions.length > 0 && (
              <div 
                className="quick-add-suggestions-dropdown" 
                style={{
                  position: "absolute",
                  top: "100%",
                  left: "0",
                  right: "0",
                  zIndex: 2000,
                  background: "#fff",
                  border: "2.5px solid #2563eb",
                  borderRadius: "8px",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
                  maxHeight: "280px",
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
                      onClick={() => handleSelectSuggestion(suggestion)}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      style={{
                        padding: "10px 14px",
                        background: isSelected ? "rgba(37, 99, 235, 0.1)" : "#fff",
                        color: isSelected ? "#2563eb" : "#1c1917",
                        fontWeight: isSelected ? "bold" : "normal",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderBottom: "1px solid #f0f0f0",
                        textAlign: "left"
                      }}
                    >
                      <div>
                        {isCustom ? (
                          <span style={{ color: "#d35400", fontWeight: "bold" }}>{suggestion.name}</span>
                        ) : (
                          <span>{suggestion.name}</span>
                        )}
                        {!isCustom && suggestion.category && (
                          <span style={{ fontSize: "10px", color: "#888", marginLeft: "8px", background: "#fafaf9", padding: "2px 6px", borderRadius: "4px" }}>
                            {suggestion.category}
                          </span>
                        )}
                      </div>
                      {!isCustom && (
                        <div style={{ textAlign: "right", fontSize: "12px" }}>
                          <span style={{ color: "#2563eb", fontWeight: "bold" }}>₹{suggestion.sellingPrice}</span>
                          <span style={{ color: suggestion.stock <= 0 ? "#e74c3c" : "#27ae60", marginLeft: "10px" }}>
                            {suggestion.stock <= 0 ? "Out of Stock" : `${suggestion.stock} left`}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="category-tabs">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`cat-tab ${category === cat ? "active" : ""}`}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {quickSearch === "" && category === "ALL" ? (
            <>
              <div className="products-section">
                <div className="section-label">FREQUENTLY SOLD</div>
                <div className="products-row">
                  {frequent.map(p => <ProductCard key={p.id} product={p} />)}
                </div>
              </div>
              <div className="products-section">
                <div className="section-label">RECENTLY SOLD</div>
                <div className="products-row">
                  {recent.map(p => <ProductCard key={p.id} product={p} />)}
                </div>
              </div>
              <div className="products-section">
                <div className="section-label">ALL PRODUCTS ({products.length})</div>
                <div className="products-grid">
                  {products.map(p => <ProductCard key={p.id} product={p} />)}
                </div>
              </div>
            </>
          ) : (
            <div className="products-section">
              <div className="section-label">{filtered.length} PRODUCTS</div>
              <div className="products-grid">
                {filtered.map(p => <ProductCard key={p.id} product={p} />)}
              </div>
            </div>
          )}
        </div>

        {/* Right: Cart Summary Sidebar */}
        <div className="billing-cart">
          <div className="cart-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <div className="cart-label">CART</div>
              <div className="cart-count">{cart.length} items</div>
            </div>
            {cart.length > 0 && (
              <button
                className="btn-secondary"
                onClick={() => {
                  if (window.confirm("Are you sure you want to clear the cart?")) {
                    setCart([]);
                    setDiscount(0);
                    setCommissionPct(0);
                  }
                }}
                style={{ padding: "4px 8px", fontSize: "10px", background: "#e74c3c", color: "#fff", border: "none", borderRadius: "4px", fontWeight: "bold" }}
              >
                🧹 Clear Cart
              </button>
            )}
          </div>

          <div className="cart-items" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "10px" }}>
            {cart.length === 0 ? (
              <div className="cart-empty">
                <div className="cart-empty-icon">🛒</div>
                <div>Cart is empty</div>
              </div>
            ) : (
              <table className="cart-table">
                <thead>
                  <tr>
                    <th style={{ width: "18px", textAlign: "center", padding: "6px 2px", fontSize: "10px" }}>#</th>
                    <th>Product</th>
                    <th style={{ width: "48px", textAlign: "right", padding: "6px 4px", fontSize: "10px" }}>Rate</th>
                    <th style={{ width: "56px", textAlign: "center", padding: "6px 2px", fontSize: "10px" }}>Qty</th>
                    <th style={{ width: "32px", textAlign: "right", padding: "6px 4px", fontSize: "10px" }}>Comm</th>
                    <th style={{ width: "60px", textAlign: "right", padding: "6px 4px", fontSize: "10px" }}>Total</th>
                    <th style={{ width: "20px", textAlign: "center", padding: "6px 2px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, index) => (
                    <tr key={item.id}>
                      <td style={{ textAlign: "center", fontWeight: "bold", color: "#888", padding: "6px 2px", fontSize: "10px" }}>{index + 1}</td>
                      <td style={{ padding: "6px 4px" }}>
                        <div className="cart-item-name" style={{ fontWeight: "700", fontSize: "11px", color: "#1c1917", lineHeight: "1.2", wordBreak: "break-word" }} title={item.name}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: "9px", color: "#888", marginTop: "2px", fontWeight: "normal" }}>
                          ({item.unit || "Nos"})
                        </div>
                      </td>
                      <td style={{ textAlign: "right", padding: "6px 2px" }}>
                        <input 
                          type="number" min="0" step="any"
                          style={{ width: '40px', padding: '2px 2px', fontSize: '10px', border: '1px solid #ccc', borderRadius: '4px', textAlign: "right" }} 
                          value={item.sellingPrice} 
                          onChange={e => updatePrice(item.id, e.target.value)} 
                        />
                      </td>
                      <td style={{ padding: "6px 2px" }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                          <button className="qty-btn" onClick={() => updateQty(item.id, -1)} style={{ width: "14px", height: "14px", fontSize: "8px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                          <span className="qty-val" style={{ fontWeight: 'bold', fontSize: "11px", minWidth: "12px", textAlign: "center" }}>
                            {item.qty}
                          </span>
                          <button className="qty-btn" onClick={() => updateQty(item.id, 1)} style={{ width: "14px", height: "14px", fontSize: "8px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                      </td>
                      <td style={{ textAlign: "right", padding: "6px 2px" }}>
                        <input 
                          type="number" min="0" max="100" step="any"
                          style={{ width: '22px', padding: '2px 2px', fontSize: '9px', border: '1px solid #ccc', borderRadius: '4px', textAlign: "right" }} 
                          value={item.commission !== undefined ? item.commission : 0} 
                          onChange={e => handleRowCommissionChange(cart.indexOf(item), e.target.value)} 
                        />
                      </td>
                      <td style={{ textAlign: "right", fontWeight: "800", fontSize: "10px", color: "#2563eb", padding: "6px 2px" }}>
                        ₹{((parseFloat(item.sellingPrice) || 0) * item.qty * (1 + (parseFloat(item.commission) || 0) / 100)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "center", padding: "6px 2px" }}>
                        <button className="remove-btn" onClick={() => removeFromCart(item.id)} style={{ padding: 0, margin: 0, border: "none", background: "none", color: "#e74c3c", cursor: "pointer", fontSize: "13px" }}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="cart-footer">
            <div className="cart-totals" style={{ marginBottom: "10px" }}>
              <div className="cart-row" style={{ fontSize: "15px", fontWeight: "bold" }}>
                <span>Subtotal ({cart.length} items)</span>
                <span style={{ color: "#2563eb" }}>₹{rawSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "10px" }}>
              <button
                className="btn-secondary"
                onClick={() => setShowBillPreview(true)}
                disabled={cart.length === 0}
                style={{ height: '44px', fontSize: '12px', fontWeight: 'bold', display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}
              >
                🔍 PREVIEW BILL
              </button>
              <button
                className="checkout-btn"
                onClick={() => setShowPaymentGateway(true)}
                disabled={cart.length === 0}
                style={{ background: '#2563eb', height: '44px', fontSize: '13px', fontWeight: 'bold', margin: 0 }}
              >
                PROCEED TO PAYMENT ➔
              </button>
            </div>
          </div>
        </div>
      </div>

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
            <div style={{ border: "1.5px solid #000", padding: "15px", background: "#fff", color: "#000", fontFamily: "sans-serif", maxHeight: "400px", overflowY: "auto", marginBottom: "15px" }}>
              <div ref={receiptRef} className="a5-container" style={{ width: "100%", maxWidth: "148mm", margin: "0 auto", padding: "15px", background: "#fff", color: "#000", border: "1.5px solid #000", fontFamily: "sans-serif", boxSizing: "border-box" }}>
                <div className="receipt-header" style={{ textAlign: "center", borderBottom: "1.5px solid #000", paddingBottom: "10px", margin: "0 0 15px 0" }}>
                  <img src="/vijayapathi-logo.jpg" alt="Vijayapathi Traders Logo" style={{ height: "65px", width: "auto", marginBottom: "8px", display: "inline-block" }} /><br />
                  <p style={{ fontSize: "11px", margin: "2px 0", color: "#444" }}>Sanitary, Hardware, Electrical & Plumbing Materials</p>
                  <p style={{ fontSize: "11px", margin: "2px 0", color: "#444" }}>
                    Phone: 9876543210{previewSaleResult.isGstBill ? " | GSTIN: 33AAAAA1111A1Z1" : ""}
                  </p>
                  <p style={{ fontSize: "12px", margin: "5px 0 0 0", fontWeight: "bold", textDecoration: "underline", color: "#e74c3c" }}>
                    *** DRAFT ESTIMATION / PROPOSAL ***
                  </p>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1.5px solid #000", paddingBottom: "10px", margin: "0 0 15px 0", fontSize: "11px", lineHeight: "1.4" }}>
                  <div>
                    <strong>Billed To:</strong><br />
                    {previewSaleResult.customerName || "Walk-in Customer"}<br />
                    {previewSaleResult.customerPhone ? `Phone: ${previewSaleResult.customerPhone}` : ""}
                    {previewSaleResult.siteName && <div>🏡 Site: {previewSaleResult.siteName}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>Voucher Draft:</strong><br />
                    Date: {previewSaleResult.date}<br />
                    Payment Mode: {previewSaleResult.paymentMethod}
                  </div>
                </div>

                <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", border: "1.5px solid #000" }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "10px", background: "#f0f0f0", fontWeight: "bold", textAlign: "center", width: "35px" }}>S.No</th>
                      <th style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "10px", background: "#f0f0f0", fontWeight: "bold", textAlign: "left" }}>Product Name</th>
                      <th style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "10px", background: "#f0f0f0", fontWeight: "bold", textAlign: "center", width: "55px" }}>Qty</th>
                      <th style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "10px", background: "#f0f0f0", fontWeight: "bold", textAlign: "right", width: "65px" }}>Rate (₹)</th>
                      <th style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "10px", background: "#f0f0f0", fontWeight: "bold", textAlign: "right", width: "80px" }}>Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewSaleResult.items.map((item, i) => (
                      <tr key={i}>
                        <td style={{ border: "1px solid #000", padding: "4px 5px", fontSize: "10px", textAlign: "center" }}>{i + 1}</td>
                        <td style={{ border: "1px solid #000", padding: "4px 5px", fontSize: "10px", textAlign: "left", fontWeight: "bold", wordBreak: "break-word", whiteSpace: "normal" }}>{item.name}</td>
                        <td style={{ border: "1px solid #000", padding: "4px 5px", fontSize: "10px", textAlign: "center" }}>{item.qty} {item.unit || "Nos"}</td>
                        <td style={{ border: "1px solid #000", padding: "4px 5px", fontSize: "10px", textAlign: "right" }}>{parseFloat(item.sellingPrice).toFixed(2)}</td>
                        <td style={{ border: "1px solid #000", padding: "4px 5px", fontSize: "10px", textAlign: "right", fontWeight: "bold" }}>{(parseFloat(item.sellingPrice) * item.qty).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px", borderTop: "1.5px solid #000", paddingTop: "6px", fontSize: "11px" }}>
                  <div style={{ width: "100%", maxWidth: "240px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                      <span>Subtotal:</span>
                      <strong>₹{previewSaleResult.subtotal?.toFixed(2)}</strong>
                    </div>
                    {previewSaleResult.discount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                        <span>Discount:</span>
                        <strong style={{ color: "#e74c3c" }}>-₹{parseFloat(previewSaleResult.discount).toFixed(2)}</strong>
                      </div>
                    )}
                    {previewSaleResult.isGstBill && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                          <span>CGST:</span>
                          <strong>+₹{parseFloat(previewSaleResult.cgst || 0).toFixed(2)}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                          <span>SGST:</span>
                          <strong>+₹{parseFloat(previewSaleResult.sgst || 0).toFixed(2)}</strong>
                        </div>
                      </>
                    )}
                    {previewSaleResult.roundOff !== 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                        <span>Round Off:</span>
                        <strong>{previewSaleResult.roundOff > 0 ? "+" : ""}₹{parseFloat(previewSaleResult.roundOff).toFixed(2)}</strong>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderTop: "1px dashed #000", fontSize: "13px", fontWeight: "bold" }}>
                      <span>Grand Total:</span>
                      <strong style={{ color: "#2563eb" }}>₹{previewSaleResult.roundedTotal?.toLocaleString()}</strong>
                    </div>
                  </div>
                </div>

                <div className="receipt-footer" style={{ textAlign: "center", fontSize: "9px", marginTop: "20px", borderTop: "1.5px solid #000", paddingTop: "6px", color: "#555" }}>
                  <p style={{ fontWeight: "bold", color: "#000", margin: "2px 0" }}>Draft invoice for estimation only. Vijayapathi Traders</p>
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <button className="btn-print" onClick={handlePrint}>🖨️ PRINT DRAFT</button>
              <button className="btn-whatsapp" onClick={() => handleWhatsApp(previewSaleResult)}>💬 WHATSAPP DRAFT</button>
              <button className="btn-print" style={{ background: "#e74c3c" }} onClick={handleDownloadPDF} disabled={loading}>
                {loading ? "⌛..." : "📥 PDF DRAFT"}
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

            {/* Hidden receipt for printing */}
            <div style={{ position: "absolute", left: "-9999px", top: "0", opacity: "1", pointerEvents: "none" }}>
              <div ref={receiptRef} className="a5-container" style={{ width: "100%", maxWidth: "148mm", padding: "15px", background: "#fff", color: "#000", border: "1.5px solid #000", fontFamily: "sans-serif", boxSizing: "border-box" }}>
                <div className="receipt-header" style={{ textAlign: "center", borderBottom: "1.5px solid #000", paddingBottom: "10px", marginBottom: "15px" }}>
                  <img src="/vijayapathi-logo.jpg" alt="Vijayapathi Traders Logo" style={{ height: "70px", width: "auto", marginBottom: "8px", display: "inline-block" }} /><br />
                  <p style={{ fontSize: "12px", margin: "2px 0", color: "#444" }}>Sanitary, Hardware, Electrical & Plumbing Materials</p>
                  <p style={{ fontSize: "12px", margin: "2px 0", color: "#444" }}>
                    Phone: 9876543210{saleResult.isGstBill ? " | GSTIN: 33AAAAA1111A1Z1" : ""}
                  </p>
                  <p style={{ fontSize: "12px", margin: "5px 0 0 0", fontWeight: "bold", textDecoration: "underline" }}>
                    {saleResult.isGstBill ? "TAX INVOICE" : "BILL OF SUPPLY"}
                  </p>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1.5px solid #000", paddingBottom: "10px", marginBottom: "15px", fontSize: "12px", lineHeight: "1.5" }}>
                  <div>
                    <strong>Billed To:</strong><br />
                    {saleResult.customerName || "Walk-in Customer"}<br />
                    {saleResult.customerPhone ? `Phone: ${saleResult.customerPhone}` : ""}
                    {saleResult.siteName && <div>🏡 Site: {saleResult.siteName}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>Bill Details:</strong><br />
                    Date: {saleResult.date || new Date().toLocaleDateString("en-IN")}<br />
                    Time: {saleResult.time || ""}<br />
                    Payment Mode: {saleResult.paymentMethod || "CASH"}
                  </div>
                </div>

                <div className="receipt-table-container" style={{ minHeight: "150px", width: "100%" }}>
                  <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", border: "1.5px solid #000" }}>
                    <thead>
                      <tr>
                        <th style={{ border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "center", width: "35px" }}>S.No</th>
                        <th style={{ border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "left" }}>Product Name</th>
                        {saleResult.isGstBill && <th style={{ border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "left", width: "45px" }}>HSN</th>}
                        <th style={{ border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "center", width: "55px" }}>Qty</th>
                        <th style={{ border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "right", width: "65px" }}>Rate (₹)</th>
                        {saleResult.isGstBill && <th style={{ border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "right", width: "45px" }}>GST %</th>}
                        <th style={{ border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "right", width: "80px" }}>Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saleResult.items?.map((item, i) => (
                        <tr key={i}>
                          <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "center" }}>{i + 1}</td>
                          <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "left", fontWeight: "bold", wordBreak: "break-word", whiteSpace: "normal" }}>{item.name}</td>
                          {saleResult.isGstBill && <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "left" }}>{item.hsnCode}</td>}
                          <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "center" }}>{item.qty} {item.unit || "Nos"}</td>
                          <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "right" }}>{parseFloat(item.sellingPrice).toFixed(2)}</td>
                          {saleResult.isGstBill && <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "right" }}>{item.gstRate}%</td>}
                          <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "right", fontWeight: "bold" }}>{(parseFloat(item.sellingPrice) * item.qty).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px", borderTop: "1.5px solid #000", paddingTop: "8px", fontSize: "12px" }}>
                  <div style={{ width: "100%", maxWidth: "270px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                      <span>Subtotal:</span>
                      <strong>₹{(saleResult.subtotal || saleResult.items?.reduce((sum, item) => sum + parseFloat(item.sellingPrice) * item.qty, 0))?.toFixed(2)}</strong>
                    </div>
                    {saleResult.discount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>Discount:</span>
                        <strong style={{ color: "#e74c3c" }}>-₹{parseFloat(saleResult.discount).toFixed(2)}</strong>
                      </div>
                    )}
                    {saleResult.isGstBill && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                          <span>CGST:</span>
                          <strong>+₹{parseFloat(saleResult.cgst || 0).toFixed(2)}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                          <span>SGST:</span>
                          <strong>+₹{parseFloat(saleResult.sgst || 0).toFixed(2)}</strong>
                        </div>
                      </>
                    )}
                    {saleResult.roundOff !== 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>Round Off:</span>
                        <strong>{saleResult.roundOff > 0 ? "+" : ""}₹{parseFloat(saleResult.roundOff).toFixed(2)}</strong>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "1px dashed #000", fontSize: "14px", fontWeight: "bold" }}>
                      <span>Grand Total:</span>
                      <strong style={{ color: "#2563eb" }}>₹{saleResult.roundedTotal?.toLocaleString()}</strong>
                    </div>
                  </div>
                </div>

                <div className="receipt-footer" style={{ textAlign: "center", fontSize: "10px", marginTop: "25px", borderTop: "1.5px solid #000", paddingTop: "10px", color: "#555" }}>
                  <p style={{ fontWeight: "bold", color: "#000", margin: "2px 0" }}>Thank you for your business! Vijayapathi Traders</p>
                  <p className="tagline" style={{ margin: "6px 0 0 0", fontSize: "11px", textTransform: "uppercase", textDecoration: "underline", fontWeight: "bold", color: "#000" }}>NO RETURN{saleResult.paymentMethod === "CREDIT" ? "" : ", NO CREDIT"}</p>
                </div>
              </div>
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
    </div>
  );
}
