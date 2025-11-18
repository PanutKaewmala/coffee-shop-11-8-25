// app/api/ingredients/adjust/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
    try {
        const supabase = getSupabaseServer();
        const { ingredient_id, diff, type, note } = await req.json();

        // ---------------------------------------------------------
        // Validate basic fields
        // ---------------------------------------------------------
        if (!ingredient_id || typeof diff !== "number") {
            return NextResponse.json(
                { error: "Invalid ingredient_id or diff" },
                { status: 400 }
            );
        }

        if (!["increase", "decrease", "set"].includes(type)) {
            return NextResponse.json(
                { error: "Invalid type. Use increase | decrease | set" },
                { status: 400 }
            );
        }

        // ---------------------------------------------------------
        // Load ingredient
        // ---------------------------------------------------------
        const { data: ing, error: ingErr } = await supabase
            .from("ingredients")
            .select("*")
            .eq("id", ingredient_id)
            .single();

        if (ingErr || !ing) {
            return NextResponse.json(
                { error: ingErr?.message ?? "Ingredient not found" },
                { status: 404 }
            );
        }

        const currentStock = Number(ing.stock);

        // ---------------------------------------------------------
        // Compute newStock and amountRecorded
        // ---------------------------------------------------------
        let newStock = currentStock + diff;
        let amountRecorded = Math.abs(diff); // default

        if (type === "set") {
            // diff = newStock - currentStock
            newStock = diff;

            // สำหรับ “ตั้งค่าใหม่” ควรเก็บความต่างจริง
            amountRecorded = Math.abs(newStock - currentStock);
        }

        if (newStock < 0) {
            return NextResponse.json(
                {
                    error: `สต๊อกไม่พอ (มี ${currentStock}, ต้องการลด ${Math.abs(
                        diff
                    )})`,
                },
                { status: 400 }
            );
        }

        // ---------------------------------------------------------
        // Update stock
        // ---------------------------------------------------------
        const { error: updateErr } = await supabase
            .from("ingredients")
            .update({ stock: newStock })
            .eq("id", ingredient_id);

        if (updateErr) {
            return NextResponse.json(
                { error: updateErr.message },
                { status: 500 }
            );
        }

        // ---------------------------------------------------------
        // Insert log (with before/after)
        // ---------------------------------------------------------
        const { error: logErr } = await supabase.from("stock_logs").insert({
            ingredient_id,
            order_id: null,
            amount: amountRecorded,
            type,
            note: note || null,

            before_stock: currentStock,
            after_stock: newStock,
        });

        if (logErr) {
            return NextResponse.json(
                { error: logErr.message },
                { status: 500 }
            );
        }

        // ---------------------------------------------------------
        return NextResponse.json({
            success: true,
            ingredient_id,
            old_stock: currentStock,
            new_stock: newStock,
            diff,
            type,
            amount_recorded: amountRecorded,
        });
    } catch (err) {
        console.error("Adjust Error:", err);
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        );
    }
}
