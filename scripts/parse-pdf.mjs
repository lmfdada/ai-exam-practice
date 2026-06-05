import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdfParse from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buf = fs.readFileSync(path.join(__dirname, "..", "samples", "黔寨寨贵州烙锅（鞍山店）常温.pdf"));
const data = await pdfParse(buf);
console.log(data.text.substring(0, 2000));
