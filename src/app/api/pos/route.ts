// app/api/pos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

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

/* -------------------- Checkout types -------------------- */
type IncomingItem = {
    variant_id?: unknown;
    qty?: unknown;
};

type IncomingBody = {
    items?: unknown;
    branch_id?: unknown;
};

type RpcItem = {
    variant_id: string;
    qty: number; // int >= 1
};

/* -------------------- Json -------------------- */
export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

/* -------------------- Idempotency row -------------------- */
type IdempotencyRow = {
    key: string;
    response: Json;
    created_at: string;
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
    supabase: ReturnType<typeof getSupabaseServer>,
    branchIdMaybe: string | null
): Promise<{ ok: true; id: string } | { ok: false; error: string; code: string }> {
    if (branchIdMaybe) {
        // validate exists
        const { data, error } = await supabase
            .from("branch")
            .select("id")
            .eq("id", branchIdMaybe)
            .maybeSingle();

        if (error) return { ok: false, error: error.message, code: "BRANCH_LOOKUP_FAILED" };
        if (!data?.id) return { ok: false, error: "Invalid branch_id", code: "INVALID_BRANCH" };
        return { ok: true, id: data.id as string };
    }

    // fallback primary
    const { data: primary, error: pErr } = await supabase
        .from("branch")
        .select("id")
        .eq("is_primary", true)
        .order("created_at", { ascending: false })
        .maybeSingle();

    if (pErr) return { ok: false, error: pErr.message, code: "BRANCH_LOOKUP_FAILED" };
    if (primary?.id) return { ok: true, id: primary.id as string };

    // fallback any branch
    const { data: anyB, error: aErr } = await supabase
        .from("branch")
        .select("id")
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
    const supabase = getSupabaseServer();

    try {
        const { searchParams } = new URL(req.url);
        const search = (searchParams.get("search") || "").trim();
        const categoryId = searchParams.get("category_id");
        const serveTypeId = searchParams.get("serve_type_id");

        let q = supabase
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

        if (search) q = q.ilike("name", `%${search}%`);
        if (categoryId) q = q.eq("category_id", categoryId);
        if (serveTypeId) q = q.filter("variants.serve_type_id", "eq", serveTypeId);

        const { data, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const menus = asArray<MenuRow>(data);

        const feed: PosMenuFeedItem[] = menus.map((m) => {
            const basePrice = Number(m.price ?? 0);
            const variantsRaw = asArray<VariantRow>(m.variants);

            const variantsFiltered = serveTypeId
                ? variantsRaw.filter((v) => v.serve_type_id === serveTypeId)
                : variantsRaw;

            const variants: PosVariant[] = variantsFiltered.map((v) => ({
                id: v.id,
                is_default: !!v.is_default,
                price: Number(v.price_override ?? basePrice),
                serve_type: v.serve_type ? { id: v.serve_type.id, name: v.serve_type.name } : null,
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
        });

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
    const supabase = getSupabaseServer();

    try {
        const idempotencyKey = getIdempotencyKey(req);

        // 1) Idempotency: return existing response
        if (idempotencyKey) {
            const { data: existing, error: exErr } = await supabase
                .from("pos_idempotency")
                .select("key, response, created_at")
                .eq("key", idempotencyKey)
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

        // 2) Resolve branch id (always!)
        const branchIdInput = toStringOrNull(raw?.branch_id);
        const branchRes = await resolveBranchId(supabase, branchIdInput);
        if (!branchRes.ok) {
            return NextResponse.json({ error: branchRes.error, code: branchRes.code }, { status: 400 });
        }

        // 3) Call RPC: signature in DB is (p_items jsonb, p_branch_id uuid)
        // TS: p_branch_id in generated types might be optional, but sending it is always OK.
        const rpcArgs = {
            p_items: toJson(items),
            p_branch_id: branchRes.id,
        } as { p_items: Json; p_branch_id: string };

        const { data, error } = await supabase.rpc("process_pos_checkout", rpcArgs);

        if (error) {
            const code = mapCheckoutErrorCode(error.message || "");
            return NextResponse.json({ error: error.message, code }, { status: 400 });
        }

        // 4) Save idempotency response
        if (idempotencyKey) {
            const payload: Json = toJson(data ?? { ok: true });

            // insert array to keep TS overload calm
            const { error: insErr } = await supabase
                .from("pos_idempotency")
                .insert([{ key: idempotencyKey, response: payload }]);

            // ถ้าชน unique ก็ช่างมัน (อีก request อาจบันทึกไปแล้ว)
            if (insErr) {
                const { data: fallback } = await supabase
                    .from("pos_idempotency")
                    .select("key, response, created_at")
                    .eq("key", idempotencyKey)
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
