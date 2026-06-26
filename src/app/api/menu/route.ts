// app/api/menu/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolvePublicShopId } from "@/lib/publicShop";
import type { MenuRow } from "@/lib/types";
import {
    isMenuEnabledInBranch,
    loadBranchMenuAvailabilityMap,
    upsertBranchMenuAvailability,
} from "@/lib/branchMenuAvailability";

export const dynamic = "force-dynamic";

/* =========================
   Types
========================= */
type UUID = string;

type VariantRow = {
    menu_id: UUID;
    serve_type_id: UUID;
    price_override: number | null;
    is_default: boolean;
    size: string;
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
    is_enabled_in_branch: boolean;
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

type ServeTypeRow = { id: UUID; name: string };
type CategoryRow = { id: UUID; name: string };

type ServePricingInputRow = {
    serveType: string;
    price_override: number | null;
};

type MenuVariantInsert = {
    menu_id: UUID;
    shop_id: UUID;
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

async function findDuplicateMenuByName(params: {
    client: ReturnType<typeof getSupabaseAdmin>;
    shopId: string;
    name: string;
    excludeMenuId?: string;
}): Promise<{ id: UUID; name: string } | null> {
    const { client, shopId, name, excludeMenuId } = params;

    let q = client.from("menu").select("id,name").eq("shop_id", shopId).limit(500);
    if (excludeMenuId) q = q.neq("id", excludeMenuId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const target = normName(name);
    const found = (data ?? []).find((row) => normName(String(row.name ?? "")) === target);
    if (!found) return null;
    return { id: found.id as UUID, name: String(found.name ?? "") };
}

async function readJson(req: NextRequest): Promise<unknown> {
    try {
        return await req.json();
    } catch {
        return null;
    }
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
function isAuthSessionMissingError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return message.includes("AuthSessionMissingError") || message.includes("Auth session missing");
}

export async function GET(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth.user ?? null;

    if (authErr && !isAuthSessionMissingError(authErr)) {
        return NextResponse.json({ error: authErr.message }, { status: 500 });
    }

    const includeDisabled =
        (req.nextUrl.searchParams.get("include_disabled") ?? "").toLowerCase() === "1" ||
        (req.nextUrl.searchParams.get("include_disabled") ?? "").toLowerCase() === "true";

    const { shopId: publicShopId, mismatch } = resolvePublicShopId(req.nextUrl.searchParams);
    let selectedShopId: string | null = null;
    let currentBranchId: string | null = null;

    if (!user) {
        if (mismatch) {
            return NextResponse.json({ error: "shop_id mismatch" }, { status: 403 });
        }
        if (!publicShopId) {
            return NextResponse.json(
                { error: "Public shop not configured" },
                { status: 409 }
            );
        }
        selectedShopId = publicShopId;
    } else {
        const { currentShopId, currentBranchId: branchId } = await getCurrentContextFromCookies();
        if (!currentShopId) {
            return NextResponse.json(
                { error: "No current shop selected" },
                { status: 409 }
            );
        }

        const { data: member, error: memberErr } = await admin
            .from("shop_members")
            .select("role")
            .eq("user_id", user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (memberErr) {
            return NextResponse.json({ error: memberErr.message }, { status: 500 });
        }
        if (!member) {
            return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
        }

        selectedShopId = currentShopId;
        currentBranchId = branchId;
    }

    const db = admin;

    const { data: menus, error } = await db
        .from("menu")
        .select("id,name,price,image_url,description,created_at,category_id")
        .eq("shop_id", selectedShopId!)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const menusRaw = (menus ?? []) as MenuRow[];
    const menuIdsAll = menusRaw.map((m) => m.id);
    let availabilityMap = new Map<string, boolean>();

    // Branch-level visibility is applied only in authenticated flow with selected branch.
    if (user && currentBranchId && menuIdsAll.length > 0) {
        try {
            availabilityMap = await loadBranchMenuAvailabilityMap({
                client: admin,
                branchId: currentBranchId,
                menuIds: menuIdsAll,
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to load branch menu availability";
            return NextResponse.json({ error: msg }, { status: 500 });
        }
    }

    const menusScoped =
        user && currentBranchId && !includeDisabled
            ? menusRaw.filter((m) => isMenuEnabledInBranch(m.id, availabilityMap))
            : menusRaw;

    const menuIds = menusScoped.map((m) => m.id);
    if (!menuIds.length) return NextResponse.json({ menu: [] });

    const categoryIds = Array.from(
        new Set(menusScoped.map((m) => m.category_id).filter(Boolean))
    ) as UUID[];

    const categoryMap = new Map<UUID, string>();
    if (categoryIds.length) {
        const { data: cats, error: cErr } = await db
            .from("menu_categories")
            .select("id,name")
            .eq("shop_id", selectedShopId!)
            .in("id", categoryIds);
        if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

        const catsRows = (cats ?? []) as CategoryRow[];
        for (const c of catsRows) {
            if (c.id && c.name) categoryMap.set(c.id, c.name);
        }
    }

    const { data: variants, error: vErr } = await db
        .from("menu_variants")
        .select("menu_id,serve_type_id,price_override,is_default,size")
        .eq("shop_id", selectedShopId!)
        .in("menu_id", menuIds);
    if (vErr) {
        return NextResponse.json({ error: vErr.message }, { status: 500 });
    }

    const variantRows = (variants ?? []) as VariantRow[];
    const serveTypeIds = Array.from(
        new Set(variantRows.map((v) => v.serve_type_id).filter(Boolean))
    ) as UUID[];

    const serveTypeMap = new Map<UUID, string>();
    if (serveTypeIds.length) {
        const { data: sts, error: stErr } = await db
            .from("menu_serve_types")
            .select("id,name")
            .eq("shop_id", selectedShopId!)
            .in("id", serveTypeIds);
        if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

        const serveRows = (sts ?? []) as ServeTypeRow[];
        for (const s of serveRows) {
            if (s.id && s.name) serveTypeMap.set(s.id, s.name);
        }
    }

    const basePriceByMenu = new Map<UUID, number>();
    for (const m of menusScoped) basePriceByMenu.set(m.id, Number(m.price));

    const byMenuId = new Map<
        UUID,
        {
            serveNames: Set<string>;
            servePrices: Map<string, ApiServePrice>;
        }
    >();

    for (const m of menusScoped) {
        byMenuId.set(m.id, { serveNames: new Set(), servePrices: new Map() });
    }

    for (const r of variantRows) {
        const serveName = serveTypeMap.get(r.serve_type_id)?.trim();
        if (!serveName) continue;

        const bucket = byMenuId.get(r.menu_id);
        if (!bucket) continue;

        bucket.serveNames.add(serveName);

        const base = basePriceByMenu.get(r.menu_id) ?? 0;
        const override = r.price_override;
        const computed = override !== null ? Number(override) : Number(base);

        const existing = bucket.servePrices.get(serveName);
        const candidate: ApiServePrice = {
            serve_type: serveName,
            price: Number.isFinite(computed) ? computed : base,
            is_default: Boolean(r.is_default),
            has_override: override !== null,
        };

        if (!existing) {
            bucket.servePrices.set(serveName, candidate);
        } else if (!existing.is_default && candidate.is_default) {
            bucket.servePrices.set(serveName, candidate);
        }
    }

    const final: ApiMenuRow[] = menusScoped.map((m) => {
        const bucket = byMenuId.get(m.id);
        const serve_prices = Array.from(bucket?.servePrices.values() ?? []);
        const serve_types = bucket ? Array.from(bucket.serveNames.values()) : [];
        const isEnabledInBranch =
            user && currentBranchId ? isMenuEnabledInBranch(m.id, availabilityMap) : true;

        return {
            id: m.id,
            name: m.name,
            price: m.price,
            image_url: m.image_url ?? "",
            description: m.description ?? "",
            category: categoryMap.get(m.category_id) ?? null,
            serve_types: serve_types.length ? serve_types : serve_prices.map((x) => x.serve_type),
            serve_prices,
            is_enabled_in_branch: isEnabledInBranch,
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
    const admin = getSupabaseAdmin();
    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    if (!currentShopId) {
        return NextResponse.json(
            { error: "No current shop selected" },
            { status: 409 }
        );
    }
    if (!currentBranchId) {
        return NextResponse.json(
            { error: "No current branch selected" },
            { status: 409 }
        );
    }
    const { data: member, error: memberErr } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
    if (!member || member.role !== "owner") {
        return NextResponse.json({ error: "Owner only" }, { status: 403 });
    }

    // 1) map category name -> category_id (shop-scoped, case-insensitive)
    const { data: catRows, error: catErr } = await admin
        .from("menu_categories")
        .select("id,name")
        .eq("shop_id", currentShopId)
        .returns<CategoryRow[]>();

    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });
    const cat = (catRows ?? []).find((c) => normName(c.name) === normName(categoryName));
    if (!cat?.id) {
        return NextResponse.json({ error: `Category not found: ${categoryName}` }, { status: 400 });
    }

    // 2) map serve names -> serve_type_ids (shop-scoped, case-insensitive)
    const { data: serves, error: serveErr } = await admin
        .from("menu_serve_types")
        .select("id,name")
        .eq("shop_id", currentShopId)
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

    // 3) duplicate name guard (shop-scoped, case/space-insensitive)
    try {
        const dup = await findDuplicateMenuByName({
            client: admin,
            shopId: currentShopId,
            name,
        });
        if (dup) {
            return NextResponse.json(
                { error: `Menu name already exists in this shop: ${name}` },
                { status: 409 }
            );
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to validate menu duplicate";
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    // 4) insert menu
    const { data: createdMenu, error: menuInsertErr } = await admin
        .from("menu")
        .insert({
            name,
            price,
            description,
            image_url: imageUrl || null,
            category_id: cat.id,
            shop_id: currentShopId,
        })
        .select("id,shop_id")
        .single();

    if (menuInsertErr) {
        if (menuInsertErr.code === "23505") {
            return NextResponse.json(
                { error: `Menu name already exists in this shop: ${name}` },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: menuInsertErr.message }, { status: 500 });
    }
    const menuId = createdMenu?.id as UUID | undefined;
    const shopId = createdMenu?.shop_id as UUID | undefined;
    if (!menuId || !shopId) {
        return NextResponse.json({ error: "Insert menu failed" }, { status: 500 });
    }

    // 5) insert 1 default variant per serveType
    const variantRows: MenuVariantInsert[] = serveTypes.map((serveName) => {
        const sid = serveIdByNorm.get(normName(serveName))!;
        const p = priceByServeNorm.has(normName(serveName))
            ? priceByServeNorm.get(normName(serveName))!
            : null;

        return {
            menu_id: menuId,
            shop_id: shopId,
            serve_type_id: sid,
            size: "default",
            price_override: p,
            image_url: imageUrl || null,
            is_default: true,
        };
    });

    const { error: vErr } = await admin.from("menu_variants").insert(variantRows);
    if (vErr) {
        await admin.from("menu").delete().eq("id", menuId).eq("shop_id", currentShopId);
        return NextResponse.json({ error: vErr.message }, { status: 500 });
    }

    // New menu is enabled only in current branch by default.
    // Other branches stay disabled until owner explicitly enables.
    try {
        await upsertBranchMenuAvailability({
            client: admin,
            branchId: currentBranchId,
            menuId,
            shopId,
            isEnabled: true,
        });
    } catch (e: unknown) {
        await admin.from("menu_variants").delete().eq("menu_id", menuId).eq("shop_id", currentShopId);
        await admin.from("menu").delete().eq("id", menuId).eq("shop_id", currentShopId);
        const errMsg =
            e instanceof Error
                ? e.message
                : "Failed to set branch availability for new menu";
        return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: menuId }, { status: 201 });
}

/* =========================================================
   PUT /api/menu
   Update menu fields only (do not touch variants here)
========================================================= */
export async function PUT(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { currentShopId } = await getCurrentContextFromCookies();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    if (!currentShopId) {
        return NextResponse.json(
            { error: "No current shop selected" },
            { status: 409 }
        );
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

    // map category name -> category_id (shop-scoped, case-insensitive)
    const { data: catRows, error: catErr } = await admin
        .from("menu_categories")
        .select("id,name")
        .eq("shop_id", currentShopId)
        .returns<CategoryRow[]>();

    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });
    const cat = (catRows ?? []).find((c) => normName(c.name) === normName(categoryName));
    if (!cat?.id)
        return NextResponse.json({ error: `Category not found: ${categoryName}` }, { status: 400 });

    // duplicate name guard (shop-scoped, case/space-insensitive)
    try {
        const dup = await findDuplicateMenuByName({
            client: admin,
            shopId: currentShopId,
            name,
            excludeMenuId: id,
        });
        if (dup) {
            return NextResponse.json(
                { error: `Menu name already exists in this shop: ${name}` },
                { status: 409 }
            );
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to validate menu duplicate";
        return NextResponse.json({ error: msg }, { status: 500 });
    }

    // 1) update menu fields
    const { data: updated, error: uErr } = await admin
        .from("menu")
        .update({
            name,
            price,
            description,
            image_url: imageUrl || null,
            category_id: cat.id,
        })
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .select("id")
        .maybeSingle();

    if (uErr || !updated) {
        if (uErr?.code === "23505") {
            return NextResponse.json(
                { error: `Menu name already exists in this shop: ${name}` },
                { status: 409 }
            );
        }
        return NextResponse.json(
            { error: uErr?.message ?? "Failed to update menu" },
            { status: 500 }
        );
    }

    // 2) map serve names -> ids
    const { data: serves, error: serveErr } = await admin
        .from("menu_serve_types")
        .select("id,name")
        .eq("shop_id", currentShopId)
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
    const { data: existing, error: exErr } = await admin
        .from("menu_variants")
        .select("id, serve_type_id, is_default")
        .eq("menu_id", id)
        .eq("shop_id", currentShopId);

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
        const { error: delErr } = await admin
            .from("menu_variants")
            .delete()
            .eq("shop_id", currentShopId)
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
            shop_id: currentShopId,
            serve_type_id: sid,
            size: "default",
            price_override: p,
            image_url: imageUrl || null,
            is_default: false, // จะจัด default ทีหลัง
        });
    }

    if (toInsert.length) {
        const { error: insErr } = await admin.from("menu_variants").insert(toInsert);
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // 6) update price_override/image_url for all wanted serves
    // (ทำทีละ serve แบบชัวร์ ๆ)
    for (const serveName of serveTypes) {
        const sid = serveIdByNorm.get(normName(serveName))!;
        const p = priceByServeNorm.has(normName(serveName))
            ? priceByServeNorm.get(normName(serveName))!
            : null;

        const { error: upvErr } = await admin
            .from("menu_variants")
            .update({
                price_override: p,
                image_url: imageUrl || null,
            })
            .eq("menu_id", id)
            .eq("shop_id", currentShopId)
            .eq("serve_type_id", sid);

        if (upvErr) return NextResponse.json({ error: upvErr.message }, { status: 500 });
    }

    // 7) ensure there is exactly one default variant
    // เลือกตัวแรกของ serveTypes ให้เป็น default (คุณจะเปลี่ยน logic ทีหลังได้)
    const defaultSid = serveIdByNorm.get(normName(serveTypes[0]))!;
    await admin
        .from("menu_variants")
        .update({ is_default: false })
        .eq("menu_id", id)
        .eq("shop_id", currentShopId);

    await admin
        .from("menu_variants")
        .update({ is_default: true })
        .eq("menu_id", id)
        .eq("shop_id", currentShopId)
        .eq("serve_type_id", defaultSid);

    return NextResponse.json({ success: true, id });
}

/* =========================================================
   DELETE /api/menu?id=...
========================================================= */
export async function DELETE(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }

    const { data: member, error: memberErr } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
    if (!member || member.role !== "owner") {
        return NextResponse.json({ error: "Owner only" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const scope = (url.searchParams.get("scope") ?? "branch").toLowerCase();

    if (!id) {
        return NextResponse.json({ error: "No id provided" }, { status: 400 });
    }

    // Safe default: branch-only remove (disable menu in current branch).
    // Global hard delete must explicitly pass ?scope=global.
    if (scope !== "global") {
        if (!currentBranchId) {
            return NextResponse.json({ error: "No current branch selected" }, { status: 409 });
        }

        const { data: menuRow, error: menuErr } = await admin
            .from("menu")
            .select("id,shop_id")
            .eq("id", id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (menuErr) {
            return NextResponse.json({ error: menuErr.message }, { status: 500 });
        }
        if (!menuRow?.id) {
            return NextResponse.json({ error: "Menu not found" }, { status: 404 });
        }

        try {
            await upsertBranchMenuAvailability({
                client: admin,
                branchId: currentBranchId,
                menuId: id,
                shopId: currentShopId,
                isEnabled: false,
            });
        } catch (e: unknown) {
            const msg =
                e instanceof Error ? e.message : "Failed to disable menu in current branch";
            return NextResponse.json({ error: msg }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            scope: "branch",
            menu_id: id,
            branch_id: currentBranchId,
            is_enabled: false,
        });
    }

    // Global hard delete across all branches.
    // 1) find variants of this menu
    const { data: variants, error: vErr } = await admin
        .from("menu_variants")
        .select("id")
        .eq("menu_id", id)
        .eq("shop_id", currentShopId);

    if (vErr) {
        return NextResponse.json({ error: vErr.message }, { status: 500 });
    }

    const variantIds = (variants ?? []).map((v) => v.id);

    // 2) detach order history (keep order_items but drop FK to variants)
    if (variantIds.length) {
        const { error: oiErr } = await admin
            .from("order_items")
            .update({ variant_id: null })
            .eq("shop_id", currentShopId)
            .in("variant_id", variantIds);

        if (oiErr) {
            return NextResponse.json({ error: oiErr.message }, { status: 500 });
        }

        // 3) delete recipe_items that point to variants
        const { error: riErr } = await admin
            .from("recipe_items")
            .delete()
            .eq("shop_id", currentShopId)
            .in("variant_id", variantIds);

        if (riErr) {
            return NextResponse.json({ error: riErr.message }, { status: 500 });
        }

        // 4) delete menu_variants
        const { error: mvErr } = await admin
            .from("menu_variants")
            .delete()
            .eq("shop_id", currentShopId)
            .in("id", variantIds);

        if (mvErr) {
            return NextResponse.json({ error: mvErr.message }, { status: 500 });
        }
    }

    // 5) delete menu_serves
    const { error: msErr } = await admin
        .from("menu_serves")
        .delete()
        .eq("menu_id", id)
        .eq("shop_id", currentShopId);

    if (msErr) {
        return NextResponse.json({ error: msErr.message }, { status: 500 });
    }

    // 6) delete recipes linked to menu
    const { error: rErr } = await admin
        .from("recipes")
        .delete()
        .eq("menu_id", id)
        .eq("shop_id", currentShopId);

    if (rErr) {
        return NextResponse.json({ error: rErr.message }, { status: 500 });
    }

    // 7) delete menu
    const { data: deleted, error } = await admin
        .from("menu")
        .delete()
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .select("id")
        .maybeSingle();
    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!deleted) {
        return NextResponse.json({ error: "Menu not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
}

