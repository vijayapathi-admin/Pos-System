import React, { useState, useMemo, useRef } from "react";
import { useApp } from "../AppContext";
import { exportToExcel } from "../utils";
import SearchableSelect from "../components/SearchableSelect";

export default function Purchases() {
  const { purchases, addPurchaseBill, products, suppliers, purchaseOrders, addPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder } = useApp();

  const purchaseProductOptions = useMemo(() => {
    return products.map(p => ({
      value: p.id,
      label: `${p.name}${p.productCode ? ` (Code: ${p.productCode})` : ""} | Stock: ${p.stock}`
    }));
  }, [products]);
  
  // High level tabs
  const [activeTab, setActiveTab] = useState("bills"); // bills | comparison | po

  // Inward Bills states (existing)
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef(null);

  // Filter controls
  const [filterMode, setFilterMode] = useState("all"); // all | month
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

  // Modal State for Bills
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [supplier, setSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [items, setItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [creditPaidAmount, setCreditPaidAmount] = useState("");
  
  // Item Entry State
  const [selectedProductId, setSelectedProductId] = useState("");
  const [qty, setQty] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [gstRate, setGstRate] = useState(18);

  // Converted from PO tracking
  const [convertedFromPoId, setConvertedFromPoId] = useState(null);

  // Price Comparison states
  const [compareProductId, setCompareProductId] = useState("");

  // Purchase Order Form States
  const [showPoModal, setShowPoModal] = useState(false);
  const [poDate, setPoDate] = useState(new Date().toISOString().split("T")[0]);
  const [poSupplier, setPoSupplier] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [poItems, setPoItems] = useState([]);
  const [poNotes, setPoNotes] = useState("");
  const [poStatus, setPoStatus] = useState("PENDING DELIVERY");
  const [editingPoId, setEditingPoId] = useState(null);

  // Custom PO Item Entry State
  const [poSelectedProductId, setPoSelectedProductId] = useState("");
  const [poQty, setPoQty] = useState("");
  const [poEstPrice, setPoEstPrice] = useState("");
  const [poGstRate, setPoGstRate] = useState(18);

  // INWARD BILLS LOGIC
  const filtered = useMemo(() => {
    let result = [...purchases];
    if (filterMode === "month") {
      result = result.filter(p => p.date?.startsWith(filterMonth));
    }
    return result.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [purchases, filterMode, filterMonth]);

  const grandTotal = filtered.reduce((sum, p) => sum + (p.grandTotal || 0), 0);

  const handleAddItem = () => {
    if (!selectedProductId || !qty || !purchasePrice) {
      alert("Please select a product and enter quantity and price.");
      return;
    }
    const product = products.find(p => p.id === selectedProductId);
    if (!product) return;

    const newItem = {
      productId: product.id,
      name: product.name,
      qty: parseFloat(qty) || 0,
      purchasePrice: parseFloat(purchasePrice) || 0,
      gstRate: parseFloat(gstRate) || 0,
    };
    
    setItems([...items, newItem]);
    
    // Reset entry fields
    setSelectedProductId("");
    setQty("");
    setPurchasePrice("");
  };

  const handleRemoveItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setDate(new Date().toISOString().split("T")[0]);
    setSupplier("");
    setInvoiceNumber("");
    setItems([]);
    setPaymentMethod("CASH");
    setCreditPaidAmount("");
    setConvertedFromPoId(null);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    let parsedValue = value;
    
    if (field === 'qty') parsedValue = parseFloat(value) || 0;
    if (field === 'purchasePrice' || field === 'gstRate') parsedValue = parseFloat(value) || 0;
    
    newItems[index] = { ...newItems[index], [field]: field === 'name' ? value : parsedValue };

    // Auto-map product ID if name matches exactly
    if (field === 'name') {
      const matched = products.find(p => p.name.toLowerCase() === value.toLowerCase());
      newItems[index].productId = matched ? matched.id : "";
    }
    
    setItems(newItems);
  };

  const handleScanBill = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    let apiKey = localStorage.getItem("gemini_api_key");
    if (!apiKey) {
      apiKey = prompt("Please enter your Google Gemini API Key to use the AI Scanner:");
      if (!apiKey) return;
      localStorage.setItem("gemini_api_key", apiKey);
    }

    setIsScanning(true);
    setShowModal(true);

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
      });

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: `Analyze this purchase invoice. Extract the supplier name, invoice number, date (YYYY-MM-DD), and a list of items. Return ONLY a valid JSON object matching this schema: { "supplier": string, "invoiceNumber": string, "date": string, "items": [ { "name": string, "qty": number, "purchasePrice": number, "gstRate": number } ] }` },
              { inline_data: { mime_type: file.type, data: base64 } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `API error: ${response.statusText}`);
      }

      const data = await response.json();
      const resultText = data.candidates[0].content.parts[0].text;
      
      const cleanJson = resultText.replace(/```json\n?|\n?```/g, '');
      const parsed = JSON.parse(cleanJson);

      if (parsed.supplier) setSupplier(parsed.supplier);
      if (parsed.invoiceNumber) setInvoiceNumber(parsed.invoiceNumber);
      if (parsed.date) setDate(parsed.date);
      
      const mappedItems = (parsed.items || []).map(item => {
        const matchedProduct = products.find(p => 
          p.name.toLowerCase().includes(item.name.toLowerCase()) || 
          item.name.toLowerCase().includes(p.name.toLowerCase())
        );
        
        return {
          productId: matchedProduct ? matchedProduct.id : "",
          name: matchedProduct ? matchedProduct.name : item.name + " (Not Found)",
          qty: item.qty || 1,
          purchasePrice: item.purchasePrice || 0,
          gstRate: item.gstRate || 0,
        };
      });

      setItems(mappedItems);
    } catch (error) {
      console.error(error);
      alert("Error scanning bill: " + error.message);
      if (error.message.includes("API key not valid") || error.message.includes("API_KEY_INVALID")) {
        localStorage.removeItem("gemini_api_key");
      }
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const subtotal = items.reduce((sum, item) => sum + (item.qty * item.purchasePrice), 0);
  const taxTotal = items.reduce((sum, item) => sum + ((item.qty * item.purchasePrice) * item.gstRate / 100), 0);
  const billTotal = subtotal + taxTotal;

  const handleSave = async () => {
    if (!supplier) {
      alert("Please specify a supplier.");
      return;
    }
    if (items.length === 0) {
      alert("Please add at least one item.");
      return;
    }
    const unmapped = items.some(item => !item.productId);
    if (unmapped) {
      alert("Some items could not be matched to existing products. Please select a product for them before saving.");
      return;
    }

    const initialPaid = paymentMethod === "CASH" ? billTotal : (parseFloat(creditPaidAmount) || 0);
    const isPaid = initialPaid >= billTotal;

    setSaving(true);
    try {
      await addPurchaseBill({
        date,
        supplier,
        invoiceNumber,
        items,
        subtotal,
        taxTotal,
        grandTotal: billTotal,
        paymentMethod,
        creditPaidAmount: initialPaid,
        isCreditPaid: isPaid,
        creditPayments: initialPaid > 0 ? [
          {
            date: new Date().toISOString().split("T")[0],
            time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            amount: initialPaid,
            method: "CASH"
          }
        ] : []
      });
      
      // If converted from PO, mark PO as delivered
      if (convertedFromPoId) {
        await updatePurchaseOrder(convertedFromPoId, { status: "DELIVERED" });
        setConvertedFromPoId(null);
      }

      setShowModal(false);
      resetForm();
    } catch (e) {
      alert("Error saving purchase bill: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const exportData = () => {
    const rows = [["Date", "Supplier", "Invoice No.", "Items", "Subtotal", "Tax", "Grand Total"]];
    filtered.forEach(p => {
      rows.push([
        p.date,
        p.supplier,
        p.invoiceNumber || "-",
        p.items?.length || 0,
        p.subtotal?.toFixed(2),
        p.taxTotal?.toFixed(2),
        p.grandTotal?.toFixed(2)
      ]);
    });
    exportToExcel(`Purchases_${new Date().getTime()}.xlsx`, rows, "Purchases");
  };


  // PRICE COMPARISON ENGINE LOGIC
  const comparisonData = useMemo(() => {
    if (!compareProductId) return [];
    
    const history = [];
    purchases.forEach(p => {
      p.items?.forEach(item => {
        if (item.productId === compareProductId) {
          history.push({
            date: p.date,
            supplier: p.supplier,
            invoiceNumber: p.invoiceNumber || "N/A",
            qty: item.qty,
            purchasePrice: item.purchasePrice,
            gstRate: item.gstRate,
            totalPrice: item.qty * item.purchasePrice * (1 + (item.gstRate || 0) / 100)
          });
        }
      });
    });
    
    return history.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [purchases, compareProductId]);

  const lowestPriceItem = useMemo(() => {
    if (comparisonData.length === 0) return null;
    return [...comparisonData].sort((a, b) => a.purchasePrice - b.purchasePrice)[0];
  }, [comparisonData]);


  // PURCHASE ORDERS LOGIC
  const poSubtotal = poItems.reduce((sum, item) => sum + (item.qty * item.estimatedPrice), 0);
  const poTaxTotal = poItems.reduce((sum, item) => sum + ((item.qty * item.estimatedPrice) * item.gstRate / 100), 0);
  const poBillTotal = poSubtotal + poTaxTotal;

  const handleAddPoItem = () => {
    if (!poSelectedProductId || !poQty || !poEstPrice) {
      alert("Please select a product, and enter quantity and price.");
      return;
    }
    const product = products.find(p => p.id === poSelectedProductId);
    if (!product) return;

    const newItem = {
      productId: product.id,
      name: product.name,
      qty: parseFloat(poQty) || 0,
      estimatedPrice: parseFloat(poEstPrice) || 0,
      gstRate: parseFloat(poGstRate) || 0,
    };
    
    setPoItems([...poItems, newItem]);
    
    // Reset entry fields
    setPoSelectedProductId("");
    setPoQty("");
    setPoEstPrice("");
  };

  const handleRemovePoItem = (index) => {
    setPoItems(poItems.filter((_, i) => i !== index));
  };

  const openCreatePo = () => {
    setPoDate(new Date().toISOString().split("T")[0]);
    setPoSupplier("");
    
    // Auto-generate PO number
    const todayStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const datePos = (purchaseOrders || []).filter(po => po.poNumber && po.poNumber.startsWith(`PO-${todayStr}`));
    const seq = (datePos.length + 1).toString().padStart(3, "0");
    setPoNumber(`PO-${todayStr}-${seq}`);
    
    setPoItems([]);
    setPoNotes("");
    setPoStatus("PENDING DELIVERY");
    setEditingPoId(null);
    setShowPoModal(true);
  };

  const handleSavePo = async () => {
    if (!poSupplier) {
      alert("Please specify a supplier.");
      return;
    }
    if (poItems.length === 0) {
      alert("Please add at least one item.");
      return;
    }

    const poData = {
      poNumber,
      date: poDate,
      supplier: poSupplier,
      items: poItems,
      subtotal: poSubtotal,
      taxTotal: poTaxTotal,
      grandTotal: poBillTotal,
      notes: poNotes,
      status: poStatus
    };

    setSaving(true);
    try {
      if (editingPoId) {
        await updatePurchaseOrder(editingPoId, poData);
      } else {
        await addPurchaseOrder(poData);
      }
      setShowPoModal(false);
    } catch (e) {
      alert("Error saving Purchase Order: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConvertPoToBill = (po) => {
    resetForm();
    setDate(new Date().toISOString().split("T")[0]);
    setSupplier(po.supplier);
    setInvoiceNumber(po.poNumber);
    setPaymentMethod("CREDIT");
    setCreditPaidAmount("0");
    
    const mapped = po.items.map(item => ({
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      purchasePrice: item.estimatedPrice,
      gstRate: item.gstRate
    }));
    setItems(mapped);
    setConvertedFromPoId(po.id);
    setShowModal(true);
  };

  const handleSendPoWhatsApp = (po) => {
    const supplierPhone = suppliers.find(s => s.name.toLowerCase() === po.supplier.toLowerCase())?.phone || "";
    
    let itemsText = po.items.map((item, idx) => {
      const itemTotal = item.qty * item.estimatedPrice * (1 + (item.gstRate || 0)/100);
      return `${idx + 1}. *${item.name}* - ${item.qty} Nos @ ₹${item.estimatedPrice} (+${item.gstRate}% GST) = ₹${itemTotal.toFixed(2)}`;
    }).join("\n");
    
    const text = `*VIJAYAPATHI TRADERS*
*PURCHASE ORDER*

*PO Number:* ${po.poNumber}
*Date:* ${po.date}
*Supplier:* ${po.supplier}

*Items Requested:*
${itemsText}

*Estimated Grand Total:* ₹${po.grandTotal.toFixed(2)}

${po.notes ? `*Delivery Notes:* ${po.notes}\n` : ""}
Thank you! Please confirm delivery schedule.`;

    const encodedText = encodeURIComponent(text);
    const cleanPhone = supplierPhone.replace(/[^0-9]/g, "");
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    
    window.open(`https://wa.me/${formattedPhone}?text=${encodedText}`, "_blank");
  };

  const handlePrintPo = (po) => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    const supplierObj = suppliers.find(s => s.name.toLowerCase() === po.supplier.toLowerCase()) || {};
    
    let itemsRows = po.items.map((item, idx) => {
      const taxable = item.qty * item.estimatedPrice;
      const taxAmt = taxable * (item.gstRate || 0)/100;
      const total = taxable + taxAmt;
      return `
        <tr>
          <td style="text-align: center; border: 1px solid #ddd; padding: 8px;">${idx + 1}</td>
          <td style="border: 1px solid #ddd; padding: 8px;"><strong>${item.name}</strong></td>
          <td style="text-align: center; border: 1px solid #ddd; padding: 8px;">${item.qty}</td>
          <td style="text-align: right; border: 1px solid #ddd; padding: 8px;">₹${item.estimatedPrice.toFixed(2)}</td>
          <td style="text-align: center; border: 1px solid #ddd; padding: 8px;">${item.gstRate}%</td>
          <td style="text-align: right; border: 1px solid #ddd; padding: 8px;">₹${total.toFixed(2)}</td>
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
      <head>
        <title>Purchase Order - ${po.poNumber}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #8e44ad; padding-bottom: 20px; margin-bottom: 20px; }
          .title { color: #8e44ad; font-size: 28px; font-weight: bold; }
          .meta-info { display: flex; justify-content: space-between; margin-bottom: 30px; line-height: 1.6; }
          .meta-info div { width: 45%; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f8f9fa; color: #555; border: 1px solid #ddd; padding: 10px; font-weight: bold; }
          td { border: 1px solid #ddd; padding: 10px; }
          .totals { text-align: right; margin-top: 20px; font-size: 16px; line-height: 1.8; }
          .po-notes { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; font-size: 13px; color: #666; }
          .footer { margin-top: 80px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
          @media print {
            body { margin: 20px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: right; margin-bottom: 10px;">
          <button onclick="window.print()" style="background: #8e44ad; color: white; border: none; padding: 8px 16px; border-radius: 4px; font-size: 14px; cursor: pointer; font-weight: bold;">🖨️ Print Purchase Order</button>
        </div>
        <div class="header">
          <div>
            <div class="title">VIJAYAPATHI TRADERS</div>
            <div style="font-size: 13px; color: #666; margin-top: 4px;">Hardware, Electrical & Plumbing Supplies</div>
            <div style="font-size: 12px; color: #888;">Coimbatore, Tamil Nadu</div>
          </div>
          <div style="text-align: right;">
            <h2 style="margin: 0; color: #333;">PURCHASE ORDER</h2>
            <div style="margin-top: 8px; font-size: 14px;">
              <strong>PO Number:</strong> ${po.poNumber}<br/>
              <strong>Date:</strong> ${po.date}
            </div>
          </div>
        </div>

        <div class="meta-info">
          <div>
            <strong style="color: #8e44ad;">BUYER:</strong><br/>
            <strong>Vijayapathi Traders</strong><br/>
            Coimbatore, TN, India<br/>
            Phone: +91 94437 21915<br/>
            GSTIN: 33AAAAV1234A1Z1 (Demo)
          </div>
          <div>
            <strong style="color: #8e44ad;">SUPPLIER:</strong><br/>
            <strong>${po.supplier}</strong><br/>
            ${supplierObj.location || "Location not specified"}<br/>
            Phone: ${supplierObj.phone || "N/A"}
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
          <thead>
            <tr>
              <th style="width: 50px; text-align: center;">S.NO</th>
              <th style="text-align: left;">PRODUCT DESCRIPTION</th>
              <th style="width: 80px; text-align: center;">QTY</th>
              <th style="width: 120px; text-align: right;">UNIT PRICE</th>
              <th style="width: 100px; text-align: center;">GST %</th>
              <th style="width: 150px; text-align: right;">TOTAL PRICE</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="totals">
          <div>Subtotal: <strong>₹${po.subtotal.toFixed(2)}</strong></div>
          <div>Estimated GST Tax: <strong>+₹${po.taxTotal.toFixed(2)}</strong></div>
          <div style="font-size: 18px; margin-top: 10px; color: #8e44ad;">Estimated Grand Total: <strong>₹${po.grandTotal.toFixed(2)}</strong></div>
        </div>

        ${po.notes ? `
          <div class="po-notes">
            <strong>DELIVERY TERMS / NOTES:</strong><br/>
            <p style="margin-top: 6px; white-space: pre-wrap;">${po.notes}</p>
          </div>
        ` : ""}

        <div style="display: flex; justify-content: space-between; margin-top: 80px; font-size: 13px;">
          <div>
            <br/><br/>
            <hr style="border: none; border-top: 1px solid #aaa; width: 180px; margin-bottom: 5px;"/>
            Prepared By (Staff)
          </div>
          <div style="text-align: right;">
            <br/><br/>
            <hr style="border: none; border-top: 1px solid #aaa; width: 180px; margin-bottom: 5px; float: right;"/>
            <div style="clear: both;">Authorized Signature</div>
          </div>
        </div>

        <div class="footer">
          This is a computer-generated Purchase Order and requires authorized approval for order finalization.
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-sub">INWARD SUPPLY CHAIN</div>
          <h1 className="page-title">
            {activeTab === "bills" && "Purchase Bills"}
            {activeTab === "comparison" && "Supplier Price Comparison"}
            {activeTab === "po" && "Purchase Orders"}
          </h1>
        </div>
        
        {/* Dynamic header buttons depending on active tab */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {activeTab === "bills" && (
            <>
              <button className="btn-secondary" onClick={exportData}>📥 DOWNLOAD CSV</button>
              <button className="btn-secondary" onClick={() => { resetForm(); fileInputRef.current?.click(); }} disabled={isScanning}>
                {isScanning ? "⏳ SCANNING..." : "📸 SCAN BILL (AI)"}
              </button>
              <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                onChange={handleScanBill} 
                style={{ display: 'none' }} 
              />
              <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>+ ADD PURCHASE BILL</button>
            </>
          )}

          {activeTab === "po" && (
            <button className="btn-primary" onClick={openCreatePo} style={{ background: "#8e44ad" }}>+ CREATE PURCHASE ORDER</button>
          )}
        </div>
      </div>

      {/* Tab Switcher Grid */}
      <div className="inventory-filters" style={{ marginBottom: "20px", marginTop: "10px" }}>
        <div className="category-tabs" style={{ gap: "10px" }}>
          <button className={`cat-tab ${activeTab === "bills" ? "active" : ""}`} onClick={() => setActiveTab("bills")}>📥 Inward Bills</button>
          <button className={`cat-tab ${activeTab === "comparison" ? "active" : ""}`} onClick={() => setActiveTab("comparison")}>📊 Price Comparison</button>
          <button className={`cat-tab ${activeTab === "po" ? "active" : ""}`} onClick={() => setActiveTab("po")}>📋 Purchase Orders</button>
        </div>
      </div>


      {/* TAB 1: INWARD PURCHASE BILLS */}
      {activeTab === "bills" && (
        <>
          <div className="expense-filters">
            <div className="expense-filter-tabs">
              <button className={`cat-tab ${filterMode === "all" ? "active" : ""}`} onClick={() => setFilterMode("all")}>ALL TIME</button>
              <button className={`cat-tab ${filterMode === "month" ? "active" : ""}`} onClick={() => setFilterMode("month")}>MONTHLY</button>
            </div>
            {filterMode === "month" && (
              <input
                type="month"
                className="expense-date-picker"
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
              />
            )}
          </div>

          <div className="expenses-summary">
            <div className="summary-label">TOTAL PURCHASES ({filterMode.toUpperCase()})</div>
            <div className="summary-total">₹{grandTotal.toLocaleString()}</div>
            <div className="entries-count">{filtered.length} bills</div>
          </div>

          <div className="table-container" style={{ marginTop: '20px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>SUPPLIER</th>
                  <th>INVOICE NO.</th>
                  <th>PAYMENT MODE</th>
                  <th style={{textAlign: 'center'}}>ITEMS</th>
                  <th style={{textAlign: 'right'}}>SUBTOTAL</th>
                  <th style={{textAlign: 'right'}}>TAX</th>
                  <th style={{textAlign: 'right'}}>GRAND TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td>{p.date}</td>
                    <td style={{ fontWeight: 'bold' }}>{p.supplier}</td>
                    <td>{p.invoiceNumber || "-"}</td>
                    <td>
                      <span style={{ 
                        padding: '3px 8px', 
                        borderRadius: '4px', 
                        fontSize: '11px', 
                        fontWeight: '800',
                        background: p.paymentMethod === 'CREDIT' ? 'rgba(0, 201, 167, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                        color: p.paymentMethod === 'CREDIT' ? '#00c9a7' : '#2563eb'
                      }}>
                        {p.paymentMethod === 'CREDIT' ? '📓 CREDIT' : '💵 CASH'}
                      </span>
                      {p.paymentMethod === 'CREDIT' && (
                        <div style={{ fontSize: '10px', color: '#888', marginTop: '4px', fontWeight: 'bold' }}>
                          Paid: ₹{(p.creditPaidAmount || 0).toLocaleString()} / ₹{(p.grandTotal || 0).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td style={{textAlign: 'center'}}>{p.items?.length || 0}</td>
                    <td style={{textAlign: 'right'}}>₹{p.subtotal?.toLocaleString()}</td>
                    <td style={{textAlign: 'right', color: '#888'}}>+₹{p.taxTotal?.toLocaleString()}</td>
                    <td style={{textAlign: 'right', fontWeight: 'bold', color: '#1c1917'}}>₹{p.grandTotal?.toLocaleString()}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan="8" className="empty-state" style={{textAlign: 'center'}}>No purchase bills found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}


      {/* TAB 2: PRICE COMPARISON */}
      {activeTab === "comparison" && (
        <div>
          <div className="expense-filters" style={{ display: "flex", gap: "15px", alignItems: "center", background: "none", border: "none", padding: 0 }}>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label style={{ fontWeight: "bold", fontSize: "14px", marginBottom: "6px", display: "block" }}>Select Product to Compare Prices</label>
              <SearchableSelect
                options={purchaseProductOptions}
                value={compareProductId}
                onChange={setCompareProductId}
                placeholder="Choose a product..."
                accentColor="#2563eb"
              />
            </div>
          </div>

          {compareProductId && (() => {
            const prod = products.find(p => p.id === compareProductId);
            if (!prod) return null;
            return (
              <div style={{ marginTop: "20px" }}>
                {/* Visual Summary Banners */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "15px", marginBottom: "25px" }}>
                  <div style={{ background: "rgba(142, 68, 173, 0.05)", border: "1.5px solid rgba(142, 68, 173, 0.15)", padding: "16px", borderRadius: "8px" }}>
                    <div style={{ fontSize: "11px", color: "#8e44ad", fontWeight: "bold" }}>CURRENT INVENTORY PRICE</div>
                    <div style={{ fontSize: "22px", fontWeight: "bold", color: "#8e44ad", marginTop: "6px" }}>₹{prod.purchasePrice?.toLocaleString()}</div>
                    <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>Selling Price: ₹{prod.sellingPrice?.toLocaleString()}</div>
                  </div>
                  
                  {lowestPriceItem ? (
                    <div style={{ background: "rgba(0, 201, 167, 0.05)", border: "1.5px solid rgba(0, 201, 167, 0.15)", padding: "16px", borderRadius: "8px" }}>
                      <div style={{ fontSize: "11px", color: "#00c9a7", fontWeight: "bold" }}>🏆 LOWEST PRICE PAID</div>
                      <div style={{ fontSize: "22px", fontWeight: "bold", color: "#00c9a7", marginTop: "6px" }}>₹{lowestPriceItem.purchasePrice?.toLocaleString()}</div>
                      <div style={{ fontSize: "11px", color: "#333", marginTop: "4px" }}>Supplier: <strong>{lowestPriceItem.supplier}</strong></div>
                    </div>
                  ) : (
                    <div style={{ background: "rgba(230, 126, 34, 0.05)", border: "1.5px solid rgba(230, 126, 34, 0.15)", padding: "16px", borderRadius: "8px" }}>
                      <div style={{ fontSize: "11px", color: "#e67e22", fontWeight: "bold" }}>STATUS</div>
                      <div style={{ fontSize: "18px", fontWeight: "bold", color: "#e67e22", marginTop: "6px" }}>No Inward Bills</div>
                      <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>No past purchase statements recorded.</div>
                    </div>
                  )}

                  {comparisonData.length > 0 && (
                    <div style={{ background: "rgba(37, 99, 235, 0.05)", border: "1.5px solid rgba(37, 99, 235, 0.15)", padding: "16px", borderRadius: "8px" }}>
                      <div style={{ fontSize: "11px", color: "#2563eb", fontWeight: "bold" }}>LATEST INWARD PRICE</div>
                      <div style={{ fontSize: "22px", fontWeight: "bold", color: "#2563eb", marginTop: "6px" }}>₹{comparisonData[0].purchasePrice?.toLocaleString()}</div>
                      <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>Date: {comparisonData[0].date}</div>
                    </div>
                  )}
                </div>

                {/* Price History Table */}
                <h3 style={{ marginBottom: "10px", fontSize: "16px", fontWeight: "bold" }}>Comparative Purchase Price History</h3>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>DATE</th>
                        <th>SUPPLIER</th>
                        <th>INVOICE NO.</th>
                        <th style={{ textAlign: "center" }}>QUANTITY BOUGHT</th>
                        <th style={{ textAlign: "right" }}>COST PRICE</th>
                        <th style={{ textAlign: "center" }}>GST %</th>
                        <th style={{ textAlign: "right" }}>NET COST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonData.map((item, idx) => {
                        const isLowest = item.purchasePrice === lowestPriceItem?.purchasePrice;
                        return (
                          <tr key={idx} style={{ background: isLowest ? "rgba(0, 201, 167, 0.06)" : "transparent" }}>
                            <td>{item.date}</td>
                            <td style={{ fontWeight: "bold" }}>
                              {item.supplier}
                              {isLowest && (
                                <span style={{ marginLeft: "8px", background: "rgba(0, 201, 167, 0.15)", color: "#00c9a7", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold" }}>
                                  BEST PRICE
                                </span>
                              )}
                            </td>
                            <td>{item.invoiceNumber}</td>
                            <td style={{ textAlign: "center" }}>{item.qty}</td>
                            <td style={{ textAlign: "right", fontWeight: isLowest ? "bold" : "normal", color: isLowest ? "#00c9a7" : "inherit" }}>
                              ₹{item.purchasePrice.toLocaleString()}
                            </td>
                            <td style={{ textAlign: "center" }}>{item.gstRate}%</td>
                            <td style={{ textAlign: "right", fontWeight: "bold" }}>₹{item.totalPrice.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                      {comparisonData.length === 0 && (
                        <tr>
                          <td colSpan="7" style={{ textAlign: "center", padding: "20px", color: "#666" }}>
                            No inward purchase records exist for this product yet. Displaying default inventory values.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}


      {/* TAB 3: PURCHASE ORDERS */}
      {activeTab === "po" && (
        <div>
          {/* PO Summary Dashboard */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "15px", marginBottom: "20px" }}>
            <div style={{ background: "rgba(230, 126, 34, 0.05)", border: "1.5px solid rgba(230, 126, 34, 0.15)", padding: "15px", borderRadius: "8px" }}>
              <div style={{ fontSize: "11px", color: "#e67e22", fontWeight: "bold" }}>PENDING ORDERS</div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#e67e22", marginTop: "5px" }}>
                {(purchaseOrders || []).filter(po => po.status === "PENDING DELIVERY").length} POs
              </div>
            </div>
            <div style={{ background: "rgba(0, 201, 167, 0.05)", border: "1.5px solid rgba(0, 201, 167, 0.15)", padding: "15px", borderRadius: "8px" }}>
              <div style={{ fontSize: "11px", color: "#00c9a7", fontWeight: "bold" }}>DELIVERED / INWARDED</div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#00c9a7", marginTop: "5px" }}>
                {(purchaseOrders || []).filter(po => po.status === "DELIVERED").length} POs
              </div>
            </div>
            <div style={{ background: "rgba(142, 68, 173, 0.05)", border: "1.5px solid rgba(142, 68, 173, 0.15)", padding: "15px", borderRadius: "8px" }}>
              <div style={{ fontSize: "11px", color: "#8e44ad", fontWeight: "bold" }}>TOTAL PENDING PO VALUE</div>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#8e44ad", marginTop: "5px" }}>
                ₹{(purchaseOrders || []).filter(po => po.status === "PENDING DELIVERY").reduce((sum, po) => sum + (po.grandTotal || 0), 0).toLocaleString()}
              </div>
            </div>
          </div>

          {/* PO List Table */}
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>PO NUMBER</th>
                  <th>DATE</th>
                  <th>SUPPLIER</th>
                  <th style={{ textAlign: "center" }}>ITEMS</th>
                  <th style={{ textAlign: "right" }}>GRAND TOTAL</th>
                  <th style={{ textAlign: "center" }}>STATUS</th>
                  <th style={{ textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {(purchaseOrders || []).map(po => {
                  const statusColors = {
                    "PENDING DELIVERY": { bg: "rgba(230, 126, 34, 0.15)", color: "#e67e22" },
                    "DELIVERED": { bg: "rgba(0, 201, 167, 0.15)", color: "#00c9a7" },
                    "CANCELLED": { bg: "rgba(255, 71, 87, 0.15)", color: "#ff4757" }
                  };
                  const colors = statusColors[po.status] || { bg: "rgba(127, 140, 141, 0.15)", color: "#7f8c8d" };
                  
                  return (
                    <tr key={po.id}>
                      <td style={{ fontWeight: "bold" }}>{po.poNumber}</td>
                      <td>{po.date}</td>
                      <td style={{ fontWeight: "bold" }}>{po.supplier}</td>
                      <td style={{ textAlign: "center" }}>{po.items?.length || 0}</td>
                      <td style={{ textAlign: "right", fontWeight: "bold", color: "#8e44ad" }}>₹{po.grandTotal?.toLocaleString()}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: "800",
                          background: colors.bg,
                          color: colors.color
                        }}>
                          {po.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {po.status === "PENDING DELIVERY" && (
                            <button 
                              className="btn-primary" 
                              onClick={() => handleConvertPoToBill(po)}
                              style={{ padding: "4px 8px", fontSize: "11px", background: "#00c9a7", border: "none", color: "#fff", cursor: "pointer", fontWeight: "bold" }}
                              title="Receive inventory and convert into Inward Purchase Bill"
                            >
                              🚚 INWARD STOCK
                            </button>
                          )}
                          <button 
                            onClick={() => handlePrintPo(po)} 
                            style={{ background: "none", border: "1px solid #ddd", borderRadius: "4px", padding: "4px 8px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}
                            title="Print PO PDF Invoice"
                          >
                            🖨️ PDF
                          </button>
                          <button 
                            onClick={() => handleSendPoWhatsApp(po)} 
                            style={{ background: "none", border: "1.5px solid #2ecc71", borderRadius: "4px", padding: "4px 8px", fontSize: "11px", cursor: "pointer", color: "#2ecc71", fontWeight: "bold" }}
                            title="Send order via WhatsApp"
                          >
                            📱 WHATSAPP
                          </button>
                          <button 
                            className="delete-btn" 
                            onClick={async () => {
                              if (confirm(`Delete Purchase Order "${po.poNumber}"?`)) {
                                await deletePurchaseOrder(po.id);
                              }
                            }}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(purchaseOrders || []).length === 0 && (
                  <tr>
                    <td colSpan="7" className="empty-state" style={{ textAlign: "center" }}>
                      No Purchase Orders found. Click "Create Purchase Order" to generate one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* INWARD PURCHASE BILL MODAL (TAB 1) */}
      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="modal-content" style={{ maxWidth: "800px", width: "90vw", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2>{isScanning ? "Scanning Invoice with AI..." : "Add Purchase Bill"}</h2>
              <button className="btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>CLOSE</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              <div className="form-group">
                <label>Date *</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Supplier *</label>
                <input 
                  list="purchases-suppliers-list"
                  value={supplier} 
                  onChange={e => setSupplier(e.target.value)} 
                  placeholder="Select or type..."
                />
                <datalist id="purchases-suppliers-list">
                  {suppliers.map(s => <option key={s.id} value={s.name} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>Invoice Number</label>
                <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-1002" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px', border: '1px dashed rgba(255,255,255,0.1)' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ marginBottom: '6px', fontSize: '13px', fontWeight: 'bold' }}>Payment Mode</label>
                <div className="payment-tabs" style={{ display: 'flex', gap: '5px' }}>
                  <button
                    type="button"
                    className={`pay-tab ${paymentMethod === "CASH" ? "active" : ""}`}
                    onClick={() => setPaymentMethod("CASH")}
                    style={{ padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', border: '1.5px solid #2563eb', background: paymentMethod === 'CASH' ? '#2563eb' : 'transparent', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  >💵 CASH</button>
                  <button
                    type="button"
                    className={`pay-tab ${paymentMethod === "CREDIT" ? "active" : ""}`}
                    onClick={() => setPaymentMethod("CREDIT")}
                    style={{ padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', border: '1.5px solid #00c9a7', background: paymentMethod === 'CREDIT' ? '#00c9a7' : 'transparent', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                  >📓 CREDIT</button>
                </div>
              </div>

              {paymentMethod === "CREDIT" && (
                <div className="form-group" style={{ margin: 0, flex: 1 }}>
                  <label style={{ marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>Initial Amount Paid (₹)</label>
                  <input
                    type="number"
                    value={creditPaidAmount}
                    onChange={e => setCreditPaidAmount(e.target.value)}
                    placeholder="e.g. 0 or partial amount"
                    style={{ width: '100%', padding: '8px', fontSize: '13px', background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
                  />
                </div>
              )}
            </div>

            <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '15px', marginBottom: '20px', background: '#f8f9fa' }}>
              <h3 style={{ marginBottom: '10px', fontSize: '14px' }}>Add Items to Bill</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '2', minWidth: '200px' }}>
                  <label>Product</label>
                  <SearchableSelect
                    options={purchaseProductOptions}
                    value={selectedProductId}
                    onChange={(val) => {
                      setSelectedProductId(val);
                      const p = products.find(prod => prod.id === val);
                      if (p) {
                        setPurchasePrice(p.purchasePrice || "");
                        setGstRate(p.gstRate || 0);
                      }
                    }}
                    placeholder="Select a product..."
                    accentColor="#2563eb"
                  />
                </div>
                <div className="form-group" style={{ width: '80px' }}>
                  <label>Qty</label>
                  <input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="10" />
                </div>
                <div className="form-group" style={{ width: '100px' }}>
                  <label>Unit Price</label>
                  <input type="number" min="0" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="₹" />
                </div>
                <div className="form-group" style={{ width: '80px' }}>
                  <label>GST %</label>
                  <select value={gstRate} onChange={e => setGstRate(e.target.value)}>
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
                <button className="btn-secondary" onClick={handleAddItem} style={{ height: '36px', marginBottom: '4px' }}>ADD</button>
              </div>
            </div>

            {items.length > 0 && (
              <table className="data-table tally-table" style={{ marginBottom: '20px' }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{textAlign: 'center'}}>Qty</th>
                    <th style={{textAlign: 'right'}}>Price</th>
                    <th style={{textAlign: 'right'}}>GST %</th>
                    <th style={{textAlign: 'right'}}>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} style={{ background: item.productId ? 'transparent' : '#fff3cd' }}>
                      <td>
                        <input 
                          type="text" 
                          list="purchases-product-list"
                          value={item.name}
                          onChange={(e) => handleItemChange(i, 'name', e.target.value)}
                          style={{ width: '100%', border: item.productId ? 'none' : '1px solid #ffc107', background: 'transparent', padding: '4px' }}
                          placeholder="Type or select product..."
                        />
                      </td>
                      <td style={{textAlign: 'center'}}>
                        <input 
                          type="number" 
                          min="0"
                          step="any"
                          value={item.qty}
                          onChange={(e) => handleItemChange(i, 'qty', e.target.value)}
                          style={{ width: '60px', textAlign: 'center', border: '1px solid #ddd', padding: '4px' }}
                        />
                      </td>
                      <td style={{textAlign: 'right'}}>
                        <input 
                          type="number" 
                          value={item.purchasePrice}
                          onChange={(e) => handleItemChange(i, 'purchasePrice', e.target.value)}
                          style={{ width: '80px', textAlign: 'right', border: '1px solid #ddd', padding: '4px' }}
                        />
                      </td>
                      <td style={{textAlign: 'right'}}>
                        <input 
                          type="number" 
                          value={item.gstRate}
                          onChange={(e) => handleItemChange(i, 'gstRate', e.target.value)}
                          style={{ width: '60px', textAlign: 'right', border: '1px solid #ddd', padding: '4px' }}
                        />%
                      </td>
                      <td style={{textAlign: 'right', fontWeight: 'bold'}}>₹{(item.qty * item.purchasePrice * (1 + item.gstRate/100)).toFixed(2)}</td>
                      <td style={{textAlign: 'center'}}><button className="delete-btn" onClick={() => handleRemoveItem(i)}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            <datalist id="purchases-product-list">
              {products.map(p => <option key={p.id} value={p.name} />)}
            </datalist>

            <div style={{ display: 'flex', justifycontent: 'flex-end', alignItems: 'flex-end', flexDirection: 'column', gap: '5px', marginBottom: '20px' }}>
              <div>Subtotal: ₹{subtotal.toFixed(2)}</div>
              <div>Total Tax: +₹{taxTotal.toFixed(2)}</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#2563eb' }}>Grand Total: ₹{billTotal.toFixed(2)}</div>
            </div>

            <div className="modal-btns">
              <button className="btn-secondary" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving || items.length === 0}>
                {saving ? "Saving..." : "Save Purchase Bill"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* CREATE PURCHASE ORDER MODAL (TAB 3) */}
      {showPoModal && (
        <div className="modal-overlay" onClick={() => { setShowPoModal(false); }}>
          <div className="modal-content" style={{ maxWidth: "800px", width: "90vw", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="modal-stripe" style={{ background: "#8e44ad" }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2>{editingPoId ? "Edit Purchase Order" : "Create Purchase Order"}</h2>
              <button className="btn-secondary" onClick={() => setShowPoModal(false)}>CLOSE</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              <div className="form-group">
                <label>PO Date *</label>
                <input type="date" value={poDate} onChange={e => setPoDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Supplier *</label>
                <input 
                  list="po-suppliers-list"
                  value={poSupplier} 
                  onChange={e => setPoSupplier(e.target.value)} 
                  placeholder="Select or type..."
                />
                <datalist id="po-suppliers-list">
                  {suppliers.map(s => <option key={s.id} value={s.name} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>PO Number *</label>
                <input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="e.g. PO-20260525-01" />
              </div>
            </div>

            {/* Custom Notes / Delivery Terms */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "15px", marginBottom: "20px" }}>
              <div className="form-group">
                <label>Delivery Terms / Custom Notes</label>
                <input value={poNotes} onChange={e => setPoNotes(e.target.value)} placeholder="e.g. Deliver requested by Friday morning" />
              </div>
              <div className="form-group">
                <label>PO Status</label>
                <select value={poStatus} onChange={e => setPoStatus(e.target.value)}>
                  <option value="PENDING DELIVERY">PENDING DELIVERY</option>
                  <option value="DELIVERED">DELIVERED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            </div>

            <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '15px', marginBottom: '20px', background: '#f8f9fa' }}>
              <h3 style={{ marginBottom: '10px', fontSize: '14px', color: '#333' }}>Add Items to Purchase Order</h3>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '2', minWidth: '200px' }}>
                  <label>Product</label>
                  <SearchableSelect
                    options={purchaseProductOptions}
                    value={poSelectedProductId}
                    onChange={(val) => {
                      setPoSelectedProductId(val);
                      const p = products.find(prod => prod.id === val);
                      if (p) {
                        // Find best historical cost price from purchases!
                        const histories = [];
                        purchases.forEach(pb => {
                          pb.items?.forEach(item => {
                            if (item.productId === p.id) {
                              histories.push(item.purchasePrice);
                            }
                          });
                        });
                        const minPrice = histories.length > 0 ? Math.min(...histories) : p.purchasePrice;
                        setPoEstPrice(minPrice || "");
                        setPoGstRate(p.gstRate || 0);
                      }
                    }}
                    placeholder="Select a product..."
                    accentColor="#8e44ad"
                  />
                </div>
                <div className="form-group" style={{ width: '80px' }}>
                  <label>Qty</label>
                  <input type="number" min="0" step="any" value={poQty} onChange={e => setPoQty(e.target.value)} placeholder="50" />
                </div>
                <div className="form-group" style={{ width: '110px' }}>
                  <label>Est Price (₹)</label>
                  <input type="number" min="0" value={poEstPrice} onChange={e => setPoEstPrice(e.target.value)} placeholder="₹" />
                </div>
                <div className="form-group" style={{ width: '80px' }}>
                  <label>GST %</label>
                  <select value={poGstRate} onChange={e => setPoGstRate(e.target.value)}>
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
                <button className="btn-secondary" onClick={handleAddPoItem} style={{ height: '36px', marginBottom: '4px' }}>ADD</button>
              </div>
            </div>

            {poItems.length > 0 && (
              <table className="data-table tally-table" style={{ marginBottom: '20px' }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{textAlign: 'center'}}>Qty</th>
                    <th style={{textAlign: 'right'}}>Est Price</th>
                    <th style={{textAlign: 'right'}}>GST %</th>
                    <th style={{textAlign: 'right'}}>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {poItems.map((item, i) => (
                    <tr key={i}>
                      <td><strong>{item.name}</strong></td>
                      <td style={{textAlign: 'center'}}>{item.qty}</td>
                      <td style={{textAlign: 'right'}}>₹{item.estimatedPrice}</td>
                      <td style={{textAlign: 'right'}}>{item.gstRate}%</td>
                      <td style={{textAlign: 'right', fontWeight: 'bold'}}>₹{(item.qty * item.estimatedPrice * (1 + item.gstRate/100)).toFixed(2)}</td>
                      <td style={{textAlign: 'center'}}><button className="delete-btn" onClick={() => handleRemovePoItem(i)}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ display: 'flex', justifycontent: 'flex-end', alignItems: 'flex-end', flexDirection: 'column', gap: '5px', marginBottom: '20px' }}>
              <div>Subtotal: ₹{poSubtotal.toFixed(2)}</div>
              <div>Estimated GST: +₹{poTaxTotal.toFixed(2)}</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#8e44ad' }}>Estimated Grand Total: ₹{poBillTotal.toFixed(2)}</div>
            </div>

            <div className="modal-btns">
              <button className="btn-secondary" onClick={() => setShowPoModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSavePo} style={{ background: '#8e44ad' }} disabled={saving || poItems.length === 0}>
                {saving ? "Saving..." : "Save Purchase Order"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
