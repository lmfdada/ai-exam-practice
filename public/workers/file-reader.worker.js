// Web Worker: 在后台线程中读取文件，不阻塞主线程
self.onmessage = async function (e) {
  var file = e.data;
  if (!file) return;

  try {
    if (file.name && file.name.endsWith(".csv")) {
      var text = await readFileAsText(file);
      var preview = parseCSVPreview(text, 10);
      self.postMessage({ success: true, type: "csv", rows: preview.rows, headers: preview.headers });
    } else {
      var buffer = await readFileAsBuffer(file);
      self.postMessage({
        success: true,
        type: "binary",
        fileName: file.name,
        fileSize: file.size,
        bufferLength: buffer.byteLength,
      });
    }
  } catch (err) {
    self.postMessage({ success: false, error: err.message || String(err) });
  }
};

function readFileAsText(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error("文件读取失败")); };
    reader.readAsText(file);
  });
}

function readFileAsBuffer(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error("文件读取失败")); };
    reader.readAsArrayBuffer(file);
  });
}

function parseCSVPreview(text, maxRows) {
  var lines = text.split("\n").filter(function (l) { return l.trim(); });
  var headers = lines[0] ? lines[0].split(",").map(function (h) { return h.trim(); }) : [];
  var rows = lines.slice(1, maxRows + 1).map(function (line) {
    return line.split(",").map(function (c) { return c.trim(); });
  });
  return { headers: headers, rows: rows };
}
