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
