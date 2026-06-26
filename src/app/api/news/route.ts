import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolvePublicShopId } from "@/lib/publicShop";
import { NextRequest, NextResponse } from "next/server";

/* =========================
   Types
========================= */

type NewsUpdatePayload = {
    category?: string;
    title?: string;
    content?: string | null;
    image_url?: string | null;
    event_date?: string; // ✅ DB ไม่รับ null
    updated_at?: string | null;
};

type NewsCreatePayload = {
    category: string;
    title: string;
    event_date: string;
    content?: string | null;
    image_url?: string | null;
};

/* =========================
   Helpers
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
}

function asStringOrNull(v: unknown): string | null {
    // ใช้กับ field ที่ยอม null ได้ เช่น content/image_url
    return asString(v);
}

/* =========================
   GET /api/news
========================= */
export async function GET(req: NextRequest) {
    const supabase = await getSupabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) {
        const { shopId, mismatch } = resolvePublicShopId(req.nextUrl.searchParams);
        if (mismatch) {
            return NextResponse.json({ error: "shop_id mismatch" }, { status: 403 });
        }
        if (!shopId) {
            return NextResponse.json(
                { error: "Public shop not configured" },
                { status: 409 }
            );
        }

        const admin = getSupabaseAdmin();
        const { data, error } = await admin
            .from("news")
            .select("*")
            .eq("shop_id", shopId)
            .order("event_date", { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data ?? []);
    }

    const { data, error } = await supabase
        .from("news")
        .select("*")
        .order("event_date", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
}

/* =========================
    POST /api/news
 ========================= */
export async function POST(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
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

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!isRecord(body)) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const category = asString(body.category);
    const title = asString(body.title);
    const event_date = asString(body.event_date);

    if (!category || !title || !event_date) {
        return NextResponse.json(
            { error: "category, title, event_date are required" },
            { status: 400 }
        );
    }

    const payload: NewsCreatePayload = {
        category,
        title,
        event_date,
        content: asStringOrNull(body.content),
        image_url: asStringOrNull(body.image),
    };

    const { data, error } = await admin
        .from("news")
        .insert([
            {
                ...payload,
                shop_id: currentShopId,
                created_at: new Date().toISOString(),
            },
        ])
        .select()
        .single();

    if (error) {
        console.error("Supabase insert error →", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}

/* =========================
    PUT /api/news
 ========================= */
export async function PUT(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
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

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!isRecord(body)) {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const id = asString(body.id);
    if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { data: existing, error: existErr } = await admin
        .from("news")
        .select("id")
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
    if (!existing) {
        return NextResponse.json({ error: "News not found in current shop" }, { status: 404 });
    }

    const updateData: NewsUpdatePayload = {};

    // string fields
    if (body.category !== undefined) updateData.category = asString(body.category) ?? undefined;
    if (body.title !== undefined) updateData.title = asString(body.title) ?? undefined;

    // ✅ event_date: ต้องเป็น string เท่านั้น (ห้าม null)
    if (body.event_date !== undefined) {
        const v = asString(body.event_date);
        if (v) updateData.event_date = v; // ถ้าเป็น ""/null -> ไม่ใส่ key นี้
    }

    // nullable fields
    if (body.content !== undefined) updateData.content = asStringOrNull(body.content);
    if (body.image !== undefined) updateData.image_url = asStringOrNull(body.image);

    updateData.updated_at = new Date().toISOString();

    // ถ้าไม่มีอะไรอัปเดตจริง ๆ (นอกจาก updated_at) ให้บอกกลับ
    if (Object.keys(updateData).length === 1) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await admin
        .from("news")
        .update(updateData)
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .select()
        .single();

    if (error) {
        console.error("Supabase update error →", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

/* =========================
    DELETE /api/news?id=...
 ========================= */
export async function DELETE(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    const user = auth.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
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

    const id = new URL(req.url).searchParams.get("id");

    if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { data: existing, error: existErr } = await admin
        .from("news")
        .select("id")
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
    if (!existing) {
        return NextResponse.json({ error: "News not found in current shop" }, { status: 404 });
    }

    const { error } = await admin.from("news").delete().eq("id", id).eq("shop_id", currentShopId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
