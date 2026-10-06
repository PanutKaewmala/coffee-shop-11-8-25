import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
    firstShopInputError,
    firstShopSlugBase,
    normalizeFirstShopInput,
} from "@/lib/firstShopOnboarding.mjs";

function jsonError(error: string, status = 400) {
    return NextResponse.json({ error }, { status });
}

async function clearCreatedShop(
    admin: ReturnType<typeof getSupabaseAdmin>,
    shopId: string,
    userId: string
) {
    await admin.from("branch").delete().eq("shop_id", shopId);
    await admin.from("shop_members").delete().eq("shop_id", shopId).eq("user_id", userId);
    await admin.from("shops").delete().eq("id", shopId);
}

export async function POST(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const { data: auth, error: authError } = await supabase.auth.getUser();

    if (!auth.user) return jsonError("Unauthorized", 401);
    if (authError) return jsonError(authError.message, 500);

    const admin = getSupabaseAdmin();
    const { data: existingMembership, error: membershipError } = await admin
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", auth.user.id)
        .limit(1);

    if (membershipError) return jsonError(membershipError.message, 500);
    if ((existingMembership ?? []).length > 0) {
        return jsonError("บัญชีนี้มีร้านอยู่แล้ว", 409);
    }

    const body = await req.json().catch(() => null);
    const input = normalizeFirstShopInput(body ?? {});
    const inputError = firstShopInputError(input);
    if (inputError) return jsonError(inputError, 400);

    let createdShop: { id: string; name: string; slug: string } | null = null;
    let lastShopError = "สร้างร้านไม่สำเร็จ";

    for (let attempt = 0; attempt < 3 && !createdShop; attempt += 1) {
        const slug = `${firstShopSlugBase(input.shopName)}-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
        const result = await admin
            .from("shops")
            .insert({ name: input.shopName, slug })
            .select("id,name,slug")
            .single();

        if (!result.error && result.data) {
            createdShop = result.data;
            break;
        }

        lastShopError = result.error?.message ?? lastShopError;
        if (!result.error?.message?.toLowerCase().includes("slug")) break;
    }

    if (!createdShop) return jsonError(lastShopError, 500);

    const shopId = createdShop.id;

    const { error: ownerError } = await admin.from("shop_members").insert({
        shop_id: shopId,
        user_id: auth.user.id,
        role: "owner",
    });

    if (ownerError) {
        await clearCreatedShop(admin, shopId, auth.user.id);
        return jsonError(ownerError.message, 500);
    }

    const { data: branch, error: branchError } = await admin
        .from("branch")
        .insert({
            shop_id: shopId,
            name: input.branchName,
            address: input.address,
            phone: input.phone || null,
            is_primary: true,
            created_at: new Date().toISOString(),
        })
        .select("id,name")
        .single();

    if (branchError || !branch) {
        await clearCreatedShop(admin, shopId, auth.user.id);
        return jsonError(branchError?.message ?? "สร้างสาขาไม่สำเร็จ", 500);
    }

    const { error: profileError } = await admin.from("profiles").upsert(
        {
            id: auth.user.id,
            email: auth.user.email ?? null,
            role: "owner",
            current_shop_id: shopId,
            current_branch_id: branch.id,
        },
        { onConflict: "id" }
    );

    if (profileError) {
        await clearCreatedShop(admin, shopId, auth.user.id);
        return jsonError(profileError.message, 500);
    }

    const cookieStore = await cookies();
    const commonCookie = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
    };

    cookieStore.set({ name: "current_shop_id", value: shopId, ...commonCookie });
    cookieStore.set({ name: "current_branch_id", value: branch.id, ...commonCookie });

    return NextResponse.json(
        {
            ok: true,
            shop: createdShop,
            branch,
            href: "/admin",
        },
        { status: 201 }
    );
}
