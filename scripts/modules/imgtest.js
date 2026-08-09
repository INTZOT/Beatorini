// ============================================================
// 临时：DDUI image 测试（验证 pack 参数取值）
// 测试通过后此模块可整体删除
// ============================================================
import {
  CustomForm,
  ObservableBoolean,
  ObservableNumber,
  ObservableString,
} from "@minecraft/server-ui";

// 与 BeatoriniRP/manifest.json 保持一致
const PACK_UUID = "514c208a-df2f-4868-9c82-cfd4f9bf7d85";
const PACK_NAME = "Beatorini 资源包";
const PACK_FOLDER = "BeatoriniRP";

const SRC_A = "textures/ui/test/img_a.png";
const SRC_B = "textures/ui/test/img_b.png";

export function showImageTestForm(player) {
  const dynamicSrc = new ObservableString(SRC_A);
  const dynamicVisible = new ObservableBoolean(true);
  const dynamicWidth = new ObservableNumber(0.5);

  const form = new CustomForm(player, "DDUI image 测试")
    .label("§e§l候选 pack 值（同一张图，哪张能显示就是有效值）")
    .spacer()
    .label("§71) UUID")
    .image(SRC_A, PACK_UUID, { width: 0.8 })
    .spacer()
    .label("§72) 包名: Beatorini 资源包")
    .image(SRC_A, PACK_NAME, { width: 0.8 })
    .spacer()
    .label("§73) 文件夹名: BeatoriniRP")
    .image(SRC_A, PACK_FOLDER, { width: 0.8 })
    .spacer()
    .divider()
    .label("§e§l动态测试（src/width/visible/tooltip/onClick）")
    .spacer()
    .image(dynamicSrc, PACK_UUID, {
      width: dynamicWidth,
      visible: dynamicVisible,
      tooltip: "点击有惊喜",
      onClick: () => player.sendMessage("§a点击了动态图片"),
    })
    .spacer()
    .button("切换到 img_b", () => dynamicSrc.setData(SRC_B))
    .button("切回 img_a", () => dynamicSrc.setData(SRC_A))
    .button("宽度 0.3", () => dynamicWidth.setData(0.3))
    .button("宽度 0.8", () => dynamicWidth.setData(0.8))
    .button("隐藏/显示", () => dynamicVisible.setData(!dynamicVisible.getData()))
    .spacer()
    .button("关闭", () => form.close());

  form.show().catch((e) => console.warn("[ImgTest] form failed:", e));
}
