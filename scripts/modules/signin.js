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
    version: "Release 4.7.0",
    items: [
      "§a▸ 抽奖系统",
      "  §7主菜单新增抽奖入口，单抽10w/十连100w",
      "  §7刷怪蛋奖池（86种）+ 下界奖池（19种）",
      "  §7传说0.1%、史诗1%，硬保底10抽史诗+/100抽传说",
      "  §7各奖池保底进度独立，可查看奖池详情",
      "§a▸ 新增18个梗成就",
      "  §7成就奖励按物品稀有度发放",
      "§a▸ 调整与修复",
      "  §7熔岩挖矿进度条满格=10%出矿概率",
      "  §7成就检测提速至3秒",
      "  §7修复市场重启后商品消失问题",
    ],
  },
];

// --- 临时调试：定位公告弹窗问题（定位完成后删除） ---
const DEBUG_SIGNIN = true;

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
  if (DEBUG_SIGNIN) {
    console.warn(
      `[SigninDebug] showSigninForm entered player=${player.name} id=${player.id}`
    );
  }
  let signed = false;
  let closed = false;
  let showing = false;
  let warned = false;
  let attemptCount = 0;

  function attempt() {
    attemptCount++;
    if (
      DEBUG_SIGNIN &&
      (attemptCount <= 30 || attemptCount % 100 === 0)
    ) {
      console.warn(
        `[SigninDebug] attempt #${attemptCount} closed=${closed} signed=${signed} showing=${showing}`
      );
    }
    if (closed || signed || showing) return;
    try {
      if (!player.isValid) {
        if (DEBUG_SIGNIN) {
          console.warn(`[SigninDebug] attempt #${attemptCount} player invalid, stop`);
        }
        closed = true;
        return;
      }
    } catch (e) {
      if (DEBUG_SIGNIN) {
        console.warn(
          `[SigninDebug] attempt #${attemptCount} isValid check threw: ${e?.name} ${e?.message}`
        );
      }
      closed = true;
      return;
    }

    showing = true;
    if (DEBUG_SIGNIN) {
      console.warn(`[SigninDebug] attempt #${attemptCount} showing=true`);
    }

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
      if (DEBUG_SIGNIN) {
        console.warn(
          `[SigninDebug] attempt #${attemptCount} building form alreadySigned=${alreadySigned} streak=${streak} reward=${reward}`
        );
      }
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
        if (DEBUG_SIGNIN) {
          console.warn(
            `[SigninDebug] attempt #${attemptCount} button clicked signed=${signed}`
          );
        }
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
        .then((response) => {
          showing = false;
          if (DEBUG_SIGNIN) {
            console.warn(
              `[SigninDebug] attempt #${attemptCount} show resolved canceled=${response?.canceled} reason=${response?.cancelationReason}`
            );
          }
          if (
            response?.canceled &&
            response.cancelationReason === "UserBusy"
          ) {
            if (!signed && !closed) {
              system.runTimeout(attempt, 1);
            }
          } else {
            if (DEBUG_SIGNIN) {
              console.warn(
                `[SigninDebug] attempt #${attemptCount} player closed, stop`
              );
            }
            closed = true;
          }
        })
        .catch((e) => {
          showing = false;
          if (DEBUG_SIGNIN) {
            console.warn(
              `[SigninDebug] attempt #${attemptCount} show rejected: ${e?.name} ${e?.message} ${e?.stack}`
            );
          }
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
      if (DEBUG_SIGNIN) {
        console.warn(
          `[SigninDebug] attempt #${attemptCount} build/show threw: ${e?.name} ${e?.message} ${e?.stack}`
        );
      }
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
