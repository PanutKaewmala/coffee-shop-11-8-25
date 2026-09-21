// app/api/pos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
    isMenuEnabledInBranch,
    loadBranchMenuAvailabilityMap,
} from "@/lib/branchMenuAvailability";

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
type RecipeItemRow = { variant_id: string; ingredient_id: string | null; supply_item_id: string | null; quantity: number | null };
type IngredientIdRow = { id: string };
/* -------------------- Checkout types -------------------- */
type IncomingItem = {
    variant_id?: unknown;
    qty?: unknown;
    sweetness?: unknown;
    sweetness_label?: unknown;
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
    sweetness: SweetnessLevel;
};

/* -------------------- Json -------------------- */
export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

const SWEETNESS_OPTIONS = ["0%", "25%", "50%", "75%", "100%", "125%"] as const;
type SweetnessLevel = (typeof SWEETNESS_OPTIONS)[number];
const DEFAULT_SWEETNESS: SweetnessLevel = "100%";
const LEGACY_SWEETNESS_MAP: Record<string, SweetnessLevel> = {
    "ไม่หวาน": "0%",
    "หวานน้อย": "75%",
    "หวานครึ่ง": "50%",
    "หวานปกติ": "100%",
    "หวานมาก": "125%",
};

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

function normalizeSweetness(v: unknown): SweetnessLevel {
    const raw = toStringOrNull(v);
    if (!raw) return DEFAULT_SWEETNESS;

    const found = SWEETNESS_OPTIONS.find((option) => option === raw);
    if (found) return found;

    const pct = raw.match(/(125|100|75|50|25|0)%/);
    if (pct) return pct[0] as SweetnessLevel;

    const withoutPrefix = raw.replace(/^หวาน\s*/, "").trim();
    const afterPrefix = SWEETNESS_OPTIONS.find((option) => option === withoutPrefix);
    if (afterPrefix) return afterPrefix;

    const exactLegacy = LEGACY_SWEETNESS_MAP[raw] ?? LEGACY_SWEETNESS_MAP[withoutPrefix];
    if (exactLegacy) return exactLegacy;

    for (const [legacy, next] of Object.entries(LEGACY_SWEETNESS_MAP)) {
        if (raw.includes(legacy)) return next;
    }

    return DEFAULT_SWEETNESS;
}

type AtomicCheckoutError = { code: string; status: number; error: string };

function mapAtomicCheckoutError(message: string): AtomicCheckoutError | null {
    const normalized = message.toUpperCase().replace(/\s+/g, "_");
    const definitions: Array<[string, number, string]> = [
        ["BUSINESS_DAY_CLOSED", 409, "Business day is closed"],
        ["IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST", 409, "Idempotency key was already used for a different request"],
        ["OWNER_OR_STAFF_REQUIRED", 403, "Owner or staff role required"],
        ["INVALID_BRANCH", 400, "Invalid branch"],
        ["INVALID_IDEMPOTENCY_KEY", 400, "Invalid idempotency key"],
        ["INVALID_ITEMS", 400, "Invalid checkout items"],
        ["INVALID_VARIANT_SWEETNESS_OR_QUANTITY", 400, "Invalid variant, sweetness, or quantity"],
        ["INVALID_PAYMENT_METHOD", 400, "Invalid payment method"],
        ["INVALID_RECIPE_QUANTITY", 400, "Invalid recipe quantity"],
        ["INVALID_RECIPE_SUPPLY_ITEM", 400, "Recipe supply item is unavailable"],
        ["INACTIVE_INVENTORY_BRANCH", 400, "Branch inventory is inactive"],
        ["INVENTORY_LOCATION_MISSING", 400, "Branch inventory is not ready for sales"],
        ["INVALID_MENU_PRICE", 400, "Menu price is invalid"],
        ["MENU_UNAVAILABLE", 400, "Menu item is unavailable in this branch"],
        ["RECIPE_INGREDIENT_OUTSIDE_BRANCH", 400, "Recipe ingredient is unavailable for this branch"],
        ["INGREDIENT_NOT_FOUND_FOR_BRANCH", 400, "Recipe ingredient is unavailable for this branch"],
        ["NO_RECIPE", 400, "Recipe is required"],
        ["NOT_ENOUGH_STOCK", 400, "Not enough stock"],
        ["INSUFFICIENT_PAYMENT", 400, "Insufficient payment"],
    ];
    for (const [code, status, error] of definitions) {
        if (normalized.includes(code)) return { code, status, error };
    }
    return null;
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

        if (!currentBranchId) {
            return NextResponse.json({ error: "Select a branch before using POS", code: "NO_BRANCH_CONTEXT" }, { status: 400 });
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
                .select("variant_id,ingredient_id,supply_item_id,quantity")
                .eq("shop_id", currentShopId)
                .eq("branch_id", currentBranchId)
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
                    .eq("is_active", true)
                    .eq("shop_id", currentShopId)
                    .filter("branch_id", "eq", currentBranchId)
                    .in("id", ingredientIds)
                    .returns<IngredientIdRow[]>();

                if (ingredientErr) {
                    return NextResponse.json({ error: ingredientErr.message }, { status: 500 });
                }

                validIngredientIds = new Set((ingredientRows ?? []).map((r) => r.id));
            }

            const supplyIds = new Set(parsedRecipeRows.map((r) => r.supply_item_id).filter(Boolean));
            const validSupplyIds = new Set<string>();
            if (supplyIds.size > 0 && currentBranchId) {
                const { data: supplyItems, error: supplyError } = await supabase.rpc("list_talvo_supply_items", {
                    p_business_id: currentShopId, p_branch_id: currentBranchId,
                });
                if (supplyError) return NextResponse.json({ error: "Unable to check recipe supplies" }, { status: 500 });
                for (const item of asArray<{ id: string }>(supplyItems)) validSupplyIds.add(item.id);
            }
            const ready = new Map<string, boolean>();
            for (const row of parsedRecipeRows) {
                const validSource = row.ingredient_id != null
                    ? row.supply_item_id == null && validIngredientIds.has(row.ingredient_id)
                    : row.supply_item_id != null && validSupplyIds.has(row.supply_item_id);
                ready.set(row.variant_id, (ready.get(row.variant_id) ?? true) && validSource &&
                    row.quantity != null && Number.isFinite(Number(row.quantity)) && Number(row.quantity) > 0);
            }
            variantsWithRecipe = new Set([...ready].filter(([, valid]) => valid).map(([id]) => id));
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

        if (!currentBranchId) {
            return NextResponse.json(
                { error: "Select a branch before checkout", code: "NO_BRANCH_CONTEXT" },
                { status: 400 }
            );
        }
        if (member.role !== "owner" && member.role !== "staff") {
            return NextResponse.json({ error: "Owner or staff role required", code: "OWNER_OR_STAFF_REQUIRED" }, { status: 403 });
        }
        const idempotencyKey = getIdempotencyKey(req);
        if (!idempotencyKey) {
            return NextResponse.json(
                { error: "Idempotency-Key header is required", code: "IDEMPOTENCY_KEY_REQUIRED" },
                { status: 400 }
            );
        }
        const raw = (await req.json().catch(() => null)) as IncomingBody | null;
        if (!raw || typeof raw !== "object") {
            return NextResponse.json({ error: "Invalid checkout request", code: "INVALID_ITEMS" }, { status: 400 });
        }
        if (raw.branch_id !== undefined && raw.branch_id !== currentBranchId) {
            return NextResponse.json(
                { error: "Checkout branch does not match the selected branch", code: "BRANCH_CONTEXT_MISMATCH" },
                { status: 409 }
            );
        }
        const rawItems = raw.items;
        if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 500) {
            return NextResponse.json({ error: "Checkout items are required", code: "INVALID_ITEMS" }, { status: 400 });
        }
        const items: RpcItem[] = [];
        for (const candidate of rawItems) {
            if (!candidate || typeof candidate !== "object") {
                return NextResponse.json({ error: "Invalid checkout item", code: "INVALID_ITEMS" }, { status: 400 });
            }
            const item = candidate as IncomingItem;
            const variant_id = toStringOrNull(item.variant_id);
            if (!variant_id || typeof item.qty !== "number" || !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 999) {
                return NextResponse.json({ error: "Each item requires a variant and a whole quantity from 1 to 999", code: "INVALID_ITEMS" }, { status: 400 });
            }
            items.push({ variant_id, qty: item.qty, sweetness: normalizeSweetness(item.sweetness ?? item.sweetness_label) });
        }
        const paymentMethod = raw.payment_method ?? "cash";
        if (paymentMethod !== "cash" && paymentMethod !== "promptpay") {
            return NextResponse.json({ error: "Invalid payment method", code: "INVALID_PAYMENT_METHOD" }, { status: 400 });
        }
        if (raw.paid_amount != null && (typeof raw.paid_amount !== "number" || !Number.isFinite(raw.paid_amount) || raw.paid_amount < 0)) {
            return NextResponse.json({ error: "Invalid payment amount", code: "INVALID_PAID_AMOUNT" }, { status: 400 });
        }
        // Preserve the caller's payment input, including null for PromptPay.
        // Replays must never depend on today's menu prices or recipes.
        const paidAmount = typeof raw.paid_amount === "number" ? raw.paid_amount : null;

        // The RPC owns the complete write transaction (order, line items, stock,
        // stock logs, closed-day guard and idempotency response).
        const { data: atomicCheckout, error: atomicError } = await supabase.rpc(
            "process_pos_checkout_atomic",
            {
                p_shop_id: currentShopId,
                p_branch_id: currentBranchId,
                p_items: toJson(items),
                p_payment_method: paymentMethod,
                p_paid_amount: paidAmount,
                p_idempotency_key: idempotencyKey,
            }
        );
        if (atomicError) {
            const mapped = mapAtomicCheckoutError(atomicError.message);
            if (mapped) {
                return NextResponse.json(
                    { error: mapped.error, code: mapped.code },
                    { status: mapped.status }
                );
            }
            console.error("[pos] atomic_checkout_failed", atomicError);
            return NextResponse.json(
                { error: "Unable to complete checkout", code: "CHECKOUT_FAILED" },
                { status: 500 }
            );
        }
        return NextResponse.json(atomicCheckout);

    } catch (error: unknown) {
        console.error("[pos] checkout_unexpected", error);
        return NextResponse.json(
            { error: "Unable to complete checkout", code: "CHECKOUT_FAILED" },
            { status: 500 }
        );
    }
}
