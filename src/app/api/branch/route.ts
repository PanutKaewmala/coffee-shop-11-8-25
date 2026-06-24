import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { resolvePublicShopId } from "@/lib/publicShop";

type ShopContextResult =
    | { ok: true; shopId: string; role: string | null }
    | { ok: false; response: NextResponse };

async function ensureCurrentShopContext(
    admin: ReturnType<typeof getSupabaseAdmin>,
    userId: string,
    ownerOnly = false
): Promise<ShopContextResult> {
    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return {
            ok: false,
            response: NextResponse.json({ error: "No current shop selected" }, { status: 409 }),
        };
    }

    const selectFields = ownerOnly
        ? "shop_id,role"
        : "shop_id";
    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select(selectFields)
        .eq("user_id", userId)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) {
        return {
            ok: false,
            response: NextResponse.json({ error: mErr.message }, { status: 500 }),
        };
    }

    if (!member) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Not a member of current shop" }, { status: 403 }),
        };
    }

    const maybeMember = member as { role?: unknown } | null;
    const role = typeof maybeMember?.role === "string" ? maybeMember.role : null;

    if (ownerOnly && role !== "owner") {
        return {
            ok: false,
            response: NextResponse.json({ error: "Owner only" }, { status: 403 }),
        };
    }

    return { ok: true, shopId: currentShopId, role };
}

export async function GET(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    const searchParams = req.nextUrl.searchParams;

    const all = searchParams.get("all");
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const primary = searchParams.get("primary") === "true";
    const page = Number(searchParams.get("page")) || null;
    const limit = Number(searchParams.get("limit")) || null;

    // Public read path (website) uses explicit public shop id.
    if (!user) {
        const { shopId, mismatch } = resolvePublicShopId(searchParams);
        if (mismatch) {
            return NextResponse.json({ error: "shop_id mismatch" }, { status: 403 });
        }
        if (!shopId) {
            return NextResponse.json({ error: "Public shop not configured" }, { status: 409 });
        }

        if (all) {
            const { data, error } = await admin
                .from("branch")
                .select("*")
                .eq("shop_id", shopId)
                .order("created_at", { ascending: false });

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json(data ?? []);
        }

        if (page && limit) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data, error } = await admin
            .from("branch")
            .select("*")
            .eq("shop_id", shopId)
            .eq("is_primary", true)
            .limit(1)
            .maybeSingle();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
    }

    const ctx = await ensureCurrentShopContext(admin, user.id);
    if (!ctx.ok) return ctx.response;
    const currentShopId = ctx.shopId;

    if (page && limit) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const baseQuery = admin
            .from("branch")
            .select("*", { count: "exact" })
            .eq("shop_id", currentShopId);

        const searchQuery = search
            ? baseQuery.or(`name.ilike.%${search}%,address.ilike.%${search}%`)
            : baseQuery;

        const finalQuery = primary ? searchQuery.eq("is_primary", true) : searchQuery;

        const { data, count, error } = await finalQuery
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({
            data: data ?? [],
            total: count ?? 0,
            page,
            totalPages: Math.ceil((count || 0) / limit),
        });
    }

    if (all) {
        const { data, error } = await admin
            .from("branch")
            .select("*")
            .eq("shop_id", currentShopId)
            .order("created_at", { ascending: false });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data ?? []);
    }

    const { data, error } = await admin
        .from("branch")
        .select("*")
        .eq("shop_id", currentShopId)
        .eq("is_primary", true)
        .limit(1)
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ctx = await ensureCurrentShopContext(admin, user.id, true);
    if (!ctx.ok) return ctx.response;
    const currentShopId = ctx.shopId;

    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const address = typeof body?.address === "string" ? body.address.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const mapLink = typeof body?.map_url === "string" ? body.map_url.trim() : typeof body?.mapLink === "string" ? body.mapLink.trim() : "";
    const openingHours =
        typeof body?.opening_hours === "string"
            ? body.opening_hours.trim()
            : typeof body?.openingHours === "string"
                ? body.openingHours.trim()
                : "";

    if (!name || !address) {
        return NextResponse.json(
            { error: "Missing required fields: name, address" },
            { status: 400 }
        );
    }

    // First branch in a shop should become primary automatically.
    const { count: existingCount, error: countErr } = await admin
        .from("branch")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", currentShopId);

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
    const isFirstBranch = (existingCount ?? 0) === 0;

    const basePayload = {
        name,
        address,
        phone: phone || null,
        map_url: mapLink || null,
        opening_hours: openingHours || null,
        shop_id: currentShopId,
    };

    let createdData: unknown = null;
    let lastError: string | null = null;

    const firstTry = await admin
        .from("branch")
        .insert([{ ...basePayload, is_primary: isFirstBranch }])
        .select()
        .single();

    if (!firstTry.error) {
        createdData = firstTry.data;
    } else {
        lastError = firstTry.error.message;

        const shouldRetryAsNonPrimary =
            isFirstBranch && firstTry.error.message.includes("branch_one_primary_idx");

        if (shouldRetryAsNonPrimary) {
            const fallbackTry = await admin
                .from("branch")
                .insert([{ ...basePayload, is_primary: false }])
                .select()
                .single();

            if (!fallbackTry.error) {
                createdData = fallbackTry.data;
            } else {
                lastError = fallbackTry.error.message;
            }
        }
    }

    if (!createdData) {
        return NextResponse.json(
            { error: lastError ?? "Failed to create branch" },
            { status: 500 }
        );
    }

    return NextResponse.json(createdData, { status: 201 });
}

export async function PUT(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ctx = await ensureCurrentShopContext(admin, user.id, true);
    if (!ctx.ok) return ctx.response;
    const currentShopId = ctx.shopId;

    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data: existing, error: existErr } = await admin
        .from("branch")
        .select("id")
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

    const payload: Record<string, string | null> = {};
    if (body?.name !== undefined) payload.name = String(body.name).trim();
    if (body?.address !== undefined) payload.address = String(body.address).trim();
    if (body?.phone !== undefined) payload.phone = body.phone ? String(body.phone).trim() : null;
    if (body?.map_url !== undefined) payload.map_url = body.map_url ? String(body.map_url).trim() : null;
    if (body?.mapLink !== undefined) payload.map_url = body.mapLink ? String(body.mapLink).trim() : null;
    if (body?.opening_hours !== undefined)
        payload.opening_hours = body.opening_hours ? String(body.opening_hours).trim() : null;
    if (body?.openingHours !== undefined)
        payload.opening_hours = body.openingHours ? String(body.openingHours).trim() : null;

    const { data, error } = await admin
        .from("branch")
        .update(payload)
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .select()
        .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ctx = await ensureCurrentShopContext(admin, user.id, true);
    if (!ctx.ok) return ctx.response;
    const currentShopId = ctx.shopId;

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "No id provided" }, { status: 400 });

    const { data: branchRow, error: branchErr } = await admin
        .from("branch")
        .select("id")
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (branchErr) return NextResponse.json({ error: branchErr.message }, { status: 500 });
    if (!branchRow) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

    const { count: totalInShop, error: countErr } = await admin
        .from("branch")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", currentShopId);

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
    if ((totalInShop ?? 0) <= 1) {
        return NextResponse.json(
            { error: "At least one branch is required per shop" },
            { status: 409 }
        );
    }

    const { error } = await admin
        .from("branch")
        .delete()
        .eq("id", id)
        .eq("shop_id", currentShopId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
