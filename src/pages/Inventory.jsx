import React, { useState, useRef } from "react";
import { useApp } from "../AppContext";
import { exportToExcel, matchesProductSearch } from "../utils";
import * as XLSX from "xlsx";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import BarcodeGenerator from "../components/BarcodeGenerator";
import ShopMap from "../components/ShopMap";
import Shelf360Viewer from "../components/Shelf360Viewer";

const CATEGORIES = ["ALL", "HARDWARE", "ELECTRICAL", "PLUMBING", "SANITARYWARE", "BATHROOM FITTINGS", "MOTORS", "HOUSE APPLIANCES"];

const CATEGORY_PREFIXES = {
  "HARDWARE": "HRD",
  "ELECTRICAL": "ELE",
  "PLUMBING": "PLM",
  "SANITARYWARE": "SAN",
  "BATHROOM FITTINGS": "BTH",
  "MOTORS": "MOT",
  "HOUSE APPLIANCES": "HAP"
};

const emptyForm = {
  name: "", category: "Hardware", purchasePrice: "", sellingPrice: "",
  stock: "", unit: "nos", supplier: "", totalSold: 0,
  hsnCode: "", gstRate: 0, productCode: "",
  lowStockThreshold: "",
  shelfLocation: ""
};

export default function Inventory() {
  const { products, suppliers, addProduct, updateProduct, deleteProduct, importProductsBatch, deleteAllProducts, batchUpdateProducts, fetchStockMovements, adjustStockTransaction } = useApp();

  const [search, setSearch] = useState("");
  const fileInputRef = useRef(null);
  const [category, setCategory] = useState("ALL");
  const [plumbingFilter, setPlumbingFilter] = useState("ALL");
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [bulkItems, setBulkItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showLowStock, setShowLowStock] = useState(false);

  const [sortField, setSortField] = useState(null); // null means dynamic/default based on category
  const [sortAsc, setSortAsc] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [isBatchEditing, setIsBatchEditing] = useState(false);
  const [batchUpdates, setBatchUpdates] = useState({});
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [barcodeBatch, setBarcodeBatch] = useState({});
  const [barcodeLayout, setBarcodeLayout] = useState("A4");
  const [locateProduct, setLocateProduct] = useState(null);
  const [locatorTab, setLocatorTab] = useState("map"); // map | shelf
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openHistoryModal = async (product) => {
    setHistoryProduct(product);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const logs = await fetchStockMovements(product.id, 50);
      setHistoryLogs(logs);
    } catch (err) {
      console.error("Failed to load stock history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };


  const handleAddProductToBarcode = (product) => {
    setBarcodeBatch(prev => ({
      ...prev,
      [product.id]: (prev[product.id] || 0) + 10
    }));
    setShowBarcodeModal(true);
  };

  const handleAddAllLowStockToBarcode = () => {
    const lowStock = products.filter(p => p.stock <= (p.lowStockThreshold || (["PLUMBING", "CPVC", "PVC", "UPVC"].includes(String(p.category || "").toUpperCase()) ? 20 : 40)));
    const updates = { ...barcodeBatch };
    lowStock.forEach(p => {
      updates[p.id] = (updates[p.id] || 0) + 10;
    });
    setBarcodeBatch(updates);
    alert(`Added ${lowStock.length} low-stock products to barcode printing batch!`);
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

  const handlePrintBarcodes = () => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    const barcodeItems = Object.entries(barcodeBatch).filter(([_, count]) => count > 0).map(([id, count]) => {
      const p = products.find(prod => prod.id === id);
      return { product: p, count };
    }).filter(item => item.product);

    if (barcodeItems.length === 0) return alert("No barcode stickers in batch to print.");

    let stickerGridHtml = "";
    barcodeItems.forEach(({ product, count }) => {
      for (let i = 0; i < count; i++) {
        const codeClean = String(product.productCode || "").toUpperCase().replace(/[^0-9A-Z\-.$/+% ]/g, "");
        stickerGridHtml += `
          <div class="sticker">
            <div class="sticker-header">VIJAYAPATHI TRADERS</div>
            <div class="sticker-name">${product.name}</div>
            <div class="sticker-price">Price: ₹${product.sellingPrice}</div>
            <div class="barcode-svg" data-code="${codeClean}"></div>
            <div class="sticker-code">${product.productCode || ""} ${product.shelfLocation ? `[${product.shelfLocation}]` : ""}</div>
          </div>
        `;
      }
    });

    const isA4 = barcodeLayout === "A4";

    printWindow.document.write(`
      <html>
      <head>
        <title>Print Barcode Stickers</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fff; padding: ${isA4 ? "15mm" : "2mm"}; }
          
          .sticker-grid {
            display: grid;
            grid-template-columns: ${isA4 ? "repeat(3, 1fr)" : "1fr"};
            gap: ${isA4 ? "2.5mm" : "0"};
            width: ${isA4 ? "180mm" : "50mm"};
          }
          
          .sticker {
            width: ${isA4 ? "58mm" : "48mm"};
            height: ${isA4 ? "36mm" : "26mm"};
            border: 1px dashed #ccc;
            padding: 4px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            overflow: hidden;
            background: #fff;
            text-align: center;
            page-break-inside: avoid;
            margin-bottom: ${isA4 ? "0" : "4mm"};
          }
          
          .sticker-header { font-size: 8px; font-weight: bold; color: #000; letter-spacing: 0.5px; border-bottom: 0.5px solid #000; width: 100%; padding-bottom: 1px; text-transform: uppercase; }
          .sticker-name { font-size: 9px; font-weight: 800; color: #000; margin: 2px 0 1px 0; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
          .sticker-price { font-size: 10px; font-weight: 900; color: #000; }
          .sticker-code { font-size: 8px; font-weight: bold; font-family: monospace; color: #555; }
          
          .barcode-line-container { display: flex; align-items: stretch; height: 35px; width: 90%; background: #fff; margin: 2px 0; }
          .b-line { width: 1px; background: #000; }
          .b-space { width: 1px; background: #fff; }
          .b-line.w { width: 2.5px; }
          .b-space.w { width: 2.5px; }
        </style>
      </head>
      <body>
        <div class="sticker-grid">
          ${stickerGridHtml}
        </div>
        <script>
          const ENCODING = {
            "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000",
            "4": "000110001", "5": "100110000", "6": "001110000", "7": "000100101",
            "8": "100100100", "9": "001100100", "A": "100001001", "B": "001001001",
            "C": "101001000", "D": "000011001", "E": "100011000", "F": "001011000",
            "G": "000001101", "H": "100001100", "I": "001001100", "J": "000011100",
            "K": "100000011", "L": "001000011", "M": "101000010", "N": "000010011",
            "O": "100010010", "P": "001010010", "Q": "000000111", "R": "100000110",
            "S": "001000110", "T": "000010110", "U": "110000001", "V": "011000001",
            "W": "111000000", "X": "010010001", "Y": "110010000", "Z": "011010000",
            "-": "010000101", ".": "110000100", " ": "011000100", "*": "010010100",
            "$": "010101000", "/": "010100010", "+": "010001010", "%": "000101010"
          };

          document.querySelectorAll('.barcode-svg').forEach(div => {
            const code = div.getAttribute('data-code');
            const fullCode = '*' + code + '*';
            
            const narrowWidth = 1.0;
            const wideWidth = 2.5;
            const charGap = 1.2;
            
            let currentX = 5;
            let svgContent = '';
            
            for(let i=0; i<fullCode.length; i++) {
              const char = fullCode[i];
              const pattern = ENCODING[char];
              if(!pattern) continue;
              
              for(let idx=0; idx<9; idx++) {
                const bit = pattern[idx];
                const isBar = idx % 2 === 0;
                const elementWidth = bit === '1' ? wideWidth : narrowWidth;
                
                if (isBar) {
                  svgContent += '<rect x="' + currentX + '" y="2" width="' + elementWidth + '" height="28" fill="#000000" />';
                }
                currentX += elementWidth;
              }
              currentX += charGap;
            }
            
            const totalWidth = currentX + 5;
            div.innerHTML = '<svg width="100%" height="32" viewBox="0 0 ' + totalWidth + ' 32" style="shape-rendering: crispEdges;">' + svgContent + '</svg>';
          });

          window.onload = function() {
            window.print();
            window.close();
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const filtered = products.filter(p => {
    const matchSearch = matchesProductSearch(p, search);
    
    const pCat = String(p.category || "").toUpperCase();
    const selCat = category.toUpperCase();
    
    let matchCat = selCat === "ALL";
    if (!matchCat) {
      if (selCat === "PLUMBING") {
        matchCat = ["PLUMBING", "CPVC", "PVC", "UPVC"].includes(pCat);
      } else if (selCat === "SANITARY" || selCat === "SANITARYWARE") {
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

    const isLowStock = p.stock <= (p.lowStockThreshold || 5);
    const matchLowStock = showLowStock ? isLowStock : true;
    return matchSearch && matchCat && matchPlumbingType && matchLowStock;
  });


  const activeSortField = sortField || (["PLUMBING", "CPVC", "PVC", "UPVC"].includes(String(category || "").toUpperCase()) ? "productCode" : "name");
  const activeSortAsc = sortAsc;

  const sortedFiltered = [...filtered].sort((a, b) => {
    let valA = a[activeSortField];
    let valB = b[activeSortField];

    if (valA === undefined || valA === null) valA = "";
    if (valB === undefined || valB === null) valB = "";

    // Numeric sorting for specific columns
    if (["purchasePrice", "sellingPrice", "stock", "totalSold"].includes(activeSortField)) {
      const numA = parseFloat(valA) || 0;
      const numB = parseFloat(valB) || 0;
      return activeSortAsc ? numA - numB : numB - numA;
    }

    // Natural alphanumeric sorting for strings (handles code formats like PLM-001, PLM-10, etc.)
    const strA = String(valA).trim();
    const strB = String(valB).trim();
    const comp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
    return activeSortAsc ? comp : -comp;
  });

  const handleSort = (field) => {
    if (activeSortField === field) {
      setSortAsc(!activeSortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const renderSortableHeader = (label, field) => {
    const isSorted = activeSortField === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className={`sortable-header ${isSorted ? "sorted-header" : ""}`}
      >
        <span style={{ display: "inline-flex", alignItems: "center" }}>
          {label}
          <span className="sort-icon">
            {isSorted ? (activeSortAsc ? " ▲" : " ▼") : " ↕"}
          </span>
        </span>
      </th>
    );
  };

  const handleBarcodeScan = (scannedCode) => {
    setShowScanner(false);
    if (scannedCode) {
      let codeClean = scannedCode.trim();
      if (codeClean.startsWith("*") && codeClean.endsWith("*") && codeClean.length > 1) {
        codeClean = codeClean.substring(1, codeClean.length - 1);
      } else if (codeClean.startsWith("*")) {
        codeClean = codeClean.substring(1);
      } else if (codeClean.endsWith("*")) {
        codeClean = codeClean.substring(0, codeClean.length - 1);
      }
      setSearch(codeClean);
    }
  };

  const handleBatchChange = (id, field, value) => {
    setBatchUpdates(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const handleSaveBatch = async () => {
    const updatesArray = Object.entries(batchUpdates).map(([id, fields]) => {
      const data = {};
      if (fields.purchasePrice !== undefined) data.purchasePrice = parseFloat(fields.purchasePrice) || 0;
      if (fields.sellingPrice !== undefined) data.sellingPrice = parseFloat(fields.sellingPrice) || 0;
      if (fields.stock !== undefined) data.stock = parseFloat(fields.stock) || 0;
      return { id, data };
    });

    if (updatesArray.length === 0) {
      setIsBatchEditing(false);
      return;
    }

    setSaving(true);
    try {
      await batchUpdateProducts(updatesArray);
      setIsBatchEditing(false);
      setBatchUpdates({});
      alert("Batch updates saved successfully!");
    } catch (err) {
      alert("Error saving batch updates: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const suggestProductCode = (cat, productsList) => {
    const prefix = CATEGORY_PREFIXES[String(cat || "").toUpperCase()] || "PRD";
    const catProducts = productsList.filter(p => String(p.category || "").toUpperCase() === String(cat || "").toUpperCase());

    let maxNum = 0;
    catProducts.forEach(p => {
      if (p.productCode && p.productCode.startsWith(prefix + "-")) {
        const numPart = p.productCode.split("-")[1];
        const num = parseInt(numPart);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    return `${prefix}-${(maxNum + 1).toString().padStart(3, '0')}`;
  };

  const openAdd = () => {
    const defaultCat = "Hardware";
    const suggestedCode = suggestProductCode(defaultCat, products);
    setForm({ ...emptyForm, category: defaultCat, productCode: suggestedCode });
    setEditingId(null);
    setShowModal(true);
  };

  const updateCategory = (cat) => {
    // Only auto-update code if we are adding a NEW product
    // AND the current code is either empty or matches a prefix pattern
    let newCode = form.productCode;
    if (!editingId) {
      newCode = suggestProductCode(cat, products);
    }
    setForm({ ...form, category: cat, productCode: newCode });
  };

  const openEdit = (product) => {
    let code = product.productCode || "";
    if (!code) {
      code = suggestProductCode(product.category || "Hardware", products);
    }
    setForm({
      name: product.name || "",
      category: product.category || "Hardware",
      purchasePrice: product.purchasePrice || "",
      sellingPrice: product.sellingPrice || "",
      stock: product.stock || "",
      unit: product.unit || "Nos",
      supplier: product.supplier || "",
      totalSold: product.totalSold || 0,
      hsnCode: product.hsnCode || "",
      gstRate: product.gstRate || 0,
      productCode: code,
      lowStockThreshold: product.lowStockThreshold || "",
      shelfLocation: product.shelfLocation || ""
    });
    setEditingId(product.id);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.sellingPrice || !form.purchasePrice) {
      alert("Please fill in name, purchase price and selling price.");
      return;
    }
    setSaving(true);
    try {
      let finalProductCode = form.productCode;
      if (!finalProductCode || finalProductCode.trim() === "") {
        finalProductCode = suggestProductCode(form.category, products);
      }

      const data = {
        name: form.name,
        category: form.category,
        purchasePrice: parseFloat(form.purchasePrice),
        sellingPrice: parseFloat(form.sellingPrice),
        stock: parseFloat(form.stock) || 0,
        unit: form.unit || "Nos",
        supplier: form.supplier,
        totalSold: parseInt(form.totalSold) || 0,
        hsnCode: form.hsnCode || "",
        gstRate: parseFloat(form.gstRate) || 0,
        productCode: finalProductCode,
        lowStockThreshold: parseInt(form.lowStockThreshold) || (["CPVC", "PVC", "UPVC"].includes(String(form.category || "").toUpperCase()) ? 20 : 40),
        shelfLocation: form.shelfLocation || ""
      };
      if (editingId) {
        await updateProduct(editingId, data);
      } else {
        await addProduct(data);
      }
      setShowModal(false);
    } catch (e) {
      alert("Error saving product: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const exportInventory = () => {
    const rows = [["#", "Code", "Product Name", "Category", "Purchase Price", "Selling Price", "Stock", "Unit", "Total Sold", "Supplier", "HSN Code", "GST %"]];
    products.forEach((p, index) => {
      rows.push([
        index + 1,
        p.productCode || "",
        p.name,
        p.category,
        p.purchasePrice,
        p.sellingPrice,
        p.stock,
        p.unit || "Nos",
        p.totalSold || 0,
        p.supplier || "",
        p.hsnCode || "",
        p.gstRate || 0
      ]);
    });
    exportToExcel("inventory_master.xlsx", rows, "Inventory");
  };

  const exportSuppliers = () => {
    const rows = [["#", "Supplier Name", "Contact", "Address", "Notes"]];
    suppliers.forEach((s, index) => {
      rows.push([
        index + 1,
        s.name,
        s.contact || "",
        s.address || "",
        s.notes || ""
      ]);
    });
    exportToExcel("suppliers_master.xlsx", rows, "Suppliers");
  };

  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let validProducts = [];
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });

        // We will scan all sheets to see which ones contain actual products.
        // We consider a sheet to be a product sheet if it has at least 3 matching keywords in its header row.
        let sheetsToProcess = [];
        const targetKeywords = [
          "item name", "product name", "product", "name", "item", "code", "product code", "item code",
          "supplier name", "supplier", "vendor", "mrp", "price", "rate", "selling rate", "selling price",
          "purchase price", "cost", "cost price", "net rate", "stock", "qty", "quantity", "stocks"
        ];

        for (const wsname of wb.SheetNames) {
          const ws = wb.Sheets[wsname];
          const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });
          if (!sheetData || sheetData.length === 0) continue;

          let headerRowIdx = 0;
          let maxMatches = 0;

          // Scan the first 15 rows for headers
          for (let i = 0; i < Math.min(15, sheetData.length); i++) {
            const row = sheetData[i];
            if (!row || !Array.isArray(row)) continue;

            let matches = 0;
            row.forEach(cell => {
              const val = String(cell || "").trim().toLowerCase();
              if (targetKeywords.some(kw => val.includes(kw))) {
                matches++;
              }
            });

            if (matches > maxMatches) {
              maxMatches = matches;
              headerRowIdx = i;
            }
          }

          // If a sheet has at least 3 keyword matches, it's a valid product sheet.
          if (maxMatches >= 3) {
            sheetsToProcess.push({
              wsname,
              sheetData,
              headerRowIdx,
              maxMatches
            });
          }
        }

        // If NO sheets met the high threshold of >= 3 matches, fall back to the first sheet in the workbook
        if (sheetsToProcess.length === 0 && wb.SheetNames.length > 0) {
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1 });
          if (sheetData && sheetData.length > 0) {
            let headerRowIdx = 0;
            let maxMatches = 0;

            for (let i = 0; i < Math.min(15, sheetData.length); i++) {
              const row = sheetData[i];
              if (!row || !Array.isArray(row)) continue;

              let matches = 0;
              row.forEach(cell => {
                const val = String(cell || "").trim().toLowerCase();
                if (targetKeywords.some(kw => val.includes(kw))) {
                  matches++;
                }
              });

              if (matches > maxMatches) {
                maxMatches = matches;
                headerRowIdx = i;
              }
            }

            sheetsToProcess.push({
              wsname,
              sheetData,
              headerRowIdx,
              maxMatches
            });
          }
        }

        const getTitleCase = (str) => {
          if (!str) return "";
          return str.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        };
        const defaultCategory = category !== "ALL" ? getTitleCase(category) : "Hardware";

        const cleanString = (str) => {
          return String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        };

        const findColumnIndex = (headersList, aliases) => {
          const cleanedHeaders = headersList.map(h => cleanString(h));
          const cleanedAliases = aliases.map(a => cleanString(a));

          // Try exact cleaned match first
          for (let i = 0; i < cleanedHeaders.length; i++) {
            if (cleanedHeaders[i] && cleanedAliases.includes(cleanedHeaders[i])) {
              return i;
            }
          }

          // Fall back to partial match
          for (let i = 0; i < cleanedHeaders.length; i++) {
            const hClean = cleanedHeaders[i];
            if (!hClean) continue;
            for (const alias of cleanedAliases) {
              if (alias && (hClean.includes(alias) || alias.includes(hClean))) {
                return i;
              }
            }
          }
          return -1;
        };

        const parseNum = (val) => {
          if (val === undefined || val === null || val === "") return 0;
          if (typeof val === "number") return val;
          const cleaned = String(val).replace(/[^0-9.-]/g, "");
          const num = parseFloat(cleaned);
          return isNaN(num) ? 0 : num;
        };

        const getVal = (row, idx, defaultValue = "") => {
          if (idx === undefined || idx === null || idx < 0 || idx >= row.length) {
            return defaultValue;
          }
          return row[idx];
        };

        // Process all matching sheets
        for (const sheetObj of sheetsToProcess) {
          const { sheetData, headerRowIdx, maxMatches } = sheetObj;

          // If we matched at least 2 headers, extract column offsets dynamically.
          // Otherwise, assume the sheet has no header row and uses standard export indices.
          const headers = (maxMatches >= 2 && sheetData[headerRowIdx])
            ? sheetData[headerRowIdx].map(h => String(h || "").trim().toLowerCase())
            : [];

          let codeIdx, nameIdx, categoryIdx, purchasePriceIdx, sellingPriceIdx, stockIdx, unitIdx, totalSoldIdx, supplierIdx, hsnCodeIdx, gstRateIdx;
          let startRowIdx = 1;

          if (maxMatches >= 2) {
            codeIdx = findColumnIndex(headers, ["code", "product code", "item code", "barcode", "productcode"]);
            nameIdx = findColumnIndex(headers, ["product name", "product", "name", "item name", "item"]);
            categoryIdx = findColumnIndex(headers, ["category"]);
            purchasePriceIdx = findColumnIndex(headers, ["purchase price", "cost price", "cost", "purchase", "purchaseprice", "net rate", "net rate (rs.)", "mrp (rs.)", "mrp"]);
            sellingPriceIdx = findColumnIndex(headers, ["selling price", "price", "mrp", "rate", "selling", "sellingprice", "selling rate"]);
            stockIdx = findColumnIndex(headers, ["stock", "qty", "quantity", "current stock", "no. of stocks", "stocks", "no of stocks"]);
            unitIdx = findColumnIndex(headers, ["unit", "units"]);
            totalSoldIdx = findColumnIndex(headers, ["total sold", "sold", "sales", "totalsold"]);
            supplierIdx = findColumnIndex(headers, ["supplier", "vendor"]);
            hsnCodeIdx = findColumnIndex(headers, ["hsn code", "hsn", "hsncode"]);
            gstRateIdx = findColumnIndex(headers, ["gst %", "gst rate", "gst", "tax", "gstrate"]);

            startRowIdx = headerRowIdx + 1;
          } else {
            codeIdx = 1;
            nameIdx = 2;
            categoryIdx = 3;
            purchasePriceIdx = 4;
            sellingPriceIdx = 5;
            stockIdx = 6;
            unitIdx = 7;
            totalSoldIdx = 8;
            supplierIdx = 9;
            hsnCodeIdx = 10;
            gstRateIdx = 11;

            startRowIdx = 1;
          }

          for (let i = startRowIdx; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (!row || row.length === 0) continue;

            const productName = getVal(row, nameIdx, "")?.toString().trim() || "";
            // Skip header replica or empty name
            if (!productName || productName.toLowerCase() === "product name" || productName.toLowerCase() === "item name") continue;

            validProducts.push({
              productCode: getVal(row, codeIdx, "")?.toString().trim() || "",
              name: productName,
              category: getVal(row, categoryIdx, defaultCategory)?.toString().trim() || defaultCategory,
              purchasePrice: parseNum(getVal(row, purchasePriceIdx, 0)),
              sellingPrice: parseNum(getVal(row, sellingPriceIdx, 0)),
              stock: parseNum(getVal(row, stockIdx, 0)),
              unit: getVal(row, unitIdx, "Nos")?.toString().trim() || "Nos",
              totalSold: parseNum(getVal(row, totalSoldIdx, 0)),
              supplier: getVal(row, supplierIdx, "")?.toString().trim() || "",
              hsnCode: getVal(row, hsnCodeIdx, "")?.toString().trim() || "",
              gstRate: parseNum(getVal(row, gstRateIdx, 0))
            });
          }
        }
      } catch (err) {
        console.error(err);
        alert("Error parsing Excel file. Make sure it is a valid Excel/CSV spreadsheet.");
        e.target.value = "";
        return;
      }

      if (validProducts.length === 0) {
        alert("No valid products found to import. Make sure your sheet contains a column for Product Name.");
        e.target.value = "";
        return;
      }

      if (confirm(`Found ${validProducts.length} products across matching sheet(s). Proceed with import?`)) {
        setSaving(true);
        try {
          await importProductsBatch(validProducts);
          alert("Import successful!");
        } catch (err) {
          console.error(err);
          alert("Error saving products to database: " + err.message);
        } finally {
          setSaving(false);
          e.target.value = ""; // clear file input
        }
      } else {
        e.target.value = ""; // clear file input
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await deleteProduct(id);
  };

  const handleClearCategoryData = async () => {
    if (category === "ALL") return;
    
    // Find the products belonging to the active category
    const catProducts = products.filter(p => String(p.category || "").toUpperCase() === category.toUpperCase());
    
    if (catProducts.length === 0) {
      alert(`There are no products in the "${category}" category to clear.`);
      return;
    }

    const confirm1 = confirm(`⚠️ DANGER: You are about to permanently delete ALL ${catProducts.length} products belonging to the category "${category}".\n\nThis will remove their stock quantities, selling prices, barcodes, and supplier associations.\n\nAre you sure you want to proceed?`);
    if (!confirm1) return;

    const typedConfirmation = prompt(`To confirm deletion, please type the category name exactly in CAPITAL letters below:\n\nType: ${category.toUpperCase()}`);
    if (typedConfirmation !== category.toUpperCase()) {
      alert("Confirmation failed. Category name did not match. Operation cancelled.");
      return;
    }

    setSaving(true);
    try {
      const chunkSize = 50;
      for (let i = 0; i < catProducts.length; i += chunkSize) {
        const chunk = catProducts.slice(i, i + chunkSize);
        await Promise.all(chunk.map(prod => deleteProduct(prod.id)));
      }
      alert(`Success! Permanently deleted all ${catProducts.length} products from the "${category}" category.`);
    } catch (err) {
      console.error(err);
      alert("Error clearing category: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllProducts = async () => {
    if (products.length === 0) {
      alert("There are no products in the inventory to delete.");
      return;
    }

    const confirm1 = confirm(
      `⚠️ DANGER: You are about to permanently delete ALL ${products.length} products and stock items from the database.\n\nThis will remove all stock quantities, barcodes, pricing, and product records.\n\nAre you sure you want to proceed?`
    );
    if (!confirm1) return;

    const typedConfirmation = prompt(
      `To confirm permanent deletion of ALL ${products.length} products, type "DELETE ALL STOCKS" below:`
    );
    if (typedConfirmation !== "DELETE ALL STOCKS") {
      alert("Confirmation failed. Text did not match. Operation cancelled.");
      return;
    }

    setSaving(true);
    try {
      await deleteAllProducts();
      alert(`Success! Permanently deleted all ${products.length} products and stock items from the database.`);
    } catch (err) {
      console.error(err);
      alert("Error deleting products: " + err.message);
    } finally {
      setSaving(false);
    }
  };


  const handleBulkParse = () => {
    if (!bulkInput.trim()) return;
    const lines = bulkInput.split("\n").filter(l => l.trim());
    const items = [];

    lines.forEach((line, idx) => {
      const parts = line.split("\t");
      let name = line.trim();
      let stock = 0;
      let sellingPrice = 0;
      let purchasePrice = 0;

      if (parts.length > 1) {
        name = parts[0].trim();
        stock = parseFloat(parts[1]) || 0;
        sellingPrice = parseFloat(parts[2]) || 0;
        purchasePrice = sellingPrice * 0.7;
      }

      const category = "Hardware";
      const productCode = suggestProductCode(category, [...products, ...items]);

      items.push({
        id: idx,
        name,
        category,
        productCode,
        purchasePrice,
        sellingPrice,
        stock,
        unit: "Nos",
        hsnCode: "",
        gstRate: 18,
        supplier: "",
        lowStockThreshold: 40
      });
    });
    setBulkItems(items);
  };

  const updateBulkItem = (index, field, value) => {
    const newItems = [...bulkItems];
    newItems[index][field] = value;
    if (field === "category") {
      newItems[index].productCode = suggestProductCode(value, [...products, ...newItems.filter((_, i) => i !== index)]);
    }
    setBulkItems(newItems);
  };

  const handleAutoGenerateCodes = async () => {
    const productsWithoutCode = products.filter(p => !p.productCode || p.productCode.trim() === "");
    if (productsWithoutCode.length === 0) {
      alert("All products already have a product code.");
      return;
    }
    if (!confirm(`Found ${productsWithoutCode.length} products without a product code. Do you want to automatically generate codes for them now?`)) return;

    setSaving(true);
    try {
      const updates = [];
      const currentList = [...products];

      for (const p of productsWithoutCode) {
        const newCode = suggestProductCode(p.category || "Hardware", currentList);
        updates.push({ id: p.id, data: { productCode: newCode } });

        const idx = currentList.findIndex(item => item.id === p.id);
        if (idx !== -1) {
          currentList[idx].productCode = newCode;
        }
      }

      const chunkSize = 50;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        await batchUpdateProducts(chunk);
      }

      alert(`Successfully generated and assigned product codes to ${updates.length} products!`);
    } catch (err) {
      alert("Error generating codes: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSave = async () => {
    if (bulkItems.length === 0) return;
    setSaving(true);
    try {
      const importedProducts = [...products];
      const toImport = [];

      for (const item of bulkItems) {
        const { id, ...rest } = item;
        let pCode = rest.productCode;
        if (!pCode || pCode.trim() === "") {
          pCode = suggestProductCode(rest.category, importedProducts);
        }

        const newItem = {
          ...rest,
          productCode: pCode,
          purchasePrice: parseFloat(rest.purchasePrice) || 0,
          sellingPrice: parseFloat(rest.sellingPrice) || 0,
          stock: parseInt(rest.stock) || 0,
          gstRate: parseFloat(rest.gstRate) || 0,
          lowStockThreshold: parseInt(rest.lowStockThreshold) || 40,
          supplier: rest.supplier || ""
        };
        toImport.push(newItem);
        importedProducts.push(newItem);
      }

      await importProductsBatch(toImport);
      setShowBulkModal(false);
      setBulkInput("");
      setBulkItems([]);
      alert(`Successfully imported ${toImport.length} products!`);
    } catch (e) {
      alert("Error during bulk import: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page inventory-page">
      <div className="page-header">
        <div>
          <div className="page-sub">STOCK MANAGEMENT</div>
          <h1 className="page-title">Inventory</h1>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={handleAutoGenerateCodes}>⚙️ GEN MISSING CODES</button>
          <button className="btn-secondary" onClick={exportSuppliers}>📥 EXPORT SUPPLIERS</button>
          <button className="btn-secondary" onClick={exportInventory}>📥 EXPORT EXCEL</button>
          <button className="btn-secondary" onClick={() => fileInputRef.current.click()}>📤 IMPORT EXCEL</button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportExcel}
            accept=".xlsx, .xls, .csv"
            style={{ display: "none" }}
          />
          <button
            className="btn-secondary"
            onClick={handleDeleteAllProducts}
            style={{ background: "rgba(231, 76, 60, 0.15)", color: "#e74c3c", borderColor: "rgba(231, 76, 60, 0.3)", fontWeight: "bold" }}
            title="Permanently delete all products and stock items from the database"
          >
            🗑️ DELETE ALL STOCKS
          </button>
          {isBatchEditing ? (
            <>
              <button className="btn-primary" onClick={handleSaveBatch} style={{ background: "#2ecc71" }} disabled={saving}>
                {saving ? "💾 SAVING..." : "💾 SAVE BATCH"}
              </button>
              <button className="btn-secondary" onClick={() => { setIsBatchEditing(false); setBatchUpdates({}); }}>
                ❌ CANCEL
              </button>
            </>
          ) : (
            <button className="btn-secondary" onClick={() => setIsBatchEditing(true)}>✏️ BATCH EDIT</button>
          )}
          <button className="btn-primary" onClick={() => setShowBarcodeModal(true)} style={{ background: "#8e44ad" }}>🏷️ BARCODE PRINTER</button>
          <button className="btn-primary" onClick={() => setShowReorderModal(true)} style={{ background: "#e67e22" }}>📋 REORDER SHEET</button>
          <button className="btn-primary" onClick={() => setShowBulkModal(true)} style={{ background: "#1c1917" }}>🚀 SMART BULK ADD</button>
          <button className="btn-primary" onClick={openAdd}>+ ADD PRODUCT</button>
        </div>
      </div>

      <div className="inventory-filters">
        <div className="search-box">
          <span>🔍</span>
          <input
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            onClick={() => setShowScanner(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '16px', color: '#888',
              padding: '0 8px'
            }}
            title="Scan Barcode via Camera"
          >
            📷
          </button>
        </div>
        <div className="category-tabs">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              className={`cat-tab ${category === cat ? "active" : ""}`}
              onClick={() => {
                setCategory(cat);
                setPlumbingFilter("ALL");
                setSortField(null);
                setSortAsc(true);
              }}
            >
              {cat}
            </button>
          ))}
          <button
            className={`cat-tab ${showLowStock ? "active" : ""}`}
            style={{ background: showLowStock ? "#e74c3c" : "transparent", color: showLowStock ? "#fff" : "#e74c3c", borderColor: "#e74c3c", marginLeft: "10px" }}
            onClick={() => setShowLowStock(!showLowStock)}
          >
            {showLowStock ? "⚠️ SHOWING ALERTS" : "⚠️ LOW STOCK ALERTS"}
          </button>
          {category !== "ALL" && (
            <button
              className="cat-tab"
              style={{
                background: "rgba(231, 76, 60, 0.12)",
                color: "#e74c3c",
                borderColor: "rgba(231, 76, 60, 0.25)",
                marginLeft: "auto",
                fontWeight: "800",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px"
              }}
              onClick={handleClearCategoryData}
              title={`Permanently delete all products inside the category: ${category}`}
            >
              🗑️ WIPE {category.toUpperCase()}
            </button>
          )}
        </div>
        {category === "PLUMBING" && (
          <div className="sub-category-tabs" style={{ display: "flex", gap: "8px", marginTop: "12px", background: "rgba(255,255,255,0.02)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(120, 113, 108, 0.1)", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "#aaa", marginRight: "10px", fontWeight: "bold" }}>Filter By Type:</span>
            {["ALL", "CPVC", "PVC", "UPVC"].map(sub => (
              <button
                key={sub}
                className={`cat-tab ${plumbingFilter === sub ? "active" : ""}`}
                style={{
                  padding: "5px 12px",
                  fontSize: "11px",
                  borderRadius: "6px",
                  background: plumbingFilter === sub ? "#2ecc71" : "transparent",
                  color: plumbingFilter === sub ? "#fff" : "#aaa",
                  border: "1.5px solid",
                  borderColor: plumbingFilter === sub ? "#2ecc71" : "rgba(255,255,255,0.15)",
                  cursor: "pointer",
                  fontWeight: "bold",
                  transition: "all 0.2s"
                }}
                onClick={() => setPlumbingFilter(sub)}
              >
                {sub === "ALL" ? "All Plumbing" : sub}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="table-container">
        {showLowStock ? (
          <table className="data-table tally-table">
            <thead>
              <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #ccc" }}>
                {renderSortableHeader("PRODUCT NAME", "name")}
                {renderSortableHeader("CATEGORY", "category")}
                {renderSortableHeader("STOCK", "stock")}
                {renderSortableHeader("SUPPLIER", "supplier")}
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map(product => (
                <tr key={product.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ color: "#000", fontWeight: "bold" }}>{product.name}</td>
                  <td style={{ color: "#555" }}>{product.category}</td>
                  <td style={{ color: product.stock <= 0 ? "#e74c3c" : "#d35400", fontWeight: "bold" }}>{product.stock} {product.unit || 'Nos'}</td>
                  <td style={{ color: "#555" }}>{product.supplier || "-"}</td>
                </tr>
              ))}
              {sortedFiltered.length === 0 && (
                <tr><td colSpan="4" className="empty-row" style={{ padding: "20px", color: "#777" }}>No low stock alerts found.</td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {renderSortableHeader("CODE", "productCode")}
                {renderSortableHeader("PRODUCT", "name")}
                {renderSortableHeader("CATEGORY", "category")}
                {renderSortableHeader("COST", "purchasePrice")}
                {renderSortableHeader("PRICE", "sellingPrice")}
                {renderSortableHeader("STOCK", "stock")}
                {renderSortableHeader("SOLD", "totalSold")}
                {renderSortableHeader("SUPPLIER", "supplier")}
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map(product => (
                <tr key={product.id}>
                  <td>{product.productCode || '-'}</td>
                  <td><strong>{product.name}</strong></td>
                  <td>{product.category}</td>
                  <td>
                    {isBatchEditing ? (
                      <input
                        type="number"
                        value={batchUpdates[product.id]?.purchasePrice !== undefined ? batchUpdates[product.id].purchasePrice : product.purchasePrice || 0}
                        onChange={e => handleBatchChange(product.id, "purchasePrice", e.target.value)}
                        style={{ width: "80px", padding: "4px 8px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", fontSize: "13px" }}
                      />
                    ) : (
                      `₹${product.purchasePrice?.toLocaleString()}`
                    )}
                  </td>
                  <td className={product.stock <= 5 ? "price-low" : "price-orange"}>
                    {isBatchEditing ? (
                      <input
                        type="number"
                        value={batchUpdates[product.id]?.sellingPrice !== undefined ? batchUpdates[product.id].sellingPrice : product.sellingPrice || 0}
                        onChange={e => handleBatchChange(product.id, "sellingPrice", e.target.value)}
                        style={{ width: "80px", padding: "4px 8px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", fontSize: "13px" }}
                      />
                    ) : (
                      `₹${product.sellingPrice?.toLocaleString()}`
                    )}
                  </td>
                  <td className={product.stock <= 5 ? "stock-low" : ""}>
                    {isBatchEditing ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="number"
                          value={batchUpdates[product.id]?.stock !== undefined ? batchUpdates[product.id].stock : product.stock || 0}
                          onChange={e => handleBatchChange(product.id, "stock", e.target.value)}
                          style={{ width: "65px", padding: "4px 8px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "4px", fontSize: "13px" }}
                        />
                        <span style={{ fontSize: "11px", color: "#888" }}>{product.unit || 'Nos'}</span>
                      </div>
                    ) : (
                      `${product.stock} ${product.unit || 'Nos'}`
                    )}
                  </td>
                  <td>{product.totalSold || 0}</td>
                  <td className="supplier-cell">{product.supplier}</td>
                  <td>
                    {!isBatchEditing ? (
                      <div className="action-btns">
                        <button className="edit-btn" style={{ background: "#2980b9" }} title="Stock Movement History" onClick={() => openHistoryModal(product)}>📜</button>
                        <button className="edit-btn" style={{ background: "#8e44ad" }} title="Locate on Floor Map" onClick={() => setLocateProduct(product)}>📍</button>
                        <button className="edit-btn" style={{ background: "#27ae60" }} title="Add to Barcode Batch" onClick={() => handleAddProductToBarcode(product)}>🏷️</button>
                        <button className="edit-btn" onClick={() => openEdit(product)}>✏️</button>
                        <button className="delete-btn" onClick={() => handleDelete(product.id, product.name)}>🗑</button>
                      </div>

                    ) : (
                      <span style={{ color: "#888", fontSize: "11px" }}>Editing...</span>
                    )}
                  </td>
                </tr>
              ))}
              {sortedFiltered.length === 0 && (
                <tr><td colSpan="9" className="empty-row">No products found.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content form-modal" onClick={e => e.stopPropagation()}>
            <h2>{editingId ? "Edit Product" : "Add Product"}</h2>
            <div className="form-grid">
              <div className="form-group">
                <label>Product Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Angle Grinder 4&quot;" />
              </div>
              <div className="form-group">
                <label>Product Code</label>
                <input value={form.productCode} onChange={e => setForm({ ...form, productCode: e.target.value })} placeholder="e.g. SW-102" />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category} onChange={e => updateCategory(e.target.value)}>
                  <option>Hardware</option>
                  <option>Electrical</option>
                  <option>Plumbing</option>
                  <option>Sanitaryware</option>
                  <option>Bathroom Fittings</option>
                  <option>Motors</option>
                  <option>House Appliances</option>
                </select>
              </div>
              <div className="form-group">
                <label>Purchase Price (₹) *</label>
                <input type="number" value={form.purchasePrice} onChange={e => setForm({ ...form, purchasePrice: e.target.value })} placeholder="2200" />
              </div>
              <div className="form-group">
                <label>Selling Price (₹) *</label>
                <input type="number" value={form.sellingPrice} onChange={e => setForm({ ...form, sellingPrice: e.target.value })} placeholder="3100" />
              </div>
              <div className="form-group">
                <label>HSN / SAC Code</label>
                <input value={form.hsnCode} onChange={e => setForm({ ...form, hsnCode: e.target.value })} placeholder="8205" />
              </div>
              <div className="form-group">
                <label>GST Rate (%)</label>
                <select value={form.gstRate} onChange={e => setForm({ ...form, gstRate: e.target.value })}>
                  <option value={0}>0% (Exempt)</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
              </div>
              <div className="form-group">
                <label>Stock Quantity</label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input type="number" step="any" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} placeholder="10" style={{ flex: 2 }} />
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={{ flex: 1 }}>
                    <option value="nos">nos</option>
                    <option value="FEET">FEET</option>
                    <option value="MTR">MTR</option>
                    <option value="KG">KG</option>
                    <option value="GRAM">GRAM</option>
                    <option value="LTR">LTR</option>
                    <option value="SET">SET</option>
                    <option value="RS">RS</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Low Stock Alert Level (Threshold)</label>
                <input
                  type="number"
                  value={form.lowStockThreshold}
                  onChange={e => setForm({ ...form, lowStockThreshold: e.target.value })}
                  placeholder={["PLUMBING", "CPVC", "PVC", "UPVC"].includes(String(form.category || "").toUpperCase()) ? "20" : "40"}
                />
              </div>
              <div className="form-group">
                <label>Shelf Location (Aisle/Rack)</label>
                <input
                  value={form.shelfLocation || ""}
                  onChange={e => setForm({ ...form, shelfLocation: e.target.value })}
                  placeholder="e.g. Rack A-3, Shelf 2"
                />
              </div>
              <div className="form-group">
                <label>Supplier</label>
                <input
                  list="suppliers-list"
                  value={form.supplier}
                  onChange={e => setForm({ ...form, supplier: e.target.value })}
                  placeholder="Search supplier..."
                />
                <datalist id="suppliers-list">
                  {suppliers.map(s => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="modal-btns">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingId ? "Update" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "95vw", width: "1200px" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe"></div>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Smart Bulk Add (Tally / Excel Paste)
              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => setShowBulkModal(false)}>Close</button>
            </h2>

            <div className="bulk-help-box">
              <strong>💡 Pro Tip:</strong>
              You can copy-paste multiple rows from <strong>Tally Prime (Stock Summary)</strong> or <strong>Excel</strong> directly here.
              One product per line. If you paste from Excel, we will automatically try to detect columns.
            </div>

            <textarea
              className="bulk-textarea"
              placeholder="Paste product names or Excel rows here...&#10;Example:&#10;Angle Grinder 4&quot;&#10;PVC Pipe 20mm&#10;LED Bulb 9W"
              value={bulkInput}
              onChange={e => setBulkInput(e.target.value)}
              onBlur={handleBulkParse}
            />

            {bulkItems.length > 0 && (
              <div className="bulk-preview-container">
                <table className="bulk-preview-table">
                  <thead>
                    <tr>
                      <th style={{ width: "100px" }}>CODE</th>
                      <th style={{ minWidth: "250px" }}>PRODUCT NAME</th>
                      <th style={{ width: "120px" }}>CATEGORY</th>
                      <th style={{ width: "80px" }}>COST</th>
                      <th style={{ width: "80px" }}>PRICE</th>
                      <th style={{ width: "80px" }}>STOCK</th>
                      <th style={{ width: "80px" }}>GST %</th>
                      <th style={{ width: "120px" }}>SUPPLIER</th>
                      <th style={{ width: "80px" }}>THRESHOLD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkItems.map((item, idx) => (
                      <tr key={idx}>
                        <td>
                          <input value={item.productCode} onChange={e => updateBulkItem(idx, "productCode", e.target.value)} placeholder="Code" />
                        </td>
                        <td>
                          <input value={item.name} onChange={e => updateBulkItem(idx, "name", e.target.value)} />
                        </td>
                        <td>
                          <select value={item.category} onChange={e => updateBulkItem(idx, "category", e.target.value)}>
                            {CATEGORIES.filter(c => c !== "ALL").map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input type="number" value={item.purchasePrice} onChange={e => updateBulkItem(idx, "purchasePrice", e.target.value)} />
                        </td>
                        <td>
                          <input type="number" value={item.sellingPrice} onChange={e => updateBulkItem(idx, "sellingPrice", e.target.value)} />
                        </td>
                        <td>
                          <input type="number" value={item.stock} onChange={e => updateBulkItem(idx, "stock", e.target.value)} />
                        </td>
                        <td>
                          <select value={item.gstRate} onChange={e => updateBulkItem(idx, "gstRate", e.target.value)}>
                            <option value={0}>0%</option>
                            <option value={5}>5%</option>
                            <option value={12}>12%</option>
                            <option value={18}>18%</option>
                            <option value={28}>28%</option>
                          </select>
                        </td>
                        <td>
                          <input
                            list="bulk-suppliers-list"
                            value={item.supplier}
                            onChange={e => updateBulkItem(idx, "supplier", e.target.value)}
                            placeholder="Supplier..."
                          />
                          <datalist id="bulk-suppliers-list">
                            {suppliers.map(s => (
                              <option key={s.id} value={s.name} />
                            ))}
                          </datalist>
                        </td>
                        <td>
                          <input type="number" value={item.lowStockThreshold} onChange={e => updateBulkItem(idx, "lowStockThreshold", e.target.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-btns" style={{ marginTop: "20px" }}>
              <span style={{ marginRight: "auto", fontSize: "12px", color: "#666" }}>
                {bulkItems.length} items found
              </span>
              <button className="btn-secondary" onClick={() => { setBulkInput(""); setBulkItems([]); }}>Clear</button>
              <button className="btn-primary" onClick={handleBulkSave} disabled={saving || bulkItems.length === 0}>
                {saving ? "Importing..." : `Import ${bulkItems.length} Products`}
              </button>
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
      {showReorderModal && (
        <div className="modal-overlay" onClick={() => setShowReorderModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "800px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe"></div>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📋 Auto-Reorder Sheets</span>
              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => setShowReorderModal(false)}>Close</button>
            </h2>

            <div className="bulk-help-box">
              <strong>💡 Smart Purchase Orders:</strong> Below are all products currently at or below their low-stock thresholds, grouped by their assigned supplier. You can adjust the reorder quantities and click the WhatsApp button to instantly send an order!
            </div>

            <div style={{ maxHeight: "60vh", overflowY: "auto", marginTop: "15px" }}>
              {(() => {
                const lowStockProducts = products.filter(p => p.stock <= (p.lowStockThreshold || (["CPVC", "PVC", "UPVC"].includes(String(p.category || "").toUpperCase()) ? 20 : 40)));

                if (lowStockProducts.length === 0) {
                  return <div className="empty-state">🎉 All products are fully stocked! No reorders needed.</div>;
                }

                const lowStockBySupplier = {};
                lowStockProducts.forEach(p => {
                  const sName = p.supplier || "Unassigned Supplier";
                  if (!lowStockBySupplier[sName]) lowStockBySupplier[sName] = [];
                  lowStockBySupplier[sName].push(p);
                });

                return Object.entries(lowStockBySupplier).map(([supplierName, items]) => {
                  const supplierObj = suppliers.find(s => s.name?.toLowerCase() === supplierName.toLowerCase());
                  const contactNum = supplierObj?.contact || "";

                  return (
                    <div key={supplierName} className="stat-card" style={{ marginBottom: "20px", border: "1px solid rgba(0,0,0,0.08)", padding: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1.5px solid rgba(255,255,255,0.1)", paddingBottom: "10px", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                        <div>
                          <strong style={{ fontSize: "16px" }}>🚚 {supplierName}</strong>
                          {contactNum && <span style={{ fontSize: "12px", color: "#888", marginLeft: "10px" }}>📞 {contactNum}</span>}
                        </div>
                        <button
                          className="btn-primary"
                          style={{ background: "#25d366", fontSize: "12px", padding: "6px 12px" }}
                          onClick={() => {
                            const dateStr = new Date().toLocaleDateString("en-IN");
                            const itemLines = items.map(item => {
                              const qtyVal = document.getElementById(`reorder-qty-${item.id}`)?.value || 50;
                              return `• ${qtyVal}x ${item.name} (Code: ${item.productCode || "-"})`;
                            }).join("\n");

                            const msg = `*Vijayapathi Traders - Restock Order*\n\n*Supplier:* ${supplierName}\n*Date:* ${dateStr}\n\n*Please restock the following items:*\n${itemLines}\n\nPlease confirm delivery date and send the invoice. Thank you!`;
                            const cleanPhone = contactNum.replace(/\D/g, "");
                            const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
                            const link = document.createElement("a");
                            link.href = url;
                            link.target = "_blank";
                            link.click();
                          }}
                        >
                          💬 Send WhatsApp Order
                        </button>
                      </div>
                      <table className="data-table" style={{ fontSize: "12px" }}>
                        <thead>
                          <tr>
                            <th>CODE</th>
                            <th>PRODUCT</th>
                            <th>STOCK</th>
                            <th>THRESHOLD</th>
                            <th style={{ width: "120px" }}>REORDER QTY</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(item => (
                            <tr key={item.id}>
                              <td>{item.productCode || "-"}</td>
                              <td><strong>{item.name}</strong></td>
                              <td style={{ color: "#e74c3c", fontWeight: "bold" }}>{item.stock} {item.unit || "Nos"}</td>
                              <td>{item.lowStockThreshold || (["CPVC", "PVC", "UPVC"].includes(String(item.category || "").toUpperCase()) ? 20 : 40)}</td>
                              <td>
                                <input
                                  id={`reorder-qty-${item.id}`}
                                  type="number"
                                  defaultValue={50}
                                  min={1}
                                  style={{ width: "80px", padding: "4px 8px", border: "1px solid #ccc", borderRadius: "4px", fontSize: "12px" }}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Barcode Printer Modal */}
      {showBarcodeModal && (
        <div className="modal-overlay" onClick={() => setShowBarcodeModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "800px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#8e44ad" }}></div>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🏷️ Barcode Sticker Printer</span>
              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => setShowBarcodeModal(false)}>Close</button>
            </h2>

            <div className="bulk-help-box">
              Add products below, select sticker quantities, and print directly.
              <div style={{ marginTop: "8px", display: "flex", gap: "10px" }}>
                <button className="btn-secondary" style={{ padding: "2px 6px", fontSize: "10px" }} onClick={handleAddAllLowStockToBarcode}>⚠️ Add All Low-Stock Items</button>
                <select value={barcodeLayout} onChange={e => setBarcodeLayout(e.target.value)} style={{ padding: "2px 6px", fontSize: "10px", borderRadius: "4px" }}>
                  <option value="A4">📄 A4 Sticker Sheets (3x8 grid)</option>
                  <option value="THERMAL">🖨️ Thermal Sticker Roll</option>
                </select>
              </div>
            </div>

            <div style={{ maxHeight: "45vh", overflowY: "auto", marginTop: "15px" }}>
              <table className="data-table" style={{ fontSize: "12px" }}>
                <thead>
                  <tr>
                    <th>CODE</th>
                    <th>PRODUCT</th>
                    <th>PRICE</th>
                    <th>RACK</th>
                    <th style={{ width: "120px" }}>COPIES</th>
                    <th>REMOVE</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(barcodeBatch).filter(([_, count]) => count > 0).map(([id, count]) => {
                    const p = products.find(prod => prod.id === id);
                    if (!p) return null;
                    return (
                      <tr key={id}>
                        <td>{p.productCode}</td>
                        <td><strong>{p.name}</strong></td>
                        <td>₹{p.sellingPrice}</td>
                        <td>{p.shelfLocation || "-"}</td>
                        <td>
                          <input
                            type="number"
                            value={count}
                            min={1}
                            onChange={e => setBarcodeBatch(prev => ({ ...prev, [id]: parseInt(e.target.value) || 0 }))}
                            style={{ width: "80px", padding: "4px 8px", border: "1px solid #ccc", borderRadius: "4px", fontSize: "12px" }}
                          />
                        </td>
                        <td>
                          <button className="delete-btn" onClick={() => setBarcodeBatch(prev => ({ ...prev, [id]: 0 }))}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                  {Object.values(barcodeBatch).filter(count => count > 0).length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: "center", padding: "20px", color: "#888" }}>
                        No products added to the print queue yet. Click the label icon (🏷️) in the inventory table next to items to queue them.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-btns" style={{ marginTop: "20px" }}>
              <button className="btn-secondary" onClick={() => { setBarcodeBatch({}); setShowBarcodeModal(false); }}>Clear Batch</button>
              <button
                className="btn-primary"
                style={{ background: "#8e44ad" }}
                onClick={handlePrintBarcodes}
                disabled={Object.values(barcodeBatch).filter(count => count > 0).length === 0}
              >
                🖨️ Generate and Print Labels
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shop Map Locator Modal */}
      {locateProduct && (
        <div className="modal-overlay" onClick={() => { setLocateProduct(null); setLocatorTab("map"); }}>
          <div className="modal-content form-modal" style={{ maxWidth: "600px", width: "95vw" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#8e44ad" }}></div>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📍 Shelf Location: {locateProduct.shelfLocation || getHighlightZone(locateProduct)}</span>
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
              />
            )}

            <div className="modal-btns" style={{ marginTop: "20px" }}>
              <button className="btn-secondary" style={{ width: "100%" }} onClick={() => { setLocateProduct(null); setLocatorTab("map"); }}>Got It</button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Movement Audit History Modal */}
      {showHistoryModal && historyProduct && (
        <div className="modal-overlay" style={{ zIndex: 9996 }} onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "700px", width: "95%", padding: "20px" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe"></div>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 0 15px 0" }}>
              <span>📜 Stock Movement History: <strong>{historyProduct.name}</strong></span>
              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => setShowHistoryModal(false)}>Close</button>
            </h2>

            <div style={{ background: "rgba(120,113,108,0.1)", borderRadius: "8px", padding: "10px", marginBottom: "15px", fontSize: "13px", display: "flex", gap: "20px" }}>
              <div><strong>Code:</strong> {historyProduct.productCode || "-"}</div>
              <div><strong>Current Stock:</strong> <span style={{ color: "#27ae60", fontWeight: "bold" }}>{historyProduct.stock} {historyProduct.unit || "Nos"}</span></div>
              <div><strong>Category:</strong> {historyProduct.category}</div>
            </div>

            {loadingHistory ? (
              <div style={{ textAlign: "center", padding: "30px", color: "#888" }}>Loading movement logs...</div>
            ) : historyLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px", color: "#888" }}>No recorded stock movements found for this product yet. Future purchases and sales will automatically log movement trails here.</div>
            ) : (
              <div style={{ maxHeight: "350px", overflowY: "auto", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px" }}>
                <table className="data-table" style={{ fontSize: "12px" }}>
                  <thead>
                    <tr>
                      <th>TIMESTAMP</th>
                      <th>TYPE</th>
                      <th>PREV STOCK</th>
                      <th>CHANGE</th>
                      <th>NEW STOCK</th>
                      <th>USER / REASON</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLogs.map(log => {
                      const isPositive = log.qty > 0;
                      return (
                        <tr key={log.id}>
                          <td>{log.dateStr}</td>
                          <td>
                            <span style={{
                              padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold",
                              background: log.type === "SALE" ? "#e74c3c" : log.type === "PURCHASE" ? "#2ecc71" : "#f39c12",
                              color: "#fff"
                            }}>
                              {log.type}
                            </span>
                          </td>
                          <td>{log.previousStock}</td>
                          <td style={{ color: isPositive ? "#2ecc71" : "#e74c3c", fontWeight: "bold" }}>
                            {isPositive ? `+${log.qty}` : log.qty}
                          </td>
                          <td>{log.newStock}</td>
                          <td>{log.createdBy || "System"} <br/><small style={{ color: "#888" }}>{log.reason || "-"}</small></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-btns" style={{ marginTop: "15px" }}>
              <button className="btn-secondary" style={{ width: "100%" }} onClick={() => setShowHistoryModal(false)}>Close Log</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

