import { system, world, ItemStack } from "@minecraft/server";
import { CustomForm, ObservableString } from "@minecraft/server-ui";
import { PLAYER_SIGNIN_DATE, PLAYER_SIGNIN_STREAK } from "./config.js";

// UTC+8 时区偏移
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

function getTodayStr() {
  const d = new Date(Date.now() + UTC8_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function getYesterdayStr() {
  const d = new Date(Date.now() + UTC8_OFFSET_MS - 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function getSigninInfo(playerId) {
  const rawDate = world.getDynamicProperty(PLAYER_SIGNIN_DATE + playerId);
  const rawStreak = world.getDynamicProperty(PLAYER_SIGNIN_STREAK + playerId);
  return {
    lastDate: typeof rawDate === "string" ? rawDate : "",
    streak: typeof rawStreak === "number" ? rawStreak : 0,
  };
}
function saveSigninInfo(playerId, date, streak) {
  world.setDynamicProperty(PLAYER_SIGNIN_DATE + playerId, date);
  world.setDynamicProperty(PLAYER_SIGNIN_STREAK + playerId, streak);
}

export function clearSignin(playerId) {
  world.setDynamicProperty(PLAYER_SIGNIN_DATE + playerId, undefined);
  world.setDynamicProperty(PLAYER_SIGNIN_STREAK + playerId, undefined);
}

export function showSigninForm(player) {
  const today = getTodayStr();
  const info = getSigninInfo(player.id);
  const alreadySigned = info.lastDate === today;

  let { streak } = info;
  if (!alreadySigned && info.lastDate !== getYesterdayStr()) {
    streak = 0;
  }

  const reward = Math.min(50 + streak * 10, 100);

  const form = new CustomForm(player, "灯浮市Beatorini");
  const statusText = new ObservableString(
    alreadySigned
      ? `§a你已连续签到 ${streak} 天！`
      : `§e今日签到奖励: ${reward} 金币`,
    { clientWritable: true }
  );
  form.label(statusText).spacer();

  // --- 服务器公告 ---
  form.label("§6§l【服务器更新日志】");
  form.spacer();
  form.label("§eRelease 3.0.0");
  form.spacer();
  form.label("§a▸ 熟练度系统");
  form.label("  §7挖矿/战斗/防御/灵巧 四大熟练度，LV100 满级");
  form.label("  §7达到指定等级解锁永久药水效果");
  form.spacer();
  form.label("§a▸ 全新菜单界面");
  form.label("  §7岛屿/交易二级菜单，布局更清爽");
  form.spacer();
  form.label("§a▸ 称号系统");
  form.label("  §7管理员可通过 #title 为玩家设置称号");
  form.label("  §7称号将显示在聊天前缀");
  form.spacer();
  form.label("§a▸ 市场交易");
  form.label("  §7玩家间自由上架/购买物品");
  form.spacer();
  form.label("§a▸ 空岛坐标调整");
  form.label("  §7基岩移至 y=64，与世界高度对齐");
  form.spacer();

  let signed = false;
  form.button(alreadySigned ? "关闭" : "签到", () => {
    if (signed) return;
    signed = true;
    if (alreadySigned) {
      form.close();
      return;
    }
    const newStreak = streak + 1;
    saveSigninInfo(player.id, today, newStreak);
    player.runCommand(`scoreboard players add @s money ${reward}`);
    player.sendMessage(
      `§a签到成功！获得 ${reward} 金币，连续签到 ${newStreak} 天`
    );
    player.playSound("random.orb");
    statusText.setData(`§a你已连续签到 ${newStreak} 天！`);
    player.dimension.spawnEntity("minecraft:fireworks_rocket", player.location);
    form.close();
  });

  form.show().catch((e) => {
    console.warn("Signin form failed:", e);
    if (!signed) {
      system.runTimeout(() => showSigninForm(player), 20);
    }
  });
}
