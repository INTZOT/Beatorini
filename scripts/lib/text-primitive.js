// ============================================================
// TextPrimitive 通用小工具
// ============================================================

/**
 * 设置多行文本的行距（@minecraft/server 2.11.0-beta 新增的 TextPrimitive.lineGapHeight）。
 * 旧版本没有该属性时静默跳过，不影响渲染。
 * @param {import("@minecraft/server").TextPrimitive} shape
 * @param {number} gap 行距，0 表示默认（行距为 0）
 */
export function applyLineGap(shape, gap) {
  const value = Number(gap);
  if (!Number.isFinite(value) || value < 0) return;
  try {
    shape.lineGapHeight = value;
  } catch (e) {}
}
