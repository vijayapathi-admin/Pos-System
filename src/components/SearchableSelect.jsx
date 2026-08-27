import React, { useState, useEffect, useRef } from "react";
import { matchesProductSearch } from "../utils";

// Helper to convert hex colors to rgba for background highlights
const getRgba = (hex, alpha) => {
  try {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch (e) {
    return `rgba(37, 99, 235, ${alpha})`;
  }
};

export default function SearchableSelect({
  options = [], // [{ value: '...', label: '...' }]
  value = "",
  onChange,
  placeholder = "Select...",
  accentColor = "#2563eb",
  disabled = false,
  style = {}
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  const selectedOption = options.find(o => o.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync search input text with selected value when dropdown is closed
  useEffect(() => {
    if (!isOpen) {
      setSearch(selectedOption ? selectedOption.label : "");
    }
  }, [isOpen, selectedOption]);

  const filteredOptions = options.filter(option =>
    matchesProductSearch({ name: option.label }, search)
  );


  const handleSelect = (option) => {
    onChange(option.value);
    setIsOpen(false);
  };

  const handleInputFocus = (e) => {
    if (disabled) return;
    setIsOpen(true);
    setSearch(selectedOption ? selectedOption.label : "");
    // Automatically select the input text so user can overwrite it easily
    setTimeout(() => {
      if (e.target) e.target.select();
    }, 0);
  };

  return (
    <div 
      ref={containerRef} 
      className="searchable-select-container" 
      style={{ position: "relative", width: "100%", ...style }}
    >
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={isOpen ? search : (selectedOption ? selectedOption.label : "")}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="searchable-select-input"
          style={{
            width: "100%",
            boxSizing: "border-box",
            paddingRight: "30px", // leave space for the arrow
            borderColor: isOpen ? accentColor : "#e7e5e4"
          }}
        />
        <span 
          className="searchable-select-arrow"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          style={{
            position: "absolute",
            right: "12px",
            top: "50%",
            transform: `translateY(-50%) rotate(${isOpen ? "180deg" : "0deg"})`,
            transition: "transform 0.2s ease",
            cursor: disabled ? "not-allowed" : "pointer",
            fontSize: "10px",
            color: "#888",
            pointerEvents: "none", // click passes through to input
            userSelect: "none"
          }}
        >
          ▼
        </span>
      </div>

      {isOpen && (
        <div 
          className="searchable-select-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 9999, // keep it overlayed above modals/inputs
            background: "#fff",
            border: `1.5px solid ${accentColor}`,
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            maxHeight: "220px",
            overflowY: "auto",
            marginTop: "4px"
          }}
        >
          {filteredOptions.length === 0 ? (
            <div style={{ padding: "12px", color: "#888", fontSize: "13px", textAlign: "center" }}>
              No matches found
            </div>
          ) : (
            filteredOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <div
                  key={option.value}
                  className={`searchable-select-option ${isSelected ? "selected" : ""}`}
                  onClick={() => handleSelect(option)}
                  style={{
                    padding: "10px 12px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f5f5f5",
                    fontSize: "13px",
                    textAlign: "left",
                    background: isSelected ? getRgba(accentColor, 0.1) : "#fff",
                    color: isSelected ? accentColor : "#1c1917",
                    fontWeight: isSelected ? "bold" : "normal"
                  }}
                >
                  {option.label}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
