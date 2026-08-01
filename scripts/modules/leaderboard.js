import { world, system } from "@minecraft/server";
import { CustomForm } from "@minecraft/server-ui";
import { getStat, STATS_CATEGORIES, getPlayerNameById } from "./stats.js";

function showLeaderboard(player, category, backFn) {
  const form = new CustomForm(player, `${category.icon} ${category.name} 排行`);

  const allEntries = [];
  const allPlayers = world.getPlayers();
  const seenIds = new Set();

  for (const p of allPlayers) {
    seenIds.add(p.id);
    allEntries.push({ name: p.name, value: getStat(p.id, category.prefix) });
  }

  const dynamicKeys = world.getDynamicPropertyIds();
  if (dynamicKeys) {
    for (const key of dynamicKeys) {
      if (key.startsWith(category.prefix)) {
        const playerId = key.slice(category.prefix.length);
        if (!seenIds.has(playerId)) {
          seenIds.add(playerId);
          const value = getStat(playerId, category.prefix);
          if (value > 0) {
            const name = getPlayerNameById(playerId);
            allEntries.push({ name, value });
          }
        }
      }
    }
  }

  allEntries.sort((a, b) => b.value - a.value);
  const top = allEntries.slice(0, 20);

  if (top.length === 0) {
    form.label("§7暂无数据");
  } else {
    form.label(`§6§lTOP 20 §7- ${category.name}`);
    form.spacer();
    for (let i = 0; i < top.length; i++) {
      const entry = top[i];
      const medal = i === 0 ? "§e1." : i === 1 ? "§f2." : i === 2 ? "§63." : `§7${i + 1}.`;
      form.label(`${medal} §e${entry.name} §7- §f${category.format(entry.value)}`);
      form.spacer();
    }
  }

  form.spacer().button("返回", () => {
    form.close();
    system.runTimeout(() => showLeaderboardMenu(player, backFn), 2);
  });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

export function showLeaderboardMenu(player, backFn) {
  const form = new CustomForm(player, "排行榜")
    .label("§e选择排行类别")
    .spacer();

  for (const cat of STATS_CATEGORIES) {
    form.button(`${cat.icon} ${cat.name}`, () => {
      form.close();
      system.runTimeout(() => showLeaderboard(player, cat, backFn), 2);
    });
    form.spacer();
  }

  form.button("返回", () => {
    form.close();
    system.runTimeout(() => backFn(player), 2);
  });
  form.show().catch((e) => console.warn("Form show failed:", e));
}
