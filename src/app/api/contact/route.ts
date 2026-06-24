import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolvePublicShopId } from "@/lib/publicShop";
import { NextRequest, NextResponse } from "next/server";

/* ===========================================
   CATEGORY ENUM
=========================================== */
const allowedCategories = [
    "question",
    "feedback",
    "complaint",
    "business",
    "other",
] as const;

type ContactCategory = (typeof allowedCategories)[number];

function isContactCategory(v: unknown): v is ContactCategory {
    return typeof v === "string" && (allowedCategories as readonly string[]).includes(v);
}

/* ===========================================
   SAFE BODY HELPERS (no any)
=========================================== */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
    try {
        const raw: unknown = await req.json();
        return isRecord(raw) ? raw : null;
    } catch {
        return null;
    }
}

function str(v: unknown): string {
    return typeof v === "string" ? v : "";
}

/* ===========================================
   IP + RATE LIMIT (in-memory)
=========================================== */
function getClientIp(req: NextRequest): string {
    const fwd = req.headers.get("x-forwarded-for");
    if (typeof fwd === "string" && fwd.trim()) return fwd.split(",")[0].trim();

    const real = req.headers.get("x-real-ip");
    if (typeof real === "string" && real.trim()) return real.trim();

    return "unknown";
}

const ipMap = new Map<string, number>();
const RATE_LIMIT_MS = 10 * 1000; // 10s

function checkRateLimit(req: NextRequest): boolean {
    const ip = getClientIp(req);
    const now = Date.now();
    const last = ipMap.get(ip);

    if (typeof last === "number" && now - last < RATE_LIMIT_MS) return false;

    ipMap.set(ip, now);
    return true;
}

/* ===========================================
   GET  /api/contact
=========================================== */
export async function GET() {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth.user;
    if (authErr || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }

    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!member) return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });

    const { data, error } = await admin
        .from("contact")
        .select("*")
        .eq("shop_id", currentShopId)
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const list = Array.isArray(data) ? data : [];

    return NextResponse.json(
        list.map((item) => {
            const categoryRaw: unknown = (item as Record<string, unknown>)?.category;

            return {
                id: (item as Record<string, unknown>)?.id,
                name: (item as Record<string, unknown>)?.name,
                email: (item as Record<string, unknown>)?.email,
                message: (item as Record<string, unknown>)?.message,
                created_at: (item as Record<string, unknown>)?.created_at,
                category: isContactCategory(categoryRaw) ? categoryRaw : "other",
            };
        })
    );
}

/* ===========================================
   POST  /api/contact
=========================================== */
export async function POST(req: NextRequest) {
    if (!checkRateLimit(req)) {
        return NextResponse.json(
            { error: "Please wait a few seconds before sending again." },
            { status: 429 }
        );
    }

    const body = await readJson(req);
    if (!body) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const name = str(body.name).trim();
    const email = str(body.email).trim();
    const message = str(body.message).trim();
    const categoryRaw: unknown = body.category;
    const bodyShopId = str(body.shop_id).trim();

    if (!name || !email || !message) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const safeCategory: ContactCategory = isContactCategory(categoryRaw)
        ? categoryRaw
        : "other";

    const supabase = await getSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) {
        const { shopId, mismatch } = resolvePublicShopId(req.nextUrl.searchParams, bodyShopId);
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
            .from("contact")
            .insert([{ name, email, message, category: safeCategory, shop_id: shopId }])
            .select()
            .single();

        if (error) {
            console.error("Supabase Insert Error →", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    }

    const { data, error } = await supabase
        .from("contact")
        .insert([{ name, email, message, category: safeCategory }])
        .select()
        .single();

    if (error) {
        console.error("Supabase Insert Error →", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}

/* ===========================================
   PUT  /api/contact
=========================================== */
type ContactUpdatePayload = {
    name?: string;
    email?: string;
    message?: string;
    category?: ContactCategory;
};

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

    const body = await readJson(req);
    if (!body) {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const id = str(body.id).trim();
    if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { data: existing, error: existErr } = await admin
        .from("contact")
        .select("id")
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
    if (!existing) {
        return NextResponse.json({ error: "Contact not found in current shop" }, { status: 404 });
    }

    const payload: ContactUpdatePayload = {};

    if ("name" in body) {
        const v = str(body.name).trim();
        if (v) payload.name = v;
    }

    if ("email" in body) {
        const v = str(body.email).trim();
        if (v) payload.email = v;
    }

    if ("message" in body) {
        const v = str(body.message).trim();
        if (v) payload.message = v;
    }

    if ("category" in body && isContactCategory(body.category)) {
        payload.category = body.category;
    }

    if (Object.keys(payload).length === 0) {
        return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await admin
        .from("contact")
        .update(payload)
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
}

/* ===========================================
   DELETE  /api/contact?id=xxxx
=========================================== */
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

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.trim();

    if (!id) return NextResponse.json({ error: "No id provided" }, { status: 400 });

    const { data: existing, error: existErr } = await admin
        .from("contact")
        .select("id")
        .eq("id", id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
    if (!existing) {
        return NextResponse.json({ error: "Contact not found in current shop" }, { status: 404 });
    }

    const { error } = await admin.from("contact").delete().eq("id", id).eq("shop_id", currentShopId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
