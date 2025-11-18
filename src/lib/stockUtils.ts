// src/lib/stockUtils.ts
import { Recipe, Ingredient, StockLog } from "./types";

/**
 * คำนวณวัตถุดิบที่ต้องใช้ทั้งหมด
 * items = [{ menu_id, qty }]
 * recipes = rows จากตาราง recipes
 */
export function computeRequiredIngredients(
    items: { menu_id: string; qty: number }[],
    recipes: Recipe[]
) {
    const needed: Record<string, number> = {};

    const menuMap = recipes.reduce<Record<string, Recipe[]>>((acc, r) => {
        acc[r.menu_id] = acc[r.menu_id] || [];
        acc[r.menu_id].push(r);
        return acc;
    }, {});

    for (const item of items) {
        const rs = menuMap[item.menu_id] || [];
        for (const r of rs) {
            const perCup = Number(r.quantity) || 0;
            const total = perCup * item.qty;
            needed[r.ingredient_id] = (needed[r.ingredient_id] || 0) + total;
        }
    }

    return needed; // { ingredient_id: totalRequired }
}

/**
 * ตรวจวัตถุดิบว่าพอไหม ก่อนตัดจริง
 */
export function validateStockBeforeOrder(
    ingredients: Ingredient[],
    required: Record<string, number>
) {
    for (const ingId in required) {
        const need = required[ingId];
        const ing = ingredients.find((i) => i.id === ingId);
        if (!ing) {
            throw new Error(`Ingredient not found: ${ingId}`);
        }
        if (ing.stock < need) {
            throw new Error(`วัตถุดิบไม่พอ: ${ing.name} (ต้องการ ${need} ${ing.unit}, มี ${ing.stock})`);
        }
    }
}

/**
 * เตรียมข้อมูลสำหรับ:
 * - update ingredients (ลบออก)
 * - insert stock_logs
 */
export function buildStockUpdatePayload(
    required: Record<string, number>,
    orderId: string
) {
    const updatedIngredients: { id: string; newStock: number }[] = [];
    const stockLogs: Omit<StockLog, "id" | "created_at">[] = [];

    for (const ingId in required) {
        const amount = required[ingId];

        updatedIngredients.push({
            id: ingId,
            newStock: -amount, // ใช้ติดลบเพื่อให้ api ตัดออก
        });

        stockLogs.push({
            orderId,
            ingredientId: ingId,
            amount,
        });
    }

    return { updatedIngredients, stockLogs };
}
