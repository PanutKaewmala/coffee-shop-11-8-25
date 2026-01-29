// src/lib/deductStock.ts
import "server-only";

import { getSupabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/lib/database.types";

type DeductRow =
    Database["public"]["Functions"]["deduct_stock_atomic"]["Returns"][number];

type DeductInput = {
    order_id: string;
    note: string;
    items: { variant_id: string; qty: number }[];
};

type DeductResult =
    | { success: true; error: ""; items: DeductRow[] }
    | { success: false; error: string; items: DeductRow[] };

export async function deductStock(input: DeductInput): Promise<DeductResult> {
    const supabase = await getSupabaseServer(); // ✅ ต้อง await

    const FN = "deduct_stock_atomic" as const;

    const { data, error } = await supabase.rpc(FN, {
        p_order_id: input.order_id,
        p_note: input.note ?? "",
        p_items: input.items,
    });

    if (error) return { success: false, error: error.message, items: [] };

    return { success: true, error: "", items: (data ?? []) as DeductRow[] };
}
