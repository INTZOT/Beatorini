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
    version: "Release 4.9.0",
    items: [
      "§a▸ 称号系统上线",
      "  §7主菜单新增「称号」入口，自由佩戴已解锁称号",
      "  §7初始称号「萌新」人人拥有",
      "  §7更多称号按成就/统计/天赋/市场/抽奖/签到等条件解锁",
    ],
  },
  {
    version: "Release 4.8.0",
    items: [
      "§a▸ 市场优化",
      "  §7上架超48小时未售出自动下架",
      "  §7在线直接返还，离线登录后自动取回",
      "§e▸ 修复",
      "  §7适配新版DDUI关闭返回格式，公告关闭/提交后不再反复重弹",
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
  let signed = false;
  let closed = false;
  let showing = false;
  let warned = false;

  function attempt() {
    if (closed || signed || showing) return;
    try {
      if (!player.isValid) {
        closed = true;
        return;
      }
    } catch (e) {
      closed = true;
      return;
    }

    showing = true;

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

    try {
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
        player.dimension.spawnEntity(
          "minecraft:fireworks_rocket",
          player.location
        );
        form.close();
      });

      // 进服后每 tick 检查一次：
      // - UserBusy（玩家正忙/聊天框打开/其他界面占用）：表单未真正展示，下一 tick 继续尝试
      // - UserClosed（玩家主动关闭）或点击按钮：停止检查
      form
        .show()
        .then((closeResult) => {
          showing = false;
          // 新版 CustomForm.show() 返回 DataDrivenScreenClosedReason 字符串
          // （ClientClosed/ServerClosed/UserBusy）；旧版返回响应对象，兼容处理
          const reason =
            typeof closeResult === "string"
              ? closeResult
              : closeResult?.cancelationReason;
          const canceled =
            closeResult && typeof closeResult === "object"
              ? closeResult.canceled
              : undefined;

          if (
            reason === "ClientClosed" ||
            reason === "ServerClosed" ||
            reason === "UserClosed" ||
            canceled === false
          ) {
            closed = true;
          } else if (reason === "UserBusy") {
            // 玩家正忙/聊天框打开/其他界面占用：表单未真正展示，继续下一 tick
            if (!signed && !closed) {
              system.runTimeout(attempt, 1);
            }
          } else {
            // canceled 为 undefined/true 但无明确原因：
            // 疑似进服瞬间客户端未就绪、表单未真正展示，视为未展示继续重试
            if (!signed && !closed) {
              system.runTimeout(attempt, 1);
            }
          }
        })
        .catch((e) => {
          showing = false;
          if (!warned) {
            warned = true;
            console.warn("Signin form failed:", e);
          }
          if (!signed && !closed) {
            system.runTimeout(attempt, 1);
          }
        });
    } catch (e) {
      showing = false;
      if (!warned) {
        warned = true;
        console.warn("Signin form failed:", e);
      }
      if (!signed && !closed) {
        system.runTimeout(attempt, 1);
      }
    }
  }

  attempt();
}
