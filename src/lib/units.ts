export const BASE_UNITS = ["ml", "g", "piece"] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

export const BASE_UNIT_LABEL: Record<BaseUnit, string> = {
    ml: "มล.",
    g: "กรัม",
    piece: "ชิ้น",
};

export const INGREDIENT_TYPES = ["liquid", "powder", "piece"] as const;
export type IngredientType = (typeof INGREDIENT_TYPES)[number];

export const TYPE_LABEL: Record<IngredientType, string> = {
    liquid: "ของเหลว",
    powder: "ผง/เมล็ด",
    piece: "ของชิ้น",
};

export const TYPE_TO_BASE: Record<IngredientType, BaseUnit> = {
    liquid: "ml",
    powder: "g",
    piece: "piece",
};
