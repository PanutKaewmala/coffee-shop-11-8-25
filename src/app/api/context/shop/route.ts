import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";

type Body = { shop_id?: string };

function jsonError(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(req: Request) {
    const supabase = await getSupabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return jsonError("Unauthorized", 401);

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode");

    if (mode !== "pick") {
        const { currentShopId } = await getCurrentContextFromCookies();
        if (!currentShopId) {
            return NextResponse.json({ shop_id: null });
        }

        const { data: member, error: mErr } = await supabase
            .from("shop_members")
            .select("shop_id")
            .eq("user_id", user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (mErr) return jsonError(mErr.message, 500);

        if (!member) {
            const cookieStore = await cookies();
            cookieStore.set({
                name: "current_shop_id",
                value: "",
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 0,
            });
            cookieStore.set({
                name: "current_branch_id",
                value: "",
                httpOnly: true,
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                path: "/",
                maxAge: 0,
            });
            return NextResponse.json({ shop_id: null });
        }

        return NextResponse.json({ shop_id: currentShopId });
    }

    const { data: rows, error } = await supabase
        .from("shop_members")
        .select("shop_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(2);

    if (error) return jsonError(error.message, 500);

    if (!rows || rows.length === 0) return NextResponse.json({ mode: "none" });
    if (rows.length === 1) return NextResponse.json({ mode: "single", shop_id: rows[0].shop_id });

    return NextResponse.json({ mode: "multiple" });
}

export async function POST(req: Request) {
    const supabase = await getSupabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return jsonError("Unauthorized", 401);

    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return jsonError("Invalid JSON body");
    }

    const shopId = body.shop_id?.trim();
    if (!shopId) return jsonError("shop_id is required");

    const { data: member, error: mErr } = await supabase
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", user.id)
        .eq("shop_id", shopId)
        .maybeSingle();

    if (mErr) return jsonError(mErr.message, 500);
    if (!member) return jsonError("Not a member of this shop", 403);

    const admin = getSupabaseAdmin();
    const { error: profileErr } = await admin
        .from("profiles")
        .update({
            current_shop_id: shopId,
            current_branch_id: null,
        })
        .eq("id", user.id);

    if (profileErr) return jsonError(profileErr.message, 500);

    const cookieStore = await cookies();
    cookieStore.set({
        name: "current_shop_id",
        value: shopId,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
    });

    // Clear branch context on shop switch.
    cookieStore.set({
        name: "current_branch_id",
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    });

    return NextResponse.json({ ok: true });
}
