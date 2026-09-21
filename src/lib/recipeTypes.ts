export type RecipeSupplyItem = {
    id: string;
    name: string;
    base_unit: string;
    quantity_step: number;
    available_stock: number;
    is_lot_tracked: boolean;
};

export type RecipeItemView = {
    id: string;
    variant_id: string;
    branch_id: string | null;
    shop_id: string;
    menu_id: string | null;
    menu_name: string | null;
    serve_type_id: string | null;
    serve_type_name: string | null;
    size: string | null;
    ingredient_id: string | null;
    supply_item_id: string | null;
    source_type: "ingredient" | "supply_item";
    source_id: string;
    ingredient_name: string | null;
    unit: string | null;
    quantity_step: number | null;
    quantity: number;
    created_at: string;
};

export type RecipeDraft = {
    id?: string;
    branch_id?: string | null;
    variant_id: string;
    ingredient_id: string;
    source_type: "ingredient" | "supply_item";
    quantity: number;
    ingredient_name?: string | null;
    ingredient_unit?: string | null;
    quantity_step?: number | null;
};

export function parseRecipeSupplies(raw: unknown): RecipeSupplyItem[] {
    if (!Array.isArray(raw)) throw new Error("Invalid supply inventory response");
    return raw.map((value) => {
        if (!value || typeof value !== "object") throw new Error("Invalid supply inventory item");
        const row = value as Record<string, unknown>;
        const step = typeof row.quantity_step === "number" || typeof row.quantity_step === "string" && row.quantity_step.trim() !== ""
            ? Number(row.quantity_step) : NaN;
        const stock = typeof row.available_stock === "number" || typeof row.available_stock === "string" && row.available_stock.trim() !== ""
            ? Number(row.available_stock) : NaN;
        if (typeof row.id !== "string" || typeof row.name !== "string" ||
            typeof row.base_unit !== "string" || !Number.isFinite(step) || step <= 0 ||
            !Number.isFinite(stock) || typeof row.is_lot_tracked !== "boolean") {
            throw new Error("Invalid supply inventory item");
        }
        return {
            id: row.id, name: row.name, base_unit: row.base_unit,
            quantity_step: step, available_stock: stock, is_lot_tracked: row.is_lot_tracked,
        };
    });
}

export function isRecipeQuantityStepValid(quantity: number, step: number): boolean {
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(step) || step <= 0) return false;
    const units = quantity / step;
    return Math.abs(units - Math.round(units)) <= 1e-8;
}
