import { system, world } from "@minecraft/server";
import { CustomForm, ObservableString, ObservableNumber } from "@minecraft/server-ui";
import { PROFICIENCY_PREFIX, PROFICIENCY_XP_PREFIX } from "./config.js";

// --- 熟练度定义 ---
export const PROFICIENCIES = {
  mining: {
    id: "mining",
    name: "挖矿",
    icon: "⛏",
    xpFn: (lvl) => lvl * 70 + 80, // LV1=150, LV100=7080
    effects: [
      { level: 35, type: "haste", amplifier: 0, label: "急迫 I" },
      { level: 70, type: "haste", amplifier: 1, label: "急迫 II" },
      { level: 100, type: "haste", amplifier: 2, label: "急迫 III" },
    ],
  },
  combat: {
    id: "combat",
    name: "战斗",
    icon: "⚔",
    xpFn: (lvl) => lvl * 14 + 15, // LV1=29, LV100=1415
    effects: [
      { level: 20, type: "health_boost", amplifier: 0, label: "生命提升 I" },
      { level: 40, type: "health_boost", amplifier: 1, label: "生命提升 II" },
      { level: 60, type: "health_boost", amplifier: 2, label: "生命提升 III" },
      { level: 80, type: "health_boost", amplifier: 3, label: "生命提升 IV" },
      { level: 100, type: "health_boost", amplifier: 4, label: "生命提升 V" },
      { level: 25, type: "strength", amplifier: 0, label: "力量 I" },
      { level: 50, type: "strength", amplifier: 1, label: "力量 II" },
      { level: 75, type: "strength", amplifier: 2, label: "力量 III" },
      { level: 100, type: "strength", amplifier: 3, label: "力量 IV" },
    ],
  },
  defense: {
    id: "defense",
    name: "防御",
    icon: "🛡",
    xpFn: (lvl) => lvl * 8 + 10, // LV1=18, LV100=810
    effects: [
      { level: 30, type: "resistance", amplifier: 0, label: "抗性提升 I" },
      { level: 60, type: "resistance", amplifier: 1, label: "抗性提升 II" },
      { level: 100, type: "resistance", amplifier: 2, label: "抗性提升 III" },
    ],
  },
  agility: {
    id: "agility",
    name: "灵巧",
    icon: "❑",
    xpFn: (lvl) => lvl * 50 + 60, // LV1=110, LV100=5060
    effects: [
      { level: 25, type: "speed", amplifier: 0, label: "速度 I" },
      { level: 50, type: "jump_boost", amplifier: 0, label: "跳跃提升 I" },
      { level: 75, type: "speed", amplifier: 1, label: "速度 II" },
      { level: 100, type: "jump_boost", amplifier: 1, label: "跳跃提升 II" },
    ],
  },
};

// --- 读写熟练度数据 ---
export function getProfLevel(playerId, profId) {
  return (
    world.getDynamicProperty(PROFICIENCY_PREFIX + profId + "_" + playerId) ?? 0
  );
}
function setProfLevel(playerId, profId, level) {
  world.setDynamicProperty(
    PROFICIENCY_PREFIX + profId + "_" + playerId,
    level
  );
}
function getProfXP(playerId, profId) {
  return (
    world.getDynamicProperty(PROFICIENCY_XP_PREFIX + profId + "_" + playerId) ??
    0
  );
}
function setProfXP(playerId, profId, xp) {
  world.setDynamicProperty(
    PROFICIENCY_XP_PREFIX + profId + "_" + playerId,
    xp
  );
}

/** 增加熟练度经验值 */
export function addProfXP(player, profId, amount) {
  const prof = PROFICIENCIES[profId];
  if (!prof) return;
  const playerId = player.id;
  let currentLevel = getProfLevel(playerId, profId);
  if (currentLevel >= 100) return;

  let currentXP = getProfXP(playerId, profId);
  currentXP += amount;

  while (currentLevel < 100) {
    const needed = prof.xpFn(currentLevel + 1);
    if (currentXP >= needed) {
      currentXP -= needed;
      currentLevel++;
      setProfLevel(playerId, profId, currentLevel);
      for (const eff of prof.effects) {
        if (currentLevel === eff.level) {
          player.sendMessage(
            `§6🎉 你的${prof.name}等级提升至 LV ${currentLevel}！解锁: §e${eff.label}`
          );
          player.playSound("random.levelup");
        }
      }
      if (!prof.effects.some((e) => e.level === currentLevel)) {
        player.sendMessage(
          `§a你的${prof.name}等级提升至 LV ${currentLevel}！`
        );
        player.playSound("random.orb");
      }
    } else {
      break;
    }
  }
  setProfXP(playerId, profId, currentXP);
}

/** 获取熟练度进度 */
export function getProfProgress(playerId, profId) {
  const prof = PROFICIENCIES[profId];
  if (!prof) return { level: 0, xp: 0, needed: 0, pct: 0 };
  const level = getProfLevel(playerId, profId);
  if (level >= 100) return { level: 100, xp: 0, needed: 0, pct: 100 };
  const xp = getProfXP(playerId, profId);
  const needed = prof.xpFn(level + 1);
  const pct = Math.min(100, Math.floor((xp / needed) * 100));
  return { level, xp, needed, pct };
}

/** 进度条渲染 */
function renderProgressBar(pct) {
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  return "§a" + "█".repeat(filled) + "§7" + "█".repeat(empty) + " §f" + pct + "%";
}

/** 熟练度 DDUI 菜单 */
export function showProficiencyMenu(player, backFn) {
  const pid = player.id;
  let f = new CustomForm(player, "熟练度");
  f = f.label("§6§l=== 熟练度等级 ===");
  f = f.spacer();

  for (const prof of Object.values(PROFICIENCIES)) {
    const { level, xp, needed, pct } = getProfProgress(pid, prof.id);
    const levelText = level >= 100 ? "§6§lMAX" : `§eLV ${level}`;
    const xpText = level >= 100 ? "" : ` §7| XP: ${xp}/${needed}`;
    f = f.label(`${prof.icon} §f${prof.name} ${levelText}${xpText}`);
    if (level < 100) {
      f = f.label(renderProgressBar(pct));
    }
    const activeEffects = prof.effects.filter((e) => level >= e.level);
    if (activeEffects.length > 0) {
      f = f.label(
        "  §b效果: " + activeEffects.map((e) => e.label).join(" §7| ")
      );
    }
    f = f.spacer();
  }

  f = f.button("返回", () => {
    f.close();
    system.runTimeout(() => backFn(player), 2);
  });
  f.show().catch((e) => console.warn("Proficiency menu failed:", e));
}

export function init() {
  // --- 永久效果刷新（每5秒） ---
  system.runInterval(() => {
    for (const player of world.getPlayers()) {
      const pid = player.id;
      for (const prof of Object.values(PROFICIENCIES)) {
        const level = getProfLevel(pid, prof.id);
        for (const eff of prof.effects) {
          if (level >= eff.level) {
            try {
              player.addEffect(eff.type, 200, {
                amplifier: eff.amplifier,
                showParticles: false,
              });
            } catch (e) {}
          }
        }
      }
    }
  }, 100);

  // --- 击杀 → 战斗熟练度 ---
  world.afterEvents.entityDie.subscribe((event) => {
    const attacker = event.damageSource?.damagingEntity;
    if (attacker?.typeId === "minecraft:player") {
      addProfXP(attacker, "combat", 1);
    }
    // 玩家死亡 → 防御熟练度
    if (event.deadEntity?.typeId === "minecraft:player") {
      try { addProfXP(event.deadEntity, "defense", 5); } catch (e) {}
    }
  });

  // --- 挖掘石头/圆石 → 挖矿熟练度 ---
  world.afterEvents.playerBreakBlock.subscribe((event) => {
    const blockId = event.brokenBlockPermutation?.type?.id;
    if (blockId === "minecraft:stone" || blockId === "minecraft:cobblestone") {
      addProfXP(event.player, "mining", 1);
    }
  });

  // --- 放置方块 → 灵巧熟练度 ---
  world.afterEvents.playerPlaceBlock.subscribe((event) => {
    addProfXP(event.player, "agility", 1);
  });
}
