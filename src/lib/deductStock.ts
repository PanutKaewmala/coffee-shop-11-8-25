// lib/deductStock.ts
import { getSupabaseServer } from "./supabaseClient";
import type {
    DeductStockInput,
    DeductResult,
} from "./types";

/**
 * ตัดสต๊อกตามสูตรแบบ multi-ingredient
 */
export async function deductStock(input: DeductStockInput) {
    const supabase = getSupabaseServer();
    const { order_id, items, note } = input;

    const results: DeductResult[] = [];

    for (const item of items) {
        const ingredientId = item.ingredient_id;

        // โหลด stock ปัจจุบัน
        const { data: ing, error: ingErr } = await supabase
            .from("ingredients")
            .select("*")
            .eq("id", ingredientId)
            .single();

        if (ingErr || !ing) {
            throw new Error(`Ingredient not found: ${ingredientId}`);
        }

        const before = Number(ing.stock);
        const deductAmount = item.quantity * item.amount; // ← ใช้อันนี้
        const after = before - deductAmount;

        if (after < 0) {
            throw new Error(
                `วัตถุดิบ "${ing.name}" ไม่พอ (ต้องใช้ ${deductAmount}, คงเหลือ ${before})`
            );
        }

        // อัปเดตสต๊อก
        const { error: upErr } = await supabase
            .from("ingredients")
            .update({ stock: after })
            .eq("id", ingredientId);

        if (upErr) {
            throw new Error(`Update failed: ${upErr.message}`);
        }

        // บันทึก log
        const { error: logErr } = await supabase.from("stock_logs").insert({
            ingredient_id: ingredientId,
            order_id,
            amount: deductAmount,
            type: "deduct",
            note: note ?? null,
            before_stock: before,
            after_stock: after,
        });

        if (logErr) {
            throw new Error(`Insert log failed: ${logErr.message}`);
        }

        results.push({
            ingredient_id: ingredientId,
            before_stock: before,
            deduct: deductAmount,
            after_stock: after,
        });
    }

    return {
        success: true,
        items: results,
    };
}
