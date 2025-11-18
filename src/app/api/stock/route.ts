// app/api/stock/route.ts
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";

/**
 * GET: ดึงประวัติ stock_logs ทั้งหมด
 * พร้อม join ingredients เพื่อแสดงชื่อวัตถุดิบ
 */
export async function GET() {
    try {
        const supabase = getSupabaseServer();

        const { data, error } = await supabase
            .from("stock_logs")
            .select(`
        id,
        ingredient_id,
        amount,
        type,
        note,
        order_id,
        created_at,
        before_stock,
        after_stock,
        ingredients ( id, name, unit )
    `)
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json(data || []);
    } catch (err) {
        console.error("GET /api/stock error:", err);
        return NextResponse.json(
            { error: "Server error" },
            { status: 500 }
        );
    }
}
