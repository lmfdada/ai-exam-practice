const ExcelJS = require("exceljs");

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]);
  console.log("Sheet names:", JSON.stringify(wb.worksheets.map((ws) => ws.name)));
  wb.worksheets.forEach((ws) => {
    const rows = [];
    ws.eachRow((excelRow) => {
      const cells = [];
      excelRow.eachCell((c) => { cells.push(c.value?.toString ? c.value.toString() : String(c.value || "")); });
      rows.push(cells);
    });
    console.log("=== Sheet:", ws.name, "=== rows:", rows.length);
    rows.forEach((row, i) => console.log(i, JSON.stringify(row)));
  });
}

main().catch(console.error);
