// app/api/pos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
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

function toNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
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

function mapCheckoutErrorCode(message: string): string {
    const msg = (message || "").toLowerCase();
    if (msg.includes("not enough stock")) return "NOT_ENOUGH_STOCK";
    if (msg.includes("no recipe")) return "NO_RECIPE";
    if (msg.includes("variant not found")) return "VARIANT_NOT_FOUND";
    if (msg.includes("invalid items")) return "INVALID_ITEMS";
    if (msg.includes("p_items must be json array")) return "INVALID_ITEMS";
    if (msg.includes("insufficient payment")) return "INSUFFICIENT_PAYMENT";
    if (msg.includes("invalid branch")) return "INVALID_BRANCH";
    if (msg.includes("idempotency key reused")) return "IDEMPOTENCY_CONFLICT";
    if (msg.includes("business_day_closed")) return "BUSINESS_DAY_CLOSED";
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
        if (authErr) return NextResponse.json({ error: "Authentication failed", code: "AUTH_FAILED" }, { status: 500 });
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
        if (memberErr) return NextResponse.json({ error: "Unable to verify shop access", code: "ACCESS_CHECK_FAILED" }, { status: 500 });
        if (!member) return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });

        const idempotencyKey = getIdempotencyKey(req);
        if (!idempotencyKey) {
            return NextResponse.json(
                { error: "A valid Idempotency-Key header is required", code: "IDEMPOTENCY_KEY_REQUIRED" },
                { status: 400 }
            );
        }

        const raw = (await req.json().catch(() => null)) as IncomingBody | null;
        if (!Array.isArray(raw?.items) || raw.items.length === 0) {
            return NextResponse.json({ error: "No items provided", code: "NO_ITEMS" }, { status: 400 });
        }

        const items: RpcItem[] = (raw.items as IncomingItem[])
            .map((item) => {
                const variant_id = toStringOrNull(item.variant_id);
                const qty = Math.floor(toNumber(item.qty, 0));
                const sweetness = normalizeSweetness(item.sweetness ?? item.sweetness_label);
                return variant_id ? { variant_id, qty, sweetness } : null;
            })
            .filter((item): item is RpcItem => !!item && item.qty >= 1);
        if (items.length !== raw.items.length) {
            return NextResponse.json(
                { error: "Invalid items: variant_id and qty are required.", code: "INVALID_ITEMS" },
                { status: 400 }
            );
        }

        const paymentMethodRaw = toStringOrNull(raw.payment_method);
        const paymentMethod = paymentMethodRaw === "promptpay" ? "promptpay" : "cash";
        if (paymentMethodRaw && paymentMethodRaw !== "cash" && paymentMethodRaw !== "promptpay") {
            return NextResponse.json(
                { error: "Invalid payment_method. Use cash or promptpay.", code: "INVALID_PAYMENT_METHOD" },
                { status: 400 }
            );
        }

        const branchRes = await resolveBranchId(
            admin,
            toStringOrNull(raw.branch_id) ?? currentBranchId,
            currentShopId
        );
        if (!branchRes.ok) {
            return NextResponse.json({ error: branchRes.error, code: branchRes.code }, { status: 400 });
        }

        // This early guard preserves the detailed API contract. The RPC repeats it
        // under the same transaction as the writes so a close cannot be bypassed.
        const closeGuard = await checkDailyClose(currentShopId, branchRes.id);
        if (closeGuard.blocked) {
            return NextResponse.json({
                error: "ปิดยอดวันนี้แล้ว ไม่สามารถสร้างบิลใหม่ได้ กรุณาเลือกวันขายถัดไปหรือให้ผู้ดูแลตรวจสอบ",
                code: "BUSINESS_DAY_CLOSED",
                business_date: closeGuard.businessDate,
                close_status: closeGuard.closeStatus,
            }, { status: 409 });
        }

        const paidAmount = paymentMethod === "promptpay" ? null : toNumber(raw.paid_amount, Number.NaN);
        if (paymentMethod === "cash" && !Number.isFinite(paidAmount)) {
            return NextResponse.json(
                { error: "paid_amount is required for cash payment.", code: "MISSING_PAID_AMOUNT" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase.rpc("process_pos_checkout", {
            p_shop_id: currentShopId,
            p_branch_id: branchRes.id,
            p_items: items,
            p_payment_method: paymentMethod,
            p_paid_amount: paymentMethod === "cash" ? paidAmount : null,
            p_idempotency_key: idempotencyKey,
        });

        if (error) {
            const code = mapCheckoutErrorCode(error.message);
            const clientErrors = new Set([
                "NOT_ENOUGH_STOCK", "NO_RECIPE", "VARIANT_NOT_FOUND", "INVALID_ITEMS",
                "INSUFFICIENT_PAYMENT", "INVALID_BRANCH", "IDEMPOTENCY_CONFLICT",
            ]);
            const status = code === "BUSINESS_DAY_CLOSED" ? 409 : clientErrors.has(code) ? 400 : 500;
            const safeMessage = status < 500 ? error.message : "Checkout could not be completed";
            return NextResponse.json({ error: safeMessage, code }, { status });
        }

        return NextResponse.json(data as Json);
    } catch {
        return NextResponse.json(
            { error: "Server error while checkout", code: "SERVER_ERROR" },
            { status: 500 }
        );
    }
}
