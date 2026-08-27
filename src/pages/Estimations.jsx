import React, { useState, useMemo, useRef } from "react";
import { useApp } from "../AppContext";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { matchesProductSearch } from "../utils";

const PIPE_SIZES = ['1/2"', '3/4"', '1"', '1-1/4"', '1-1/2"', '2"', '2-1/2"', '3"', '4"'];

const ESTIMATION_TEMPLATES = {
  bathroom: [
    { name: 'CPVC Pipe 3/4" (10 Ft)', qty: 3, category: 'PLUMBING', estimatedPrice: 160 },
    { name: 'CPVC Elbow 3/4"', qty: 8, category: 'PLUMBING', estimatedPrice: 18 },
    { name: 'CPVC Tee 3/4"', qty: 4, category: 'PLUMBING', estimatedPrice: 24 },
    { name: 'Brass Elbow 3/4" x 1/2"', qty: 3, category: 'PLUMBING', estimatedPrice: 95 },
    { name: 'CPVC Gate Valve 3/4"', qty: 1, category: 'PLUMBING', estimatedPrice: 220 },
    { name: 'Teflon Tape', qty: 2, category: 'HARDWARE', estimatedPrice: 20 },
    { name: 'PVC Solvent Cement 100ml', qty: 1, category: 'PLUMBING', estimatedPrice: 75 }
  ],
  kitchen: [
    { name: 'CPVC Pipe 3/4" (10 Ft)', qty: 2, category: 'PLUMBING', estimatedPrice: 160 },
    { name: 'CPVC Elbow 3/4"', qty: 6, category: 'PLUMBING', estimatedPrice: 18 },
    { name: 'CPVC Tee 3/4"', qty: 2, category: 'PLUMBING', estimatedPrice: 24 },
    { name: 'Brass Elbow 3/4" x 1/2"', qty: 2, category: 'PLUMBING', estimatedPrice: 95 },
    { name: 'PVC Waste Pipe 1-1/2"', qty: 1, category: 'PLUMBING', estimatedPrice: 65 },
    { name: 'Teflon Tape', qty: 1, category: 'HARDWARE', estimatedPrice: 20 },
    { name: 'PVC Solvent Cement 100ml', qty: 1, category: 'PLUMBING', estimatedPrice: 75 }
  ]
};

export default function Estimations() {
  const { products, estimations, saveEstimation, updateEstimation, deleteEstimation, setEditingSale } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("builder"); // "builder" | "saved" | "construction"
  const [editingId, setEditingId] = useState(null); 
  const [showModal, setShowModal] = useState(false);
  const [lastEstimate, setLastEstimate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const receiptRef = useRef(null);

  const [pdfEstimate, setPdfEstimate] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Builder State
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [plumbingFilter, setPlumbingFilter] = useState("ALL");
  const [cart, setCart] = useState([]);
  const [estimationName, setEstimationName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [siteName, setSiteName] = useState("");
  const [discount, setDiscount] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState("Group A");

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [bulkItems, setBulkItems] = useState([]);
  const [isEditingBulk, setIsEditingBulk] = useState(false);

  // Construction tab state
  const [calcMainSize, setCalcMainSize] = useState('1"');
  const [calcBranchSize, setCalcBranchSize] = useState('1/2"');
  const [activeTemplate, setActiveTemplate] = useState("bathroom");

  // Room Pipe & Wire Length Calculator state
  const [calcRoomLength, setCalcRoomLength] = useState(12);
  const [calcRoomWidth, setCalcRoomWidth] = useState(10);
  const [calcRoomHeight, setCalcRoomHeight] = useState(10);
  const [calcRoomCount, setCalcRoomCount] = useState(4);
  const [calcFloorCount, setCalcFloorCount] = useState(1);
  const [calcSystemType, setCalcSystemType] = useState("electrical"); // "electrical" | "plumbing"

  const GROUPS = ["Group A", "Group B", "Group C", "Group D"];
  const CATEGORIES = ["ALL", "HARDWARE", "ELECTRICAL", "PLUMBING", "SANITARYWARE", "BATHROOM FITTINGS", "MOTORS", "HOUSE APPLIANCES"];

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
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

      return matchSearch && matchCat && matchPlumbingType;
    });
  }, [products, search, category, plumbingFilter]);


  const addToCart = (product) => {
    const existing = cart.find(i => i.id === product.id || i.productId === product.id);
    if (existing) {
      setCart(cart.map(i => (i.id === product.id || i.productId === product.id) ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setCart([...cart, { ...product, qty: 1 }]);
    }
  };

  const updateQty = (id, value) => {
    const newQty = value === "" ? "" : parseInt(value);
    setCart(cart.map(i => {
      if (i.id === id || i.productId === id) {
        if (newQty === "") return { ...i, qty: "" };
        if (isNaN(newQty) || newQty < 0) return i;
        return { ...i, qty: newQty };
      }
      return i;
    }));
  };

  const updatePrice = (id, value) => {
    const price = value === "" ? "" : parseFloat(value);
    setCart(cart.map(i => {
      if (i.id === id || i.productId === id) {
        if (price === "") return { ...i, sellingPrice: "" };
        if (isNaN(price) || price < 0) return i;
        return { ...i, sellingPrice: price };
      }
      return i;
    }));
  };

  const adjustQty = (id, delta) => {
    setCart(cart.map(i => {
      if (i.id === id || i.productId === id) {
        const currentQty = typeof i.qty === 'number' ? i.qty : 0;
        const newQty = Math.max(0, currentQty + delta);
        return { ...i, qty: newQty };
      }
      return i;
    }).filter(i => i.qty > 0));
  };

  const removeItem = (id) => {
    setCart(cart.filter(i => (i.id !== id && i.productId !== id)));
  };

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

  const handleProductNameChange = (idx, nameValue) => {
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

  const subtotal = cart.reduce((sum, item) => sum + (item.sellingPrice * item.qty), 0);
  const grandTotal = subtotal - (discount || 0);

  const handleSaveEstimate = async () => {
    if (cart.length === 0) return alert("Cart is empty");
    
    setSaving(true);
    try {
      const finalName = `${selectedGroup} - ${estimationName || "Untitled"}`;
      let estimate;
      if (editingId) {
        const updatedData = {
          estimationName: finalName,
          items: cart.map(i => ({
            productId: i.id || i.productId, name: i.name, qty: i.qty, sellingPrice: i.sellingPrice,
            hsnCode: i.hsnCode || "", gstRate: parseFloat(i.gstRate) || 0
          })),
          total: grandTotal,
          discount: parseFloat(discount) || 0,
          customerName,
          customerPhone,
          siteName,
          subtotal
        };
        await updateEstimation(editingId, updatedData);
        estimate = { id: editingId, ...updatedData, date: new Date().toISOString().split("T")[0], time: new Date().toLocaleTimeString() };
      } else {
        estimate = await saveEstimation(cart, finalName, customerName, customerPhone, parseFloat(discount) || 0, false, siteName);
      }
      
      setLastEstimate(estimate);
      setShowModal(true);
      resetBuilder();
    } catch (e) {
      alert("Error saving estimation: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetBuilder = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setSiteName("");
    setEstimationName("");
    setDiscount(0);
    setEditingId(null);
  };

  const loadEstimation = (est) => {
    setEditingId(est.id);
    const groupParts = est.estimationName.split(" - ");
    if (groupParts.length > 1) {
      setSelectedGroup(groupParts[0]);
      setEstimationName(groupParts.slice(1).join(" - "));
    } else {
      setEstimationName(est.estimationName);
    }
    setCart(est.items.map(item => ({ ...item, id: item.productId })));
    setCustomerName(est.customerName || "");
    setCustomerPhone(est.customerPhone || "");
    setSiteName(est.siteName || "");
    setDiscount(est.discount || 0);
    setActiveTab("builder");
  };

  const checkoutToPOS = (est) => {
    const saleData = {
      ...est,
      id: "TEMP_EST_" + est.id, 
      paymentMethod: "CASH" 
    };
    setEditingSale(saleData);
    navigate("/billing");
  };

  React.useEffect(() => {
    if (!pdfEstimate || !receiptRef.current) return;
    
    const timer = setTimeout(async () => {
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
        pdf.save(`Quotation_${pdfEstimate.estimationName || "Estimate"}_${pdfEstimate.date || new Date().toISOString().split("T")[0]}.pdf`);
      } catch (err) {
        console.error("PDF generation error:", err);
        alert("Failed to download PDF. Please try printing instead.");
      } finally {
        setPdfEstimate(null);
        setPdfLoading(false);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [pdfEstimate]);

  const handleDownloadPDF = (est) => {
    if (!est) return;
    setPdfLoading(true);
    setPdfEstimate(est);
  };

  const handlePrint = (est = lastEstimate) => {
    if (!est) return;
    
    const printWindow = window.open("", "_blank", "width=800,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
      <head>
        <title>${est.estimationName || "Quotation"}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; font-size: 13px; color: #000; background: #fff; }
          .a5-container { width: 148mm; margin: 0 auto; border: 1.5px solid #000; padding: 15px; }
          .receipt-header { text-align: center; border-bottom: 1.5px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
          .receipt-header h2 { font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
          .receipt-header p { font-size: 12px; margin: 2px 0; color: #444; }
          .customer-details { border-bottom: 1.5px solid #000; padding-bottom: 10px; margin-bottom: 15px; font-size: 12px; line-height: 1.5; }
          .table-container { min-height: 150px; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; }
          th { border: 1px solid #000; padding: 6px 8px; font-size: 11px; background: #f0f0f0; fontWeight: bold; text-align: left; }
          td { border: 1px solid #000; padding: 5px 6px; font-size: 11px; text-align: left; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .totals-section { width: 100%; margin-top: 10px; border-top: 1.5px solid #000; padding-top: 8px; font-size: 12px; }
          .totals-row { display: flex; justify-content: flex-end; padding: 3px 0; }
          .totals-row span { width: 120px; text-align: right; }
          .totals-row span.label { width: 150px; font-weight: bold; }
          .grand-total { font-size: 14px; font-weight: bold; border-top: 1px dashed #000; padding-top: 6px; margin-top: 4px; }
          .receipt-footer { text-align: center; font-size: 10px; margin-top: 25px; border-top: 1.5px solid #000; padding-top: 10px; color: #555; }
        </style>
      </head>
      <body>
        <div class="a5-container">
          <div class="receipt-header">
            <h2>VIJAYAPATHI TRADERS</h2>
            <p>Sanitary, Hardware, Electrical & Plumbing Materials</p>
            <p>Phone: 9876543210 | GSTIN: 33AAAAA1111A1Z1</p>
            <p style="font-weight: bold; margin-top: 5px; text-decoration: underline;">B2B QUOTATION SLIP</p>
          </div>
          
           <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 12px; line-height: 1.5;">
            <div>
              <strong>Estimated For:</strong><br/>
              ${est.customerName || "General Inquiry"}<br/>
              ${est.customerPhone ? `Phone: ${est.customerPhone}` : ""}
              ${est.siteName ? `<div>🏡 Site: ${est.siteName}</div>` : ""}
            </div>
            <div style="text-align: right;">
              <strong>Quote Details:</strong><br/>
              Group: ${est.estimationName}<br/>
              Date: ${est.date || new Date().toLocaleDateString("en-IN")}<br/>
              Time: ${est.time || ""}
            </div>
          </div>

          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th class="text-center" style="width: 40px;">S.No</th>
                  <th>Product Name</th>
                  <th class="text-center" style="width: 70px;">Qty</th>
                  <th class="text-right" style="width: 100px;">Rate (₹)</th>
                  <th class="text-right" style="width: 120px;">Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${est.items.map((item, i) => `
                  <tr>
                    <td class="text-center">${i + 1}</td>
                    <td style="font-weight: bold;">${item.name}</td>
                    <td class="text-center">${item.qty} ${item.unit || 'Nos'}</td>
                    <td class="text-right">${parseFloat(item.sellingPrice).toFixed(2)}</td>
                    <td class="text-right" style="font-weight: bold;">${(item.sellingPrice * item.qty).toFixed(2)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          <div class="totals-section">
            <div class="totals-row">
              <span class="label">Subtotal:</span>
              <span>₹${parseFloat(est.subtotal || est.total + est.discount).toFixed(2)}</span>
            </div>
            ${est.discount > 0 ? `
            <div class="totals-row">
              <span class="label">Discount:</span>
              <span>-₹${parseFloat(est.discount).toFixed(2)}</span>
            </div>` : ""}
            <div class="totals-row grand-total">
              <span class="label">Grand Total:</span>
              <span>₹${parseFloat(est.total).toFixed(2)}</span>
            </div>
          </div>

          <div class="receipt-footer">
            <p>* This is a temporary quotation only. Prices subject to market variations. *</p>
            <p>Thank you for your valuable B2B inquiry! Vijayapathi Traders</p>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleWhatsApp = (est) => {
    if (!est) return;
    
    const existingPhone = est.customerPhone ? est.customerPhone.replace(/\D/g, "") : "";
    const enteredPhone = window.prompt("Confirm or enter customer WhatsApp number:", existingPhone);
    
    if (!enteredPhone) return;
    const phone = enteredPhone.replace(/\D/g, "");

    // Header
    const header = "📝 *VIJAYAPATHI TRADERS - B2B QUOTATION SLIP*";

    // Itemized list
    const items = est.items.map((i, idx) => {
      const rateStr = parseFloat(i.sellingPrice).toFixed(2);
      const totalStr = (i.sellingPrice * i.qty).toFixed(2);
      return `• *${i.name}*\n  Qty: ${i.qty} ${i.unit || "Nos"} × ₹${rateStr} = *₹${totalStr}*`;
    }).join("\n\n");
    
    // Project Site
    const siteInfo = est.siteName ? `\n🏡 *Project Site:* ${est.siteName}` : "";

    // Compile clean draft
    const msg = `
${header}
------------------------------
📋 *Quotation Group:* ${est.estimationName}
👤 *Customer:* ${est.customerName || "Valued Customer"}
📱 *Phone:* ${est.customerPhone || "-"}${siteInfo}
📅 *Date:* ${est.date || new Date().toLocaleDateString("en-IN")}
------------------------------
🛒 *ITEMS ESTIMATED:*

${items}

------------------------------
💰 *QUOTATION SUMMARY:*
• Subtotal: ₹${parseFloat(est.subtotal || est.total + est.discount).toFixed(2)}
• Discount: -₹${parseFloat(est.discount || 0).toFixed(2)}

礼 *GRAND TOTAL: ₹${Math.round(est.total)}*
------------------------------
✨ _This is an estimation only. Prices subject to change._
✨ _Thank you for choosing Vijayapathi Traders! Contact: +91 94432 55677._ ✨
    `.trim();

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
  };

  // Room Pipe & Wire Length Calculator calculations
  const roomEstimations = useMemo(() => {
    const L = parseFloat(calcRoomLength) || 0;
    const W = parseFloat(calcRoomWidth) || 0;
    const H = parseFloat(calcRoomHeight) || 0;
    const rooms = parseInt(calcRoomCount) || 0;
    const floors = parseInt(calcFloorCount) || 0;

    const multiplier = rooms * floors;

    if (calcSystemType === "electrical") {
      // Conduit pipe: perimeter + vertical drops
      const conduitFt = (L * 2 + W * 2 + H * 3) * multiplier;
      // Wires: Phase, Neutral, Earth inside conduits.
      const wire15Mtrs = Math.round(conduitFt * 2.5 * 0.3048); // 1.5sqmm light runs
      const wire25Mtrs = Math.round(conduitFt * 1.5 * 0.3048); // 2.5sqmm heavy power runs
      const bends = 4 * multiplier;
      const boxes = 6 * multiplier;

      return {
        conduitFt,
        wire15Mtrs,
        wire25Mtrs,
        bends,
        boxes
      };
    } else {
      // Plumbing pipe: perimeter + height drops
      const pipeFt = (L + W + H * 2) * multiplier;
      const elbows = 6 * multiplier;
      const tees = 3 * multiplier;
      const unions = 1 * multiplier;

      return {
        pipeFt,
        elbows,
        tees,
        unions
      };
    }
  }, [calcRoomLength, calcRoomWidth, calcRoomHeight, calcRoomCount, calcFloorCount, calcSystemType]);

  // Searches inventory for room estimation products
  const roomProductMatches = useMemo(() => {
    if (calcSystemType === "electrical") {
      return {
        conduit: products.find(p => {
          const name = p.name?.toLowerCase() || "";
          return (name.includes("conduit") || name.includes("electrical pipe")) && name.includes("25mm");
        }) || null,
        wire15: products.find(p => {
          const name = p.name?.toLowerCase() || "";
          return name.includes("wire") && (name.includes("1.5") || name.includes("1.5sqmm") || name.includes("1.5mm"));
        }) || null,
        wire25: products.find(p => {
          const name = p.name?.toLowerCase() || "";
          return name.includes("wire") && (name.includes("2.5") || name.includes("2.5sqmm") || name.includes("2.5mm"));
        }) || null,
        bend: products.find(p => {
          const name = p.name?.toLowerCase() || "";
          return (name.includes("bend") || name.includes("elbow")) && name.includes("25mm");
        }) || null,
        box: products.find(p => {
          const name = p.name?.toLowerCase() || "";
          return name.includes("junction box") || name.includes("deep box") || name.includes("switch box");
        }) || null
      };
    } else {
      return {
        pipe: products.find(p => {
          const name = p.name?.toLowerCase() || "";
          return name.includes("cpvc pipe") && name.includes("3/4");
        }) || null,
        elbow: products.find(p => {
          const name = p.name?.toLowerCase() || "";
          return name.includes("cpvc elbow") && name.includes("3/4") && !name.includes("reducing");
        }) || null,
        tee: products.find(p => {
          const name = p.name?.toLowerCase() || "";
          return name.includes("cpvc tee") && name.includes("3/4") && !name.includes("reducing");
        }) || null,
        union: products.find(p => {
          const name = p.name?.toLowerCase() || "";
          return name.includes("cpvc union") && name.includes("3/4");
        }) || null
      };
    }
  }, [products, calcSystemType]);

  const loadRoomEstimationToCart = () => {
    const itemsToAdd = [];

    if (calcSystemType === "electrical") {
      const match = roomProductMatches;
      const conduitQty = Math.ceil(roomEstimations.conduitFt / 10); // Standard pipes are 10Ft
      const rolls15 = Math.ceil(roomEstimations.wire15Mtrs / 90); // Standard wire rolls are 90m
      const rolls25 = Math.ceil(roomEstimations.wire25Mtrs / 90);

      // 1. Conduit pipe
      if (match.conduit) {
        itemsToAdd.push({ ...match.conduit, qty: conduitQty });
      } else {
        itemsToAdd.push({
          id: `custom_conduit_${Date.now()}`,
          productId: `custom_conduit_${Date.now()}`,
          name: 'PVC Conduit Pipe 25mm (10 Ft)',
          qty: conduitQty,
          sellingPrice: 45,
          gstRate: 18,
          unit: "Nos",
          category: "ELECTRICAL",
          isCustom: true
        });
      }

      // 2. Wires
      if (match.wire15) {
        itemsToAdd.push({ ...match.wire15, qty: rolls15 });
      } else {
        itemsToAdd.push({
          id: `custom_wire15_${Date.now()}`,
          productId: `custom_wire15_${Date.now()}`,
          name: 'Finolex 1.5sqmm Wire (90m Roll)',
          qty: rolls15,
          sellingPrice: 1250,
          gstRate: 18,
          unit: "Nos",
          category: "ELECTRICAL",
          isCustom: true
        });
      }

      if (match.wire25) {
        itemsToAdd.push({ ...match.wire25, qty: rolls25 });
      } else {
        itemsToAdd.push({
          id: `custom_wire25_${Date.now()}`,
          productId: `custom_wire25_${Date.now()}`,
          name: 'Finolex 2.5sqmm Wire (90m Roll)',
          qty: rolls25,
          sellingPrice: 2150,
          gstRate: 18,
          unit: "Nos",
          category: "ELECTRICAL",
          isCustom: true
        });
      }

      // 3. Bends
      if (match.bend) {
        itemsToAdd.push({ ...match.bend, qty: roomEstimations.bends });
      } else {
        itemsToAdd.push({
          id: `custom_bend_${Date.now()}`,
          productId: `custom_bend_${Date.now()}`,
          name: 'PVC Conduit Bend 25mm',
          qty: roomEstimations.bends,
          sellingPrice: 12,
          gstRate: 18,
          unit: "Nos",
          category: "ELECTRICAL",
          isCustom: true
        });
      }

      // 4. Boxes
      if (match.box) {
        itemsToAdd.push({ ...match.box, qty: roomEstimations.boxes });
      } else {
        itemsToAdd.push({
          id: `custom_box_${Date.now()}`,
          productId: `custom_box_${Date.now()}`,
          name: 'PVC Deep Junction Box 25mm',
          qty: roomEstimations.boxes,
          sellingPrice: 20,
          gstRate: 18,
          unit: "Nos",
          category: "ELECTRICAL",
          isCustom: true
        });
      }

    } else {
      const match = roomProductMatches;
      const pipeQty = Math.ceil(roomEstimations.pipeFt / 10); // Standard pipes are 10Ft

      // 1. Plumbing Pipe
      if (match.pipe) {
        itemsToAdd.push({ ...match.pipe, qty: pipeQty });
      } else {
        itemsToAdd.push({
          id: `custom_plumbpipe_${Date.now()}`,
          productId: `custom_plumbpipe_${Date.now()}`,
          name: 'CPVC Pipe 3/4" (10 Ft)',
          qty: pipeQty,
          sellingPrice: 160,
          gstRate: 18,
          unit: "Nos",
          category: "CPVC",
          isCustom: true
        });
      }

      // 2. Elbows
      if (match.elbow) {
        itemsToAdd.push({ ...match.elbow, qty: roomEstimations.elbows });
      } else {
        itemsToAdd.push({
          id: `custom_plumbelbow_${Date.now()}`,
          productId: `custom_plumbelbow_${Date.now()}`,
          name: 'CPVC Elbow 3/4"',
          qty: roomEstimations.elbows,
          sellingPrice: 18,
          gstRate: 18,
          unit: "Nos",
          category: "CPVC",
          isCustom: true
        });
      }

      // 3. Tees
      if (match.tee) {
        itemsToAdd.push({ ...match.tee, qty: roomEstimations.tees });
      } else {
        itemsToAdd.push({
          id: `custom_plumbtee_${Date.now()}`,
          productId: `custom_plumbtee_${Date.now()}`,
          name: 'CPVC Tee 3/4"',
          qty: roomEstimations.tees,
          sellingPrice: 24,
          gstRate: 18,
          unit: "Nos",
          category: "CPVC",
          isCustom: true
        });
      }

      // 4. Unions
      if (match.union) {
        itemsToAdd.push({ ...match.union, qty: roomEstimations.unions });
      } else {
        itemsToAdd.push({
          id: `custom_plumbunion_${Date.now()}`,
          productId: `custom_plumbunion_${Date.now()}`,
          name: 'CPVC Union 3/4"',
          qty: roomEstimations.unions,
          sellingPrice: 55,
          gstRate: 18,
          unit: "Nos",
          category: "CPVC",
          isCustom: true
        });
      }
    }

    setCart([...cart, ...itemsToAdd]);
    setActiveTab("builder");
    alert(`Loaded ${itemsToAdd.length} estimated materials directly to your active Quote Cart!`);
  };

  // Fitting suggestions logic based on main & branch pipe size selection
  const suggestedFittings = useMemo(() => {
    if (calcMainSize === calcBranchSize) {
      return [{
        name: "Straight Union / Coupling",
        description: `Direct connection. Since the pipe lines are both ${calcMainSize}, you need standard couplings, elbows, or tees to route.`,
        keywords: [calcMainSize]
      }];
    }
    
    // e.g. 1" to 1/2"
    return [
      {
        name: `${calcMainSize} x ${calcBranchSize} Reducing Tee`,
        description: `Use this to branch off a ${calcBranchSize} line from a ${calcMainSize} main pipeline route.`,
        keywords: ["reducing tee", calcMainSize, calcBranchSize]
      },
      {
        name: `${calcMainSize} x ${calcBranchSize} Reducing Elbow`,
        description: `Use this to run a 90-degree corner transition directly reducing from ${calcMainSize} to ${calcBranchSize}.`,
        keywords: ["reducing elbow", calcMainSize, calcBranchSize]
      },
      {
        name: `${calcMainSize} x ${calcBranchSize} Reducer Bushing`,
        description: `Male-to-female slip threaded bushing that drops a standard fitting collar from ${calcMainSize} to ${calcBranchSize}.`,
        keywords: ["reducer bushing", "reducing bushing", "reducer", calcMainSize, calcBranchSize]
      }
    ];
  }, [calcMainSize, calcBranchSize]);

  // Searches our inventory products for the suggested fittings
  const fittingProductMatches = useMemo(() => {
    if (calcMainSize === calcBranchSize) {
      // Find direct fittings of this size
      const sizeClean = calcMainSize.replace('"', '');
      return products.filter(p => {
        const pName = p.name?.toLowerCase() || "";
        const isFitting = pName.includes("elbow") || pName.includes("tee") || pName.includes("coupling") || pName.includes("union") || pName.includes("socket") || pName.includes("mabt") || pName.includes("fabt");
        return isFitting && pName.includes(sizeClean) && !pName.includes("reducing") && !pName.includes("reducer");
      }).slice(0, 8);
    }

    const mainClean = calcMainSize.replace('"', '');
    const branchClean = calcBranchSize.replace('"', '');

    return products.filter(p => {
      const pName = p.name?.toLowerCase() || "";
      const isReducer = pName.includes("reducer") || pName.includes("reducing") || pName.includes("elbow") || pName.includes("tee") || pName.includes("bushing");
      
      // Matches both size numbers
      const matchesMain = pName.includes(mainClean);
      const matchesBranch = pName.includes(branchClean);
      
      return isReducer && matchesMain && matchesBranch;
    }).slice(0, 8);
  }, [products, calcMainSize, calcBranchSize]);

  // Auto room material estimator logic
  const templateProductsMatches = useMemo(() => {
    const items = ESTIMATION_TEMPLATES[activeTemplate] || [];
    return items.map(tItem => {
      // Search catalog for match
      const matched = products.find(p => {
        const pName = p.name?.toLowerCase() || "";
        const tName = tItem.name?.toLowerCase() || "";
        return pName.includes(tName) || tName.includes(pName);
      });
      return {
        templateItem: tItem,
        matchedProduct: matched || null
      };
    });
  }, [products, activeTemplate]);

  const loadTemplateToCart = () => {
    const newItemsToAdd = templateProductsMatches.map(match => {
      if (match.matchedProduct) {
        return {
          ...match.matchedProduct,
          qty: match.templateItem.qty
        };
      } else {
        // Fallback custom item
        const idx = Math.random();
        return {
          id: `custom_${Date.now()}_${idx}`,
          productId: `custom_${Date.now()}_${idx}`,
          name: match.templateItem.name,
          qty: match.templateItem.qty,
          sellingPrice: match.templateItem.estimatedPrice,
          gstRate: 18,
          unit: "Nos",
          hsnCode: "",
          category: match.templateItem.category,
          productCode: "",
          isCustom: true
        };
      }
    });

    setCart([...cart, ...newItemsToAdd]);
    setActiveTab("builder");
    alert(`Added ${newItemsToAdd.length} template items to your active Quote Cart!`);
  };

  return (
    <div className="page pos-page" style={{ paddingBottom: "40px" }}>
      <div className="pos-header" style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <h1 className="page-title" style={{ margin: 0 }}>Quotations & Construction</h1>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {activeTab === "builder" && (
            <button className="btn-primary" onClick={openBulkAdd} style={{ background: "#1c1917", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: "700" }}>🚀 SMART BULK ADD</button>
          )}
          <div className="tabs" style={{ display: "flex", gap: "10px", margin: 0, borderBottom: "none", paddingBottom: 0 }}>
            <button className={`tab-btn ${activeTab === "builder" ? "active" : ""}`} onClick={() => setActiveTab("builder")}>Build Quote</button>
            <button className={`tab-btn ${activeTab === "saved" ? "active" : ""}`} onClick={() => setActiveTab("saved")}>Saved Groups ({estimations.length})</button>
            <button className={`tab-btn ${activeTab === "construction" ? "active" : ""}`} onClick={() => setActiveTab("construction")} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>🏗️ Construction Mode</button>
          </div>
        </div>
      </div>

      {activeTab === "builder" && (
        <div className="pos-layout">
          {/* Left Side: Product Selection */}
          <div className="pos-products">
            <div className="search-box">
              <span>🔍</span>
              <input 
                placeholder="Search products..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="category-tabs">
              {CATEGORIES.map(cat => (
                <button 
                  key={cat} 
                  className={`cat-tab ${category === cat ? "active" : ""}`}
                  onClick={() => {
                    setCategory(cat);
                    setPlumbingFilter("ALL");
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
            {category === "PLUMBING" && (
              <div className="sub-category-tabs" style={{ display: "flex", gap: "8px", marginTop: "12px", background: "rgba(255,255,255,0.02)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(120, 113, 108, 0.1)", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
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
            <div className="pos-products-scroll">
              <div className="products-grid">
                {filteredProducts.map(p => (
                  <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
                    <div className="product-card-cat">{p.category?.toUpperCase()}</div>
                    <div className="product-card-name">{p.name}</div>
                    <div className="product-card-bottom">
                      <span className="product-card-price">₹{p.sellingPrice?.toLocaleString()}</span>
                      <span className="prod-stock-normal" style={{ fontSize: "11px", color: "#16a34a", fontWeight: "700" }}>
                        Available
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Side: Quote Cart */}
          <div className="pos-cart">
            <div className="cart-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>{editingId ? "Editing Group" : "New Quote"}</h2>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {cart.length > 0 && (
                  <button 
                    className="btn-primary" 
                    onClick={openBulkEdit} 
                    style={{ background: "#2563eb", padding: "6px 12px", borderRadius: "4px", fontSize: "11px", fontWeight: "700", border: "none", color: "#fff", cursor: "pointer" }}
                  >
                    📝 BULK EDIT
                  </button>
                )}
                {editingId && <button className="btn-close-text" onClick={resetBuilder}>Cancel</button>}
              </div>
            </div>
            
            <div className="cart-items" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "10px" }}>
              {cart.length === 0 ? (
                <div style={{ padding: "30px 10px", textAlign: "center", color: "#888", fontStyle: "italic", fontSize: "13px" }}>
                  Your quote is empty. Select items from left catalog or use B2B Construction Planner templates!
                </div>
              ) : (
                <table className="cart-table">
                  <thead>
                    <tr>
                      <th style={{ width: "18px", textAlign: "center", padding: "6px 2px", fontSize: "10px" }}>#</th>
                      <th>Product</th>
                      <th style={{ width: "48px", textAlign: "right", padding: "6px 4px", fontSize: "10px" }}>Rate</th>
                      <th style={{ width: "56px", textAlign: "center", padding: "6px 2px", fontSize: "10px" }}>Qty</th>
                      <th style={{ width: "60px", textAlign: "right", padding: "6px 4px", fontSize: "10px" }}>Total</th>
                      <th style={{ width: "20px", textAlign: "center", padding: "6px 2px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, index) => (
                      <tr key={item.id || item.productId}>
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
                            onChange={e => updatePrice(item.id || item.productId, e.target.value)} 
                          />
                        </td>
                        <td style={{ padding: "6px 2px" }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                            <button className="qty-btn" onClick={() => adjustQty(item.id || item.productId, -1)} style={{ width: "14px", height: "14px", fontSize: "8px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                            <input 
                              type="text" 
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={item.qty} 
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                updateQty(item.id || item.productId, val);
                              }} 
                              onBlur={(e) => {
                                if (e.target.value === "" || parseInt(e.target.value) === 0) {
                                  removeItem(item.id || item.productId);
                                }
                              }}
                              className="qty-val"
                              style={{ width: "18px", height: "14px", textAlign: "center", border: "none", background: "transparent", fontSize: "11px", margin: 0, padding: 0, outline: 'none', fontWeight: 'bold' }} 
                            />
                            <button className="qty-btn" onClick={() => adjustQty(item.id || item.productId, 1)} style={{ width: "14px", height: "14px", fontSize: "8px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                          </div>
                        </td>
                        <td style={{ textAlign: "right", fontWeight: "800", fontSize: "10px", color: "#2563eb", padding: "6px 2px" }}>
                          ₹{((parseFloat(item.sellingPrice) || 0) * (parseFloat(item.qty) || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: "center", padding: "6px 2px" }}>
                          <button className="remove-btn" onClick={() => removeItem(item.id || item.productId)} style={{ padding: 0, margin: 0, border: "none", background: "none", color: "#e74c3c", cursor: "pointer", fontSize: "13px" }}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="cart-summary">
              <div className="group-selector">
                {GROUPS.map(g => (
                  <button 
                    key={g} 
                    className={`btn-group-select ${selectedGroup === g ? "active" : ""}`}
                    onClick={() => setSelectedGroup(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <input 
                className="cart-discount-input"
                placeholder="Group Name (e.g. Bathroom Set)" 
                value={estimationName}
                onChange={e => setEstimationName(e.target.value)}
              />
              <div className="quote-fields" style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "10px 0" }}>
                <input placeholder="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} />
                <input placeholder="Phone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                <input placeholder="Project Site Name (e.g., Aisle 3 Villa #12)" value={siteName} onChange={e => setSiteName(e.target.value)} />
              </div>
              <div className="summary-row">
                <span>Subtotal</span>
                <span>₹{subtotal.toLocaleString()}</span>
              </div>
              <div className="summary-row">
                <span>Discount (₹)</span>
                <input type="number" value={discount} onChange={e => setDiscount(e.target.value)} className="cart-discount-input discount-input-field" />
              </div>
              <div className="summary-row grand-total">
                <span>Total</span>
                <span>₹{grandTotal.toLocaleString()}</span>
              </div>

              <button className="btn-primary checkout-btn" onClick={handleSaveEstimate} disabled={saving || cart.length === 0}>
                {saving ? "SAVING..." : editingId ? "💾 UPDATE GROUP" : "💾 SAVE GROUP & PRINT"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "saved" && (
        <div className="saved-estimations-grid">
          {estimations.map(est => (
            <div key={est.id} className="estimation-card">
              <div className="est-card-header">
                <h3>{est.estimationName}</h3>
                <span className="est-date">{est.date}</span>
              </div>
              <div className="est-details">
                <p>👤 {est.customerName || "N/A"}</p>
                <p>📞 {est.customerPhone || "N/A"}</p>
                {est.siteName && <p>🏡 <strong>Site:</strong> {est.siteName}</p>}
                <p>📦 {est.items.length} Items</p>
                <div className="est-total">₹{est.total.toLocaleString()}</div>
              </div>
              <div className="est-actions">
                <button className="btn-est edit" onClick={() => loadEstimation(est)}>✏️ Edit</button>
                <button className="btn-est print" onClick={() => handlePrint(est)}>🖨️ Print</button>
                <button 
                  className="btn-est pdf" 
                  onClick={() => handleDownloadPDF(est)}
                  style={{ background: "#00c9a7", color: "#111", fontWeight: "bold" }}
                  disabled={pdfLoading}
                >
                  {pdfLoading && pdfEstimate?.id === est.id ? "📥 ..." : "📥 PDF"}
                </button>
                <button className="btn-est whatsapp" onClick={() => handleWhatsApp(est)}>💬 WA</button>
              </div>
              <div className="est-actions-secondary">
                <button className="btn-est checkout" onClick={() => checkoutToPOS(est)}>🚀 Checkout to POS</button>
                <button className="btn-est delete" onClick={() => { if(window.confirm("Delete this quote?")) deleteEstimation(est.id) }}>🗑️</button>
              </div>
            </div>
          ))}
          {estimations.length === 0 && <div className="empty-row">No saved quotations found.</div>}
        </div>
      )}

      {activeTab === "construction" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "25px", flexWrap: "wrap" }}>
          
          {/* Left Column: Stack of Calculators */}
          <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
            
            {/* Card 1: Pipe Size & Reducer Calculator */}
            <div className="calc-card">
              <div style={{ borderBottom: "1.5px solid rgba(120, 113, 108, 0.15)", paddingBottom: "10px", marginBottom: "15px" }}>
                <h2 style={{ margin: 0, color: "#e67e22" }}>🚰 B2B Pipe Reducer Calculator</h2>
                <span style={{ fontSize: "11px", color: "#aaa" }}>Calculate reducing fittings and fetch stock matches in 1-click.</span>
              </div>

              <div style={{ display: "flex", gap: "15px", marginBottom: "20px" }}>
                <div style={{ flex: 1 }}>
                  <label className="calc-label">Main Line Size</label>
                  <select 
                    value={calcMainSize} 
                    onChange={e => setCalcMainSize(e.target.value)}
                    className="calc-input"
                    style={{ padding: "10px" }}
                  >
                    {PIPE_SIZES.map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", fontSize: "18px", paddingBottom: "8px" }}>➔</div>
                <div style={{ flex: 1 }}>
                  <label className="calc-label">Branch Line Size</label>
                  <select 
                    value={calcBranchSize} 
                    onChange={e => setCalcBranchSize(e.target.value)}
                    className="calc-input"
                    style={{ padding: "10px" }}
                  >
                    {PIPE_SIZES.map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ padding: "15px", borderRadius: "6px", marginBottom: "20px", border: "1.5px dashed rgba(230,126,34,0.3)", background: "rgba(0,0,0,0.03)" }}>
                <strong style={{ display: "block", fontSize: "13px", color: "#e67e22", marginBottom: "6px" }}>💡 FITTING SUGGESTIONS:</strong>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {suggestedFittings.map((fit, idx) => (
                    <div key={idx} className="calc-suggestion-item">
                      <div className="calc-suggestion-name">• {fit.name}</div>
                      <div className="calc-suggestion-desc">{fit.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <strong style={{ display: "block", fontSize: "13px", color: "#00c9a7", marginBottom: "10px" }}>🔍 Live Inventory Catalog Matches:</strong>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "250px", overflowY: "auto" }}>
                  {fittingProductMatches.map(p => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: "4px" }}>
                      <div>
                        <strong style={{ fontSize: "12px", display: "block" }}>{p.name}</strong>
                        <span style={{ fontSize: "10px", color: p.stock > 0 ? "#2ecc71" : "#ff4757" }}>
                          Stock: {p.stock} Nos | Price: ₹{p.sellingPrice}
                        </span>
                      </div>
                      <button 
                        className="btn-primary" 
                        style={{ padding: "4px 8px", fontSize: "10px", margin: 0, background: "#27ae60" }}
                        onClick={() => {
                          addToCart(p);
                          alert(`Added ${p.name} to active quote!`);
                        }}
                      >
                        ➕ Add
                      </button>
                    </div>
                  ))}
                  {fittingProductMatches.length === 0 && (
                    <div style={{ color: "#777", fontSize: "12px", fontStyle: "italic", textAlign: "center", padding: "20px" }}>
                      No exact reducing socket or fitting product found in catalog matching "{calcMainSize} to {calcBranchSize}".
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Pipe & Wire Length Estimator */}
            <div className="calc-card">
              <div style={{ borderBottom: "1.5px solid rgba(120, 113, 108, 0.15)", paddingBottom: "10px", marginBottom: "15px" }}>
                <h2 style={{ margin: 0, color: "#00c9a7" }}>⚡ Room Pipe & Wire Length Calculator</h2>
                <span style={{ fontSize: "11px", color: "#aaa" }}>Enter Room Dimensions & Scale to estimate necessary electrical or plumbing conduit pipes and wires.</span>
              </div>

              {/* Dimensions Input Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "15px" }}>
                <div>
                  <label className="calc-label">Length (Ft)</label>
                  <input 
                    type="number" 
                    value={calcRoomLength}
                    onChange={e => setCalcRoomLength(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="calc-input"
                  />
                </div>
                <div>
                  <label className="calc-label">Width (Ft)</label>
                  <input 
                    type="number" 
                    value={calcRoomWidth}
                    onChange={e => setCalcRoomWidth(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="calc-input"
                  />
                </div>
                <div>
                  <label className="calc-label">Height (Ft)</label>
                  <input 
                    type="number" 
                    value={calcRoomHeight}
                    onChange={e => setCalcRoomHeight(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="calc-input"
                  />
                </div>
              </div>

              {/* Scale Input Row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px", marginBottom: "15px" }}>
                <div>
                  <label className="calc-label">Total Rooms</label>
                  <input 
                    type="number" 
                    value={calcRoomCount}
                    onChange={e => setCalcRoomCount(Math.max(1, parseInt(e.target.value) || 0))}
                    className="calc-input"
                  />
                </div>
                <div>
                  <label className="calc-label">Total Floors</label>
                  <input 
                    type="number" 
                    value={calcFloorCount}
                    onChange={e => setCalcFloorCount(Math.max(1, parseInt(e.target.value) || 0))}
                    className="calc-input"
                  />
                </div>
              </div>

              {/* System Type Row */}
              <div className="form-group" style={{ marginBottom: "15px" }}>
                <label className="calc-label" style={{ marginBottom: "6px" }}>Select Trade Utility System</label>
                <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                    <input 
                      type="radio" 
                      name="calcSystemType" 
                      checked={calcSystemType === "electrical"}
                      onChange={() => setCalcSystemType("electrical")}
                    />
                    🔌 Electrical Wire & Conduit
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "13px" }}>
                    <input 
                      type="radio" 
                      name="calcSystemType" 
                      checked={calcSystemType === "plumbing"}
                      onChange={() => setCalcSystemType("plumbing")}
                    />
                    🚿 Plumbing Water Line
                  </label>
                </div>
              </div>

              {/* Calculations results */}
              <div className="calc-details-box">
                <strong style={{ display: "block", fontSize: "13px", color: "#00c9a7", marginBottom: "8px" }}>📊 ESTIMATION DETAILS:</strong>
                {calcSystemType === "electrical" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Estimated Conduit Pipe Needed:</span>
                      <strong>{roomEstimations.conduitFt} Ft ({Math.ceil(roomEstimations.conduitFt / 10)} Pipes of 10 Ft)</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Estimated 1.5sqmm Wire:</span>
                      <strong>{roomEstimations.wire15Mtrs} Meters ({Math.ceil(roomEstimations.wire15Mtrs / 90)} Rolls of 90m)</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Estimated 2.5sqmm Wire:</span>
                      <strong>{roomEstimations.wire25Mtrs} Meters ({Math.ceil(roomEstimations.wire25Mtrs / 90)} Rolls of 90m)</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>PVC Bends / Junctions:</span>
                      <strong>{roomEstimations.bends} Bends | {roomEstimations.boxes} Boxes</strong>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Estimated CPVC 3/4" Pipe:</span>
                      <strong>{roomEstimations.pipeFt} Ft ({Math.ceil(roomEstimations.pipeFt / 10)} Pipes of 10 Ft)</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>CPVC Elbows 3/4":</span>
                      <strong>{roomEstimations.elbows} Nos</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>CPVC Tees 3/4":</span>
                      <strong>{roomEstimations.tees} Nos</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>CPVC Unions 3/4":</span>
                      <strong>{roomEstimations.unions} Nos</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button 
                className="btn-primary" 
                style={{ width: "100%", background: "#00c9a7", padding: "10px", fontWeight: "bold", border: "none", borderRadius: "4px", color: "#111", cursor: "pointer" }}
                onClick={loadRoomEstimationToCart}
              >
                🚀 Load Estimated Materials to Active Cart
              </button>
            </div>

          </div>

          {/* Right Column: Auto Room Quantity Estimator Templates */}
          <div className="stat-card" style={{ padding: "20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(120, 113, 108, 0.1)", borderRadius: "8px" }}>
            <div style={{ borderBottom: "1.5px solid rgba(120, 113, 108, 0.15)", paddingBottom: "10px", marginBottom: "15px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h2 style={{ margin: 0, color: "#8e44ad" }}>🏗️ B2B Auto-Room Estimator</h2>
                <span style={{ fontSize: "11px", color: "#aaa" }}>Select plumbing installation templates to automatically estimate a Bill of Materials.</span>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button 
                  className={`filter-btn ${activeTemplate === "bathroom" ? "active" : ""}`}
                  onClick={() => setActiveTemplate("bathroom")}
                  style={{ margin: 0 }}
                >
                  🛁 Bathroom Set
                </button>
                <button 
                  className={`filter-btn ${activeTemplate === "kitchen" ? "active" : ""}`}
                  onClick={() => setActiveTemplate("kitchen")}
                  style={{ margin: 0 }}
                >
                  🚰 Kitchen Sink
                </button>
              </div>
            </div>

            <div className="table-container" style={{ marginBottom: "20px" }}>
              <table className="data-table" style={{ fontSize: "11px" }}>
                <thead>
                  <tr>
                    <th>MATERIAL IN TEMPLATE</th>
                    <th style={{ width: "60px" }}>QTY</th>
                    <th>INVENTORY MATCH STATUS</th>
                    <th style={{ width: "90px" }}>PRICE (EST)</th>
                  </tr>
                </thead>
                <tbody>
                  {templateProductsMatches.map((match, idx) => {
                    const item = match.templateItem;
                    return (
                      <tr key={idx}>
                        <td><strong>{item.name}</strong></td>
                        <td style={{ fontWeight: "bold" }}>{item.qty} Nos</td>
                        <td>
                          {match.matchedProduct ? (
                            <span style={{ color: "#2ecc71", fontWeight: "bold" }}>
                              ✓ Matched ({match.matchedProduct.name.substring(0, 18)}...) | Stock: {match.matchedProduct.stock}
                            </span>
                          ) : (
                            <span style={{ color: "#e67e22" }}>
                              ⚠️ Not in stock (Will add as custom)
                            </span>
                          )}
                        </td>
                        <td>₹{match.matchedProduct ? match.matchedProduct.sellingPrice * item.qty : item.estimatedPrice * item.qty}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.01)", padding: "12px", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "6px" }}>
              <div>
                <strong style={{ display: "block", fontSize: "13px" }}>Total Estimated Items: {ESTIMATION_TEMPLATES[activeTemplate]?.length}</strong>
                <span style={{ fontSize: "10px", color: "#aaa" }}>Auto-mapped to in-stock brands where possible.</span>
              </div>
              <button 
                className="btn-primary" 
                style={{ background: "#8e44ad", fontWeight: "bold" }}
                onClick={loadTemplateToCart}
              >
                🚀 Load Template & Build Quote
              </button>
            </div>

          </div>

        </div>
      )}

      {showModal && lastEstimate && (
        <div className="modal-overlay">
          <div className="modal-content success-modal">
            <div className="success-icon">📝</div>
            <h2>Group Saved Successfully!</h2>
            <div className="sale-success-details">
              <p><strong>Group:</strong> {lastEstimate.estimationName}</p>
              {lastEstimate.siteName && <p><strong>Project Site:</strong> {lastEstimate.siteName}</p>}
              <p><strong>Total:</strong> ₹{lastEstimate.total.toLocaleString()}</p>
            </div>
            <div className="modal-btns">
              <button className="btn-primary" onClick={() => handlePrint()}>🖨️ PRINT QUOTE</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>DONE</button>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal-content form-modal" style={{ maxWidth: "95vw", width: "1200px" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe"></div>
            <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {isEditingBulk ? "📝 Edit Group Items" : "🚀 Smart Bulk Add to Quote"}
              <button className="btn-secondary" style={{ padding: "4px 8px", fontSize: "11px" }} onClick={() => setShowBulkModal(false)}>Close</button>
            </h2>
            
            {!isEditingBulk && (
              <>
                <div className="bulk-help-box">
                  <strong>💡 Pro Tip:</strong>
                  You can copy-paste multiple rows from <strong>Excel</strong> or <strong>Tally</strong>.
                  One item per line. Column order can be: <code>Product Name [Tab] Qty [Tab] Rate</code>.
                  We will try to auto-match names with items in your inventory!
                </div>

                <textarea 
                  className="bulk-textarea"
                  placeholder="Paste quotation items here...&#10;Example:&#10;Angle Grinder 4&quot;&#10;PVC Pipe 20mm	10	120&#10;LED Bulb 9W	5	180"
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
                              ✅ Matched
                            </span>
                          )}
                        </td>
                        <td>
                          <input 
                            value={item.name} 
                            list="estimations-products-list"
                            onChange={e => handleProductNameChange(idx, e.target.value)} 
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

            <datalist id="estimations-products-list">
              {products.map(p => (
                <option key={p.id} value={p.name}>
                  {p.productCode ? `${p.productCode} - ` : ''}₹{p.sellingPrice} ({p.category})
                </option>
              ))}
            </datalist>

            <div className="modal-btns" style={{ marginTop: "20px" }}>
              <span style={{ marginRight: "auto", fontSize: "12px", color: "#666", fontWeight: "700" }}>
                {bulkItems.length} items {isEditingBulk ? "in group" : "parsed"}
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
              <button className="btn-primary" onClick={handleBulkSave} disabled={bulkItems.length === 0}>
                {isEditingBulk ? "Save & Update Quote" : `Add ${bulkItems.length} Items to Quote`}
              </button>
            </div>
          </div>
        </div>
      )}

      {pdfEstimate && (
        <div style={{ position: "fixed", left: "0", top: "0", zIndex: "-1000", opacity: "1", pointerEvents: "none", background: "#fff", padding: "10px" }}>
          <div ref={receiptRef} className="a5-container" style={{ width: "100%", maxWidth: "148mm", padding: "15px", background: "#fff", color: "#000", border: "1.5px solid #000", fontFamily: "sans-serif", boxSizing: "border-box" }}>
            <div className="receipt-header" style={{ textAlign: "center", borderBottom: "1.5px solid #000", paddingBottom: "10px", marginBottom: "15px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 4px 0" }}>VIJAYAPATHI TRADERS</h2>
              <p style={{ fontSize: "12px", margin: "2px 0", color: "#444" }}>Sanitary, Hardware, Electrical & Plumbing Materials</p>
              <p style={{ fontSize: "12px", margin: "2px 0", color: "#444" }}>Phone: 9876543210 | GSTIN: 33AAAAA1111A1Z1</p>
              <p style={{ fontSize: "12px", margin: "5px 0 0 0", fontWeight: "bold", textDecoration: "underline" }}>B2B QUOTATION SLIP</p>
              <p style={{ fontSize: "11px", margin: "5px 0 0 0", color: "#666" }}>Date: {pdfEstimate.date || new Date().toLocaleDateString("en-IN")} &nbsp;&nbsp;|&nbsp;&nbsp; Time: {pdfEstimate.time || ""}</p>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1.5px solid #000", paddingBottom: "10px", marginBottom: "15px", fontSize: "12px", lineHeight: "1.5" }}>
              <div>
                <strong>Estimated For:</strong><br/>
                {pdfEstimate.customerName || "General Inquiry"}<br/>
                {pdfEstimate.customerPhone ? `Phone: ${pdfEstimate.customerPhone}` : ""}
                {pdfEstimate.siteName && <div>🏡 Site: {pdfEstimate.siteName}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <strong>Quote Details:</strong><br/>
                Group: {pdfEstimate.estimationName}<br/>
                Date: {pdfEstimate.date || new Date().toLocaleDateString("en-IN")}<br/>
              </div>
            </div>

            <div className="table-container" style={{ minHeight: "150px" }}>
              <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ width: "35px", border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "center" }}>S.No</th>
                    <th style={{ border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "left" }}>Product Name</th>
                    <th style={{ width: "55px", border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "center" }}>Qty</th>
                    <th style={{ width: "65px", border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "right" }}>Rate (₹)</th>
                    <th style={{ width: "80px", border: "1px solid #000", padding: "6px 8px", fontSize: "11px", background: "#f0f0f0", fontWeight: "bold", textAlign: "right" }}>Total (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {pdfEstimate.items?.map((item, i) => (
                    <tr key={i}>
                      <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "center" }}>{i + 1}</td>
                      <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "left", fontWeight: "bold", wordBreak: "break-word", whiteSpace: "normal" }}>{item.name}</td>
                      <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "center" }}>{item.qty} {item.unit || "Nos"}</td>
                      <td style={{ border: "1px solid #000", padding: "5px 6px", fontSize: "11px", textAlign: "right" }}>{parseFloat(item.sellingPrice).toFixed(2)}</td>
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
                  <strong>₹{parseFloat(pdfEstimate.subtotal || pdfEstimate.total + pdfEstimate.discount).toFixed(2)}</strong>
                </div>
                {pdfEstimate.discount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span>Discount:</span>
                    <strong style={{ color: "#d35400" }}>-₹{parseFloat(pdfEstimate.discount).toFixed(2)}</strong>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "1px dashed #000", fontSize: "14px", fontWeight: "bold" }}>
                  <span>Grand Total:</span>
                  <strong>₹{parseFloat(pdfEstimate.total).toFixed(2)}</strong>
                </div>
              </div>
            </div>

            <div className="receipt-footer" style={{ textAlign: "center", fontSize: "10px", marginTop: "25px", borderTop: "1.5px solid #000", paddingTop: "10px", color: "#555" }}>
              <p>* This is a temporary quotation only. Prices subject to market variations. *</p>
              <p>Thank you for choosing Vijayapathi Traders!</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
