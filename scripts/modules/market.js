import { system, world, ItemTypes, BlockTypes } from "@minecraft/server";
import { CustomForm, ObservableString, ObservableNumber } from "@minecraft/server-ui";
import { countItem, removeItems, giveItemToPlayer } from "../lib/inventory.js";
import { getPlayerMoney } from "./money.js";
import { storeItem, takeItem, getVaultEntities } from "./vault.js";
import { MARKET_LISTINGS_KEY, MARKET_SOLD_PREFIX, MARKET_RETURNS_PREFIX, MARKET_UNLOCKED_PREFIX, MARKET_COUNTER_KEY, MARKET_UNLOCK_COST, MARKET_TAX_RATE, MARKET_VAULT_INDEX_KEY } from "./config.js";

// ============================================================
// 市场数据操作
// ============================================================

function getMarketListings() {
  const raw = world.getDynamicProperty(MARKET_LISTINGS_KEY);
  return raw ? JSON.parse(raw) : [];
}
function setMarketListings(listings) {
  world.setDynamicProperty(MARKET_LISTINGS_KEY, JSON.stringify(listings));
}
function nextListingId() {
  let c = world.getDynamicProperty(MARKET_COUNTER_KEY) ?? 0;
  c++;
  world.setDynamicProperty(MARKET_COUNTER_KEY, c);
  return "ml_" + c;
}
function getMarketSold(playerId) {
  return world.getDynamicProperty(MARKET_SOLD_PREFIX + playerId) ?? 0;
}
function addMarketSold(playerId, amount) {
  const cur = getMarketSold(playerId);
  world.setDynamicProperty(MARKET_SOLD_PREFIX + playerId, cur + amount);
}
function clearMarketSold(playerId) {
  world.setDynamicProperty(MARKET_SOLD_PREFIX + playerId, undefined);
}
function getMarketReturns(playerId) {
  const raw = world.getDynamicProperty(MARKET_RETURNS_PREFIX + playerId);
  return raw ? JSON.parse(raw) : [];
}
function clearMarketReturns(playerId) {
  world.setDynamicProperty(MARKET_RETURNS_PREFIX + playerId, undefined);
}
function isPlayerOnline(playerId) {
  return [...world.getPlayers()].some((p) => p.id === playerId);
}

// ============================================================
// 物品/方块显示名：直接使用本地化键，交给客户端翻译
// ============================================================

function getTypeLocalizationKey(typeId) {
  try {
    return (
      ItemTypes.get(typeId)?.localizationKey ||
      BlockTypes.get(typeId)?.localizationKey ||
      undefined
    );
  } catch (e) {
    return undefined;
  }
}

export function getItemDisplayName(typeId) {
  const key = getTypeLocalizationKey(typeId);
  return key
    ? { translate: key }
    : { text: typeId.replace("minecraft:", "") };
}

/** 清单显示名：使用物品本地化键，由客户端翻译 */
function getListingDisplayName(listing) {
  const key = listing.itemKey || getTypeLocalizationKey(listing.typeId);
  return key
    ? { translate: key }
    : { text: listing.typeId.replace("minecraft:", "") };
}

// ============================================================
// 市场 DDUI 菜单
// ============================================================

function showMarketMenu(player, backFn) {
  const form = new CustomForm(player, "市场")
    .label(`§6金币: ${getPlayerMoney(player)}`)
    .spacer()
    .button("浏览市场", () => {
      form.close();
      system.runTimeout(() => showMarketBrowse(player, backFn), 2);
    })
    .spacer()
    .button("上架物品", () => {
      form.close();
      system.runTimeout(() => showMarketCreateListing(player, backFn), 2);
    })
    .spacer()
    .button("我的上架", () => {
      form.close();
      system.runTimeout(() => showMarketMyListings(player, backFn), 2);
    })
    .spacer()
    .button("返回", () => {
      form.close();
      system.runTimeout(() => backFn(player), 2);
    });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

function showMarketBrowse(player, backFn) {
  const listings = getMarketListings();
  const form = new CustomForm(player, "浏览市场");

  if (listings.length === 0) {
    form.label("§7市场上暂无商品");
  } else {
    form.label(`§e共 ${listings.length} 件商品`);
    for (const l of listings) {
      form.spacer();
      form.label(
        {
          rawtext: [
            { text: "§f" },
            getListingDisplayName(l),
            {
              text: ` x${l.amount} §7- §e${l.price}金币 §7by ${l.sellerName}`,
            },
          ],
        }
      );
      form.spacer();
      form.button("购买", () => {
        form.close();
        system.runTimeout(() => confirmMarketPurchase(player, l, backFn), 2);
      });
    }
  }
  form.spacer().button("返回", () => {
    form.close();
    system.runTimeout(() => showMarketMenu(player, backFn), 2);
  });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

function confirmMarketPurchase(player, listing, backFn) {
  if (listing.sellerId === player.id) {
    player.sendMessage("§c不能购买自己的商品！");
    return;
  }
  const form = new CustomForm(player, "确认购买")
    .label({
      rawtext: [
        { text: "§f" },
        getListingDisplayName(listing),
        { text: ` x${listing.amount}` },
      ],
    })
    .spacer()
    .label(`§e价格: ${listing.price} 金币`)
    .spacer()
    .label(`§7出售方: ${listing.sellerName}`)
    .spacer()
    .button("确认购买", () => {
      form.close();
      const buyer = player;
      const buyerName = buyer.name;

      if (getPlayerMoney(buyer) < listing.price) {
        buyer.sendMessage("§c金币不足！");
        buyer.playSound("random.break");
        return;
      }

      const allListings = getMarketListings();
      const idx = allListings.findIndex((l) => l.id === listing.id);
      if (idx === -1) {
        buyer.sendMessage("§c该商品已被购买或下架！");
        return;
      }
      const confirmed = allListings[idx];
      allListings.splice(idx, 1);
      setMarketListings(allListings);

      try {
        buyer.runCommand(
          `scoreboard players remove @s money ${confirmed.price}`
        );
      } catch (e) {}

      // 从金库无损取出物品
      const stack = takeItem(confirmed.vault?.index, confirmed.vault?.slot);
      if (!stack) {
        const rollbackListings = getMarketListings();
        rollbackListings.push(confirmed);
        setMarketListings(rollbackListings);
        try {
          buyer.runCommand(
            `scoreboard players add @s money ${confirmed.price}`
          );
        } catch (e) {}
        buyer.sendMessage("§c商品暂时不可用，已退款！");
        console.error(
          `[Market] Vault item missing for listing ${confirmed.id}: ${confirmed.typeId} x${confirmed.amount}`
        );
        return;
      }

      // 交付：完整 ItemStack 直接入买家背包，背包满则剩余掉落在脚下
      let leftover;
      try {
        leftover = buyer
          .getComponent("inventory")
          .container.addItem(stack);
      } catch (e) {
        const rollbackListings = getMarketListings();
        rollbackListings.push(confirmed);
        setMarketListings(rollbackListings);
        try {
          buyer.runCommand(
            `scoreboard players add @s money ${confirmed.price}`
          );
        } catch (e) {}
        const restored = storeItem(confirmed.id, stack);
        if (!restored) {
          buyer.dimension.spawnItem(stack, buyer.location);
        }
        buyer.sendMessage("§c交易失败，已退款！请重试");
        console.error(`[Market] Delivery failed: ${e}`);
        return;
      }
      if (leftover) {
        buyer.dimension.spawnItem(leftover, buyer.location);
        buyer.sendMessage("§e背包已满，部分物品掉落在脚下");
      }

      const sellerEarn = Math.floor(confirmed.price * (1 - MARKET_TAX_RATE));
      const sellerOnline = isPlayerOnline(confirmed.sellerId);
      if (sellerOnline) {
        const seller = [...world.getPlayers()].find(
          (p) => p.id === confirmed.sellerId
        );
        if (seller) {
          try {
            seller.runCommand(
              `scoreboard players add @s money ${sellerEarn}`
            );
          } catch (e) {}
          seller.sendMessage(
            {
              rawtext: [
                { text: `§e市场：${buyerName} 购买了你的 §f` },
                getListingDisplayName(confirmed),
                {
                  text: ` x${confirmed.amount} §e| 获得 ${sellerEarn}金币(税后)`,
                },
              ],
            }
          );
          seller.playSound("random.orb");
        }
      } else {
        addMarketSold(confirmed.sellerId, sellerEarn);
      }

      buyer.sendMessage(
        {
          rawtext: [
            { text: "§a购买成功！" },
            getListingDisplayName(confirmed),
            {
              text: ` x${confirmed.amount} §a| 花费 ${confirmed.price}金币`,
            },
          ],
        }
      );
      buyer.playSound("random.orb");
    })
    .spacer()
    .button("返回", () => {
      form.close();
      system.runTimeout(() => showMarketBrowse(player, backFn), 2);
    });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

function showMarketCreateListing(player, backFn) {
  const inv = player.getComponent("inventory").container;
  const itemMap = new Map();
  for (let i = 0; i < inv.size; i++) {
    const item = inv.getItem(i);
    if (
      item &&
      item.typeId !== "minecraft:clock" &&
      item.typeId !== "minecraft:command_block_minecart"
    ) {
      const key = item.typeId;
      itemMap.set(key, (itemMap.get(key) || 0) + item.amount);
    }
  }
  if (itemMap.size === 0) {
    player.sendMessage("§c背包中没有可上架的物品！");
    return;
  }
  const dropdownItems = [];
  const marketItemMap = [];
  const maxStackMap = [];
  let itemIdx = 0;
  for (const [typeId, total] of itemMap) {
    dropdownItems.push({
      label: {
        rawtext: [
          getItemDisplayName(typeId),
          { text: ` (拥有:${total})` },
        ],
      },
      value: itemIdx,
    });
    marketItemMap.push(typeId);
    let samp = null;
    for (let j = 0; j < inv.size; j++) {
      const s = inv.getItem(j);
      if (s?.typeId === typeId) {
        samp = s;
        break;
      }
    }
    maxStackMap.push(samp ? samp.maxAmount : 64);
    itemIdx++;
  }
  const selectedItem = new ObservableNumber(0, { clientWritable: true });
  const amountObs = new ObservableNumber(1, { clientWritable: true });
  const priceObs = new ObservableString("", { clientWritable: true });
  const firstMax = Math.min(itemMap.get(marketItemMap[0]), maxStackMap[0]);
  const maxObs = new ObservableNumber(firstMax);
  const maxLabel = new ObservableString(
    `§7可上架: ${firstMax} (最大堆叠:${maxStackMap[0]})`
  );

  selectedItem.subscribe((idx) => {
    const cnt = itemMap.get(marketItemMap[idx]);
    const stackMax = maxStackMap[idx];
    const limit = Math.min(cnt, stackMax);
    maxLabel.setData(`§7可上架: ${limit} (最大堆叠:${stackMax})`);
    maxObs.setData(limit);
    if (amountObs.getData() > limit) amountObs.setData(limit);
  });

  const form = new CustomForm(player, "上架物品")
    .dropdown("选择物品", selectedItem, dropdownItems)
    .spacer()
    .label(maxLabel)
    .spacer()
    .slider("数量", amountObs, new ObservableNumber(1), maxObs)
    .spacer()
    .textField("总价（金币）", priceObs)
    .spacer()
    .button("上架", () => {
      const typeId = marketItemMap[selectedItem.getData()];
      const amount = amountObs.getData();
      const priceStr = priceObs.getData().trim();
      const price = parseInt(priceStr, 10);
      if (isNaN(price) || price <= 0) {
        player.sendMessage("§c请输入有效价格！");
        return;
      }
      const owned = countItem(player, typeId);
      if (owned < amount) {
        player.sendMessage(`§c物品不足！拥有: ${owned}`);
        return;
      }

      // 取背包中同类型第一组物品，克隆后拆分到上架数量（保留全部 NBT）
      const inv = player.getComponent("inventory").container;
      let srcStack = null;
      for (let i = 0; i < inv.size; i++) {
        const it = inv.getItem(i);
        if (it?.typeId === typeId) {
          srcStack = it;
          break;
        }
      }
      if (!srcStack) {
        player.sendMessage("§c未找到可上架的物品");
        return;
      }
      const listingStack = srcStack.clone();
      listingStack.amount = amount;

      const listingId = nextListingId();
      const vaultRef = storeItem(listingId, listingStack);
      if (!vaultRef) {
        player.sendMessage("§c金库暂时不可用，上架失败，请稍后再试");
        player.playSound("random.break");
        return;
      }

      let itemKey;
      try {
        itemKey = srcStack.localizationKey;
      } catch (e) {}
      removeItems(player, typeId, amount);
      const listing = {
        id: listingId,
        sellerId: player.id,
        sellerName: player.name,
        typeId,
        amount,
        price,
        vault: vaultRef,
        itemKey: itemKey || undefined,
        listedAt: Date.now(),
      };
      const listings = getMarketListings();
      listings.push(listing);
      setMarketListings(listings);
      player.sendMessage(
        {
          rawtext: [
            { text: "§a已上架 §f" },
            getListingDisplayName(listing),
            { text: ` x${amount} §a售价 §e${price}金币` },
          ],
        }
      );
      player.playSound("random.orb");
      form.close();
    })
    .spacer()
    .button("返回", () => {
      form.close();
      system.runTimeout(() => showMarketMenu(player, backFn), 2);
    });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

function showMarketMyListings(player, backFn) {
  const listings = getMarketListings().filter(
    (l) => l.sellerId === player.id
  );
  const form = new CustomForm(player, "我的上架");
  if (listings.length === 0) {
    form.label("§7你没有上架的商品");
  } else {
    for (const l of listings) {
      form.spacer();
      form.label(
        {
          rawtext: [
            { text: "§f" },
            getListingDisplayName(l),
            { text: ` x${l.amount} §e${l.price}金币` },
          ],
        }
      );
      form.spacer();
      form.button("下架", () => {
        const current = getMarketListings();
        const idx = current.findIndex((x) => x.id === l.id);
        if (idx === -1) {
          player.sendMessage("§c该商品已不存在！");
          return;
        }
        const stack = takeItem(l.vault?.index, l.vault?.slot);
        if (!stack) {
          player.sendMessage("§c商品数据异常（金库未找到物品），请联系管理员");
          player.playSound("random.break");
          return;
        }
        current.splice(idx, 1);
        setMarketListings(current);
        const leftover = player
          .getComponent("inventory")
          .container.addItem(stack);
        if (leftover) {
          player.dimension.spawnItem(leftover, player.location);
          player.sendMessage("§e背包已满，物品掉落在脚下");
        }
        player.sendMessage(
          {
            rawtext: [
              { text: "§a已下架 §f" },
              getListingDisplayName(l),
              { text: ` x${l.amount}` },
            ],
          }
        );
        player.playSound("random.orb");
        form.close();
        system.runTimeout(() => showMarketMyListings(player, backFn), 2);
      });
    }
  }
  form.spacer().button("返回", () => {
    form.close();
    system.runTimeout(() => showMarketMenu(player, backFn), 2);
  });
  form.show().catch((e) => console.warn("Form show failed:", e));
}

function showMarketUnlockForm(player, backFn) {
  const money = getPlayerMoney(player);
  const canAfford = money >= MARKET_UNLOCK_COST;
  const form = new CustomForm(player, "解锁市场")
    .label(`§6开启市场功能需要支付 ${MARKET_UNLOCK_COST} 金币`)
    .spacer()
    .label(`§e当前金币: ${money}`)
    .spacer()
    .label(canAfford ? "§a金币充足，可以解锁" : "§c金币不足，无法解锁");
  if (canAfford) {
    form.spacer().button("确认解锁", () => {
      player.runCommand(
        `scoreboard players remove @s money ${MARKET_UNLOCK_COST}`
      );
      world.setDynamicProperty(MARKET_UNLOCKED_PREFIX + player.id, true);
      player.sendMessage("§a市场已解锁！");
      player.playSound("random.orb");
      form.close();
      system.runTimeout(() => showMarketMenu(player, backFn), 2);
    });
  }
  form.spacer().button("返回", () => {
    form.close();
    system.runTimeout(() => backFn(player), 2);
  });
  form.show().catch((e) => console.warn("Market unlock form failed:", e));
}

/** 玩家上线：领取离线售出金币 + 返还下架物品 */
function onPlayerJoin(player) {
  const pendingGold = getMarketSold(player.id);
  if (pendingGold > 0) {
    system.runTimeout(() => {
      try {
        player.runCommand(`scoreboard players add @s money ${pendingGold}`);
      } catch (e) {}
      clearMarketSold(player.id);
      player.sendMessage(
        `§e市场：离线期间售出商品，获得 §6${pendingGold}金币`
      );
      player.playSound("random.orb");
    }, 20);
  }

  const returns = getMarketReturns(player.id);
  if (returns.length === 0) return;

  system.runTimeout(() => {
    for (const r of returns) {
      giveItemToPlayer(player, r.typeId, r.amount, r.itemProps);
    }
    clearMarketReturns(player.id);
    player.sendMessage(`§e市场：你的 ${returns.length} 件下架商品已返还`);
  }, 20);
}

// ============================================================
// 启动对账：金库实体容器 ↔ 市场清单
// ============================================================
export function init() {
  system.beforeEvents.startup.subscribe(() => {
    system.runTimeout(() => reconcileMarketVault(), 20);
  });
}

function reconcileMarketVault() {
  try {
    const listings = getMarketListings();
    const entities = getVaultEntities();
    const occupied = new Map(); // "index:slot" -> container
    for (const e of entities) {
      const index = e.getDynamicProperty(MARKET_VAULT_INDEX_KEY) ?? 0;
      const container = e.getComponent("minecraft:inventory")?.container;
      if (!container) continue;
      for (let slot = 0; slot < container.size; slot++) {
        if (container.getItem(slot)) {
          occupied.set(`${index}:${slot}`, container);
        }
      }
    }

    const claimed = new Set();
    const broken = [];
    for (const l of listings) {
      const key = `${l.vault?.index}:${l.vault?.slot}`;
      if (occupied.has(key)) {
        claimed.add(key);
      } else {
        broken.push(l);
      }
    }

    // 孤儿物品按 typeId+amount 匹配损坏清单，尽量救回
    for (const l of broken) {
      if (claimed.has(`${l.vault?.index}:${l.vault?.slot}`)) continue;
      const matchKey = [...occupied.keys()].find((key) => {
        if (claimed.has(key)) return false;
        const [index, slot] = key.split(":").map(Number);
        const item = occupied.get(key)?.getItem(slot);
        return item?.typeId === l.typeId && item.amount === l.amount;
      });
      if (matchKey) {
        const [index, slot] = matchKey.split(":").map(Number);
        l.vault = { index, slot };
        claimed.add(matchKey);
      }
    }

    const kept = [];
    let removed = 0;
    for (const l of listings) {
      const key = `${l.vault?.index}:${l.vault?.slot}`;
      if (occupied.has(key)) {
        kept.push(l);
      } else {
        removed++;
        const seller = [...world.getPlayers()].find(
          (p) => p.id === l.sellerId
        );
        if (seller) {
          seller.sendMessage(
            {
              rawtext: [
                { text: "§c市场：你的商品「" },
                getListingDisplayName(l),
                { text: "」数据异常，已自动下架" },
              ],
            }
          );
        }
      }
    }
    setMarketListings(kept);

    const orphanCount = [...occupied.keys()].filter(
      (key) => !claimed.has(key)
    ).length;
    if (removed > 0 || orphanCount > 0) {
      console.warn(
        `[Market] 对账完成：移除 ${removed} 个异常清单，${orphanCount} 个孤儿物品保留在金库`
      );
    }
  } catch (e) {
    console.error(`[Market] Reconcile failed: ${e}`);
  }
}

// ============================================================
// 导出
// ============================================================

export { showMarketMenu, showMarketUnlockForm, onPlayerJoin };
