import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import type { ReceiptSettings } from "@/lib/types";

type ContextResult =
    | {
        ok: true;
        shopId: string;
        branchId: string | null;
        role: string | null;
    }
    | { ok: false; response: NextResponse };

type ShopSettingsRow = {
    id: string;
    name: string;
    tax_id: string | null;
    receipt_footer: string | null;
};

type BranchSettingsRow = {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
};

function jsonError(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

async function ensureContext({
    ownerOnly,
    requireBranch,
}: {
    ownerOnly: boolean;
    requireBranch: boolean;
}): Promise<ContextResult> {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) {
        return { ok: false, response: jsonError(authError.message, 500) };
    }
    if (!auth.user) {
        return { ok: false, response: jsonError("Unauthorized", 401) };
    }

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return { ok: false, response: jsonError("No current shop selected", 409) };
    }
    if (requireBranch && !currentBranchId) {
        return { ok: false, response: jsonError("No current branch selected", 409) };
    }

    const { data: member, error: memberError } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (memberError) {
        return { ok: false, response: jsonError(memberError.message, 500) };
    }
    if (!member) {
        return { ok: false, response: jsonError("Not a member of current shop", 403) };
    }
    if (ownerOnly && member.role !== "owner") {
        return { ok: false, response: jsonError("Owner only", 403) };
    }

    if (currentBranchId) {
        const { data: branch, error: branchError } = await admin
            .from("branch")
            .select("id")
            .eq("id", currentBranchId)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (branchError) {
            return { ok: false, response: jsonError(branchError.message, 500) };
        }
        if (!branch) {
            return {
                ok: false,
                response: jsonError("Current branch is not in the current shop", 409),
            };
        }
    }

    return {
        ok: true,
        shopId: currentShopId,
        branchId: currentBranchId,
        role: typeof member.role === "string" ? member.role : null,
    };
}

async function loadSettings(context: {
    shopId: string;
    branchId: string | null;
    role: string | null;
}): Promise<{ ok: true; settings: ReceiptSettings } | { ok: false; response: NextResponse }> {
    const admin = getSupabaseAdmin();

    const { data: shop, error: shopError } = await admin
        .from("shops")
        .select("id,name,tax_id,receipt_footer")
        .eq("id", context.shopId)
        .maybeSingle()
        .returns<ShopSettingsRow | null>();

    if (shopError) {
        return { ok: false, response: jsonError(shopError.message, 500) };
    }
    if (!shop) {
        return { ok: false, response: jsonError("Shop not found", 404) };
    }

    let branch: BranchSettingsRow | null = null;
    if (context.branchId) {
        const branchResult = await admin
            .from("branch")
            .select("id,name,address,phone")
            .eq("id", context.branchId)
            .eq("shop_id", context.shopId)
            .maybeSingle()
            .returns<BranchSettingsRow | null>();

        if (branchResult.error) {
            return { ok: false, response: jsonError(branchResult.error.message, 500) };
        }
        branch = branchResult.data;
    }

    const shopName = shop.name.trim() || "Coffee SaaS";

    return {
        ok: true,
        settings: {
            shopId: shop.id,
            shopName,
            taxId: shop.tax_id?.trim() || null,
            receiptFooter: shop.receipt_footer?.trim() || null,
            branchId: branch?.id ?? null,
            branchName: branch?.name?.trim() || null,
            branchAddress: branch?.address?.trim() || null,
            branchPhone: branch?.phone?.trim() || null,
            canEditShopSettings: context.role === "owner",
        },
    };
}

function normalizeOptionalText(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
    const context = await ensureContext({ ownerOnly: false, requireBranch: true });
    if (!context.ok) return context.response;

    const result = await loadSettings(context);
    if (!result.ok) return result.response;
    return NextResponse.json(result.settings);
}

export async function PUT(req: NextRequest) {
    const context = await ensureContext({ ownerOnly: true, requireBranch: false });
    if (!context.ok) return context.response;

    const raw = (await req.json().catch(() => null)) as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return jsonError("Invalid body", 400);
    }

    const body = raw as Record<string, unknown>;
    const taxId = normalizeOptionalText(body.taxId);
    const receiptFooter = normalizeOptionalText(body.receiptFooter);

    if (taxId && taxId.length > 50) {
        return jsonError("Tax ID must be 50 characters or fewer", 400);
    }
    if (receiptFooter && receiptFooter.length > 300) {
        return jsonError("Receipt footer must be 300 characters or fewer", 400);
    }

    const admin = getSupabaseAdmin();
    const { data: updated, error: updateError } = await admin
        .from("shops")
        .update({ tax_id: taxId, receipt_footer: receiptFooter })
        .eq("id", context.shopId)
        .select("id")
        .maybeSingle();

    if (updateError) return jsonError(updateError.message, 500);
    if (!updated) return jsonError("Shop not found", 404);

    const result = await loadSettings(context);
    if (!result.ok) return result.response;
    return NextResponse.json(result.settings);
}
