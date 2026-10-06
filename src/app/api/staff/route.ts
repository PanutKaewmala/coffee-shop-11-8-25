import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { normalizeStaffEmail, staffAccountInputError } from "@/lib/staffManagementPolicy.mjs";

type OwnerContext =
    | { ok: true; shopId: string }
    | { ok: false; response: NextResponse };

async function requireCurrentOwner(): Promise<OwnerContext> {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) {
        return { ok: false, response: NextResponse.json({ error: authError.message }, { status: 500 }) };
    }
    if (!auth.user) {
        return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }

    const { currentShopId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return { ok: false, response: NextResponse.json({ error: "No current shop selected" }, { status: 409 }) };
    }

    const { data: membership, error: membershipError } = await admin
        .from("shop_members")
        .select("role")
        .eq("shop_id", currentShopId)
        .eq("user_id", auth.user.id)
        .maybeSingle();

    if (membershipError) {
        return { ok: false, response: NextResponse.json({ error: membershipError.message }, { status: 500 }) };
    }
    if (!membership || membership.role !== "owner") {
        return { ok: false, response: NextResponse.json({ error: "Owner only" }, { status: 403 }) };
    }

    return { ok: true, shopId: currentShopId };
}

function publicStaffUser(user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
}, createdAt: string) {
    const rawName = user.user_metadata?.display_name;
    return {
        user_id: user.id,
        email: user.email ?? null,
        name: typeof rawName === "string" && rawName.trim() ? rawName.trim() : null,
        created_at: createdAt,
    };
}

export async function GET() {
    const ctx = await requireCurrentOwner();
    if (!ctx.ok) return ctx.response;

    const admin = getSupabaseAdmin();
    const { data: memberships, error } = await admin
        .from("shop_members")
        .select("user_id,created_at")
        .eq("shop_id", ctx.shopId)
        .eq("role", "staff")
        .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const staff = await Promise.all(
        (memberships ?? []).map(async (membership) => {
            const { data, error: userError } = await admin.auth.admin.getUserById(membership.user_id);
            if (userError || !data.user) {
                return {
                    user_id: membership.user_id,
                    email: null,
                    name: null,
                    created_at: membership.created_at,
                };
            }
            return publicStaffUser(data.user, membership.created_at);
        })
    );

    return NextResponse.json({ staff });
}

export async function POST(req: NextRequest) {
    const ctx = await requireCurrentOwner();
    if (!ctx.ok) return ctx.response;

    const body = (await req.json().catch(() => null)) as {
        name?: unknown;
        email?: unknown;
        password?: unknown;
    } | null;

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = normalizeStaffEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";

    const inputError = staffAccountInputError({ name, email, password });
    if (inputError) {
        return NextResponse.json({ error: inputError }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: name },
    });

    if (createError || !created.user) {
        const message = createError?.message ?? "สร้างบัญชีพนักงานไม่สำเร็จ";
        const normalized = message.toLowerCase();
        if (normalized.includes("already") || normalized.includes("exist") || normalized.includes("registered")) {
            return NextResponse.json(
                { error: "อีเมลนี้มีบัญชี TALVO อยู่แล้ว กรุณาใช้อีเมลอื่นสำหรับพนักงานคนนี้" },
                { status: 409 }
            );
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }

    const { error: membershipError } = await admin
        .from("shop_members")
        .insert({ shop_id: ctx.shopId, user_id: created.user.id, role: "staff" });

    if (membershipError) {
        await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
        return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    return NextResponse.json(
        { staff: publicStaffUser(created.user, new Date().toISOString()) },
        { status: 201 }
    );
}

export async function DELETE(req: NextRequest) {
    const ctx = await requireCurrentOwner();
    if (!ctx.ok) return ctx.response;

    const body = (await req.json().catch(() => null)) as { user_id?: unknown } | null;
    const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    if (!userId) {
        return NextResponse.json({ error: "ไม่พบพนักงานที่ต้องการนำออก" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
        .from("shop_members")
        .delete()
        .eq("shop_id", ctx.shopId)
        .eq("user_id", userId)
        .eq("role", "staff")
        .select("user_id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) {
        return NextResponse.json({ error: "ไม่พบพนักงานคนนี้ในร้าน" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
}
