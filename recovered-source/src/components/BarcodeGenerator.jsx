import React from "react";

// Standard Code-39 character mapping (9 elements: 5 bars, 4 spaces)
// '1' = wide, '0' = narrow
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

export default function BarcodeGenerator({ value = "", height = 45, showText = false }) {
  const svgRef = React.useRef(null);
  
  // Normalize and sandwich in start/stop character '*'
  const cleanVal = String(value).toUpperCase().replace(/[^0-9A-Z\-.$/+% ]/g, "");
  const fullString = `*${cleanVal}*`;

  // Standard dimensions
  const narrowWidth = 1.2;
  const wideWidth = 3.0;
  const charGap = 1.5; // space between characters

  let currentX = 10; // Left margin padding
  const rects = [];

  for (let i = 0; i < fullString.length; i++) {
    const char = fullString[i];
    const pattern = ENCODING[char];
    if (!pattern) continue;

    for (let bitIdx = 0; bitIdx < 9; bitIdx++) {
      const bit = pattern[bitIdx];
      const isBar = bitIdx % 2 === 0; // odd indexes are spaces, even are bars (0-indexed)
      const elementWidth = bit === "1" ? wideWidth : narrowWidth;

      if (isBar) {
        rects.push(
          <rect
            key={`${i}-${bitIdx}`}
            x={currentX}
            y={2}
            width={elementWidth}
            height={height}
            fill="#000000"
          />
        );
      }

      currentX += elementWidth;
    }

    // Inter-character gap
    currentX += charGap;
  }

  // Total width of the barcode
  const totalWidth = currentX + 10;
  const svgHeight = height + (showText ? 24 : 6);

  const downloadPNG = (e) => {
    e.stopPropagation();
    const svgElement = svgRef.current;
    if (!svgElement) return;

    // Create a high resolution clone of the SVG element for crisp rasterization
    const svgClone = svgElement.cloneNode(true);
    const scale = 4;
    svgClone.setAttribute("width", totalWidth * scale);
    svgClone.setAttribute("height", svgHeight * scale);

    const svgString = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);
    
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = totalWidth * scale;
      canvas.height = svgHeight * scale;
      const context = canvas.getContext("2d");
      
      // Draw solid white background to prevent transparent background scan failures
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      
      const png = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.href = png;
      downloadLink.download = `Barcode_${cleanVal}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(blobURL);
    };
    image.src = blobURL;
  };

  return (
    <div className="barcode-container-card" style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", background: "#fff", padding: "8px", borderRadius: "6px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.06)", position: "relative" }}>
      <svg
        ref={svgRef}
        width="100%"
        height={svgHeight}
        viewBox={`0 0 ${totalWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ shapeRendering: "crispEdges" }}
      >
        {rects}
        {showText && (
          <text
            x={totalWidth / 2}
            y={height + 16}
            textAnchor="middle"
            style={{
              fontFamily: "monospace",
              fontSize: "11px",
              fontWeight: "900",
              fill: "#000000",
              letterSpacing: "4px"
            }}
          >
            {cleanVal}
          </text>
        )}
      </svg>
      
      <button
        onClick={downloadPNG}
        style={{
          marginTop: "6px",
          background: "#1c1917",
          border: "none",
          borderRadius: "4px",
          color: "#ffffff",
          padding: "4px 10px",
          fontSize: "10px",
          fontWeight: "700",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          transition: "background 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)"
        }}
        title="Download high-resolution barcode image file (PNG)"
        onMouseOver={e => e.currentTarget.style.background = "#2563eb"}
        onMouseOut={e => e.currentTarget.style.background = "#1c1917"}
      >
        💾 Download PNG
      </button>
    </div>
  );
}
