import { system, world, ItemStack } from "@minecraft/server";
import { CustomForm, ObservableString } from "@minecraft/server-ui";
import {
  PLAYER_SIGNIN_DATE,
  PLAYER_SIGNIN_STREAK,
  SIGNIN_BASE_REWARD,
  SIGNIN_STREAK_REWARD,
  SIGNIN_MAX_REWARD,
} from "./config.js";

// UTC+8 时区偏移
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

// --- 进入表单的服务器公告 ---
const SERVER_ANNOUNCEMENTS = [
  "§e欢迎来到灯浮市Beatorini 空岛服务器！"
];

// --- 进入表单的服务器更新日志（最新在上） ---
const SERVER_CHANGELOGS = [
  {
    version: "Release 4.1.0",
    items: [
      "§a▸ 大厅保护",
      "  §7大厅内禁止破坏/放置/攻击/使用道具",
      "§a▸ 熔岩挖矿优化",
      "  §7新增出矿概率ActionBar与进度条",
      "  §7每次挖掘概率+0.05%，2000次必出",
      "§a▸ 岛屿规则调整",
      "  §7放弃岛屿每日仅限一次，5秒后自动重置",
      "  §7成就进度跨岛屿保留，防止刷奖励",
      "§a▸ 体验优化",
      "  §7返回大厅自动给予菜单时钟",
    ],
  },
];

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

  const reward = Math.min(
    SIGNIN_BASE_REWARD + streak * SIGNIN_STREAK_REWARD,
    SIGNIN_MAX_REWARD
  );

  const form = new CustomForm(player, "灯浮市Beatorini");
  const statusText = new ObservableString(
    alreadySigned
      ? `§a你已连续签到 ${streak} 天！`
      : `§e今日签到奖励: ${reward} 金币`,
    { clientWritable: true }
  );
  form.label(statusText).spacer();

  // --- 服务器公告 ---
  form.label("§6§l【服务器公告】");
  form.spacer();
  for (const line of SERVER_ANNOUNCEMENTS) {
    form.label(line);
    form.spacer();
  }

  // --- 服务器更新日志 ---
  form.label("§6§l【服务器更新日志】");
  form.spacer();
  for (const entry of SERVER_CHANGELOGS) {
    form.label(`§e${entry.version}`);
    form.spacer();
    for (const line of entry.items) {
      form.label(line);
      form.spacer();
    }
  }

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
