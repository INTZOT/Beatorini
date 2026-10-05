// ============================================================
// 生成 pack_icon.png（128×128，像素风）
//
// 行为包在游戏内的图标：先在 32×32 网格上作画，再整数倍放大到 128×128，
// 保证边缘干净、像素风统一。不依赖任何图形库（zlib 内置即可编码 PNG）。
//
// 用法：node tools/gen-pack-icon.js
// 输出：pack_icon.png（仓库根目录，随行为包一起分发）
// ============================================================
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const BASE = 32; // 逻辑像素
const SCALE = 4; // 放大倍数 → 128×128
const SIZE = BASE * SCALE;

// --- 调色板 ---
const C = {
  skyTop: [0x4f, 0xa8, 0xe0],
  skyBottom: [0xbf, 0xe8, 0xfa],
  cloud: [0xff, 0xff, 0xff],
  cloudShade: [0xdf, 0xee, 0xf7],
  grass: [0x5f, 0xbf, 0x4a],
  grassDark: [0x3e, 0x8f, 0x33],
  dirt: [0x8b, 0x5a, 0x2b],
  dirtDark: [0x6b, 0x45, 0x20],
  stone: [0x8a, 0x8a, 0x8a],
  trunk: [0x6b, 0x45, 0x20],
  leaf: [0x37, 0x8f, 0x2c],
  leafLight: [0x4f, 0xb0, 0x3a],
  chestBody: [0xc8, 0x8b, 0x1e],
  chestLid: [0x9a, 0x6a, 0x14],
  chestLock: [0xf2, 0xe2, 0x9a],
  outline: [0x2b, 0x2b, 0x2b],
};

const pixels = Array.from({ length: BASE }, () => Array(BASE).fill(null));

function set(x, y, color) {
  if (x < 0 || y < 0 || x >= BASE || y >= BASE) return;
  pixels[y][x] = color;
}
function rect(x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, color);
}

// --- 天空渐变 ---
for (let y = 0; y < BASE; y++) {
  const t = y / (BASE - 1);
  const color = [0, 1, 2].map((i) =>
    Math.round(C.skyTop[i] + (C.skyBottom[i] - C.skyTop[i]) * t)
  );
  for (let x = 0; x < BASE; x++) set(x, y, color);
}

// --- 云 ---
const clouds = [
  [3, 5, 7, 2],
  [22, 9, 6, 2],
  [7, 13, 5, 1],
];
for (const [x, y, w, h] of clouds) {
  rect(x, y, w, h, C.cloud);
  rect(x, y + h, w, 1, C.cloudShade);
}

// --- 悬浮岛（草皮 → 泥土 → 收窄成倒三角）---
const islandTop = 18;
const islandRows = [
  [10, 13, C.grass], // [起始x, 宽度, 颜色]
  [9, 15, C.grass],
  [9, 15, C.dirt],
  [10, 13, C.dirt],
  [11, 11, C.dirt],
  [12, 9, C.dirtDark],
  [13, 7, C.dirtDark],
  [15, 4, C.stone],
  [16, 2, C.stone],
];
islandRows.forEach((row, i) => {
  rect(row[0], islandTop + i, row[1], 1, row[2]);
});
// 草皮高光/阴影点缀
for (const [x, y, color] of [
  [10, 18, C.grassDark],
  [14, 18, C.grassDark],
  [20, 18, C.grassDark],
  [12, 19, C.grassDark],
  [18, 19, C.grassDark],
]) set(x, y, color);
// 泥土纹理
for (const [x, y] of [[11, 21], [16, 21], [21, 21], [13, 22], [19, 22], [15, 23]]) {
  set(x, y, C.dirtDark);
}

// --- 小树 ---
rect(15, 14, 2, 4, C.trunk);
rect(13, 11, 6, 3, C.leaf);
rect(14, 10, 4, 1, C.leaf);
set(13, 11, C.leafLight);
set(18, 12, C.leafLight);
set(15, 11, C.leafLight);

// --- 宝箱（市场金库的意象）---
rect(19, 20, 5, 3, C.chestBody);
rect(19, 19, 5, 1, C.chestLid);
rect(21, 20, 1, 1, C.chestLock);
set(19, 22, C.chestLid);
set(23, 22, C.chestLid);

// --- 放大 + 描边（岛体与宝箱外缘描一圈深色，像素风更清晰）---
const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const color = pixels[Math.floor(y / SCALE)][Math.floor(x / SCALE)];
    const o = (y * SIZE + x) * 4;
    rgba[o] = color[0];
    rgba[o + 1] = color[1];
    rgba[o + 2] = color[2];
    rgba[o + 3] = 255;
  }
}

// --- PNG 编码 ---
function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter: none
  rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(__dirname, "..", "pack_icon.png");
fs.writeFileSync(out, png);
console.log(`✓ 已生成 ${out}（${SIZE}×${SIZE}，${(png.length / 1024).toFixed(1)} KB）`);
