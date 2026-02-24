// app/api/recipes/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
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

type ResolvedContext =
    | { ok: false; response: NextResponse }
    | {
        ok: true;
        admin: ReturnType<typeof getSupabaseAdmin>;
        currentShopId: string;
        currentBranchId: string;
    };

async function resolveContext(ownerOnly = false): Promise<ResolvedContext> {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return { ok: false, response: NextResponse.json({ error: authErr.message }, { status: 500 }) };
    if (!auth.user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return {
            ok: false,
            response: NextResponse.json({ error: "No current shop selected" }, { status: 409 }),
        };
    }
    if (!currentBranchId) {
        return {
            ok: false,
            response: NextResponse.json({ error: "No current branch selected" }, { status: 409 }),
        };
    }

    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return { ok: false, response: NextResponse.json({ error: mErr.message }, { status: 500 }) };
    if (!member) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Not a member of current shop" }, { status: 403 }),
        };
    }
    if (ownerOnly && member.role !== "owner") {
        return { ok: false, response: NextResponse.json({ error: "Owner only" }, { status: 403 }) };
    }

    return { ok: true, admin, currentShopId, currentBranchId };
}

async function getBranchIngredientIds(params: {
    admin: ReturnType<typeof getSupabaseAdmin>;
    currentShopId: string;
    currentBranchId: string;
}): Promise<{ ok: true; ids: UUID[] } | { ok: false; response: NextResponse }> {
    const { admin, currentShopId, currentBranchId } = params;

    const { data, error } = await admin
        .from("ingredients")
        .select("id")
        .eq("shop_id", currentShopId)
        .filter("branch_id", "eq", currentBranchId)
        .returns<Array<{ id: UUID }>>();

    if (error) {
        return {
            ok: false,
            response: NextResponse.json({ error: error.message }, { status: 500 }),
        };
    }

    return {
        ok: true,
        ids: (data ?? []).map((x) => x.id),
    };
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
        const ctx = await resolveContext(false);
        if (!ctx.ok) return ctx.response;
        const { admin, currentShopId, currentBranchId } = ctx;

        const branchIng = await getBranchIngredientIds({
            admin,
            currentShopId,
            currentBranchId,
        });
        if (!branchIng.ok) return branchIng.response;
        const branchIngredientIds = branchIng.ids;
        const branchIngredientSet = new Set(branchIngredientIds);

        const id = req.nextUrl.searchParams.get("id");
        const variant_id = req.nextUrl.searchParams.get("variant_id");
        const menu_id = req.nextUrl.searchParams.get("menu_id");

        // ---- single by id
        if (id) {
            const { data, error } = await admin
                .from("recipe_items")
                .select(SELECT_JOIN)
                .eq("id", id)
                .eq("shop_id", currentShopId)
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
            if (!branchIngredientSet.has(data.ingredient_id)) {
                return NextResponse.json({ error: "Recipe item not found" }, { status: 404 });
            }

            return NextResponse.json({ item: toView(data) });
        }

        // ---- filter menu_id safely (get variant ids first)
        let variantIdsForMenu: UUID[] | null = null;

        if (menu_id) {
            const { data: variants, error: vErr } = await admin
                .from("menu_variants")
                .select("id")
                .eq("menu_id", menu_id)
                .eq("shop_id", currentShopId)
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
        if (branchIngredientIds.length === 0) {
            return NextResponse.json({ items: [] });
        }

        let q = admin
            .from("recipe_items")
            .select(SELECT_JOIN)
            .eq("shop_id", currentShopId)
            .in("ingredient_id", branchIngredientIds)
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
        const ctx = await resolveContext(true);
        if (!ctx.ok) return ctx.response;
        const { admin, currentShopId, currentBranchId } = ctx;

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

        const { data: variantRow, error: variantErr } = await admin
            .from("menu_variants")
            .select("id")
            .eq("id", variant_id)
            .eq("shop_id", currentShopId)
            .maybeSingle()
            .overrideTypes<{ id: UUID } | null, { merge: false }>();

        if (variantErr) {
            return NextResponse.json({ error: variantErr.message }, { status: 500 });
        }
        if (!variantRow?.id) {
            return NextResponse.json({ error: "Variant not found in current shop" }, { status: 404 });
        }

        const { data: ingRow, error: ingErr } = await admin
            .from("ingredients")
            .select("id")
            .eq("id", ingredient_id)
            .eq("shop_id", currentShopId)
            .filter("branch_id", "eq", currentBranchId)
            .maybeSingle()
            .overrideTypes<{ id: UUID } | null, { merge: false }>();

        if (ingErr) {
            return NextResponse.json({ error: ingErr.message }, { status: 500 });
        }
        if (!ingRow?.id) {
            return NextResponse.json({ error: "Ingredient not found in current shop" }, { status: 404 });
        }

        // 1) Try INSERT first (fast path)
        const ins = await admin
            .from("recipe_items")
            .insert([{ variant_id, ingredient_id, quantity: qty.value, shop_id: currentShopId }])
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
            const upd = await admin
                .from("recipe_items")
                .update({ quantity: qty.value })
                .eq("variant_id", variant_id)
                .eq("ingredient_id", ingredient_id)
                .eq("shop_id", currentShopId)
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
        const ctx = await resolveContext(true);
        if (!ctx.ok) return ctx.response;
        const { admin, currentShopId, currentBranchId } = ctx;

        const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;

        const id = toStringOrNull(body?.id);
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

        const branchIng = await getBranchIngredientIds({
            admin,
            currentShopId,
            currentBranchId,
        });
        if (!branchIng.ok) return branchIng.response;
        const branchIngredientSet = new Set(branchIng.ids);

        const { data: cur, error: curErr } = await admin
            .from("recipe_items")
            .select("variant_id,ingredient_id")
            .eq("id", id)
            .eq("shop_id", currentShopId)
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
        if (!branchIngredientSet.has(cur.ingredient_id)) {
            return NextResponse.json({ error: "Recipe item not found" }, { status: 404 });
        }

        const update: Partial<Pick<RecipeItemRow, "variant_id" | "ingredient_id" | "quantity">> = {};

        const variant_id = toStringOrNull(body?.variant_id);
        const ingredient_id = toStringOrNull(body?.ingredient_id);

        if (variant_id) update.variant_id = variant_id;
        if (ingredient_id) update.ingredient_id = ingredient_id;

        if (variant_id) {
            const { data: variantRow, error: variantErr } = await admin
                .from("menu_variants")
                .select("id")
                .eq("id", variant_id)
                .eq("shop_id", currentShopId)
                .maybeSingle()
                .overrideTypes<{ id: UUID } | null, { merge: false }>();

            if (variantErr) {
                return NextResponse.json({ error: variantErr.message }, { status: 500 });
            }
            if (!variantRow?.id) {
                return NextResponse.json({ error: "Variant not found in current shop" }, { status: 404 });
            }
        }

        if (ingredient_id) {
            const { data: ingRow, error: ingErr } = await admin
                .from("ingredients")
                .select("id")
                .eq("id", ingredient_id)
                .eq("shop_id", currentShopId)
                .filter("branch_id", "eq", currentBranchId)
                .maybeSingle()
                .overrideTypes<{ id: UUID } | null, { merge: false }>();

            if (ingErr) {
                return NextResponse.json({ error: ingErr.message }, { status: 500 });
            }
            if (!ingRow?.id) {
                return NextResponse.json({ error: "Ingredient not found in current shop" }, { status: 404 });
            }
        }

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
            const finalVariantId = update.variant_id ?? cur.variant_id;
            const finalIngredientId = update.ingredient_id ?? cur.ingredient_id;

            // dup check: query as list then pick first (avoid maybeSingle typings)
            const { data: dupList, error: dupErr } = await admin
                .from("recipe_items")
                .select("id")
                .eq("variant_id", finalVariantId)
                .eq("ingredient_id", finalIngredientId)
                .eq("shop_id", currentShopId)
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

        const { data, error } = await admin
            .from("recipe_items")
            .update(update)
            .eq("id", id)
            .eq("shop_id", currentShopId)
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
        const ctx = await resolveContext(true);
        if (!ctx.ok) return ctx.response;
        const { admin, currentShopId, currentBranchId } = ctx;
        const id = req.nextUrl.searchParams.get("id");

        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

        const branchIng = await getBranchIngredientIds({
            admin,
            currentShopId,
            currentBranchId,
        });
        if (!branchIng.ok) return branchIng.response;
        const branchIngredientSet = new Set(branchIng.ids);

        const { data: cur, error: curErr } = await admin
            .from("recipe_items")
            .select("id,ingredient_id")
            .eq("id", id)
            .eq("shop_id", currentShopId)
            .maybeSingle()
            .overrideTypes<{ id: UUID; ingredient_id: UUID } | null, { merge: false }>();

        if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 });
        if (!cur || !branchIngredientSet.has(cur.ingredient_id)) {
            return NextResponse.json({ error: "Recipe item not found" }, { status: 404 });
        }

        const { data: deleted, error } = await admin
            .from("recipe_items")
            .delete()
            .eq("id", id)
            .eq("shop_id", currentShopId)
            .select("id")
            .maybeSingle();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        if (!deleted?.id) {
            return NextResponse.json({ error: "Recipe item not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
