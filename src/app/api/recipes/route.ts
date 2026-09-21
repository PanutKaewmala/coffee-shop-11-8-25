// app/api/recipes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { GET as getVariantRecipes, POST as postVariantRecipe, PUT as putVariantRecipe, DELETE as deleteVariantRecipe } from "./items/route";

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
    if (getSource(req) === "variant") {
        const response = await getVariantRecipes(req);
        if (!response.ok) return response;
        const body = await response.json();
        return NextResponse.json(body.items ?? (body.item ? [body.item] : []));
    }
    const supabase = await getSupabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }

    const { data: member, error: mErr } = await supabase
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!member) return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });


    try {

        const menu_id = req.nextUrl.searchParams.get("menu_id");

        let q = supabase
            .from("recipes")
            .select("*")
            .eq("shop_id", currentShopId)
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
    if (getSource(req) === "variant") return postVariantRecipe(req);
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }

    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!member || member.role !== "owner") {
        return NextResponse.json({ error: "Owner only" }, { status: 403 });
    }


    try {
        const bodyUnknown: unknown = await req.json().catch(() => null);
        if (!bodyUnknown || typeof bodyUnknown !== "object") {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const body = bodyUnknown as Record<string, unknown>;
        const ingredient_id = body.ingredient_id;
        const menu_id = body.menu_id;
        const qty = parseQty(body.quantity);

        if (!isNonEmptyString(ingredient_id) || qty === null) {
            return NextResponse.json(
                { error: "ingredient_id(string) and quantity(number>0) are required" },
                { status: 400 }
            );
        }

        // source === "menu"
        if (!isNonEmptyString(menu_id)) {
            return NextResponse.json(
                { error: "menu_id is required (or use ?source=variant + variant_id)" },
                { status: 400 }
            );
        }

        // verify menu belongs to current shop
        const { data: menuRow, error: menuErr } = await supabase
            .from("menu")
            .select("id")
            .eq("id", menu_id.trim())
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (menuErr) return NextResponse.json({ error: menuErr.message }, { status: 500 });
        if (!menuRow) {
            return NextResponse.json({ error: "Menu not found in current shop" }, { status: 404 });
        }

        // verify ingredient belongs to current shop
        const { data: ingredientRow2, error: ingErr2 } = await supabase
            .from("ingredients")
            .select("id")
            .eq("id", ingredient_id.trim())
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (ingErr2) return NextResponse.json({ error: ingErr2.message }, { status: 500 });
        if (!ingredientRow2) {
            return NextResponse.json({ error: "Ingredient not found in current shop" }, { status: 404 });
        }

        const { data, error } = await supabase
            .from("recipes")
            .insert([
                {
                    menu_id: menu_id.trim(),
                    ingredient_id: ingredient_id.trim(),
                    quantity: qty,
                    shop_id: currentShopId,
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
    if (getSource(req) === "variant") return putVariantRecipe(req);
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }

    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!member || member.role !== "owner") {
        return NextResponse.json({ error: "Owner only" }, { status: 403 });
    }


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
            const ingId = body.ingredient_id.trim();

            const { data: ingRow, error: ingErr } = await supabase
                .from("ingredients")
                .select("id")
                .eq("id", ingId)
                .eq("shop_id", currentShopId)
                .maybeSingle();

            if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 });
            if (!ingRow) {
                return NextResponse.json({ error: "Ingredient not found in current shop" }, { status: 404 });
            }

            updateData.ingredient_id = ingId;
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

        // source === "menu"
        if (body.menu_id !== undefined) {
            if (!isNonEmptyString(body.menu_id)) {
                return NextResponse.json({ error: "menu_id must be string" }, { status: 400 });
            }
            const mId = body.menu_id.trim();

            const { data: menuRow, error: menuErr } = await supabase
                .from("menu")
                .select("id")
                .eq("id", mId)
                .eq("shop_id", currentShopId)
                .maybeSingle();

            if (menuErr) return NextResponse.json({ error: menuErr.message }, { status: 500 });
            if (!menuRow) {
                return NextResponse.json({ error: "Menu not found in current shop" }, { status: 404 });
            }

            updateData.menu_id = mId;
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const { data: targetRecipe, error: targetErr } = await supabase
            .from("recipes")
            .select("id")
            .eq("id", id.trim())
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
        if (!targetRecipe) {
            return NextResponse.json({ error: "Recipe not found in current shop" }, { status: 404 });
        }

        const { data, error } = await supabase
            .from("recipes")
            .update(updateData)
            .eq("id", id.trim())
            .eq("shop_id", currentShopId)
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
    if (getSource(req) === "variant") return deleteVariantRecipe(req);
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }

    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!member || member.role !== "owner") {
        return NextResponse.json({ error: "Owner only" }, { status: 403 });
    }


    try {
        const id = req.nextUrl.searchParams.get("id");
        if (!isNonEmptyString(id)) {
            return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
        }

        const table = "recipes";

        const { data: targetRow, error: targetErr } = await supabase
            .from(table)
            .select("id")
            .eq("id", id.trim())
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
        if (!targetRow) {
            return NextResponse.json(
                { error: "Recipe not found in current shop" },
                { status: 404 }
            );
        }

        const { error } = await supabase
            .from(table)
            .delete()
            .eq("id", id.trim())
            .eq("shop_id", currentShopId);

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
