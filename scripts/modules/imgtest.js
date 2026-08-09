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

// 已确认：pack 参数需传资源包 manifest 的 header.uuid
const PACK_UUID = "514c208a-df2f-4868-9c82-cfd4f9bf7d85";

const SRC_A = "textures/ui/test/img_a.png";
const SRC_B = "textures/ui/test/img_b.png";

export function showImageTestForm(player) {
  const dynamicSrc = new ObservableString(SRC_A);
  const dynamicVisible = new ObservableBoolean(true);
  const dynamicWidth = new ObservableNumber(0.5);

  const form = new CustomForm(player, "DDUI image 测试")
    .label("§7pack 参数已确认：资源包 header UUID")
    .spacer()
    .image(SRC_A, PACK_UUID, { width: 0.8 })
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
