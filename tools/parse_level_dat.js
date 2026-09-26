// Minimal Bedrock level.dat (gzip + VarInt NBT) dumper — extract world dynamic properties.
const fs = require("fs");
const zlib = require("zlib");

const path = process.argv[2];
const data = fs.readFileSync(path);
const buf = data[0] === 0x1f ? zlib.gunzipSync(data) : data;

let pos = 0;
function readVarInt() {
  let result = 0;
  let shift = 0;
  while (true) {
    const b = buf[pos++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return result;
}

function parsePayload(type) {
  switch (type) {
    case 1: { // byte
      const v = buf.readInt8(pos); pos += 1; return v;
    }
    case 2: { // short
      const v = buf.readInt16LE(pos); pos += 2; return v;
    }
    case 3: { // int
      const v = buf.readInt32LE(pos); pos += 4; return v;
    }
    case 4: { // long
      const v = buf.readBigInt64LE(pos); pos += 8; return v.toString();
    }
    case 5: { // float
      const v = buf.readFloatLE(pos); pos += 4; return v;
    }
    case 6: { // double
      const v = buf.readDoubleLE(pos); pos += 8; return v;
    }
    case 7: { // byte array
      const n = readVarInt(); const v = buf.subarray(pos, pos + n); pos += n; return `byteArray[${n}]`;
    }
    case 8: { // string
      const n = readVarInt(); const v = buf.subarray(pos, pos + n).toString("utf8"); pos += n; return v;
    }
    case 9: { // list
      const elemType = buf[pos++]; const n = readVarInt();
      const items = [];
      for (let i = 0; i < n; i++) items.push(parsePayload(elemType));
      return `list[${elemType}](${n})`;
    }
    case 10: { // compound
      const obj = {};
      while (true) {
        const t = buf[pos++];
        if (t === 0) break;
        const nameLen = readVarInt();
        const name = buf.subarray(pos, pos + nameLen).toString("utf8"); pos += nameLen;
        obj[name] = parsePayload(t);
      }
      return obj;
    }
    case 11: { // int array
      const n = readVarInt(); pos += 4 * n; return `intArray[${n}]`;
    }
    case 12: { // long array
      const n = readVarInt(); pos += 8 * n; return `longArray[${n}]`;
    }
    default:
      throw new Error(`unknown type ${type} at ${pos}`);
  }
}

const root = parsePayload(10);

function walk(obj, keyPrefix, out) {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" || typeof v === "number") {
        out.push(`${keyPrefix}${k} = ${typeof v === "string" ? JSON.stringify(v) : v}`);
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        walk(v, keyPrefix + k + ".", out);
      }
    }
  }
}

const out = [];
walk(root, "", out);
console.log("ROOT_KEYS: " + Object.keys(root).join(", "));
console.log(out.join("\n"));
