// app/api/recipes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

type Source = "menu" | "variant";

function getSource(req: NextRequest): Source {
    const s = req.nextUrl.searchParams.get("source");
    return s === "variant" ? "variant" : "menu";
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === "string" && v.trim().length > 0;
}

function parseQty(quantity: unknown): number | null {
    const qty = typeof quantity === "number" ? quantity : Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return null;
    // กันหลุดแบบร้านจริง (กันพิมพ์ผิด 9999999)
    if (qty > 999999) return null;
    return qty;
}

function returnAsc() {
    return { ascending: true } as const;
}

/* ============================================================
   GET /api/recipes
   - default: recipes (menu-based)
   - ?source=variant : recipe_items (variant-based)
   Optional filters:
   - menu:    ?menu_id=...
   - variant: ?variant_id=...
============================================================ */
export async function GET(req: NextRequest) {
    const supabase = getSupabaseServer();
    const source = getSource(req);

    try {
        if (source === "variant") {
            const variant_id = req.nextUrl.searchParams.get("variant_id");
            const menu_id = req.nextUrl.searchParams.get("menu_id");

            // base query
            let q = supabase
                .from("recipe_items")
                .select("*")
                .order("variant_id", returnAsc());

            // filter by variant_id (direct)
            if (isNonEmptyString(variant_id)) {
                q = q.eq("variant_id", variant_id.trim());
            }

            // filter by menu_id (via menu_variants -> variant ids)
            if (isNonEmptyString(menu_id)) {
                const { data: vars, error: vErr } = await supabase
                    .from("menu_variants")
                    .select("id")
                    .eq("menu_id", menu_id.trim());

                if (vErr) {
                    console.error("GET /api/recipes?source=variant (load variants):", vErr);
                    return NextResponse.json({ error: vErr.message }, { status: 500 });
                }

                const ids = (vars ?? []).map((x) => x.id).filter(isNonEmptyString);
                if (ids.length === 0) return NextResponse.json([]);

                q = q.in("variant_id", ids);
            }

            const { data, error } = await q;
            if (error) {
                console.error("GET /api/recipes?source=variant:", error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json(data ?? []);
        }

        // source === "menu"
        const menu_id = req.nextUrl.searchParams.get("menu_id");

        let q = supabase
            .from("recipes")
            .select("*")
            .order("menu_id", returnAsc());

        if (isNonEmptyString(menu_id)) q = q.eq("menu_id", menu_id.trim());

        const { data, error } = await q;
        if (error) {
            console.error("GET /api/recipes:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data ?? []);
    } catch (err) {
        console.error("GET /api/recipes fatal:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

/* ============================================================
   POST /api/recipes
   - default inserts into recipes
   - ?source=variant UPSERT into recipe_items (REPLACE policy)
   Body:
     menu:    { menu_id, ingredient_id, quantity }
     variant: { variant_id, ingredient_id, quantity }
============================================================ */
export async function POST(req: NextRequest) {
    const supabase = getSupabaseServer();
    const source = getSource(req);

    try {
        const bodyUnknown: unknown = await req.json().catch(() => null);
        if (!bodyUnknown || typeof bodyUnknown !== "object") {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const body = bodyUnknown as Record<string, unknown>;
        const ingredient_id = body.ingredient_id;
        const menu_id = body.menu_id;
        const variant_id = body.variant_id;
        const qty = parseQty(body.quantity);

        if (!isNonEmptyString(ingredient_id) || qty === null) {
            return NextResponse.json(
                { error: "ingredient_id(string) and quantity(number>0) are required" },
                { status: 400 }
            );
        }

        if (source === "variant") {
            if (!isNonEmptyString(variant_id)) {
                return NextResponse.json(
                    { error: "variant_id is required for source=variant" },
                    { status: 400 }
                );
            }

            const vId = variant_id.trim();
            const ingId = ingredient_id.trim();

            // 1) เช็คก่อนว่ามีอยู่แล้วไหม เพื่อบอก mode ให้ UI
            const { data: existing, error: exErr } = await supabase
                .from("recipe_items")
                .select("id")
                .eq("variant_id", vId)
                .eq("ingredient_id", ingId)
                .maybeSingle();

            if (exErr) {
                console.error("POST /api/recipes?source=variant (precheck):", exErr);
                return NextResponse.json({ error: exErr.message }, { status: 500 });
            }

            // 2) UPSERT (Replace policy)
            // ต้องมี unique(variant_id, ingredient_id) แล้ว -> onConflict ใช้ได้
            const { data, error } = await supabase
                .from("recipe_items")
                .upsert(
                    [
                        {
                            variant_id: vId,
                            ingredient_id: ingId,
                            quantity: qty,
                        },
                    ],
                    { onConflict: "variant_id,ingredient_id" }
                )
                .select()
                .single();

            if (error) {
                console.error("POST /api/recipes?source=variant (upsert):", error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({
                mode: existing?.id ? "update" : "insert",
                item: data,
            });
        }

        // source === "menu"
        if (!isNonEmptyString(menu_id)) {
            return NextResponse.json(
                { error: "menu_id is required (or use ?source=variant + variant_id)" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("recipes")
            .insert([
                {
                    menu_id: menu_id.trim(),
                    ingredient_id: ingredient_id.trim(),
                    quantity: qty,
                },
            ])
            .select()
            .single();

        if (error) {
            console.error("POST /api/recipes:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ mode: "insert", item: data });
    } catch (err) {
        console.error("POST /api/recipes fatal:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

/* ============================================================
   PUT /api/recipes?id=...
   - default updates recipes
   - ?source=variant updates recipe_items
============================================================ */
export async function PUT(req: NextRequest) {
    const supabase = getSupabaseServer();
    const source = getSource(req);

    try {
        const id = req.nextUrl.searchParams.get("id");
        if (!isNonEmptyString(id)) {
            return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
        }

        const bodyUnknown: unknown = await req.json().catch(() => null);
        if (!bodyUnknown || typeof bodyUnknown !== "object") {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const body = bodyUnknown as Record<string, unknown>;
        const updateData: Record<string, unknown> = {};

        if (body.ingredient_id !== undefined) {
            if (!isNonEmptyString(body.ingredient_id)) {
                return NextResponse.json({ error: "ingredient_id must be string" }, { status: 400 });
            }
            updateData.ingredient_id = body.ingredient_id.trim();
        }

        if (body.quantity !== undefined) {
            const qty = parseQty(body.quantity);
            if (qty === null) {
                return NextResponse.json(
                    { error: "quantity must be a valid number > 0" },
                    { status: 400 }
                );
            }
            updateData.quantity = qty;
        }

        if (source === "variant") {
            // ไม่แนะนำให้เปลี่ยน variant_id ของแถวเดิม (มันคือ “ย้ายสูตร”)
            if (body.variant_id !== undefined) {
                if (!isNonEmptyString(body.variant_id)) {
                    return NextResponse.json({ error: "variant_id must be string" }, { status: 400 });
                }
                updateData.variant_id = body.variant_id.trim();
            }

            if (Object.keys(updateData).length === 0) {
                return NextResponse.json({ error: "No fields to update" }, { status: 400 });
            }

            const { data, error } = await supabase
                .from("recipe_items")
                .update(updateData)
                .eq("id", id.trim())
                .select()
                .single();

            if (error) {
                console.error("PUT /api/recipes?source=variant:", error);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ mode: "update", item: data });
        }

        // source === "menu"
        if (body.menu_id !== undefined) {
            if (!isNonEmptyString(body.menu_id)) {
                return NextResponse.json({ error: "menu_id must be string" }, { status: 400 });
            }
            updateData.menu_id = body.menu_id.trim();
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("recipes")
            .update(updateData)
            .eq("id", id.trim())
            .select()
            .single();

        if (error) {
            console.error("PUT /api/recipes:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ mode: "update", item: data });
    } catch (err) {
        console.error("PUT /api/recipes fatal:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

/* ============================================================
   DELETE /api/recipes?id=...
   - default deletes from recipes
   - ?source=variant deletes from recipe_items
============================================================ */
export async function DELETE(req: NextRequest) {
    const supabase = getSupabaseServer();
    const source = getSource(req);

    try {
        const id = req.nextUrl.searchParams.get("id");
        if (!isNonEmptyString(id)) {
            return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
        }

        const table = source === "variant" ? "recipe_items" : "recipes";
        const { error } = await supabase.from(table).delete().eq("id", id.trim());

        if (error) {
            console.error(`DELETE /api/recipes (table=${table}):`, error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("DELETE /api/recipes fatal:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
