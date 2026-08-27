import * as XLSX from 'xlsx';

export const downloadCSV = (filename, rows) => {
  if (!rows || !rows.length) return;
  const processRow = function (row) {
    let finalVal = '';
    for (let j = 0; j < row.length; j++) {
      let innerValue = row[j] === null || row[j] === undefined ? '' : row[j].toString();
      if (row[j] instanceof Date) {
        innerValue = row[j].toLocaleString();
      }
      let result = innerValue.replace(/"/g, '""');
      if (result.search(/("|,|\n)/g) >= 0)
        result = '"' + result + '"';
      if (j > 0)
        finalVal += ',';
      finalVal += result;
    }
    return finalVal + '\n';
  };

  let csvFile = '';
  for (let i = 0; i < rows.length; i++) {
    csvFile += processRow(rows[i]);
  }

  const blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export const exportToExcel = (filename, rows, sheetName = "Sheet1") => {
  if (!rows || !rows.length) return;

  // Convert array of arrays (rows) to a worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  // Generate a new workbook and append the worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Write file to trigger download
  XLSX.writeFile(workbook, filename);
};

export const matchesProductSearch = (product, searchQuery) => {
  if (!searchQuery || !searchQuery.trim()) return true;
  if (!product) return false;

  const query = String(searchQuery).trim().toLowerCase();

  const prodName = String(product.name || "").toLowerCase();
  const prodCode = String(product.productCode || "").toLowerCase();
  const prodCat = String(product.category || "").toLowerCase();
  const prodSupplier = String(product.supplier || "").toLowerCase();
  const prodShelf = String(product.shelfLocation || "").toLowerCase();
  const prodHsn = String(product.hsnCode || "").toLowerCase();

  const fullText = `${prodName} ${prodCode} ${prodCat} ${prodSupplier} ${prodShelf} ${prodHsn}`;

  // Direct substring match
  if (fullText.includes(query)) return true;

  // Normalized (space/punctuation free) match so "32mm", "32 mm", "32-mm", "32 MM" match each other
  const fullTextNoSpaces = fullText.replace(/[^a-z0-9]/g, "");
  const queryNoSpaces = query.replace(/[^a-z0-9]/g, "");

  if (queryNoSpaces && fullTextNoSpaces.includes(queryNoSpaces)) return true;

  // Multi-token match: split query by whitespace and ensure every token matches
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const allTokensMatch = tokens.every(token => {
      const tokenNoSpace = token.replace(/[^a-z0-9]/g, "");
      if (!tokenNoSpace) return true;
      return fullText.includes(token) || fullTextNoSpaces.includes(tokenNoSpace);
    });
    if (allTokensMatch) return true;
  }

  return false;
};

