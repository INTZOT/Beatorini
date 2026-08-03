import { system, world } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";
import { getPlayerMoney } from "./money.js";
import {
  TALENT_PREFIX,
  TALENT_MAX_LEVEL,
  TALENT_PERIOD_TICKS,
  TALENT_COST_BASE,
  TALENT_COST_GROWTH,
} from "./config.js";

// ============================================================
// 天赋定义
// ============================================================

const TALENTS = {
  speed: {
    id: "speed",
    name: "速度",
    icon: "⚡",
    effectType: "speed",
    effectName: "速度",
    kind: "coverage",
    maxTier: 2,
  },
  haste: {
    id: "haste",
    name: "急迫",
    icon: "⛏",
    effectType: "haste",
    effectName: "急迫",
    kind: "coverage",
    maxTier: 3,
  },
  strength: {
    id: "strength",
    name: "力量",
    icon: "⚔",
    effectType: "strength",
    effectName: "力量",
    kind: "coverage",
    maxTier: 3,
  },
  jump: {
    id: "jump",
    name: "跳跃",
    icon: "⇧",
    effectType: "jump_boost",
    effectName: "跳跃提升",
    kind: "coverage",
    maxTier: 2,
  },
  resistance: {
    id: "resistance",
    name: "抗性",
    icon: "🛡",
    effectType: "resistance",
    effectName: "抗性提升",
    kind: "coverage",
    maxTier: 3,
  },
  health: {
    id: "health",
    name: "生命",
    icon: "❤",
    effectType: "health_boost",
    effectName: "生命提升",
    kind: "permanent",
  },
};

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// 进度条 10 段矿物色（每 12 级进位换色）
const BAR_COLORS = [
  "§7", // LV1-12  灰
  "§i", // LV13-24 铁锭
  "§n", // LV25-36 铜锭
  "§p", // LV37-48 金锭
  "§g", // LV49-60 Minecoin金
  "§q", // LV61-72 绿宝石
  "§s", // LV73-84 钻石
  "§t", // LV85-96 青金石
  "§u", // LV97-108 紫水晶
  "§v", // LV109-120 树脂
];

// ============================================================
// 数据读写
// ============================================================

export function getTalentLevel(playerId, talentId) {
  return world.getDynamicProperty(TALENT_PREFIX + talentId + "_" + playerId) ?? 0;
}

function setTalentLevel(playerId, talentId, level) {
  world.setDynamicProperty(TALENT_PREFIX + talentId + "_" + playerId, level);
}

/** 从当前等级升到下一级的费用 */
export function getTalentUpgradeCost(currentLevel) {
  return Math.floor(
    TALENT_COST_BASE * Math.pow(TALENT_COST_GROWTH, currentLevel)
  );
}

// ============================================================
// 效果计算
// ============================================================

/**
 * 计算天赋当前效果段。
 * coverage 天赋返回高档在前的段数组（如 III 3s + II 57s），每段 60 秒周期内顺序生效；
 * permanent 天赋返回单段永久效果。
 */
function getTalentEffectSegments(talent, level) {
  if (level <= 0) return [];

  if (talent.kind === "permanent") {
    const amp = Math.floor(level / 12) - 1;
    if (amp < 0) return [];
    return [{ type: talent.effectType, amplifier: amp, seconds: Infinity }];
  }

  if (talent.maxTier === 2) {
    // 速度/跳跃：LV1~60 为 I 档 1s→60s，LV61 起 II 档从 1s 替代 I 档
    const ii = Math.max(0, level - 60);
    const i = level <= 60 ? level : 60 - ii;
    const segs = [];
    if (ii > 0) segs.push({ type: talent.effectType, amplifier: 1, seconds: ii });
    if (i > 0) segs.push({ type: talent.effectType, amplifier: 0, seconds: i });
    return segs;
  }

  // 力量/急迫/抗性：每 2 级 +3s，LV40 满 I 档，LV80 满 II 档，LV120 满 III 档
  const iCap = Math.min(60, 3 * Math.floor(level / 2));
  const iiCap = Math.min(60, 3 * Math.floor(Math.max(0, level - 40) / 2));
  const iiiCap = Math.min(60, 3 * Math.floor(Math.max(0, level - 80) / 2));
  let i, ii, iii;
  if (level <= 40) {
    i = iCap;
    ii = 0;
    iii = 0;
  } else if (level <= 80) {
    ii = iiCap;
    i = 60 - ii;
    iii = 0;
  } else {
    iii = iiiCap;
    ii = 60 - iii;
    i = 0;
  }
  const segs = [];
  if (iii > 0) segs.push({ type: talent.effectType, amplifier: 2, seconds: iii });
  if (ii > 0) segs.push({ type: talent.effectType, amplifier: 1, seconds: ii });
  if (i > 0) segs.push({ type: talent.effectType, amplifier: 0, seconds: i });
  return segs;
}

/** 当前效果文本（如「速度I 11s」「跳跃提升II 6s + 跳跃提升I 54s」「生命提升X 永久」） */
function getEffectText(talent, level) {
  const segs = getTalentEffectSegments(talent, level);
  if (segs.length === 0) return "未解锁";
  return segs
    .map((s) => {
      const tier = ROMAN[Math.min(9, s.amplifier)] ?? "?";
      if (s.seconds === Infinity) return `${talent.effectName}${tier} 永久`;
      return `${talent.effectName}${tier} ${s.seconds}s`;
    })
    .join(" + ");
}

/** 12 格进度条：实心数 = 等级对 12 取余（余 0 全实），段位颜色随 12 级进位切换，满级闪烁 */
function renderBar(level) {
  if (level >= TALENT_MAX_LEVEL) {
    return "§k" + "●".repeat(12);
  }
  const segment = Math.min(10, Math.max(1, Math.ceil(level / 12)));
  const filled = level % 12 === 0 ? 12 : level % 12;
  const color = BAR_COLORS[segment - 1];
  return color + "●".repeat(filled) + "○".repeat(12 - filled);
}

// ============================================================
// 天赋菜单
// ============================================================

function showTalentMenu(player, backFn) {
  const pid = player.id;
  let f = new CustomForm(player, "天赋");
  f = f.label(`§6当前金币: ${getPlayerMoney(player)}`);
  f = f.spacer();

  for (const talent of Object.values(TALENTS)) {
    const level = getTalentLevel(pid, talent.id);
    const effectText = getEffectText(talent, level);
    f = f.label(`${talent.icon} §f${talent.name} §7LV${level}`);
    f = f.spacer();
    f = f.label(`§f当前效果: §e${effectText}`);
    f = f.spacer();
    f = f.label(renderBar(level));
    f = f.spacer();
    f = f.button(`查看/升级 ${talent.name}`, () => {
      f.close();
      system.runTimeout(() => showTalentDetail(player, talent.id, backFn), 2);
    });
    f = f.spacer();
  }

  f = f.label("§8周期类天赋每 60 秒触发，高等级效果优先覆盖");
  f = f.spacer();
  f = f.button("返回", () => {
    f.close();
    system.runTimeout(() => backFn(player), 2);
  });
  f.show().catch((e) => console.warn("Talent menu failed:", e));
}

function showTalentDetail(player, talentId, backFn) {
  const talent = TALENTS[talentId];
  if (!talent) {
    showTalentMenu(player, backFn);
    return;
  }
  const pid = player.id;
  const level = getTalentLevel(pid, talent.id);
  const cost = getTalentUpgradeCost(level);

  const form = new CustomForm(player, `${talent.icon}${talent.name}`);
  form.label(`§6当前金币: ${getPlayerMoney(player)}`);
  form.spacer();
  form.label(`§f等级: §eLV${level} §7/ ${TALENT_MAX_LEVEL}`);
  form.spacer();
  form.label(`§f当前效果: §e${getEffectText(talent, level)}`);
  form.spacer();
  form.label(renderBar(level));
  form.spacer();
  form.label(
    talent.kind === "permanent"
      ? "§8永久生效，每 12 级提升一档"
      : "§8每 60 秒触发，高等级效果优先覆盖"
  );
  form.spacer();

  if (level >= TALENT_MAX_LEVEL) {
    form.label("§6§l已满级");
    form.spacer();
  } else {
    form.button(`升级至 LV${level + 1}（${cost} 金币）`, () => {
      const money = getPlayerMoney(player);
      if (money < cost) {
        player.sendMessage(`§c金币不足！升级需要 ${cost} 金币，当前 ${money} 金币`);
        player.playSound("random.break");
        return;
      }
      player.runCommand(`scoreboard players remove @s money ${cost}`);
      const newLevel = getTalentLevel(pid, talent.id) + 1;
      setTalentLevel(pid, talent.id, newLevel);
      player.playSound("random.levelup");
      player.sendMessage(
        `§a✔ ${talent.name} 升级至 LV${newLevel}！当前效果: ${getEffectText(talent, newLevel)}`
      );
      form.close();
      system.runTimeout(() => showTalentDetail(player, talent.id, backFn), 2);
    });
    form.spacer();
  }

  form.button("返回", () => {
    form.close();
    system.runTimeout(() => showTalentMenu(player, backFn), 2);
  });
  form.show().catch((e) => console.warn("Talent detail failed:", e));
}

// ============================================================
// 效果刷新
// ============================================================

function applyTalentEffects(player, talent, level) {
  const segs = getTalentEffectSegments(talent, level);
  if (segs.length === 0) return;

  if (talent.kind === "permanent") {
    const seg = segs[0];
    player.addEffect(seg.type, 200, {
      amplifier: seg.amplifier,
      showParticles: false,
    });
    return;
  }

  const tickInPeriod = system.currentTick % TALENT_PERIOD_TICKS;
  let startTick = 0;
  for (const seg of segs) {
    const endTick = startTick + seg.seconds * 20;
    if (tickInPeriod >= startTick && tickInPeriod < endTick) {
      const remain = endTick - tickInPeriod;
      // 多给 15 tick 余量，避免调度抖动导致档位衔接出现真空；
      // 切换窗口后由下一次检查用新档位效果直接覆盖（同效果类型会替换）。
      player.addEffect(seg.type, remain + 15, {
        amplifier: seg.amplifier,
        showParticles: false,
      });
      return;
    }
    startTick = endTick;
  }
}

export function init() {
  // 每 0.5 秒检查一次覆盖窗口，配合 15 tick 余量保证档位无缝衔接
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      const pid = player.id;
      for (const talent of Object.values(TALENTS)) {
        const level = getTalentLevel(pid, talent.id);
        if (level <= 0) continue;
        try {
          applyTalentEffects(player, talent, level);
        } catch (e) {}
      }
    }
  }, 10);
}

export { showTalentMenu };
