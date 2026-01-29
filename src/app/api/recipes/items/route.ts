// app/api/recipes/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/* =========================================================
   Types (no any)
========================================================= */
type UUID = string;

type RecipeItemRow = {
    id: UUID;
    variant_id: UUID;
    ingredient_id: UUID;
    quantity: number; // DB numeric อาจวิ่งมาเป็น string ได้ แต่เราจะแปลงใน toView
    created_at: string;
};

type VariantJoin = {
    id: UUID;
    menu_id: UUID;
    serve_type_id: UUID | null;
    size: string | null;
    price_override: number | null;

    menu?: { id: UUID; name: string } | null;
    serve_type?: { id: UUID; name: string } | null;
};

type IngredientJoin = {
    id: UUID;
    name: string;
    unit: string | null;
};

type RecipeItemJoinRow = RecipeItemRow & {
    variant?: VariantJoin | null;
    ingredient?: IngredientJoin | null;
};

export type RecipeItemView = {
    id: UUID;
    variant_id: UUID;

    menu_id: UUID | null;
    menu_name: string | null;
    serve_type_id: UUID | null;
    serve_type_name: string | null;
    size: string | null;

    ingredient_id: UUID;
    ingredient_name: string | null;
    unit: string | null;

    quantity: number;
    created_at: string;
};

/* =========================================================
   Strong DB-derived helper types (fix "never")
========================================================= */
type RecipeItemsRowDB = Database["public"]["Tables"]["recipe_items"]["Row"];
type RecipeItemPair = Pick<RecipeItemsRowDB, "variant_id" | "ingredient_id">;
type RecipeItemIdOnly = Pick<RecipeItemsRowDB, "id">;

/* =========================================================
   Utils
========================================================= */
function toStringOrNull(v: unknown): string | null {
    if (typeof v === "string") {
        const s = v.trim();
        return s ? s : null;
    }
    return null;
}

function parsePositiveNumber(
    v: unknown
): { ok: true; value: number } | { ok: false } {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n) || n <= 0) return { ok: false };
    return { ok: true, value: n };
}

function toView(row: RecipeItemJoinRow): RecipeItemView {
    return {
        id: row.id,
        variant_id: row.variant_id,

        menu_id: row.variant?.menu_id ?? null,
        menu_name: row.variant?.menu?.name ?? null,

        serve_type_id: row.variant?.serve_type?.id ?? row.variant?.serve_type_id ?? null,
        serve_type_name: row.variant?.serve_type?.name ?? null,

        size: row.variant?.size ?? null,

        ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredient?.name ?? null,
        unit: row.ingredient?.unit ?? null,

        quantity: Number(row.quantity ?? 0),
        created_at: row.created_at,
    };
}

/**
 * Supabase single-row "not found" error code
 * - When using .single() and row not found, PostgREST returns PGRST116
 */
function isNotFoundSingle(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" && code === "PGRST116";
}

/**
 * Postgres unique violation error code
 * - When insert hits unique constraint, PostgREST returns 23505
 */
function isUniqueViolation(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" && code === "23505";
}

const SELECT_JOIN = `
  id,
  variant_id,
  ingredient_id,
  quantity,
  created_at,
  variant:menu_variants (
    id,
    menu_id,
    serve_type_id,
    size,
    price_override,
    menu:menu ( id, name ),
    serve_type:menu_serve_types ( id, name )
  ),
  ingredient:ingredients ( id, name, unit )
`;

/* =========================================================
   GET /api/recipes/items
   - id=...           -> single
   - variant_id=...   -> filter
   - menu_id=...      -> filter via variants lookup (safe)
========================================================= */
export async function GET(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();

        const id = req.nextUrl.searchParams.get("id");
        const variant_id = req.nextUrl.searchParams.get("variant_id");
        const menu_id = req.nextUrl.searchParams.get("menu_id");

        // ---- single by id
        if (id) {
            const { data, error } = await supabase
                .from("recipe_items")
                .select(SELECT_JOIN)
                .eq("id", id)
                .limit(1)
                .single()
                .overrideTypes<RecipeItemJoinRow, { merge: false }>();

            if (error) {
                const status = isNotFoundSingle(error) ? 404 : 500;
                return NextResponse.json(
                    { error: error.message ?? "Recipe item not found" },
                    { status }
                );
            }

            return NextResponse.json({ item: toView(data) });
        }

        // ---- filter menu_id safely (get variant ids first)
        let variantIdsForMenu: UUID[] | null = null;

        if (menu_id) {
            const { data: variants, error: vErr } = await supabase
                .from("menu_variants")
                .select("id")
                .eq("menu_id", menu_id)
                .overrideTypes<Array<{ id: UUID }>, { merge: false }>();

            if (vErr) {
                return NextResponse.json({ error: vErr.message }, { status: 500 });
            }

            variantIdsForMenu = (variants ?? [])
                .map((v) => (typeof v.id === "string" ? v.id : ""))
                .filter(Boolean);

            if (variantIdsForMenu.length === 0) {
                return NextResponse.json({ items: [] });
            }
        }

        // ---- list
        let q = supabase
            .from("recipe_items")
            .select(SELECT_JOIN)
            .order("created_at", { ascending: false });

        if (variant_id) q = q.eq("variant_id", variant_id);
        if (variantIdsForMenu) q = q.in("variant_id", variantIdsForMenu);

        const { data, error } = await q.overrideTypes<RecipeItemJoinRow[], { merge: false }>();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ items: (data ?? []).map(toView) });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================================================
   POST /api/recipes/items
   body: { variant_id, ingredient_id, quantity }
   - upsert behavior:
     - try INSERT
     - if unique violation (variant_id + ingredient_id) -> UPDATE quantity (replace policy)
   - return RecipeItemView + mode: "insert" | "update"
========================================================= */
export async function POST(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

        const variant_id = toStringOrNull(body?.variant_id);
        const ingredient_id = toStringOrNull(body?.ingredient_id);
        const qty = parsePositiveNumber(body?.quantity);

        if (!variant_id || !ingredient_id || !qty.ok) {
            return NextResponse.json(
                { error: "variant_id, ingredient_id, quantity (> 0) are required" },
                { status: 400 }
            );
        }

        // 1) Try INSERT first (fast path)
        const ins = await supabase
            .from("recipe_items")
            .insert([{ variant_id, ingredient_id, quantity: qty.value }])
            .select(SELECT_JOIN)
            .limit(1)
            .single()
            .overrideTypes<RecipeItemJoinRow, { merge: false }>();

        if (!ins.error && ins.data) {
            return NextResponse.json(
                { item: toView(ins.data), mode: "insert" as const },
                { status: 201 }
            );
        }

        // 2) If duplicate (unique violation) -> UPDATE (replace policy)
        if (isUniqueViolation(ins.error)) {
            const upd = await supabase
                .from("recipe_items")
                .update({ quantity: qty.value })
                .eq("variant_id", variant_id)
                .eq("ingredient_id", ingredient_id)
                .select(SELECT_JOIN)
                .limit(1)
                .single()
                .overrideTypes<RecipeItemJoinRow, { merge: false }>();

            if (upd.error || !upd.data) {
                const status = isNotFoundSingle(upd.error) ? 404 : 500;
                return NextResponse.json(
                    { error: upd.error?.message ?? "Failed to update recipe item" },
                    { status }
                );
            }

            return NextResponse.json(
                { item: toView(upd.data), mode: "update" as const },
                { status: 200 }
            );
        }

        // 3) Other errors
        return NextResponse.json(
            { error: ins.error?.message ?? "Failed to create recipe item" },
            { status: 500 }
        );
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================================================
   PUT /api/recipes/items
   body: { id, variant_id?, ingredient_id?, quantity? }
   - if quantity is provided but invalid -> 400
   - prevent duplicate pair (variant_id + ingredient_id)
   - return RecipeItemView
========================================================= */
export async function PUT(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

        const id = toStringOrNull(body?.id);
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

        const update: Partial<Pick<RecipeItemRow, "variant_id" | "ingredient_id" | "quantity">> = {};

        const variant_id = toStringOrNull(body?.variant_id);
        const ingredient_id = toStringOrNull(body?.ingredient_id);

        if (variant_id) update.variant_id = variant_id;
        if (ingredient_id) update.ingredient_id = ingredient_id;

        // quantity: if present -> must be valid (>0)
        const hasQuantity = Object.prototype.hasOwnProperty.call(body ?? {}, "quantity");
        if (hasQuantity) {
            const qty = parsePositiveNumber(body?.quantity);
            if (!qty.ok) {
                return NextResponse.json({ error: "quantity must be > 0" }, { status: 400 });
            }
            update.quantity = qty.value;
        }

        if (Object.keys(update).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        // If they change pair variant_id + ingredient_id, prevent duplicates
        const willChangeVariant = typeof update.variant_id === "string";
        const willChangeIngredient = typeof update.ingredient_id === "string";

        if (willChangeVariant || willChangeIngredient) {
            // fetch current row to know final pair
            const { data: cur, error: curErr } = await supabase
                .from("recipe_items")
                .select("variant_id,ingredient_id")
                .eq("id", id)
                .limit(1)
                .single()
                .overrideTypes<RecipeItemPair, { merge: false }>();

            if (curErr) {
                const status = isNotFoundSingle(curErr) ? 404 : 500;
                return NextResponse.json(
                    { error: curErr.message ?? "Recipe item not found" },
                    { status }
                );
            }

            const finalVariantId = update.variant_id ?? cur.variant_id;
            const finalIngredientId = update.ingredient_id ?? cur.ingredient_id;

            // dup check: query as list then pick first (avoid maybeSingle typings)
            const { data: dupList, error: dupErr } = await supabase
                .from("recipe_items")
                .select("id")
                .eq("variant_id", finalVariantId)
                .eq("ingredient_id", finalIngredientId)
                .neq("id", id)
                .limit(1)
                .overrideTypes<RecipeItemIdOnly[], { merge: false }>();

            if (dupErr) {
                return NextResponse.json({ error: dupErr.message }, { status: 500 });
            }

            if ((dupList ?? [])[0]?.id) {
                return NextResponse.json(
                    { error: "Duplicate recipe item (same variant + ingredient already exists)." },
                    { status: 409 }
                );
            }
        }

        const { data, error } = await supabase
            .from("recipe_items")
            .update(update)
            .eq("id", id)
            .select(SELECT_JOIN)
            .limit(1)
            .single()
            .overrideTypes<RecipeItemJoinRow, { merge: false }>();

        if (error) {
            const status = isNotFoundSingle(error) ? 404 : 500;
            return NextResponse.json(
                { error: error.message ?? "Failed to update recipe item" },
                { status }
            );
        }

        return NextResponse.json({ item: toView(data) });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================================================
   DELETE /api/recipes/items?id=...
========================================================= */
export async function DELETE(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const id = req.nextUrl.searchParams.get("id");

        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

        const { error } = await supabase.from("recipe_items").delete().eq("id", id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
