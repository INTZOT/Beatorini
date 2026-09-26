// Parse LevelDB .log (WAL) files — assemble fragmented records, extract WriteBatch entries by key filter.
const fs = require("fs");

function parseLogFile(file, keyFilter) {
  const buf = fs.readFileSync(file);
  const out = [];
  const BLOCK = 32768;
  let current = null; // assembling type 2/3/4 chain
  function flush() {
    if (!current) return;
    processBatch(current, out, keyFilter);
    current = null;
  }
  for (let blockStart = 0; blockStart < buf.length; blockStart += BLOCK) {
    let pos = blockStart;
    const blockEnd = Math.min(blockStart + BLOCK, buf.length);
    while (pos + 7 <= blockEnd) {
      const len = buf.readUInt16LE(pos + 4);
      const type = buf[pos + 6];
      if (len === 0) { pos += 7; continue; }
      if (pos + 7 + len > blockEnd) break; // leftover padding
      const data = buf.subarray(pos + 7, pos + 7 + len);
      pos += 7 + len;
      if (type === 1) { flush(); processBatch(data, out, keyFilter); }
      else if (type === 2) { flush(); current = Buffer.from(data); }
      else if (type === 3) { if (current) current = Buffer.concat([current, data]); }
      else if (type === 4) { if (current) { current = Buffer.concat([current, data]); processBatch(current, out, keyFilter); current = null; } }
    }
  }
  flush();
  return out;
}

function processBatch(data, out, keyFilter) {
  if (data.length < 12) return;
  const count = data.readUInt32LE(8);
  let p = 12;
  for (let i = 0; i < count && p < data.length; i++) {
    let keyLen = 0, shift = 0, b;
    do { if (p >= data.length) return; b = data[p++]; keyLen |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    const key = data.subarray(p, p + keyLen).toString("utf8"); p += keyLen;
    let valLen = 0; shift = 0;
    do { if (p >= data.length) return; b = data[p++]; valLen |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    const val = data.subarray(p, p + valLen); p += valLen;
    if (!keyFilter || key.includes(keyFilter)) out.push({ key, val: val.toString("utf8"), raw: val });
  }
}

const files = process.argv.slice(2);
const filter = process.env.KEYFILTER || "market:listings";
for (const f of files) {
  const recs = parseLogFile(f, filter);
  recs.forEach((r, i) => {
    console.log(`## ${f} #${i} key=${r.key}`);
    console.log(r.val);
    console.log("----");
  });
}
