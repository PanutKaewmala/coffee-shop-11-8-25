import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database } from "@/lib/database.types";
import { isRecipeQuantityStepValid, parseRecipeSupplies, type RecipeItemView, type RecipeSupplyItem } from "@/lib/recipeTypes";

export const dynamic = "force-dynamic";

type RecipeRow = Database["public"]["Tables"]["recipe_items"]["Row"];
type RecipeJoin = RecipeRow & {
    variant: {
        menu_id: string;
        serve_type_id: string | null;
        size: string | null;
        menu: { name: string } | null;
        serve_type: { id: string; name: string } | null;
    } | null;
    ingredient: { name: string; unit: string | null; base_unit: string | null } | null;
};
type Context = {
    supabase: Awaited<ReturnType<typeof getSupabaseServer>>;
    admin: ReturnType<typeof getSupabaseAdmin>;
    currentShopId: string;
    currentBranchId: string;
};
type Result<T> = { ok: true; value: T } | { ok: false; response: NextResponse };
type RecipeSource = { ingredient_id: string | null; supply_item_id: string | null };

function failure(message: string, status: number): NextResponse {
    return NextResponse.json({ error: message }, { status });
}

function nonempty(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function requestBody(req: NextRequest): Promise<Record<string, unknown> | null> {
    const value: unknown = await req.json().catch(() => null);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function positiveQuantity(value: unknown): number | null {
    if (typeof value !== "number" && typeof value !== "string") return null;
    const quantity = Number(value);
    return Number.isFinite(quantity) && quantity > 0 && quantity <= 999999 ? quantity : null;
}

function parseSource(body: Record<string, unknown>): RecipeSource | null {
    const ingredient_id = nonempty(body.ingredient_id);
    const supply_item_id = nonempty(body.supply_item_id);
    return Boolean(ingredient_id) !== Boolean(supply_item_id) ? { ingredient_id, supply_item_id } : null;
}

async function resolveContext(ownerOnly = false): Promise<Result<Context>> {
    const supabase = await getSupabaseServer();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth.user) return { ok: false, response: failure("Unauthorized", 401) };
    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    if (!currentShopId || !currentBranchId) {
        return { ok: false, response: failure("Select a shop and branch", 409) };
    }
    const admin = getSupabaseAdmin();
    const { data: member, error: memberError } = await admin.from("shop_members")
        .select("role").eq("shop_id", currentShopId).eq("user_id", auth.user.id).maybeSingle();
    if (memberError) return { ok: false, response: failure(memberError.message, 500) };
    if (!member || (ownerOnly && member.role !== "owner")) {
        return { ok: false, response: failure(ownerOnly ? "Owner only" : "Not a member of current shop", 403) };
    }
    const { data: branch, error: branchError } = await admin.from("branch")
        .select("id").eq("id", currentBranchId).eq("shop_id", currentShopId).maybeSingle();
    if (branchError) return { ok: false, response: failure(branchError.message, 500) };
    if (!branch) return { ok: false, response: failure("Branch not found in current shop", 403) };
    return { ok: true, value: { supabase, admin, currentShopId, currentBranchId } };
}

async function loadSupplies(ctx: Context): Promise<Result<RecipeSupplyItem[]>> {
    const { data, error } = await ctx.supabase.rpc("list_talvo_supply_items", {
        p_business_id: ctx.currentShopId,
        p_branch_id: ctx.currentBranchId,
    });
    if (error) return { ok: false, response: failure(error.message, error.code === "42501" ? 403 : 500) };
    return { ok: true, value: parseRecipeSupplies(data) };
}

function toView(row: RecipeJoin, supplies: RecipeSupplyItem[]): RecipeItemView {
    const supply = row.supply_item_id ? supplies.find((item) => item.id === row.supply_item_id) : null;
    return {
        id: row.id, variant_id: row.variant_id, branch_id: row.branch_id, shop_id: row.shop_id,
        menu_id: row.variant?.menu_id ?? null,
        menu_name: row.variant?.menu?.name ?? null,
        serve_type_id: row.variant?.serve_type?.id ?? row.variant?.serve_type_id ?? null,
        serve_type_name: row.variant?.serve_type?.name ?? null,
        size: row.variant?.size ?? null,
        ingredient_id: row.ingredient_id,
        supply_item_id: row.supply_item_id,
        source_type: row.supply_item_id ? "supply_item" : "ingredient",
        source_id: row.supply_item_id ?? row.ingredient_id ?? "",
        ingredient_name: supply?.name ?? row.ingredient?.name ?? null,
        unit: supply?.base_unit ?? row.ingredient?.base_unit ?? row.ingredient?.unit ?? null,
        quantity_step: supply?.quantity_step ?? null,
        quantity: Number(row.quantity), created_at: row.created_at,
    };
}

const SELECT_JOIN = `
    id, variant_id, branch_id, shop_id, ingredient_id, supply_item_id, quantity, created_at,
    variant:menu_variants (
        menu_id, serve_type_id, size,
        menu:menu (name), serve_type:menu_serve_types (id, name)
    ),
    ingredient:ingredients (name, unit, base_unit)
`;

function databaseFailure(error: { code?: string; message: string }): NextResponse {
    const status = error.code === "23505" ? 409 : error.code === "42501" ? 403 :
        ["23514", "23503", "22023", "22P02"].includes(error.code ?? "") ? 400 :
        error.code === "PGRST116" ? 404 : 500;
    return failure(error.message, status);
}

async function validateVariant(ctx: Context, variantId: string): Promise<NextResponse | null> {
    const { data, error } = await ctx.admin.from("menu_variants").select("id")
        .eq("id", variantId).eq("shop_id", ctx.currentShopId).maybeSingle();
    if (error) return databaseFailure(error);
    return data ? null : failure("Variant not found in current shop", 404);
}

async function validateSource(ctx: Context, source: RecipeSource, quantity: number, supplies: RecipeSupplyItem[]): Promise<NextResponse | null> {
    if (source.supply_item_id) {
        const supply = supplies.find((row) => row.id === source.supply_item_id);
        if (!supply) return failure("Supply item not found in current branch", 404);
        if (!isRecipeQuantityStepValid(quantity, supply.quantity_step)) {
            return failure(`Quantity must be a multiple of ${supply.quantity_step} ${supply.base_unit}`, 400);
        }
        return null;
    }
    const { data, error } = await ctx.admin.from("ingredients").select("id, is_active, archived_at")
        .eq("id", source.ingredient_id!).eq("shop_id", ctx.currentShopId)
        .eq("branch_id", ctx.currentBranchId).maybeSingle();
    if (error) return databaseFailure(error);
    if (!data) return failure("Ingredient not found in current branch", 404);
    return data.is_active !== true || data.archived_at !== null ? failure("Ingredient is archived", 400) : null;
}

// Current branch is always server-resolved. Query/body branch IDs cannot redirect a recipe mutation.
export async function GET(req: NextRequest) {
    try {
        const resolved = await resolveContext(false);
        if (!resolved.ok) return resolved.response;
        const ctx = resolved.value;
        const supplies = await loadSupplies(ctx);
        if (!supplies.ok) return supplies.response;
        if (req.nextUrl.searchParams.get("sources") === "1") {
            return NextResponse.json({ supply_items: supplies.value, branch_id: ctx.currentBranchId });
        }
        let query = ctx.supabase.from("recipe_items").select(SELECT_JOIN)
            .eq("shop_id", ctx.currentShopId).or(`branch_id.eq.${ctx.currentBranchId},branch_id.is.null`)
            .order("created_at", { ascending: false });
        const id = req.nextUrl.searchParams.get("id");
        const variantId = req.nextUrl.searchParams.get("variant_id");
        const menuId = req.nextUrl.searchParams.get("menu_id");
        if (id) query = query.eq("id", id);
        if (variantId) query = query.eq("variant_id", variantId);
        if (menuId) {
            const { data, error } = await ctx.admin.from("menu_variants").select("id")
                .eq("shop_id", ctx.currentShopId).eq("menu_id", menuId);
            if (error) return databaseFailure(error);
            if (!data?.length) return NextResponse.json({ items: [], supply_items: supplies.value });
            query = query.in("variant_id", data.map((variant) => variant.id));
        }
        const { data, error } = await query.overrideTypes<RecipeJoin[], { merge: false }>();
        if (error) return databaseFailure(error);
        const items = (data ?? []).map((row) => toView(row, supplies.value));
        if (id) return items[0] ? NextResponse.json({ item: items[0] }) : failure("Recipe item not found", 404);
        return NextResponse.json({ items, supply_items: supplies.value, branch_id: ctx.currentBranchId });
    } catch (error) {
        return failure(error instanceof Error ? error.message : "Server error", 500);
    }
}

// Duplicate source in this branch+variant replaces quantity, as in the existing editor.
export async function POST(req: NextRequest) {
    try {
        const resolved = await resolveContext(true);
        if (!resolved.ok) return resolved.response;
        const ctx = resolved.value;
        const body = await requestBody(req);
        const variantId = nonempty(body?.variant_id);
        const source = body && parseSource(body);
        const quantity = positiveQuantity(body?.quantity);
        if (!variantId || !source || quantity === null) {
            return failure("variant_id, exactly one ingredient_id or supply_item_id, and quantity (> 0) are required", 400);
        }
        const supplies = await loadSupplies(ctx);
        if (!supplies.ok) return supplies.response;
        const variantError = await validateVariant(ctx, variantId);
        if (variantError) return variantError;
        const sourceError = await validateSource(ctx, source, quantity, supplies.value);
        if (sourceError) return sourceError;
        const inserted = await ctx.supabase.from("recipe_items").insert({
            variant_id: variantId, ...source, quantity, shop_id: ctx.currentShopId, branch_id: ctx.currentBranchId,
        }).select(SELECT_JOIN).single().overrideTypes<RecipeJoin, { merge: false }>();
        if (!inserted.error) return NextResponse.json({ item: toView(inserted.data, supplies.value), mode: "insert" }, { status: 201 });
        if (inserted.error.code !== "23505") return databaseFailure(inserted.error);
        let update = ctx.supabase.from("recipe_items").update({ quantity })
            .eq("variant_id", variantId).eq("shop_id", ctx.currentShopId).eq("branch_id", ctx.currentBranchId);
        update = source.supply_item_id ? update.eq("supply_item_id", source.supply_item_id) : update.eq("ingredient_id", source.ingredient_id!);
        const { data, error } = await update.select(SELECT_JOIN).single().overrideTypes<RecipeJoin, { merge: false }>();
        if (error) return databaseFailure(error);
        return NextResponse.json({ item: toView(data, supplies.value), mode: "update" });
    } catch (error) {
        return failure(error instanceof Error ? error.message : "Server error", 500);
    }
}

export async function PUT(req: NextRequest) {
    try {
        const resolved = await resolveContext(true);
        if (!resolved.ok) return resolved.response;
        const ctx = resolved.value;
        const body = await requestBody(req);
        const id = nonempty(body?.id) ?? nonempty(req.nextUrl.searchParams.get("id"));
        if (!id || !body) return failure("Missing id or request body", 400);
        const { data: current, error: currentError } = await ctx.supabase.from("recipe_items")
            .select("*").eq("id", id).eq("shop_id", ctx.currentShopId)
            .or(`branch_id.eq.${ctx.currentBranchId},branch_id.is.null`).maybeSingle();
        if (currentError) return databaseFailure(currentError);
        if (!current) return failure("Recipe item not found", 404);
        const sourceChanged = "ingredient_id" in body || "supply_item_id" in body;
        const source = sourceChanged ? parseSource(body) : { ingredient_id: current.ingredient_id, supply_item_id: current.supply_item_id };
        const variantId = "variant_id" in body ? nonempty(body.variant_id) : current.variant_id;
        const quantity = "quantity" in body ? positiveQuantity(body.quantity) : Number(current.quantity);
        if (!source || !variantId || quantity === null) return failure("Invalid recipe source, variant or quantity", 400);
        if (!sourceChanged && !("variant_id" in body) && !("quantity" in body)) return failure("No fields to update", 400);
        const supplies = await loadSupplies(ctx);
        if (!supplies.ok) return supplies.response;
        const variantError = await validateVariant(ctx, variantId);
        if (variantError) return variantError;
        const sourceError = await validateSource(ctx, source, quantity, supplies.value);
        if (sourceError) return sourceError;
        const { data, error } = await ctx.supabase.from("recipe_items")
            .update({ ...source, quantity, variant_id: variantId, branch_id: ctx.currentBranchId })
            .eq("id", id).eq("shop_id", ctx.currentShopId)
            .or(`branch_id.eq.${ctx.currentBranchId},branch_id.is.null`)
            .select(SELECT_JOIN).single().overrideTypes<RecipeJoin, { merge: false }>();
        if (error) return databaseFailure(error);
        return NextResponse.json({ item: toView(data, supplies.value), mode: "update" });
    } catch (error) {
        return failure(error instanceof Error ? error.message : "Server error", 500);
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const resolved = await resolveContext(true);
        if (!resolved.ok) return resolved.response;
        const ctx = resolved.value;
        const id = nonempty(req.nextUrl.searchParams.get("id"));
        if (!id) return failure("Missing id", 400);
        const { data, error } = await ctx.supabase.from("recipe_items").delete()
            .eq("id", id).eq("shop_id", ctx.currentShopId)
            .or(`branch_id.eq.${ctx.currentBranchId},branch_id.is.null`)
            .select("id").maybeSingle();
        if (error) return databaseFailure(error);
        return data ? NextResponse.json({ success: true }) : failure("Recipe item not found", 404);
    } catch (error) {
        return failure(error instanceof Error ? error.message : "Server error", 500);
    }
}
