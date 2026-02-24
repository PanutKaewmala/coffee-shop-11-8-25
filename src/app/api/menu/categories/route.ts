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

// GET - list categories in current shop
export async function GET() {
    const ctx = await ensureContext({ ownerOnly: false });
    if (!ctx.ok) return ctx.response;

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from("menu_categories")
        .select("*")
        .eq("shop_id", ctx.shopId)
        .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
}

// POST - add new category in current shop
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
        .from("menu_categories")
        .insert({ name, shop_id: ctx.shopId })
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json(
                { error: `Category name already exists in this shop: ${name}` },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
}

// PUT - update category name in current shop
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
    const { data, error } = await admin
        .from("menu_categories")
        .update({ name })
        .eq("id", id)
        .eq("shop_id", ctx.shopId)
        .select()
        .maybeSingle();

    if (error) {
        if (error.code === "23505") {
            return NextResponse.json(
                { error: `Category name already exists in this shop: ${name}` },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    return NextResponse.json(data);
}

// DELETE - remove category in current shop
export async function DELETE(req: NextRequest) {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const ctx = await ensureContext({ ownerOnly: true });
    if (!ctx.ok) return ctx.response;

    const admin = getSupabaseAdmin();

    // block delete when category is still used by menus
    const { count: menuCount, error: countErr } = await admin
        .from("menu")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", ctx.shopId)
        .eq("category_id", id);

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
    if ((menuCount ?? 0) > 0) {
        return NextResponse.json(
            { error: `Category is in use by ${menuCount} menu item(s)` },
            { status: 409 }
        );
    }

    const { data: deleted, error } = await admin
        .from("menu_categories")
        .delete()
        .eq("id", id)
        .eq("shop_id", ctx.shopId)
        .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!deleted || deleted.length === 0) {
        return NextResponse.json({ error: "Nothing deleted" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
}
