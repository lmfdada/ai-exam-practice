const ExcelJS = require("exceljs");

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]);
  const ws = wb.worksheets[0];
  const maxRows = parseInt(process.argv[3] || "5");
  let i = 0;
  ws.eachRow((excelRow) => {
    if (i >= maxRows) return;
    const cells = [];
    excelRow.eachCell((c) => { cells.push(c.value?.toString ? c.value.toString() : String(c.value || "")); });
    console.log(i, JSON.stringify(cells));
    i++;
  });
}
main().catch(console.error);
