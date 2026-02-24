import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ContextResult =
    | { ok: true; shopId: string }
    | { ok: false; response: NextResponse };

async function ensureContext({ ownerOnly }: { ownerOnly: boolean }): Promise<ContextResult> {
    const supabase = await getSupabaseServer();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
        return {
            ok: false,
            response: NextResponse.json({ error: authErr.message }, { status: 500 }),
        };
    }

    const user = auth.user;
    if (!user) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        };
    }

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return {
            ok: false,
            response: NextResponse.json({ error: "No current shop selected" }, { status: 409 }),
        };
    }

    const admin = getSupabaseAdmin();
    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", user.id)
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
    if (ownerOnly && member.role !== "owner") {
        return {
            ok: false,
            response: NextResponse.json({ error: "Owner only" }, { status: 403 }),
        };
    }

    return { ok: true, shopId: currentShopId };
}

// GET - list serve types in current shop
export async function GET() {
    const ctx = await ensureContext({ ownerOnly: false });
    if (!ctx.ok) return ctx.response;

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from("menu_serve_types")
        .select("*")
        .eq("shop_id", ctx.shopId)
        .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
}

// POST - add serve type in current shop
export async function POST(req: NextRequest) {
    const body = await req.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const ctx = await ensureContext({ ownerOnly: true });
    if (!ctx.ok) return ctx.response;

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from("menu_serve_types")
        .insert({
            name,
            shop_id: ctx.shopId,
            is_system: false,
            system_key: null,
        })
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json(
                { error: `Serve type name already exists in this shop: ${name}` },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
}

// PUT - update serve type name in current shop
export async function PUT(req: NextRequest) {
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!id || !name) {
        return NextResponse.json({ error: "ID and name are required" }, { status: 400 });
    }

    const ctx = await ensureContext({ ownerOnly: true });
    if (!ctx.ok) return ctx.response;

    const admin = getSupabaseAdmin();

    // block editing system serve types
    const { data: st, error: stErr } = await admin
        .from("menu_serve_types")
        .select("id, is_system")
        .eq("id", id)
        .eq("shop_id", ctx.shopId)
        .maybeSingle();

    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
    if (!st) return NextResponse.json({ error: "Serve type not found" }, { status: 404 });
    if (st.is_system === true) {
        return NextResponse.json({ error: "System serve type cannot be edited" }, { status: 409 });
    }

    const { data, error } = await admin
        .from("menu_serve_types")
        .update({ name })
        .eq("id", id)
        .eq("shop_id", ctx.shopId)
        .select()
        .maybeSingle();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json(
                { error: `Serve type name already exists in this shop: ${name}` },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Serve type not found" }, { status: 404 });
    return NextResponse.json(data);
}

// DELETE - remove serve type in current shop
export async function DELETE(req: NextRequest) {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const ctx = await ensureContext({ ownerOnly: true });
    if (!ctx.ok) return ctx.response;
    const currentShopId = ctx.shopId;

    const admin = getSupabaseAdmin();

    // ensure serve type belongs to current shop
    const { data: st, error: stErr } = await admin
        .from("menu_serve_types")
        .select("id, shop_id, system_key, is_system")
        .eq("id", id)
        .maybeSingle();

    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
    if (!st) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (st.shop_id !== currentShopId) {
        return NextResponse.json({ error: "Not in current shop" }, { status: 403 });
    }

    // block system serve types only when explicitly marked
    if (st.is_system === true) {
        return NextResponse.json(
            { error: "System serve type cannot be deleted" },
            { status: 409 }
        );
    }

    // find variants under this serve type
    const { data: variants, error: variantsErr } = await admin
        .from("menu_variants")
        .select("id")
        .eq("serve_type_id", id)
        .eq("shop_id", currentShopId);

    if (variantsErr) {
        return NextResponse.json({ error: variantsErr.message }, { status: 500 });
    }
    const variantIds = (variants ?? []).map((v) => v.id);

    // if this serve type has sales history, do not hard-delete
    if (variantIds.length > 0) {
        const { count: orderCount, error: orderCountErr } = await admin
            .from("order_items")
            .select("id", { count: "exact", head: true })
            .in("variant_id", variantIds)
            .eq("shop_id", currentShopId);

        if (orderCountErr) {
            return NextResponse.json({ error: orderCountErr.message }, { status: 500 });
        }
        if ((orderCount ?? 0) > 0) {
            return NextResponse.json(
                {
                    error:
                        "Serve type has sales history and cannot be deleted. Archive this serve type instead.",
                },
                { status: 409 }
            );
        }

        // no sales history -> safe to remove recipe rows and variants
        const { error: recipeErr } = await admin
            .from("recipe_items")
            .delete()
            .in("variant_id", variantIds)
            .eq("shop_id", currentShopId);

        if (recipeErr) {
            return NextResponse.json({ error: recipeErr.message }, { status: 500 });
        }

        const { error: variantDeleteErr } = await admin
            .from("menu_variants")
            .delete()
            .in("id", variantIds)
            .eq("shop_id", currentShopId);

        if (variantDeleteErr) {
            return NextResponse.json({ error: variantDeleteErr.message }, { status: 500 });
        }
    }

    // cleanup legacy link rows
    const { error: menuServesErr } = await admin
        .from("menu_serves")
        .delete()
        .eq("serve_type_id", id)
        .eq("shop_id", currentShopId);

    if (menuServesErr) {
        return NextResponse.json({ error: menuServesErr.message }, { status: 500 });
    }

    // delete serve type (hard delete only when no order history)
    const { data: deleted, error } = await admin
        .from("menu_serve_types")
        .delete()
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!deleted || deleted.length === 0) {
        return NextResponse.json({ error: "Nothing deleted" }, { status: 404 });
    }
    return NextResponse.json({ success: true, deleted: deleted.map((d) => d.id) });
}
