import { notifyIfBusy } from "../lib/form.js";
import { system, world, ItemTypes, BlockTypes } from "@minecraft/server";
import { CustomForm, ObservableString, ObservableNumber } from "@minecraft/server-ui";
import { countItem, removeItems, giveItemToPlayer } from "../lib/inventory.js";
import { safeParseArray } from "../lib/json.js";
import { getPlayerMoney } from "./money.js";
import {
  storeItem,
  takeItem,
  restoreItem,
  getStackFingerprint,
  getVaultEntityIndex,
  getVaultEntities,
  getVaultCount,
} from "./vault.js";
import { MARKET_LISTINGS_KEY, MARKET_SOLD_PREFIX, MARKET_RETURNS_PREFIX, MARKET_UNLOCKED_PREFIX, MARKET_COUNTER_KEY, MARKET_UNLOCK_COST, MARKET_TAX_RATE, MARKET_QUARANTINE_KEY, MARKET_VAULT_READY_KEY } from "./config.js";

// --- 市场超时自动下架 ---
const AUTO_DELIST_MS = 48 * 60 * 60 * 1000; // 上架超过48小时未售出
const MARKET_AUTO_DELIST_INTERVAL_TICKS = 20 * 60 * 10; // 每10分钟检查一次

// 本次脚本加载时刻：金库「内容可信」时间戳必须 ≥ 该值
const SESSION_START_MS = Date.now();

/**
 * 金库内容是否已确认可信（启动对账与自动下架的前置条件）。
 * 只数实体数量是不够的：vault.js 在等待实体加载超时后会补建「空容器」实体并清理悬空索引，
 * 数量会瞬间达标但内容为空 —— 此时对账会把全服在售清单当成丢失而批量隔离（物品无法自动找回）。
 * 因此要求 vault.js 在 ensureVaultEntities() 真正跑完后写入本次启动的时间戳。
 */
function vaultContentTrusted() {
  try {
    const readyAt = world.getDynamicProperty(MARKET_VAULT_READY_KEY);
    return typeof readyAt === "number" && readyAt >= SESSION_START_MS;
  } catch (e) {
    console.error(`[Market] 读取金库就绪时间戳失败：${e}`);
    return false;
  }
}

/**
 * 改钱并**校验命令真的生效**，返回 true 表示已生效。
 * 为什么需要：`runCommand` 在"没有实际生效"时很多情况**不抛异常**，只返回 `successCount: 0`；
 * 旧代码丢弃返回值（且异常被空 catch 吞掉），可能出现"扣款没扣成但货已发"的凭空造币路径。
 */
function changeMoney(player, delta, reason) {
  const op = delta >= 0 ? "add" : "remove";
  const amount = Math.abs(Math.round(delta));
  if (!Number.isFinite(amount) || amount <= 0) return false;
  try {
    const res = player.runCommand(`scoreboard players ${op} @s money ${amount}`);
    if ((res?.successCount ?? 0) >= 1) return true;
    console.error(
      `[Market] 改钱未生效（${reason}）：${op} ${amount} → ${player.name ?? player.id}`
    );
    return false;
  } catch (e) {
    console.error(`[Market] 改钱抛错（${reason}）：${e}`);
    return false;
  }
}

/**
 * 校验金库物品与清单一致（typeId + 数量 + NBT 指纹）。
 * 清单不含 nbtFp（旧数据）时退化为 typeId+数量校验。
 * 防止“货不对板”：金库引用错位/被配错时拒绝交付并回滚。
 */
function stackMatchesListing(stack, listing) {
  if (!stack) return false;
  if (stack.typeId !== listing.typeId) return false;
  if (stack.amount !== listing.amount) return false;
  if (listing.nbtFp) {
    return getStackFingerprint(stack) === listing.nbtFp;
  }
  return true;
}

// ============================================================
// 市场数据操作
// ============================================================

function getMarketListings() {
  // 坏数据不再抛穿到表单/事件回调（整条市场功能会静默失效）
  return safeParseArray(world.getDynamicProperty(MARKET_LISTINGS_KEY), MARKET_LISTINGS_KEY);
}
function setMarketListings(listings) {
  world.setDynamicProperty(MARKET_LISTINGS_KEY, JSON.stringify(listings));
}
function getMarketQuarantine() {
  return safeParseArray(world.getDynamicProperty(MARKET_QUARANTINE_KEY), MARKET_QUARANTINE_KEY);
}
function setMarketQuarantine(list) {
  world.setDynamicProperty(MARKET_QUARANTINE_KEY, JSON.stringify(list));
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
  return safeParseArray(
    world.getDynamicProperty(MARKET_RETURNS_PREFIX + playerId),
    MARKET_RETURNS_PREFIX + playerId
  );
}
function setMarketReturns(playerId, list) {
  world.setDynamicProperty(MARKET_RETURNS_PREFIX + playerId, JSON.stringify(list));
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
  form.show().then((r) => notifyIfBusy(r, player)).catch((e) => console.warn("Form show failed:", e));
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
  form.show().then((r) => notifyIfBusy(r, player)).catch((e) => console.warn("Form show failed:", e));
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

      // 扣款必须确认真的生效，否则可能"没扣钱却拿到货"（凭空造币）
      if (!changeMoney(buyer, -confirmed.price, `购买扣款 ${confirmed.id}`)) {
        const rollback = getMarketListings();
        rollback.push(confirmed);
        setMarketListings(rollback);
        buyer.sendMessage("§c扣款失败，交易已取消（金币未扣、商品未动）");
        return;
      }

      // 从金库无损取出物品
      const stack = takeItem(confirmed.vault?.index, confirmed.vault?.slot);
      if (!stack) {
        const rollbackListings = getMarketListings();
        rollbackListings.push(confirmed);
        setMarketListings(rollbackListings);
        changeMoney(buyer, confirmed.price, `商品不可用退款 ${confirmed.id}`);
        buyer.sendMessage("§c商品暂时不可用，已退款！");
        console.error(
          `[Market] Vault item missing for listing ${confirmed.id}: ${confirmed.typeId} x${confirmed.amount}`
        );
        return;
      }

      // 交付前校验：金库物品必须与清单一致（防“货不对板”，如引用错位配到相邻清单物品）
      if (!stackMatchesListing(stack, confirmed)) {
        // 物品放回原槽位；清单保留（引用暂错），启动对账会按指纹重新匹配救回
        const putBack = restoreItem(
          confirmed.vault?.index,
          confirmed.vault?.slot,
          stack
        );
        const rollbackListings = getMarketListings();
        rollbackListings.push(confirmed);
        setMarketListings(rollbackListings);
        changeMoney(buyer, confirmed.price, `交易失败退款 ${confirmed.id}`);
        buyer.sendMessage("§c交易校验失败（物品与清单不符），已退款！请稍后再试");
        console.error(
          `[Market] Mismatch on buy ${confirmed.id}: expect ${confirmed.typeId} x${confirmed.amount}, got ${stack.typeId} x${stack.amount}, putBack=${putBack}`
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
        // 回滚：先把物品放回金库（新槽位），再把清单写回——引用必须同步更新，
        // 否则清单指向已清空的旧槽位，下次交付/对账会再次错位
        const restored = storeItem(confirmed.id, stack);
        if (restored) {
          confirmed.vault = restored;
        } else {
          buyer.dimension.spawnItem(stack, buyer.location);
        }
        const rollbackListings = getMarketListings();
        rollbackListings.push(confirmed);
        setMarketListings(rollbackListings);
        changeMoney(buyer, confirmed.price, `交易失败退款 ${confirmed.id}`);
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
          // 到账失败不能静默：转入"离线收益"队列，下次上线补发
          if (!changeMoney(seller, sellerEarn, `售出到账 ${confirmed.id}`)) {
            addMarketSold(seller.id, sellerEarn);
            console.warn(
              `[Market] 卖家到账未生效，已转入离线收益队列：${seller.name} +${sellerEarn}`
            );
          }
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
  form.show().then((r) => notifyIfBusy(r, p)).catch((e) => console.warn("Form show failed:", e));
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
        nbtFp: getStackFingerprint(listingStack),
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
  form.show().then((r) => notifyIfBusy(r, player)).catch((e) => console.warn("Form show failed:", e));
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
        if (!stackMatchesListing(stack, l)) {
          // 引用配错：放回原槽位，清单下架并隔离待管理员处理（避免错发他人物品）
          const putBack = restoreItem(l.vault?.index, l.vault?.slot, stack);
          current.splice(idx, 1);
          setMarketListings(current);
          const quarantine = getMarketQuarantine();
          quarantine.push({
            ...l,
            removedAt: Date.now(),
            reason: "delist_mismatch",
            mismatch: `${stack.typeId} x${stack.amount} (${getStackFingerprint(stack)})`,
            putBack,
          });
          setMarketQuarantine(quarantine);
          player.sendMessage("§c商品数据异常（与清单不符），已下架隔离，请联系管理员");
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
  form.show().then((r) => notifyIfBusy(r, player)).catch((e) => console.warn("Form show failed:", e));
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
      // 扣费必须确认生效才发放解锁，否则"点一下白拿市场"
      if (!changeMoney(player, -MARKET_UNLOCK_COST, "市场解锁扣费")) {
        player.sendMessage("§c扣费失败，解锁未完成，请稍后再试");
        return;
      }
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
  form.show().then((r) => notifyIfBusy(r, player)).catch((e) => console.warn("Market unlock form failed:", e));
}

/** 玩家上线：领取离线售出金币 + 返还下架物品 */
function onPlayerJoin(player) {
  const pendingGold = getMarketSold(player.id);
  if (pendingGold > 0) {
    system.runTimeout(() => {
      // 加款未确认生效前绝不清零，否则金币静默蒸发（下次上线还能重试）
      if (!player.isValid) {
        console.warn(
          `[Market] 玩家已失效，离线收益 ${pendingGold} 金币保留待下次上线`
        );
        return;
      }
      if (!changeMoney(player, pendingGold, `离线售出收益 ${player.id}`)) {
        console.warn(
          `[Market] 离线收益发放未生效（${pendingGold} 金币），金额已保留待重试`
        );
        return;
      }
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
    const remaining = [];
    let delivered = 0;
    for (const r of returns) {
      if (r.vault) {
        // 金库无损返还：直接从金库取出完整 ItemStack 交给玩家
        const stack = takeItem(r.vault.index, r.vault.slot);
        if (stack) {
          if (!stackMatchesListing(stack, r)) {
            // 引用配错：放回原槽位并隔离，不发给卖家
            const putBack = restoreItem(r.vault.index, r.vault.slot, stack);
            const quarantine = getMarketQuarantine();
            quarantine.push({
              ...r,
              removedAt: Date.now(),
              reason: "return_mismatch",
              mismatch: `${stack.typeId} x${stack.amount} (${getStackFingerprint(stack)})`,
              putBack,
            });
            setMarketQuarantine(quarantine);
            console.error(
              `[Market] Return mismatch for ${player.name}: expect ${r.typeId} x${r.amount}, got ${stack.typeId} x${stack.amount}`
            );
            continue;
          }
          const leftover = player
            .getComponent("inventory")
            .container.addItem(stack);
          if (leftover) {
            player.dimension.spawnItem(leftover, player.location);
          }
          delivered++;
          continue;
        }
        remaining.push(r);
        continue;
      }
      // 旧格式返还（无金库引用）
      giveItemToPlayer(player, r.typeId, r.amount, r.itemProps);
      delivered++;
    }
    if (remaining.length > 0) {
      setMarketReturns(player.id, remaining);
    } else {
      clearMarketReturns(player.id);
    }
    if (delivered > 0) {
      player.sendMessage(`§e市场：你的 ${delivered} 件下架商品已返还`);
    }
  }, 20);
}

// ============================================================
// 启动对账：金库实体容器 ↔ 市场清单
// ============================================================
export function init() {
  system.beforeEvents.startup.subscribe(() => {
    system.runTimeout(() => scheduleMarketReconcile(0), 20);
  });

  // 每10分钟检查一次超48小时未售出的商品，自动下架并返还
  system.runInterval(() => {
    if (!isVaultReadyForMarket()) return;
    autoDelistExpiredListings();
  }, MARKET_AUTO_DELIST_INTERVAL_TICKS);

  // 启动约1分钟后补一次检查
  system.runTimeout(() => {
    if (!isVaultReadyForMarket()) return;
    autoDelistExpiredListings();
  }, 20 * 60);
}

/** 金库已加载完成且内容可信才执行依赖金库的操作 */
function isVaultReadyForMarket() {
  if (!vaultContentTrusted()) return false;
  const expected = getVaultCount();
  const found = getVaultEntities().length;
  if (expected > 0 && found < expected) return false;
  const listings = getMarketListings();
  if (listings.length > 0 && expected === 0 && found === 0) return false;
  return true;
}

/** 自动下架超过48小时未售出的商品 */
function autoDelistExpiredListings() {
  try {
    const now = Date.now();
    const listings = getMarketListings();
    const expired = listings.filter(
      (l) =>
        typeof l.listedAt === "number" && now - l.listedAt >= AUTO_DELIST_MS
    );
    if (expired.length === 0) return;

    const expiredIds = new Set(expired.map((l) => l.id));
    setMarketListings(listings.filter((l) => !expiredIds.has(l.id)));

    for (const l of expired) {
      const stack = takeItem(l.vault?.index, l.vault?.slot);
      const seller = [...world.getPlayers()].find(
        (p) => p.id === l.sellerId
      );

      if (stack && !stackMatchesListing(stack, l)) {
        // 引用配错：放回原槽位并隔离，等待对账/管理员处理
        const putBack = restoreItem(l.vault?.index, l.vault?.slot, stack);
        const quarantine = getMarketQuarantine();
        quarantine.push({
          ...l,
          removedAt: now,
          reason: "auto_delist_mismatch",
          mismatch: `${stack.typeId} x${stack.amount} (${getStackFingerprint(stack)})`,
          putBack,
        });
        setMarketQuarantine(quarantine);
        console.error(
          `[Market] Auto-delist mismatch ${l.id}: expect ${l.typeId} x${l.amount}, got ${stack.typeId} x${stack.amount}, putBack=${putBack}`
        );
        continue;
      }

      if (seller && stack) {
        const leftover = seller
          .getComponent("inventory")
          .container.addItem(stack);
        if (leftover) {
          seller.dimension.spawnItem(leftover, seller.location);
        }
        seller.sendMessage({
          rawtext: [
            { text: "§e市场：你的 §f" },
            getListingDisplayName(l),
            {
              text: ` x${l.amount} §e已上架超过48小时未售出，已自动下架并返还`,
            },
          ],
        });
        seller.playSound("random.orb");
        continue;
      }

      // 离线或取回失败：进入离线返还队列（保留金库引用，登录后无损取回）
      const returns = getMarketReturns(l.sellerId);
      returns.push({
        typeId: l.typeId,
        amount: l.amount,
        itemKey: l.itemKey,
        nbtFp: l.nbtFp,
        vault: l.vault,
        returnedAt: now,
      });
      setMarketReturns(l.sellerId, returns);
    }

    console.warn(`[Market] 自动下架 ${expired.length} 件超48小时未售出商品`);
  } catch (e) {
    console.error(`[Market] Auto delist failed: ${e}`);
  }
}

/**
 * 等待金库实体确认加载完成后再对账。
 * 金库加载不出来（或存在商品但金库计数异常）时保留全部清单，避免误删商品。
 */
function scheduleMarketReconcile(attempt) {
  try {
    const expected = getVaultCount();
    const found = getVaultEntities().length;
    const listings = getMarketListings();

    // 金库内容未确认可信（本次启动未写入就绪时间戳）→ 绝不对账
    if (!vaultContentTrusted()) {
      if (attempt < 60) {
        system.runTimeout(() => scheduleMarketReconcile(attempt + 1), 20);
        return;
      }
      console.error(
        `[Market] 金库内容未确认可信（本次启动未写入就绪时间戳，实体 ${found}/${expected}），` +
          `跳过启动对账以保留全部商品清单`
      );
      return;
    }

    if (expected > 0 && found < expected) {
      if (attempt < 60) {
        system.runTimeout(() => scheduleMarketReconcile(attempt + 1), 20);
        return;
      }
      console.error(
        `[Market] 金库实体未完全加载（${found}/${expected}），跳过启动对账以保留全部商品清单`
      );
      return;
    }

    if (listings.length > 0 && expected === 0 && found === 0) {
      console.error(
        "[Market] 存在商品清单但金库计数为 0，跳过启动对账以保留全部商品清单"
      );
      return;
    }

    reconcileMarketVault();
  } catch (e) {
    // 递归链里抛错不会被外层捕获，之前会静默断链；现在记录并续试
    console.error(`[Market] 启动对账异常（attempt=${attempt}/60）：${e}`);
    if (attempt < 60) {
      system.runTimeout(() => scheduleMarketReconcile(attempt + 1), 20);
    }
  }
}

function reconcileMarketVault() {
  try {
    const listings = getMarketListings();
    const entities = getVaultEntities();
    const occupied = new Map(); // "index:slot" -> { container, item }
    for (const e of entities) {
      const index = getVaultEntityIndex(e);
      if (index === undefined) {
        // 索引不可解析：跳过（绝不回退成 0，避免多个实体相互覆盖引用）
        console.error(
          `[Market] 对账：发现索引不可解析的金库实体（跳过其内容）`
        );
        continue;
      }
      const container = e.getComponent("minecraft:inventory")?.container;
      if (!container) continue;
      for (let slot = 0; slot < container.size; slot++) {
        const item = container.getItem(slot);
        if (item) {
          occupied.set(`${index}:${slot}`, { container, item });
        }
      }
    }

    // 第一遍：引用有效且内容与清单一致 → 认领；否则进入待修复
    const claimed = new Map(); // key -> listingId（同一槽位只允许一个清单认领）
    const broken = [];
    for (const l of listings) {
      const key = `${l.vault?.index}:${l.vault?.slot}`;
      const occ = occupied.get(key);
      if (occ && !claimed.has(key) && stackMatchesListing(occ.item, l)) {
        claimed.set(key, l.id);
      } else {
        broken.push(l);
      }
    }

    // 第二遍：孤儿/错位物品按【指纹】匹配待修复清单，尽量救回（含同类型不同 NBT 的物品）
    const healed = [];
    for (const l of broken) {
      const matchKey = [...occupied.keys()].find((key) => {
        if (claimed.has(key)) return false;
        const occ = occupied.get(key);
        return occ && stackMatchesListing(occ.item, l);
      });
      if (matchKey) {
        const [index, slot] = matchKey.split(":").map(Number);
        l.vault = { index, slot };
        claimed.set(matchKey, l.id);
        healed.push(l);
      }
    }

    const kept = [];
    const removed = [];
    for (const l of listings) {
      const key = `${l.vault?.index}:${l.vault?.slot}`;
      const occ = occupied.get(key);
      if (
        occ &&
        claimed.get(key) === l.id &&
        stackMatchesListing(occ.item, l)
      ) {
        kept.push(l);
      } else {
        removed.push(l);
        const seller = [...world.getPlayers()].find(
          (p) => p.id === l.sellerId
        );
        if (seller) {
          seller.sendMessage(
            {
              rawtext: [
                { text: "§c市场：你的商品「" },
                getListingDisplayName(l),
                { text: "」在金库中未找到匹配物品，已自动下架并隔离，请联系管理员" },
              ],
            }
          );
        }
      }
    }
    setMarketListings(kept);

    if (removed.length > 0) {
      const quarantine = getMarketQuarantine();
      for (const l of removed) {
        quarantine.push({
          ...l,
          removedAt: Date.now(),
          reason: "startup_vault_missing",
        });
      }
      setMarketQuarantine(quarantine);
    }

    const orphanCount = [...occupied.keys()].filter(
      (key) => !claimed.has(key)
    ).length;
    if (healed.length > 0 || removed.length > 0 || orphanCount > 0) {
      console.warn(
        `[Market] 对账完成：修复 ${healed.length} 个错位清单，移除 ${removed.length} 个异常清单（已隔离），${orphanCount} 个孤儿物品保留在金库`
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
