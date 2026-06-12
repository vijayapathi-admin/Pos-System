import React, { useState, useMemo } from "react";
import { useApp } from "../AppContext";
import { exportToExcel } from "../utils";

export default function Expenses() {
  const { expenses, addExpense, deleteExpense } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [expDate, setExpDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [filterMode, setFilterMode] = useState("today"); // all | today | week | month
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split("T")[0]);
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

  // Filtered expenses
  const filtered = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    let result = [...expenses];

    if (filterMode === "today") {
      result = result.filter(e => e.date === today);
    } else if (filterMode === "day") {
      result = result.filter(e => e.date === filterDate);
    } else if (filterMode === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekStr = weekAgo.toISOString().split("T")[0];
      result = result.filter(e => e.date >= weekStr && e.date <= today);
    } else if (filterMode === "month") {
      result = result.filter(e => e.date?.startsWith(filterMonth));
    }

    return result.sort((a, b) => b.date?.localeCompare(a.date));
  }, [expenses, filterMode, filterDate, filterMonth]);

  const total = filtered.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Group by date for summary
  const dateGroups = useMemo(() => {
    const groups = {};
    filtered.forEach(exp => {
      const d = exp.date || "Unknown";
      if (!groups[d]) groups[d] = { expenses: [], total: 0 };
      groups[d].expenses.push(exp);
      groups[d].total += exp.amount || 0;
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const handleAdd = async () => {
    if (!reason || !amount) { alert("Please enter reason and amount."); return; }
    setSaving(true);
    try {
      await addExpense(reason, amount, expDate);
      setReason("");
      setAmount("");
      setExpDate(new Date().toISOString().split("T")[0]);
      setShowModal(false);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const exportExpenses = () => {
    const rows = [["#", "Date", "Reason", "Amount (₹)"]];
    filtered.forEach((e, index) => {
      rows.push([
        index + 1,
        e.date,
        e.reason,
        e.amount
      ]);
    });
    // Add Total Row
    rows.push(["", "", "TOTAL", total]);
    exportToExcel(`expenses_${filterMode}_${new Date().getTime()}.xlsx`, rows, "Expenses");
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this expense?")) return;
    await deleteExpense(id);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-sub">DAILY COSTS</div>
          <h1 className="page-title">Expenses</h1>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={exportExpenses}>📥 DOWNLOAD CSV</button>
          <button className="btn-primary" onClick={() => { setReason(""); setShowModal(true); }}>+ GENERAL EXP</button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="expense-filters">
        <div className="expense-filter-tabs">
          {[
            { key: "all", label: "ALL" },
            { key: "today", label: "TODAY" },
            { key: "day", label: "BY DATE" },
            { key: "week", label: "THIS WEEK" },
            { key: "month", label: "MONTHLY" },
          ].map(f => (
            <button
              key={f.key}
              className={`cat-tab ${filterMode === f.key ? "active" : ""}`}
              onClick={() => setFilterMode(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        {filterMode === "day" && (
          <input
            type="date"
            className="expense-date-picker"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            max={new Date().toISOString().split("T")[0]}
          />
        )}
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
        <div className="summary-label">TOTAL EXPENSES ({filterMode.toUpperCase()})</div>
        <div className="summary-total">₹{total.toLocaleString()}</div>
        <div className="entries-count">{filtered.length} entries</div>
      </div>

      {/* Date-grouped view */}
      {dateGroups.map(([date, group]) => {
      return (
        <div key={date} className="expense-date-group">
          <div className="expense-group-header" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="expense-group-date">
                {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
              </span>
              <span className="expense-group-total">₹{group.total.toLocaleString()}</span>
            </div>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>REASON</th>
                  <th>AMOUNT</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {group.expenses.map(expense => (
                  <tr key={expense.id}>
                    <td>{expense.reason}</td>
                    <td><strong>₹{expense.amount?.toLocaleString()}</strong></td>
                    <td>
                      <button className="delete-btn" onClick={() => handleDelete(expense.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="empty-state">No expenses found for this period.</div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content form-modal" onClick={e => e.stopPropagation()}>
            <h2>Add Expense</h2>
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={expDate}
                onChange={e => setExpDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>
            <div className="form-group">
              <label>Reason / Description</label>
              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Electricity bill"
              />
            </div>
            <div className="form-group">
              <label>Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="500"
              />
            </div>
            <div className="modal-btns">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleAdd} disabled={saving}>
                {saving ? "Saving..." : "Add Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
