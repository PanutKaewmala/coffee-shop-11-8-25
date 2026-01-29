// app/api/menu/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { MenuRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/* =========================
   Types
========================= */
type UUID = string;

type CategoryJoin = { id: UUID; name: string } | null;

type MenuWithCategory = MenuRow & {
    category: CategoryJoin;
};

type VariantServeJoinRow = {
    menu_id: UUID;
    price_override: number | null;
    is_default: boolean;
    size: string;
    serve_type: { name: string } | null;
};

type ApiServePrice = {
    serve_type: string;
    price: number;
    is_default: boolean;
    has_override: boolean;
};

type ApiMenuRow = {
    id: UUID;
    name: string;
    price: number;
    image_url: string;
    description: string;
    category: string | null;
    serve_types: string[];
    serve_prices: ApiServePrice[];
    created_at: string;
};

type MenuPayload = {
    id?: unknown;
    name?: unknown;
    price?: unknown;
    category?: unknown;
    serveTypes?: unknown;
    servePricing?: unknown;
    image?: unknown;
    description?: unknown;
};

type SupabaseErrorLike = {
    message: string;
    details?: string | null;
    hint?: string | null;
    code?: string | null;
};

type ServeTypeRow = { id: UUID; name: string };

type ServePricingInputRow = {
    serveType: string;
    price_override: number | null;
};

type MenuVariantInsert = {
    menu_id: UUID;
    serve_type_id: UUID;
    size: string;
    price_override: number | null;
    image_url: string | null;
    is_default: boolean;
};

/* =========================
   Helpers
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | null {
    return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asStringArray(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
}

function uniqueStrings(arr: string[]) {
    return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

function normName(s: string) {
    return s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

async function readJson(req: NextRequest): Promise<unknown> {
    try {
        return await req.json();
    } catch {
        return null;
    }
}

function toSupabaseErrorLike(err: unknown): SupabaseErrorLike {
    if (typeof err === "object" && err !== null && "message" in err) {
        const e = err as Record<string, unknown>;
        return {
            message: typeof e.message === "string" ? e.message : "Unknown error",
            details: typeof e.details === "string" ? e.details : null,
            hint: typeof e.hint === "string" ? e.hint : null,
            code: typeof e.code === "string" ? e.code : null,
        };
    }
    return { message: "Unknown error" };
}

function parseServePricing(v: unknown): ServePricingInputRow[] {
    if (!Array.isArray(v)) return [];

    const map = new Map<string, ServePricingInputRow>();

    for (const row of v) {
        if (!isRecord(row)) continue;

        const serveType = asString(row.serveType)?.trim();
        if (!serveType) continue;

        let price_override: number | null = null;
        const raw = row.price_override;

        if (raw === null || raw === undefined) {
            price_override = null;
        } else if (typeof raw === "number" && Number.isFinite(raw)) {
            price_override = raw;
        } else if (typeof raw === "string" && raw.trim() !== "") {
            const n = Number(raw);
            price_override = Number.isFinite(n) ? n : null;
        }

        map.set(normName(serveType), { serveType, price_override });
    }

    return Array.from(map.values());
}

/* =========================================================
   GET /api/menu
   returns: { menu: ApiMenuRow[] }
   includes serve_prices (from menu_variants)
========================================================= */
export async function GET() {
    const supabase = await getSupabaseServer();

    const { data: menus, error } = await supabase
        .from("menu")
        .select(
            `
        id,
        name,
        price,
        image_url,
        description,
        created_at,
        category:menu_categories!menu_category_fk ( id, name )
      `
        )
        .order("created_at", { ascending: false })
        .returns<MenuWithCategory[]>();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const menuIds = (menus ?? []).map((m) => m.id);
    const byMenuId = new Map<
        UUID,
        {
            serveNames: string[];
            servePrices: Map<string, ApiServePrice>;
        }
    >();

    for (const m of menus ?? []) {
        byMenuId.set(m.id, { serveNames: [], servePrices: new Map() });
    }

    if (menuIds.length) {
        const { data: variants, error: vErr } = await supabase
            .from("menu_variants")
            .select(
                `
          menu_id,
          size,
          price_override,
          is_default,
          serve_type:menu_serve_types!menu_variants_serve_type_id_fkey ( name )
        `
            )
            .in("menu_id", menuIds)
            .returns<VariantServeJoinRow[]>();

        if (vErr) {
            return NextResponse.json({ error: vErr.message }, { status: 500 });
        }

        // Pick 1 representative variant per (menu_id, serve_type):
        // prefer is_default = true, else first seen.
        for (const r of variants ?? []) {
            const serveName = r.serve_type?.name?.trim();
            if (!serveName) continue;

            const bucket = byMenuId.get(r.menu_id);
            if (!bucket) continue;

            bucket.serveNames.push(serveName);

            // store best candidate per serveName
            const existing = bucket.servePrices.get(serveName);
            const candidate: ApiServePrice = {
                serve_type: serveName,
                price: 0, // filled later because need base price
                is_default: Boolean(r.is_default),
                has_override: r.price_override !== null,
            };

            if (!existing) {
                bucket.servePrices.set(serveName, candidate);
            } else {
                // prefer default
                if (!existing.is_default && candidate.is_default) {
                    bucket.servePrices.set(serveName, candidate);
                }
            }
        }
    }

    const result: ApiMenuRow[] = (menus ?? []).map((m) => {
        const bucket = byMenuId.get(m.id);
        const serveNames = uniqueStrings(bucket?.serveNames ?? []);

        const servePrices: ApiServePrice[] = Array.from(
            (bucket?.servePrices ?? new Map<string, ApiServePrice>()).values()
        ).map((sp) => {
            const price = sp.has_override ? (Number.isFinite(sp.price) ? sp.price : 0) : 0;
            // price is unknown here; compute with base + override map using a second pass:
            // We'll compute override from variants via has_override flag is true but we didn't store value.
            // Fix: compute price using query data again? Not ideal.
            // Better: store override value in map during loop.
            return { ...sp, price };
        });

        return {
            id: m.id,
            name: m.name,
            price: m.price,
            image_url: m.image_url ?? "",
            description: m.description ?? "",
            category: m.category?.name ?? null,
            serve_types: serveNames,
            serve_prices: servePrices, // placeholder, will fill properly below
            created_at: m.created_at!,
        };
    });

    // Rebuild serve_prices with correct price values in one pass using variants again,
    // without extra DB query: we already have variants? Not accessible here.
    // So: do a single variants query above and keep a map of override values too.

    // ✅ We'll redo minimal: query variants again with override values stored in-memory.
    // To avoid extra query, we should have captured override values during the first loop.
    // We'll do that by re-querying only if needed is worse; instead we adjust above:
    // NOTE: We cannot access "variants" here since it was scoped. We'll restructure quickly:
    // -> Simplest: return without second pass is wrong. So we restructure now:

    // --- Re-run with a correct approach (still single DB hit): ---
    // We'll do it properly by doing the whole GET construction again but correctly, without multiple DB calls.
    // Since we already made the DB calls, we can just re-fetch variants once more is acceptable,
    // but not ideal. We'll still keep it correct.

    // If no menus, return.
    if (!menuIds.length) return NextResponse.json({ menu: [] });

    const { data: variants2, error: vErr2 } = await supabase
        .from("menu_variants")
        .select(
            `
        menu_id,
        price_override,
        is_default,
        serve_type:menu_serve_types!menu_variants_serve_type_id_fkey ( name )
      `
        )
        .in("menu_id", menuIds)
        .returns<VariantServeJoinRow[]>();

    if (vErr2) {
        return NextResponse.json({ error: vErr2.message }, { status: 500 });
    }

    const basePriceByMenu = new Map<UUID, number>();
    for (const m of menus ?? []) basePriceByMenu.set(m.id, Number(m.price));

    // Build final serve_prices per menu with correct price
    const servePricesByMenu = new Map<UUID, Map<string, ApiServePrice>>();
    for (const mid of menuIds) servePricesByMenu.set(mid, new Map());

    for (const r of variants2 ?? []) {
        const serveName = r.serve_type?.name?.trim();
        if (!serveName) continue;

        const base = basePriceByMenu.get(r.menu_id) ?? 0;
        const override = r.price_override;
        const computed = override !== null ? Number(override) : Number(base);

        const mp = servePricesByMenu.get(r.menu_id);
        if (!mp) continue;

        const existing = mp.get(serveName);
        const candidate: ApiServePrice = {
            serve_type: serveName,
            price: Number.isFinite(computed) ? computed : base,
            is_default: Boolean(r.is_default),
            has_override: override !== null,
        };

        if (!existing) {
            mp.set(serveName, candidate);
        } else {
            // prefer default row per serve
            if (!existing.is_default && candidate.is_default) {
                mp.set(serveName, candidate);
            }
        }
    }

    const final: ApiMenuRow[] = (menus ?? []).map((m) => {
        const bucket = byMenuId.get(m.id);
        const serveNames = uniqueStrings(bucket?.serveNames ?? []);
        const mp = servePricesByMenu.get(m.id) ?? new Map<string, ApiServePrice>();
        const serve_prices = Array.from(mp.values());

        return {
            id: m.id,
            name: m.name,
            price: m.price,
            image_url: m.image_url ?? "",
            description: m.description ?? "",
            category: m.category?.name ?? null,
            serve_types: serveNames.length ? serveNames : serve_prices.map((x) => x.serve_type),
            serve_prices,
            created_at: m.created_at!,
        };
    });

    return NextResponse.json({ menu: final });
}

/* =========================================================
   POST /api/menu
   Create menu + create 1 default variant per serveType
========================================================= */
export async function POST(req: NextRequest) {
    const supabase = await getSupabaseServer();

    const raw = await readJson(req);
    if (!isRecord(raw)) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const body = raw as MenuPayload;

    const name = asString(body.name)?.trim();
    const price = asNumber(body.price);
    const categoryName = asString(body.category)?.trim();
    const description = asString(body.description) ?? "";
    const imageUrl = asString(body.image) ?? "";

    const serveTypes = uniqueStrings(asStringArray(body.serveTypes));
    const servePricing = parseServePricing(body.servePricing);

    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
    if (price === null || price <= 0)
        return NextResponse.json({ error: "Missing/invalid price" }, { status: 400 });
    if (!categoryName)
        return NextResponse.json({ error: "Missing category" }, { status: 400 });
    if (!serveTypes.length)
        return NextResponse.json({ error: "Missing serveTypes" }, { status: 400 });

    // 1) map category name -> category_id
    const { data: cat, error: catErr } = await supabase
        .from("menu_categories")
        .select("id,name")
        .ilike("name", categoryName)
        .maybeSingle();

    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });
    if (!cat?.id)
        return NextResponse.json({ error: `Category not found: ${categoryName}` }, { status: 400 });

    // 2) map serve names -> serve_type_ids
    const { data: serves, error: serveErr } = await supabase
        .from("menu_serve_types")
        .select("id,name")
        .in("name", serveTypes)
        .returns<ServeTypeRow[]>();

    if (serveErr) return NextResponse.json({ error: serveErr.message }, { status: 500 });

    const serveIdByNorm = new Map<string, UUID>();
    for (const s of serves ?? []) serveIdByNorm.set(normName(s.name), s.id);

    const missing = serveTypes.filter((n) => !serveIdByNorm.has(normName(n)));
    if (missing.length) {
        return NextResponse.json(
            { error: `Serve types not found: ${missing.join(", ")}` },
            { status: 400 }
        );
    }

    // pricing map
    const priceByServeNorm = new Map<string, number | null>();
    for (const r of servePricing) priceByServeNorm.set(normName(r.serveType), r.price_override);

    // 3) insert menu
    const { data: createdMenu, error: mErr } = await supabase
        .from("menu")
        .insert({
            name,
            price,
            description,
            image_url: imageUrl || null,
            category_id: cat.id,
        })
        .select("id")
        .single();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    const menuId = createdMenu?.id as UUID | undefined;
    if (!menuId) return NextResponse.json({ error: "Insert menu failed" }, { status: 500 });

    // 4) insert 1 default variant per serveType
    const variantRows: MenuVariantInsert[] = serveTypes.map((serveName) => {
        const sid = serveIdByNorm.get(normName(serveName))!;
        const p = priceByServeNorm.has(normName(serveName))
            ? priceByServeNorm.get(normName(serveName))!
            : null;

        return {
            menu_id: menuId,
            serve_type_id: sid,
            size: "default",
            price_override: p,
            image_url: imageUrl || null,
            is_default: true,
        };
    });

    const { error: vErr } = await supabase.from("menu_variants").insert(variantRows);
    if (vErr) {
        await supabase.from("menu").delete().eq("id", menuId);
        return NextResponse.json({ error: vErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: menuId }, { status: 201 });
}

/* =========================================================
   PUT /api/menu
   Update menu fields only (do not touch variants here)
========================================================= */
export async function PUT(req: NextRequest) {
    const supabase = await getSupabaseServer();

    const raw = await readJson(req);
    if (!isRecord(raw)) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const body = raw as MenuPayload;

    const id = asString(body.id)?.trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const name = asString(body.name)?.trim();
    const price = asNumber(body.price);
    const categoryName = asString(body.category)?.trim();
    const description = asString(body.description) ?? "";
    const imageUrl = asString(body.image) ?? "";

    // ✅ NEW: serveTypes + servePricing
    const serveTypes = uniqueStrings(asStringArray(body.serveTypes));
    const servePricing = parseServePricing(body.servePricing);

    if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
    if (price === null || price <= 0)
        return NextResponse.json({ error: "Missing/invalid price" }, { status: 400 });
    if (!categoryName)
        return NextResponse.json({ error: "Missing category" }, { status: 400 });
    if (!serveTypes.length)
        return NextResponse.json({ error: "Missing serveTypes" }, { status: 400 });

    // map category name -> category_id
    const { data: cat, error: catErr } = await supabase
        .from("menu_categories")
        .select("id,name")
        .ilike("name", categoryName)
        .maybeSingle();

    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });
    if (!cat?.id)
        return NextResponse.json({ error: `Category not found: ${categoryName}` }, { status: 400 });

    // 1) update menu fields
    const { data: updated, error: uErr } = await supabase
        .from("menu")
        .update({
            name,
            price,
            description,
            image_url: imageUrl || null,
            category_id: cat.id,
        })
        .eq("id", id)
        .select("id")
        .single();

    if (uErr || !updated) {
        return NextResponse.json(
            { error: uErr?.message ?? "Failed to update menu" },
            { status: 500 }
        );
    }

    // 2) map serve names -> ids
    const { data: serves, error: serveErr } = await supabase
        .from("menu_serve_types")
        .select("id,name")
        .in("name", serveTypes)
        .returns<ServeTypeRow[]>();

    if (serveErr) return NextResponse.json({ error: serveErr.message }, { status: 500 });

    const serveIdByNorm = new Map<string, UUID>();
    for (const s of serves ?? []) serveIdByNorm.set(normName(s.name), s.id);

    const missing = serveTypes.filter((n) => !serveIdByNorm.has(normName(n)));
    if (missing.length) {
        return NextResponse.json(
            { error: `Serve types not found: ${missing.join(", ")}` },
            { status: 400 }
        );
    }

    // pricing map (norm -> price_override)
    const priceByServeNorm = new Map<string, number | null>();
    for (const r of servePricing) priceByServeNorm.set(normName(r.serveType), r.price_override);

    const wantedServeIds = new Set<UUID>(
        serveTypes.map((n) => serveIdByNorm.get(normName(n))!)
    );

    // 3) read existing variants for this menu
    const { data: existing, error: exErr } = await supabase
        .from("menu_variants")
        .select("id, serve_type_id, is_default")
        .eq("menu_id", id);

    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

    const existingByServeId = new Map<UUID, { id: UUID; is_default: boolean }>();
    for (const v of existing ?? []) {
        existingByServeId.set(v.serve_type_id as UUID, {
            id: v.id as UUID,
            is_default: Boolean(v.is_default),
        });
    }

    // 4) delete removed serves
    const toDeleteIds: UUID[] = [];
    for (const [serveId, row] of existingByServeId.entries()) {
        if (!wantedServeIds.has(serveId)) toDeleteIds.push(row.id);
    }
    if (toDeleteIds.length) {
        const { error: delErr } = await supabase
            .from("menu_variants")
            .delete()
            .in("id", toDeleteIds);

        if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    // 5) insert new serves
    const toInsert: MenuVariantInsert[] = [];
    for (const serveName of serveTypes) {
        const sid = serveIdByNorm.get(normName(serveName))!;
        if (existingByServeId.has(sid)) continue;

        const p = priceByServeNorm.has(normName(serveName))
            ? priceByServeNorm.get(normName(serveName))!
            : null;

        toInsert.push({
            menu_id: id,
            serve_type_id: sid,
            size: "default",
            price_override: p,
            image_url: imageUrl || null,
            is_default: false, // จะจัด default ทีหลัง
        });
    }

    if (toInsert.length) {
        const { error: insErr } = await supabase.from("menu_variants").insert(toInsert);
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // 6) update price_override/image_url for all wanted serves
    // (ทำทีละ serve แบบชัวร์ ๆ)
    for (const serveName of serveTypes) {
        const sid = serveIdByNorm.get(normName(serveName))!;
        const p = priceByServeNorm.has(normName(serveName))
            ? priceByServeNorm.get(normName(serveName))!
            : null;

        const { error: upvErr } = await supabase
            .from("menu_variants")
            .update({
                price_override: p,
                image_url: imageUrl || null,
            })
            .eq("menu_id", id)
            .eq("serve_type_id", sid);

        if (upvErr) return NextResponse.json({ error: upvErr.message }, { status: 500 });
    }

    // 7) ensure there is exactly one default variant
    // เลือกตัวแรกของ serveTypes ให้เป็น default (คุณจะเปลี่ยน logic ทีหลังได้)
    const defaultSid = serveIdByNorm.get(normName(serveTypes[0]))!;
    await supabase
        .from("menu_variants")
        .update({ is_default: false })
        .eq("menu_id", id);

    await supabase
        .from("menu_variants")
        .update({ is_default: true })
        .eq("menu_id", id)
        .eq("serve_type_id", defaultSid);

    return NextResponse.json({ success: true, id });
}

/* =========================================================
   DELETE /api/menu?id=...
========================================================= */
export async function DELETE(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const id = new URL(req.url).searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "No id provided" }, { status: 400 });
    }

    const { error } = await supabase.from("menu").delete().eq("id", id);
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
