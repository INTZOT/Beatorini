// ============================================================
// 灵魂出窍：自由相机视角脱离身体探索。
// 命令 #fc on / #fc off 开关；受伤/死亡/离开世界/脚本重载自动退出。
// 身体不做无敌处理，可被攻击，死亡惩罚照常。
// ============================================================
import { system, world, InputButton, ButtonState } from "@minecraft/server";

const SOUL_KEY = "soul:active_";
const SOUL_MOVE_SPEED = 0.215; // 块/tick（约等于行走速度 4.3 块/秒）
const active = new Map(); // playerId -> { player, pos }

export function toggleSoul(player, on) {
  if (on) {
    enterSoul(player);
  } else {
    exitSoul(player, "手动关闭");
  }
}

function enterSoul(player) {
  if (world.getDynamicProperty(SOUL_KEY + player.id)) {
    player.sendMessage("§c你已在灵魂出窍中");
    return;
  }
  const loc = player.location;
  try {
    player.camera.setCamera("minecraft:free", {
      location: { x: loc.x, y: loc.y + 1.5, z: loc.z },
    });
    world.setDynamicProperty(SOUL_KEY + player.id, true);
    active.set(player.id, {
      player,
      pos: { x: loc.x, y: loc.y + 1.5, z: loc.z },
    });
    player.sendMessage("§a已开启灵魂出窍！输入 #fc off 关闭");
    player.playSound("random.orb");
  } catch (e) {
    player.sendMessage(`§c开启灵魂出窍失败: ${e}`);
  }
}

function exitSoul(player, reason) {
  if (!world.getDynamicProperty(SOUL_KEY + player.id)) return;
  world.setDynamicProperty(SOUL_KEY + player.id, undefined);
  active.delete(player.id);
  try {
    player.camera.setCamera("minecraft:first_person");
  } catch (e) {}
  player.sendMessage(`§e已退出灵魂出窍（${reason}）`);
  player.playSound("random.orb");
}

export function init() {
  // 出窍期间：按输入实时移动自由相机位置
  system.runInterval(() => {
    for (const data of active.values()) {
      const p = data.player;
      try {
        const mv = p.inputInfo?.getMovementVector?.();
        const mx = typeof mv?.x === "number" ? mv.x : 0;
        const mz = typeof mv?.z === "number" ? mv.z : 0;
        if (mx !== 0 || mz !== 0) {
          console.warn(
            `[Soul] mv=${JSON.stringify(mv)} pos=${JSON.stringify(data.pos)}`
          );
        }
        const yaw = (p.getRotation().y * Math.PI) / 180;
        const sinY = Math.sin(yaw);
        const cosY = Math.cos(yaw);
        // 移动向量：前后/左右按视角朝向映射到世界坐标
        let dx = -sinY * mz - cosY * mx;
        let dz = cosY * mz - sinY * mx;
        const len = Math.hypot(dx, dz);
        if (len > 1) {
          dx /= len;
          dz /= len;
        }
        let dy = 0;
        if (
          p.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed
        ) {
          dy += 1;
        }
        if (
          p.inputInfo.getButtonState(InputButton.Sneak) === ButtonState.Pressed
        ) {
          dy -= 1;
        }
        data.pos.x += dx * SOUL_MOVE_SPEED;
        data.pos.y += dy * SOUL_MOVE_SPEED;
        data.pos.z += dz * SOUL_MOVE_SPEED;
        p.camera.setCamera("minecraft:free", { location: data.pos });
      } catch (e) {
        console.warn(`[Soul] tick failed: ${e} stack=${e?.stack ?? ""}`);
      }
    }
  }, 2);

  // 脚本重载后强制恢复：残留出窍标志的玩家退出自由相机
  world.afterEvents.worldLoad.subscribe(() => {
    for (const p of world.getPlayers()) {
      if (world.getDynamicProperty(SOUL_KEY + p.id)) {
        exitSoul(p, "脚本重载");
      }
    }
  });

  // 死亡自动退出
  world.afterEvents.entityDie.subscribe((event) => {
    if (event.deadEntity.typeId === "minecraft:player") {
      exitSoul(event.deadEntity, "死亡");
    }
  });

  // 受伤自动退出
  world.afterEvents.entityHurt.subscribe((event) => {
    if (event.hurtEntity.typeId === "minecraft:player") {
      exitSoul(event.hurtEntity, "受伤");
    }
  });

  // 离开世界清理状态
  world.afterEvents.playerLeave.subscribe((event) => {
    world.setDynamicProperty(SOUL_KEY + event.playerId, undefined);
  });
}
