// app/api/pos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database } from "@/lib/database.types";
import {
    isMenuEnabledInBranch,
    loadBranchMenuAvailabilityMap,
} from "@/lib/branchMenuAvailability";
import { checkDailyClose } from "@/lib/dailyCloseGuard";

export const dynamic = "force-dynamic";

/* =========================================================
   Types (no any)
========================================================= */
type CategoryRow = { id: string; name: string };
type ServeTypeRow = { id: string; name: string };

type VariantRow = {
    id: string;
    menu_id: string;
    serve_type_id: string | null;
    price_override: number | null;
    is_default: boolean;
    serve_type: ServeTypeRow | null;
};

type MenuRow = {
    id: string;
    name: string;
    price: number | null;
    image_url: string | null;
    description: string | null;
    category_id: string | null;
    category: CategoryRow | null;
    variants: VariantRow[] | null;
};

type PosVariant = {
    id: string;
    is_default: boolean;
    price: number;
    serve_type: { id: string; name: string } | null;
};

type PosMenuFeedItem = {
    id: string;
    name: string;
    price: number;
    image_url: string | null;
    description: string | null;
    category: CategoryRow | null;
    variants: PosVariant[];
};

type PosFeedResponse = { menu: PosMenuFeedItem[] };
type RecipeItemRow = { variant_id: string; ingredient_id: string | null };
type RecipeItemForCheckRow = { id: string; variant_id: string; ingredient_id: string | null };
type IngredientIdRow = { id: string };
type RecipeItemDeductRow = { variant_id: string; ingredient_id: string | null; quantity: number };
type IngredientStockRow = { id: string; stock: number; name: string };
type FallbackDeductRow = {
    ingredient_id: string;
    deduct: number;
    before_stock: number;



    after_stock: number;
};

/* -------------------- Checkout types -------------------- */
type IncomingItem = {
    variant_id?: unknown;
    qty?: unknown;
};

type IncomingBody = {
    items?: unknown;
    branch_id?: unknown;
    payment_method?: unknown;
    paid_amount?: unknown;
};

type RpcItem = {
    variant_id: string;
    qty: number; // int >= 1
};

type CheckoutVariantRow = {
    id: string;
    menu_id: string;
    serve_type_id: string | null;
    size: string | null;
    price_override: number | null;
};

type CheckoutMenuRow = {
    id: string;
    name: string;
    price: number | null;
};

type CheckoutServeTypeRow = {
    id: string;
    name: string;
};

type CreatedOrderRow = {
    id: string;
    total: number;
    created_at: string;
    status: string;
    payment_method: string;
    paid_at: string | null;
    note: string | null;
};

/* -------------------- Json -------------------- */
export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

/* =========================================================
   Helpers
========================================================= */
function asArray<T>(v: unknown): T[] {
    return Array.isArray(v) ? (v as T[]) : [];
}

function toStringOrNull(v: unknown): string | null {
    if (typeof v === "string" && v.trim()) return v.trim();
    return null;
}

function toNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function compactSpaces(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}

function cleanLabel(s: string | null | undefined): string | null {
    if (!s) return null;
    const cleaned = compactSpaces(String(s).replace(/\bdefault\b/gi, ""));
    return cleaned || null;
}

function buildVariantLabel(opts: { serveTypeName?: string | null; size?: string | null }): string | null {
    const a = cleanLabel(opts.serveTypeName);
    const b = cleanLabel(opts.size);
    const merged = compactSpaces([a, b].filter(Boolean).join(" / "));
    return merged || null;
}

function mapCheckoutErrorCode(message: string): string {
    const msg = (message || "").toLowerCase();
    if (msg.includes("not enough stock")) return "NOT_ENOUGH_STOCK";
    if (msg.includes("no recipe")) return "NO_RECIPE";
    if (msg.includes("variant not found")) return "VARIANT_NOT_FOUND";
    if (msg.includes("invalid items")) return "INVALID_ITEMS";
    if (msg.includes("p_items must be json array")) return "INVALID_ITEMS";
    return "CHECKOUT_FAILED";
}

function getIdempotencyKey(req: NextRequest): string | null {
    const raw = req.headers.get("Idempotency-Key") ?? req.headers.get("idempotency-key");
    if (!raw) return null;

    const key = raw.trim();
    if (key.length < 8) return null;
    if (key.length > 200) return null;
    return key;
}

function toJson(value: unknown): Json {
    try {
        return JSON.parse(JSON.stringify(value ?? null)) as Json;
    } catch {
        return null;
    }
}

/**
 * Get branch id for checkout:
 * - if client provides branch_id -> use it
 * - else fallback to primary branch
 * - else fallback to any branch (latest)
 */
async function resolveBranchId(
    lookupClient: ReturnType<typeof getSupabaseAdmin>,
    branchIdMaybe: string | null,
    currentShopId: string
): Promise<{ ok: true; id: string } | { ok: false; error: string; code: string }> {
    if (branchIdMaybe) {
        // validate exists
        const { data, error } = await lookupClient
            .from("branch")
            .select("id")
            .eq("id", branchIdMaybe)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (error) return { ok: false, error: error.message, code: "BRANCH_LOOKUP_FAILED" };
        if (!data?.id) return { ok: false, error: "Invalid branch_id", code: "INVALID_BRANCH" };
        return { ok: true, id: data.id as string };
    }

    // fallback primary
    const { data: primary, error: pErr } = await lookupClient
        .from("branch")
        .select("id")
        .eq("shop_id", currentShopId)
        .eq("is_primary", true)
        .order("created_at", { ascending: false })
        .maybeSingle();

    if (pErr) return { ok: false, error: pErr.message, code: "BRANCH_LOOKUP_FAILED" };
    if (primary?.id) return { ok: true, id: primary.id as string };

    // fallback any branch
    const { data: anyB, error: aErr } = await lookupClient
        .from("branch")
        .select("id")
        .eq("shop_id", currentShopId)
        .order("created_at", { ascending: false })
        .maybeSingle();

    if (aErr) return { ok: false, error: aErr.message, code: "BRANCH_LOOKUP_FAILED" };
    if (anyB?.id) return { ok: true, id: anyB.id as string };

    return { ok: false, error: "No branch found. Please create a branch first.", code: "NO_BRANCH" };
}

async function deductStockFallbackFromRecipeItems(params: {
    admin: ReturnType<typeof getSupabaseAdmin>;
    currentShopId: string;
    currentBranchId: string;
    orderId: string;
    items: RpcItem[];
    variantIds: string[];
}): Promise<{ ok: true; data: FallbackDeductRow[] } | { ok: false; error: string }> {
    const { admin, currentShopId, currentBranchId, orderId, items, variantIds } = params;

    const qtyByVariant = new Map<string, number>();
    for (const it of items) {
        qtyByVariant.set(it.variant_id, (qtyByVariant.get(it.variant_id) ?? 0) + it.qty);
    }

    const { data: recipeRowsRaw, error: recipeErr } = await admin
        .from("recipe_items")
        .select("variant_id,ingredient_id,quantity")
        .eq("shop_id", currentShopId)
        .in("variant_id", variantIds)
        .returns<RecipeItemDeductRow[]>();

    if (recipeErr) return { ok: false, error: recipeErr.message };
    const recipeRows = recipeRowsRaw ?? [];

    const ingredientIds = Array.from(
        new Set(
            recipeRows
                .map((r) => r.ingredient_id)
                .filter((v): v is string => typeof v === "string" && v.length > 0)
        )
    );

    if (ingredientIds.length === 0) {
        return { ok: false, error: "No recipe rows found for checkout variants" };
    }

    const { data: ingredientRowsRaw, error: ingredientErr } = await admin
        .from("ingredients")
        .select("id,stock,name")
        .eq("shop_id", currentShopId)
        .filter("branch_id", "eq", currentBranchId)
        .in("id", ingredientIds)
        .returns<IngredientStockRow[]>();

    if (ingredientErr) return { ok: false, error: ingredientErr.message };
    const ingredientRows = ingredientRowsRaw ?? [];
    const ingredientById = new Map(ingredientRows.map((r) => [r.id, r]));

    const deductByIngredient = new Map<string, number>();
    const recipeVariantHasValidIngredient = new Set<string>();

    for (const row of recipeRows) {
        if (!row.ingredient_id) continue;
        if (!ingredientById.has(row.ingredient_id)) continue;

        const lineQty = toNumber(row.quantity, 0);
        const orderQty = qtyByVariant.get(row.variant_id) ?? 0;
        if (lineQty <= 0 || orderQty <= 0) continue;

        recipeVariantHasValidIngredient.add(row.variant_id);
        const deduct = lineQty * orderQty;
        deductByIngredient.set(
            row.ingredient_id,
            (deductByIngredient.get(row.ingredient_id) ?? 0) + deduct
        );
    }

    for (const variantId of variantIds) {
        if (!recipeVariantHasValidIngredient.has(variantId)) {
            return { ok: false, error: `No recipe for variant: ${variantId}` };
        }
    }

    const beforeStockByIngredient = new Map<string, number>();
    for (const [ingredientId, deduct] of deductByIngredient) {
        const ing = ingredientById.get(ingredientId);
        if (!ing) return { ok: false, error: `Ingredient not found: ${ingredientId}` };

        const before = toNumber(ing.stock, 0);
        if (before < deduct) {
            return {
                ok: false,
                error: `Not enough stock: ${ing.name} (need ${deduct}, have ${before})`,
            };
        }
        beforeStockByIngredient.set(ingredientId, before);
    }

    const applied: Array<{ ingredient_id: string; deduct: number }> = [];
    for (const [ingredientId, deduct] of deductByIngredient) {
        const { error } = await admin.rpc("increment_stock", {
            ing_id: ingredientId,
            diff: -deduct,
        });
        if (error) {
            // best-effort rollback
            for (const a of applied) {
                await admin.rpc("increment_stock", {
                    ing_id: a.ingredient_id,
                    diff: a.deduct,
                });
            }
            return { ok: false, error: error.message };
        }
        applied.push({ ingredient_id: ingredientId, deduct });
    }

    const out: FallbackDeductRow[] = applied.map((a) => {
        const before = beforeStockByIngredient.get(a.ingredient_id) ?? 0;
        return {
            ingredient_id: a.ingredient_id,
            deduct: a.deduct,
            before_stock: before,
            after_stock: before - a.deduct,
        };
    });

    const logRowsBase = out.map((r) => ({
        ingredient_id: r.ingredient_id,
        order_id: orderId,
        amount: r.deduct,
        type: "deduct",
        note: "",
        before_stock: r.before_stock,
        after_stock: r.after_stock,
        shop_id: currentShopId,
    }));

    const logRows = logRowsBase.map((r) => ({
        ...r,
        branch_id: currentBranchId,
    })) as unknown as Database["public"]["Tables"]["stock_logs"]["Insert"][];

    const { error: logErr } = await admin.from("stock_logs").insert(logRows);
    if (logErr) {
        for (const a of applied) {
            await admin.rpc("increment_stock", {
                ing_id: a.ingredient_id,
                diff: a.deduct,
            });
        }
        return { ok: false, error: logErr.message };
    }

    return { ok: true, data: out };
}

/* =========================================================
   GET /api/pos
========================================================= */
export async function GET(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    try {
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
        if (!currentShopId) {
            return NextResponse.json(
                { error: "Shop context is required. Please select a shop.", code: "NO_SHOP_CONTEXT" },
                { status: 400 }
            );
        }

        const { data: member, error: memberErr } = await admin
            .from("shop_members")
            .select("role")
            .eq("user_id", auth.user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
        if (!member) {
            return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const search = (searchParams.get("search") || "").trim();
        const categoryId = searchParams.get("category_id");
        const serveTypeId = searchParams.get("serve_type_id");

        let q = admin
            .from("menu")
            .select(
                `
          id,
          name,
          price,
          image_url,
          description,
          category_id,
          category:menu_categories(id, name),
          variants:menu_variants(
            id,
            menu_id,
            serve_type_id,
            price_override,
            is_default,
            serve_type:menu_serve_types(id, name)
          )
        `
            )
            .order("created_at", { ascending: false });

        q = q.eq("shop_id", currentShopId);
        if (search) q = q.ilike("name", `%${search}%`);
        if (categoryId) q = q.eq("category_id", categoryId);
        if (serveTypeId) q = q.filter("variants.serve_type_id", "eq", serveTypeId);

        const { data, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const menus = asArray<MenuRow>(data);
        const menuIds = menus.map((m) => m.id);
        let availabilityMap = new Map<string, boolean>();

        if (currentBranchId && menuIds.length > 0) {
            try {
                availabilityMap = await loadBranchMenuAvailabilityMap({
                    client: admin,
                    branchId: currentBranchId,
                    menuIds,
                });
            } catch (e: unknown) {
                const msg =
                    e instanceof Error
                        ? e.message
                        : "Failed to load branch menu availability";
                return NextResponse.json({ error: msg }, { status: 500 });
            }
        }

        const menusByBranch = currentBranchId
            ? menus.filter((m) => isMenuEnabledInBranch(m.id, availabilityMap))
            : menus;

        const allVariants = menusByBranch.flatMap((m) => asArray<VariantRow>(m.variants));
        const allVariantIds = allVariants.map((v) => v.id);

        // Show only variants that already have recipe rows.
        // This prevents staff from selling items that will fail checkout.
        let variantsWithRecipe = new Set<string>();
        if (allVariantIds.length > 0) {
            const { data: recipeRows, error: recipeErr } = await admin
                .from("recipe_items")
                .select("variant_id,ingredient_id")
                .eq("shop_id", currentShopId)
                .in("variant_id", allVariantIds);

            if (recipeErr) {
                return NextResponse.json({ error: recipeErr.message }, { status: 500 });
            }

            const parsedRecipeRows = asArray<RecipeItemRow>(recipeRows);
            const ingredientIds = Array.from(
                new Set(
                    parsedRecipeRows
                        .map((r) => r.ingredient_id)
                        .filter((v): v is string => typeof v === "string" && v.length > 0)
                )
            );

            let validIngredientIds = new Set<string>();
            if (ingredientIds.length > 0) {
                const { data: ingredientRows, error: ingredientErr } = await admin
                    .from("ingredients")
                    .select("id")
                    .eq("shop_id", currentShopId)
                    .filter("branch_id", "eq", currentBranchId)
                    .in("id", ingredientIds)
                    .returns<IngredientIdRow[]>();

                if (ingredientErr) {
                    return NextResponse.json({ error: ingredientErr.message }, { status: 500 });
                }

                validIngredientIds = new Set((ingredientRows ?? []).map((r) => r.id));
            }

            variantsWithRecipe = new Set(
                parsedRecipeRows
                    .filter((r) => !!r.ingredient_id && validIngredientIds.has(r.ingredient_id))
                    .map((r) => r.variant_id)
            );
        }

        const feed: PosMenuFeedItem[] = menusByBranch
            .map((m) => {
                const basePrice = Number(m.price ?? 0);
                const variantsRaw = asArray<VariantRow>(m.variants);

                const variantsFiltered = serveTypeId
                    ? variantsRaw.filter((v) => v.serve_type_id === serveTypeId)
                    : variantsRaw;

                const sellableVariants = variantsFiltered.filter((v) =>
                    variantsWithRecipe.has(v.id)
                );

                const variants: PosVariant[] = sellableVariants.map((v) => ({
                    id: v.id,
                    is_default: !!v.is_default,
                    price: Number(v.price_override ?? basePrice),
                    serve_type: v.serve_type
                        ? { id: v.serve_type.id, name: v.serve_type.name }
                        : null,
                }));

                return {
                    id: m.id,
                    name: m.name,
                    price: basePrice,
                    image_url: m.image_url,
                    description: m.description,
                    category: m.category,
                    variants,
                };
            })
            .filter((m) => m.variants.length > 0);

        const resBody: PosFeedResponse = { menu: feed };
        return NextResponse.json(resBody);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================================================
   POST /api/pos (Checkout)
========================================================= */
export async function POST(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    try {
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
        if (!currentShopId) {
            return NextResponse.json(
                { error: "Shop context is required. Please select a shop.", code: "NO_SHOP_CONTEXT" },
                { status: 400 }
            );
        }

        const { data: member, error: memberErr } = await admin
            .from("shop_members")
            .select("role")
            .eq("user_id", auth.user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
        if (!member) {
            return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
        }

        const idempotencyKey = getIdempotencyKey(req);

        // 1) Idempotency: return existing response
        if (idempotencyKey) {
            const { data: existing, error: exErr } = await admin
                .from("pos_idempotency")
                .select("key, response, created_at")
                .eq("key", idempotencyKey)
                .eq("shop_id", currentShopId)
                .maybeSingle();

            if (!exErr && existing?.response) {
                return NextResponse.json(existing.response);
            }
        }

        const raw = (await req.json().catch(() => null)) as IncomingBody | null;
        const rawItems = raw?.items;

        if (!Array.isArray(rawItems) || rawItems.length === 0) {
            return NextResponse.json({ error: "No items provided", code: "NO_ITEMS" }, { status: 400 });
        }

        const items: RpcItem[] = (rawItems as IncomingItem[])
            .map((i) => {
                const variant_id = toStringOrNull(i.variant_id);
                const qtyRaw = toNumber(i.qty, 0);
                const qty = Math.floor(qtyRaw);
                return variant_id ? { variant_id, qty } : null;
            })
            .filter((i): i is RpcItem => !!i && i.qty >= 1);

        if (items.length === 0) {
            return NextResponse.json(
                { error: "Invalid items: variant_id and qty are required.", code: "INVALID_ITEMS" },
                { status: 400 }
            );
        }

        const paymentMethodRaw = toStringOrNull(raw?.payment_method);
        const paymentMethod = paymentMethodRaw === "promptpay" ? "promptpay" : "cash";

        if (paymentMethodRaw && paymentMethodRaw !== "cash" && paymentMethodRaw !== "promptpay") {
            return NextResponse.json(
                { error: "Invalid payment_method. Use cash or promptpay.", code: "INVALID_PAYMENT_METHOD" },
                { status: 400 }
            );
        }

        // 2) Resolve branch id (always!)
        const branchIdInput = toStringOrNull(raw?.branch_id) ?? currentBranchId;
        const branchRes = await resolveBranchId(admin, branchIdInput, currentShopId);
        if (!branchRes.ok) {
            return NextResponse.json({ error: branchRes.error, code: branchRes.code }, { status: 400 });
        }

        // Keep profile context aligned with current checkout context.
        // Do this as best-effort only; missing legacy profile must not block checkout.
        const { data: profileCtx, error: profileCtxErr } = await admin
            .from("profiles")
            .update({
                current_shop_id: currentShopId,
                current_branch_id: branchRes.id,
            })
            .eq("id", auth.user.id)
            .select("id")
            .maybeSingle();

        if (profileCtxErr) {
            console.warn("[pos] profile context update failed:", profileCtxErr.message);
        } else if (!profileCtx?.id) {
            const { error: insertProfileErr } = await admin.from("profiles").insert([
                {
                    id: auth.user.id,
                    email: auth.user.email ?? null,
                    role: typeof member.role === "string" ? member.role : "staff",
                    current_shop_id: currentShopId,
                    current_branch_id: branchRes.id,
                },
            ]);
            if (insertProfileErr) {
                console.warn("[pos] profile bootstrap failed:", insertProfileErr.message);
            }
        }

        // Gate: block checkout if daily close is closed/approved for this branch/date
        const closeGuard = await checkDailyClose(currentShopId, branchRes.id);
        if (closeGuard.blocked) {
            return NextResponse.json(
                {
                    error: "ปิดยอดวันนี้แล้ว ไม่สามารถสร้างบิลใหม่ได้ กรุณาเลือกวันขายถัดไปหรือให้ผู้ดูแลตรวจสอบ",
                    code: "BUSINESS_DAY_CLOSED",
                    business_date: closeGuard.businessDate,
                    close_status: closeGuard.closeStatus,
                },
                { status: 409 }
            );
        }

        // 3) Build checkout in API directly (avoid legacy RPC that may miss shop_id).
        const variantIds = Array.from(new Set(items.map((i) => i.variant_id)));
        const { data: variants, error: vErr } = await admin
            .from("menu_variants")
            .select("id,menu_id,serve_type_id,size,price_override")
            .eq("shop_id", currentShopId)
            .in("id", variantIds)
            .returns<CheckoutVariantRow[]>();

        if (vErr) {
            return NextResponse.json({ error: vErr.message, code: "CHECKOUT_FAILED" }, { status: 500 });
        }

        const variantMap = new Map<string, CheckoutVariantRow>(
            (variants ?? []).map((v) => [v.id, v])
        );

        for (const it of items) {
            if (!variantMap.has(it.variant_id)) {
                return NextResponse.json(
                    { error: `Variant not found: ${it.variant_id}`, code: "VARIANT_NOT_FOUND" },
                    { status: 400 }
                );
            }
        }

        const menuIds = Array.from(new Set((variants ?? []).map((v) => v.menu_id)));
        const { data: menus, error: mErr } = await admin
            .from("menu")
            .select("id,name,price")
            .eq("shop_id", currentShopId)
            .in("id", menuIds)
            .returns<CheckoutMenuRow[]>();

        if (mErr) {
            return NextResponse.json({ error: mErr.message, code: "CHECKOUT_FAILED" }, { status: 500 });
        }

        const menuMap = new Map<string, CheckoutMenuRow>((menus ?? []).map((m) => [m.id, m]));
        for (const v of variants ?? []) {
            if (!menuMap.has(v.menu_id)) {
                return NextResponse.json(
                    { error: `Menu not found for variant: ${v.id}`, code: "CHECKOUT_FAILED" },
                    { status: 400 }
                );
            }
        }

        const serveTypeIds = Array.from(
            new Set((variants ?? []).map((v) => v.serve_type_id).filter(Boolean) as string[])
        );
        const serveTypeMap = new Map<string, string>();
        if (serveTypeIds.length > 0) {
            const { data: serves, error: sErr } = await admin
                .from("menu_serve_types")
                .select("id,name")
                .eq("shop_id", currentShopId)
                .in("id", serveTypeIds)
                .returns<CheckoutServeTypeRow[]>();

            if (sErr) {
                return NextResponse.json({ error: sErr.message, code: "CHECKOUT_FAILED" }, { status: 500 });
            }

            for (const s of serves ?? []) serveTypeMap.set(s.id, s.name);
        }

        const itemsToInsert = items.map((it) => {
            const v = variantMap.get(it.variant_id)!;
            const m = menuMap.get(v.menu_id)!;
            const basePrice = toNumber(m.price, 0);
            const finalPrice = toNumber(v.price_override ?? basePrice, basePrice);
            const variantLabel = buildVariantLabel({
                serveTypeName: v.serve_type_id ? serveTypeMap.get(v.serve_type_id) ?? null : null,
                size: v.size ?? null,
            });

            return {
                menu_id: m.id,
                variant_id: v.id,
                variant_label: variantLabel,
                name: m.name,
                price: finalPrice,
                qty: it.qty,
            };
        });

        const total = itemsToInsert.reduce((sum, i) => sum + i.price * i.qty, 0);
        const paidAt = new Date().toISOString();

        const paidAmountRaw = toNumber(raw?.paid_amount);
        const paidAmount =
            paymentMethod === "promptpay"
                ? total
                : paidAmountRaw != null
                    ? paidAmountRaw
                    : null;

        if (paymentMethod === "cash" && paidAmount == null) {
            return NextResponse.json(
                { error: "paid_amount is required for cash payment.", code: "MISSING_PAID_AMOUNT" },
                { status: 400 }
            );
        }

        const changeAmount =
            paymentMethod === "cash" && paidAmount != null
                ? Math.max(0, paidAmount - total)
                : 0;

        if (paymentMethod === "cash" && paidAmount != null && paidAmount < total) {
            return NextResponse.json(
                { error: `Insufficient payment. Total is ${total}, received ${paidAmount}.`, code: "INSUFFICIENT_PAYMENT" },
                { status: 400 }
            );
        }

        // IMPORTANT:
        // Use user-scoped client for write path so DB functions/triggers that rely
        // on auth/context (ex. current_shop_id()) get correct values.
        const writeClient = supabase;

        const orderInsertBase: Database["public"]["Tables"]["orders"]["Insert"] = {
            total,
            status: "paid",
            payment_method: paymentMethod,
            paid_amount: paidAmount,
            change_amount: changeAmount,
            paid_at: paidAt,
            note: null,
            shop_id: currentShopId,
        };

        // `branch_id` may exist in DB but not yet in generated types; keep runtime field.
        const orderInsertWithBranch = {
            ...orderInsertBase,
            branch_id: branchRes.id,
        } as unknown as Database["public"]["Tables"]["orders"]["Insert"];

        let createdOrder: CreatedOrderRow | null = null;
        const withBranch = await writeClient
            .from("orders")
            .insert([orderInsertWithBranch])
            .select("id,total,created_at,status,payment_method,paid_at,note")
            .maybeSingle()
            .returns<CreatedOrderRow | null>();

        if (withBranch.error) {
            const branchColumnMissing = withBranch.error.message
                .toLowerCase()
                .includes('column "branch_id" of relation "orders" does not exist');

            if (!branchColumnMissing) {
                return NextResponse.json(
                    { error: withBranch.error.message, code: "CHECKOUT_FAILED" },
                    { status: 400 }
                );
            }

            const withoutBranch = await writeClient
                .from("orders")
                .insert([
                    orderInsertBase,
                ])
                .select("id,total,created_at,status,payment_method,paid_at,note")
                .single()
                .returns<CreatedOrderRow>();

            if (withoutBranch.error || !withoutBranch.data) {
                return NextResponse.json(
                    { error: withoutBranch.error?.message ?? "Failed to create order", code: "CHECKOUT_FAILED" },
                    { status: 400 }
                );
            }

            createdOrder = withoutBranch.data;
        } else if (withBranch.data) {
            createdOrder = withBranch.data;
        }

        if (!createdOrder) {
            return NextResponse.json({ error: "Failed to create order", code: "CHECKOUT_FAILED" }, { status: 500 });
        }

        const createdOrderId = createdOrder.id;

        const { error: itemErr } = await writeClient.from("order_items").insert(
            itemsToInsert.map((i) => ({
                order_id: createdOrderId,
                menu_id: i.menu_id,
                variant_id: i.variant_id,
                variant_label: i.variant_label,
                name: i.name,
                price: i.price,
                qty: i.qty,
                shop_id: currentShopId,
            }))
        );

        if (itemErr) {
            await admin.from("orders").delete().eq("id", createdOrderId).eq("shop_id", currentShopId);
            return NextResponse.json({ error: itemErr.message, code: "CHECKOUT_FAILED" }, { status: 500 });
        }

        // Pre-clean invalid legacy recipe rows for checkout variants.
        // Some old rows may have null/missing ingredient refs and make stock deduction fail.
        const { data: recipeRowsForCheck, error: recipeScanErr } = await admin
            .from("recipe_items")
            .select("id,variant_id,ingredient_id")
            .eq("shop_id", currentShopId)
            .in("variant_id", variantIds)
            .returns<RecipeItemForCheckRow[]>();

        if (recipeScanErr) {
            await admin.from("order_items").delete().eq("order_id", createdOrderId).eq("shop_id", currentShopId);
            await admin.from("orders").delete().eq("id", createdOrderId).eq("shop_id", currentShopId);
            return NextResponse.json({ error: recipeScanErr.message, code: "CHECKOUT_FAILED" }, { status: 500 });
        }

        const recipeRows = recipeRowsForCheck ?? [];
        const ingredientIds = Array.from(
            new Set(
                recipeRows
                    .map((r) => r.ingredient_id)
                    .filter((v): v is string => typeof v === "string" && v.length > 0)
            )
        );

        let validIngredientIds = new Set<string>();
        if (ingredientIds.length > 0) {
            const { data: ingredientRows, error: ingredientScanErr } = await admin
                .from("ingredients")
                .select("id")
                .eq("shop_id", currentShopId)
                .filter("branch_id", "eq", branchRes.id)
                .in("id", ingredientIds)
                .returns<IngredientIdRow[]>();

            if (ingredientScanErr) {
                await admin.from("order_items").delete().eq("order_id", createdOrderId).eq("shop_id", currentShopId);
                await admin.from("orders").delete().eq("id", createdOrderId).eq("shop_id", currentShopId);
                return NextResponse.json({ error: ingredientScanErr.message, code: "CHECKOUT_FAILED" }, { status: 500 });
            }

            validIngredientIds = new Set((ingredientRows ?? []).map((r) => r.id));
        }

        const invalidRecipeItemIds = recipeRows
            .filter((r) => !r.ingredient_id || !validIngredientIds.has(r.ingredient_id))
            .map((r) => r.id);

        if (invalidRecipeItemIds.length > 0) {
            await admin
                .from("recipe_items")
                .delete()
                .eq("shop_id", currentShopId)
                .in("id", invalidRecipeItemIds);
        }

        const deductResult = await deductStockFallbackFromRecipeItems({
            admin,
            currentShopId,
            currentBranchId: branchRes.id,
            orderId: createdOrderId,
            items,
            variantIds,
        });

        if (!deductResult.ok) {
            await admin.from("order_items").delete().eq("order_id", createdOrderId).eq("shop_id", currentShopId);
            await admin.from("orders").delete().eq("id", createdOrderId).eq("shop_id", currentShopId);
            const code = mapCheckoutErrorCode(deductResult.error || "");
            return NextResponse.json({ error: deductResult.error, code }, { status: 400 });
        }

        const data: Json = toJson({
            success: true,
            order: {
                ...createdOrder,
                shop_id: currentShopId,
                branch_id: branchRes.id,
                items: itemsToInsert,
            },
            deducted: asArray<unknown>(deductResult.data),
        });

        // 4) Save idempotency response
        if (idempotencyKey) {
            const payload: Json = toJson(data ?? { ok: true });

            // insert array to keep TS overload calm
            const { error: insErr } = await admin
                .from("pos_idempotency")
                .insert([{ key: idempotencyKey, response: payload, shop_id: currentShopId }]);

            // ถ้าชน unique ก็ช่างมัน (อีก request อาจบันทึกไปแล้ว)
            if (insErr) {
                const { data: fallback } = await admin
                    .from("pos_idempotency")
                    .select("key, response, created_at")
                    .eq("key", idempotencyKey)
                    .eq("shop_id", currentShopId)
                    .maybeSingle();

                if (fallback?.response) return NextResponse.json(fallback.response);
            }
        }

        return NextResponse.json(data);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Server error while checkout";
        return NextResponse.json({ error: msg, code: "SERVER_ERROR" }, { status: 500 });
    }
}
