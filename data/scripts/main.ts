import { ScriptEventCommandMessageAfterEvent, system, Player, EntityComponentTypes, Dimension, MinecraftDimensionTypes, EntityInventoryComponent, EntityEquippableComponent, EquipmentSlot, world, StructureSaveMode, EntityHealthComponent } from "@minecraft/server";
import * as ui from "@minecraft/server-ui";

system.afterEvents.scriptEventReceive.subscribe((eventData: ScriptEventCommandMessageAfterEvent) => {
  const { id, message, sourceEntity } = eventData;

  if (!(sourceEntity instanceof Player)) return;

  const commandId = id;
  const structureId = message.startsWith('"') && message.endsWith('"') ? message.slice(1, -1) : message;
  if (structureId.includes(' ')) {
    sourceEntity.sendMessage(`§cInvalid structure ID: Spaces are not allowed.`);
    return;
  }

  const inventoryComp = sourceEntity.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent | null;
  if (!inventoryComp || inventoryComp.container === undefined) return;

  let structureY: number;
  switch (sourceEntity.dimension.id) {
    case MinecraftDimensionTypes.overworld:
      structureY = 319;
      break;
    case MinecraftDimensionTypes.nether:
      structureY = 127;
      break;
    case MinecraftDimensionTypes.theEnd:
      structureY = 254;
      break;
    default:
      structureY = 319;
      break;
  }

  const structurePosition = {
    x: sourceEntity.location.x,
    y: structureY,
    z: sourceEntity.location.z,
  };

  const playerStructureId = `${sourceEntity.id}:${structureId}`;

  if (commandId === "inventory:save") {
    const existingStructures = world.structureManager.getWorldStructureIds().filter(id => id === playerStructureId);
    if (existingStructures.length > 0) {
      sourceEntity.sendMessage(`§cA structure with ID '§f${structureId}§c' already exists.`);
      return;
    }

    if (isInventoryEmpty(inventoryComp, sourceEntity)) {
      sourceEntity.sendMessage("§cYour inventory is empty, there's nothing to save!");
      return;
    }

    savePlayerInventory(sourceEntity, inventoryComp, structurePosition, playerStructureId);
  }

  if (commandId === "inventory:load") {
    const existingStructures = world.structureManager.getWorldStructureIds().filter(id => id === playerStructureId);
    if (existingStructures.length === 0) {
      sourceEntity.sendMessage(`§cNo saved inventory found with ID '§f${structureId}§c'.`);
      return;
    }

    loadPlayerInventory(sourceEntity, inventoryComp, structurePosition, playerStructureId);
  }

  if (commandId === "inventory:delete") {
    const existingStructures = world.structureManager.getWorldStructureIds().filter(id => id === playerStructureId);
    if (existingStructures.length === 0) {
      sourceEntity.sendMessage(`§cNo saved inventory found with ID '§f${structureId}§c' to delete.`);
      return;
    }

    world.structureManager.delete(playerStructureId);
    sourceEntity.sendMessage(`§aInventory with ID '§f${structureId}§a' has been deleted.`);
  }

  if (commandId === "inventory:list") {
    const playerStructures = world.structureManager.getWorldStructureIds().filter(id => id.startsWith(`${sourceEntity.id}:`));
    if (playerStructures.length === 0) {
      sourceEntity.sendMessage("§cYou don't have any saved inventories.");
      return;
    }

    let listMessage = "§aYou have following saved inventories:\n";
    playerStructures.forEach(structure => {
      const shortId = structure.split(':')[1];
      const items = getInventoryPreview(structure, sourceEntity.dimension, structurePosition);
      listMessage += `§f${shortId}: §7${items}...`;
    });
    sourceEntity.sendMessage(listMessage);
  }

  if (commandId === "inventory:config") {
    config(sourceEntity);
  }
});

function savePlayerInventory(player: Player, inventoryComp: EntityInventoryComponent, structurePosition: { x: number; y: number; z: number }, structureId: string) {
  const storagEntityId = world.getDynamicProperty("inventory_tools:storage_entity") as string;
  (player.dimension as Dimension).runCommand(`summon ${storagEntityId || "storage:entity"} ${structurePosition.x} ${structurePosition.y} ${structurePosition.z}`);
  const storageEntity = (player.dimension as Dimension).getEntities({ type: storagEntityId || "storage:entity", location: structurePosition })[0];
  if (!storageEntity) return;

  const storageInventoryComp = storageEntity.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
  if (!storageInventoryComp || !storageInventoryComp.container) return;

  if (!inventoryComp || !inventoryComp.container) return;

  transferItems(inventoryComp.container, storageInventoryComp.container, inventoryComp.container.size);
  transferEquipment(player, storageInventoryComp.container, true);

  const saveInRam = world.getDynamicProperty("inventory_tools:save_in_ram") as boolean;
  world.structureManager.createFromWorld(structureId, player.dimension, structurePosition, structurePosition, {
    includeBlocks: false,
    includeEntities: true,
    saveMode: saveInRam ? StructureSaveMode.Memory : StructureSaveMode.World
  });

  storageEntity.remove();
  player.sendMessage(`§aInventory saved with ID '§f${structureId.split(':')[1]}§a'.`);
}

function loadPlayerInventory(player: Player, inventoryComp: EntityInventoryComponent, structurePosition: { x: number; y: number; z: number }, structureId: string) {
  const storagEntityId = world.getDynamicProperty("inventory_tools:storage_entity") as string;
  world.structureManager.place(structureId, player.dimension as Dimension, structurePosition);
  const storageEntity = (player.dimension as Dimension).getEntities({ type: storagEntityId || "storage:entity", location: structurePosition })[0];
  if (!storageEntity) return;

  const storageInventoryComp = storageEntity.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
  if (!storageInventoryComp || !storageInventoryComp.container) return;

  const thisttt = storageEntity.getComponent('health') as EntityHealthComponent
  thisttt.setCurrentValue

  transferItems(storageInventoryComp.container, inventoryComp.container!, 35);
  transferEquipment(player, storageInventoryComp.container, false);

  storageEntity.remove();
  if (!world.getDynamicProperty("inventory_tools:keep_inventory")) {
    world.structureManager.delete(structureId);
  }
  player.sendMessage(`§aInventory loaded from ID '§f${structureId.split(':')[1]}§a'.`);
}

function transferItems(sourceContainer: any, targetContainer: any, slotCount: number) {
  for (let slot = 0; slot < slotCount; slot++) {
    const item = sourceContainer.getItem(slot);
    if (item) {
      targetContainer.setItem(slot, item);
      if (!world.getDynamicProperty("inventory_tools:keep_items")) {
        sourceContainer.setItem(slot, undefined);
      }
    }
  }
}

function transferEquipment(player: Player, container: any, isSaving: boolean) {
  const equippableComp = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent;
  if (!equippableComp) return;

  const equipmentSlots = [
    EquipmentSlot.Head,
    EquipmentSlot.Chest,
    EquipmentSlot.Legs,
    EquipmentSlot.Feet,
    EquipmentSlot.Offhand,
  ];

  equipmentSlots.forEach((slot, index) => {
    if (isSaving) {
      const equipment = equippableComp.getEquipment(slot);
      if (equipment) {
        container.setItem(36 + index, equipment);
        if (!world.getDynamicProperty("inventory_tools:keep_items")) {
          equippableComp.setEquipment(slot, undefined);
        }
      }
    } else {
      const item = container.getItem(36 + index);
      if (item) {
        equippableComp.setEquipment(slot, item);
        if (!world.getDynamicProperty("inventory_tools:keep_items")) {
          container.setItem(36 + index, undefined);
        }
      }
    }
  });
}

function isInventoryEmpty(inventoryComp: EntityInventoryComponent, player: Player): boolean {
  if (!inventoryComp || !inventoryComp.container) return true;
  for (let slot = 0; slot < inventoryComp.container.size; slot++) {
    if (inventoryComp.container.getItem(slot)) {
      return false;
    }
  }

  const equippableComp = player.getComponent(EntityComponentTypes.Equippable) as EntityEquippableComponent;
  if (!equippableComp) return true;

  const equipmentSlots = [
    EquipmentSlot.Head,
    EquipmentSlot.Chest,
    EquipmentSlot.Legs,
    EquipmentSlot.Feet,
    EquipmentSlot.Offhand,
  ];

  for (const slot of equipmentSlots) {
    if (equippableComp.getEquipment(slot)) {
      return false;
    }
  }

  return true;
}

function getInventoryPreview(structureId: string, dimension: Dimension, structurePosition: { x: number; y: number; z: number }): string {
  const storagEntityId = world.getDynamicProperty("inventory_tools:storage_entity") as string;
  world.structureManager.place(structureId, dimension, structurePosition);
  const storageEntity = (dimension as Dimension).getEntities({ type: storagEntityId || "storage:entity", location: structurePosition })[0];
  if (!storageEntity) return "No items";

  const storageInventoryComp = storageEntity.getComponent(EntityComponentTypes.Inventory) as EntityInventoryComponent;
  if (!storageInventoryComp || !storageInventoryComp.container) return "No items";

  let previewItems: string[] = [];
  for (let slot = 0; slot < storageInventoryComp.container.size && previewItems.length < 3; slot++) {
    const item = storageInventoryComp.container.getItem(slot);
    if (item) {
      previewItems.push(`x${item.amount} ${item.typeId}`);
    }
  }

  storageEntity.remove();
  return previewItems.length > 0 ? previewItems.join(', ') : "No items";
}

function config(viewer: Player) {
  const menu = new ui.ModalFormData();
  menu.title("Inventory Tools - Config Menu");

  const saveInRam = world.getDynamicProperty("inventory_tools:save_in_ram") as boolean;
  menu.dropdown("\nSave inventory structures in:", [
    "World",
    "Memory (RAM)"
  ], saveInRam !== true ? 0 : 1);

  const keepItems = world.getDynamicProperty("inventory_tools:keep_items") as boolean;
  menu.toggle("Automatically remove items from inventory after save", keepItems !== true);

  const keepInven = world.getDynamicProperty("inventory_tools:keep_inventory") as boolean;
  menu.toggle("Automatically remove inventory after load", keepInven !== true);

  const storageEntityId = world.getDynamicProperty("inventory_tools:storage_entity") as string;
  menu.textField("\n§eOnly edit if you have a custom storage entity with at least 41 slots§r\n\nStorage Entity ID: \n", "", storageEntityId || "storage:entity");

  menu.show(viewer).then((result: ui.ModalFormResponse) => {
    if (result.canceled || !result.formValues) return;

    const saveMode = result.formValues[0] as number;
    const removeItemsAfterSave = result.formValues[1] as boolean;
    const removeInventoryAfterLoad = result.formValues[2] as boolean;
    const storageEntityId = result.formValues[3] as string;

    if (saveMode === 1) {
      world.setDynamicProperty("inventory_tools:save_in_ram", true);
    } else {
      world.setDynamicProperty("inventory_tools:save_in_ram", undefined);
    }

    if (removeItemsAfterSave) {
      world.setDynamicProperty("inventory_tools:keep_items", undefined)
    } else {
      world.setDynamicProperty("inventory_tools:keep_items", true)
    }

    if (removeInventoryAfterLoad) {
      world.setDynamicProperty("inventory_tools:keep_inventory", undefined)
    } else {
      world.setDynamicProperty("inventory_tools:keep_inventory", true)
    }

    if (storageEntityId && storageEntityId !== "storage:entity") {
      world.setDynamicProperty("inventory_tools:storage_entity", storageEntityId)
    } else {
      world.setDynamicProperty("inventory_tools:storage_entity", undefined)
    }
  });
}