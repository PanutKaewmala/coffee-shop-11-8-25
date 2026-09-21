export type RecipeIngredientSnapshot = {
  recipe_item_id: string;
  ingredient_id: string | null;
  supply_item_id: string | null;
  name: string;
  unit: string;
  quantity_per_item: number;
  quantity: number;
};

export type RecipeSnapshot = {
  variant_id: string;
  branch_id: string;
  sweetness: string;
  recipe_hash: string;
  ingredients: RecipeIngredientSnapshot[];
};

export type InventorySnapshot = {
  version: 1;
  actor_id: string;
  branch_id: string;
  branch_name: string;
  ingredients: Array<{
    ingredient_id: string | null;
    supply_item_id: string | null;
    name: string;
    unit: string;
    quantity: number;
    before_stock: number;
    after_stock: number;
    allocations: Array<{
      location_id: string;
      ingredient_lot_id: string;
      quantity: number;
      before_stock: number;
      after_stock: number;
    }>;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRecipeSnapshot(value: unknown): RecipeSnapshot | null {
  if (!isRecord(value) || typeof value.recipe_hash !== "string" ||
      typeof value.variant_id !== "string" || typeof value.branch_id !== "string" ||
      typeof value.sweetness !== "string" || !Array.isArray(value.ingredients)) return null;
  if (!value.ingredients.every((item) => isRecord(item) && typeof item.recipe_item_id === "string" &&
      typeof item.name === "string" && typeof item.unit === "string" &&
      typeof item.quantity_per_item === "number" && Number.isFinite(item.quantity_per_item) &&
      typeof item.quantity === "number" && Number.isFinite(item.quantity))) return null;
  return value as RecipeSnapshot;
}

export function readInventorySnapshot(value: unknown): InventorySnapshot | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.branch_id !== "string" ||
      typeof value.branch_name !== "string" || typeof value.actor_id !== "string" ||
      !Array.isArray(value.ingredients)) return null;
  if (!value.ingredients.every((item) => isRecord(item) && typeof item.name === "string" &&
      typeof item.unit === "string" && typeof item.quantity === "number" && Number.isFinite(item.quantity) &&
      typeof item.before_stock === "number" && Number.isFinite(item.before_stock) &&
      typeof item.after_stock === "number" && Number.isFinite(item.after_stock) && Array.isArray(item.allocations))) return null;
  return value as InventorySnapshot;
}
