// src/app/api/orders/[id]/cancel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { parseAppRole } from "@/lib/accessPolicy.mjs";

export const dynamic = "force-dynamic";

type CancelReason =
    | "ลูกค้ายกเลิก"
    | "กดผิด / ชงผิด"
    | "วัตถุดิบไม่พอ"
    | "ระบบขัดข้อง"
    | "อื่นๆ";

const REASONS: CancelReason[] = [
    "ลูกค้ายกเลิก",
    "กดผิด / ชงผิด",
    "วัตถุดิบไม่พอ",
    "ระบบขัดข้อง",
    "อื่นๆ",
];

/* =========================
   Safe readers (no any)
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function readString(v: unknown): string | null {
    return typeof v === "string" ? v : null;
}

function readBoolean(v: unknown): boolean | null {
    return typeof v === "boolean" ? v : null;
}

function isUuid(v: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function readReason(v: unknown): CancelReason | null {
    const s = readString(v);
    if (!s) return null;
    return REASONS.includes(s as CancelReason) ? (s as CancelReason) : null;
}

function normalizeNote(v: unknown): string | null {
    const s = readString(v);
    if (!s) return null;
    const t = s.trim();
    if (!t) return null;
    return t.length > 200 ? t.slice(0, 200) : t;
}

function serverError(scope: string, error: unknown) {
    console.error(`[order-cancel] ${scope}`, error);
    return NextResponse.json(
        { error: "Unable to cancel order", code: "ORDER_CANCELLATION_FAILED" },
        { status: 500 }
    );
}

/* =========================
   RPC result shape
========================= */
type CancelRpcOk = {
    success: true;
    order_id: string;
    status: string;
    stock_refunded?: boolean;
    refunded?: boolean;
    already_refunded?: boolean;
    already_cancelled?: boolean;
};

type CancelRpcFail = {
    success: false;
    error: string;
    status?: string | null;
};

function isCancelRpcOk(v: unknown): v is CancelRpcOk {
    if (!isRecord(v)) return false;
    return v.success === true && typeof v.order_id === "string";
}

function isCancelRpcFail(v: unknown): v is CancelRpcFail {
    if (!isRecord(v)) return false;
    return v.success === false && typeof v.error === "string";
}

// ✅ Next.js 16: params is Promise
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await getSupabaseServer();
        const admin = getSupabaseAdmin();
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) return serverError("auth_lookup_failed", authErr);
        const user = auth.user;
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
        if (!currentShopId) {
            return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
        }
        if (!currentBranchId) {
            return NextResponse.json({ error: "No current branch selected" }, { status: 409 });
        }

        const { data: member, error: mErr } = await admin
            .from("shop_members")
            .select("shop_id, role")
            .eq("user_id", user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (mErr) return serverError("membership_lookup_failed", mErr);
        if (!member) return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
        const actorRole = parseAppRole(member.role);
        if (!actorRole) {
            return NextResponse.json({ error: "Owner or staff role required", code: "CANCEL_ROLE_REQUIRED" }, { status: 403 });
        }

        const { id } = await params;
        const rawId = (id ?? "").trim();

        if (!rawId || !isUuid(rawId)) {
            return NextResponse.json(
                { error: "Invalid order id", code: "INVALID_ORDER_ID" },
                { status: 400 }
            );
        }

        const { data: orderRow, error: orderErr } = await admin
            .from("orders")
            .select("id, shop_id, branch_id, status, paid_at, created_at")
            .eq("id", rawId)
            .eq("shop_id", currentShopId)
            .eq("branch_id", currentBranchId)
            .maybeSingle();

        if (orderErr) return serverError("order_lookup_failed", orderErr);
        if (!orderRow) {
            return NextResponse.json(
                { error: "Order not found in current shop and branch", code: "ORDER_NOT_FOUND" },
                { status: 404 }
            );
        }

        // Closed-day validation is performed atomically by cancel_order while
        // holding the canonical business-day transaction lock.

        const body: unknown = await req.json().catch(() => null);
        if (!isRecord(body)) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const reason = readReason(body.reason);
        const cancelNote = normalizeNote(body.cancelNote);
        // ✅ NEW: restock flag (default true)
        const restockRaw = readBoolean(body.restock);
        const restock = restockRaw ?? true;

        if (!reason) {
            return NextResponse.json(
                { error: "Invalid reason", code: "INVALID_CANCEL_REASON" },
                { status: 400 }
            );
        }

        if (reason === "อื่นๆ" && !cancelNote) {
            return NextResponse.json({ error: "Note is required when reason is 'อื่นๆ'" }, { status: 400 });
        }

        const noteForRpc: string | undefined = cancelNote ?? undefined;

        const { data, error } = await supabase.rpc("cancel_order", {
            p_order_id: rawId,
            p_reason: reason,
            p_note: noteForRpc,
            // Audit actor is derived exclusively from the authenticated user's
            // current-shop membership. Client-supplied actor fields are ignored.
            p_cancelled_by: actorRole,
            p_restock: restock, // ✅ NEW
        });

        if (error) {
            return serverError("cancel_rpc_failed", { error, orderId: rawId, userId: user.id });
        }

        if (isCancelRpcOk(data)) {
            return NextResponse.json({
                ok: true,
                id: data.order_id,
                status: data.status,
                restock,
                stock_refunded: data.stock_refunded ?? data.refunded ?? false,
                already_refunded: data.already_refunded ?? false,
                already_cancelled: data.already_cancelled ?? false,
            });
        }

        if (isCancelRpcFail(data)) {
            console.warn("[order-cancel] cancel_rpc_rejected", {
                orderId: rawId,
                userId: user.id,
                rpcStatus: data.status ?? null,
                rpcError: data.error,
            });
            return NextResponse.json(
                { error: "Order cancellation was rejected", code: "ORDER_CANCELLATION_REJECTED" },
                { status: 409 }
            );
        }

        return serverError("unexpected_rpc_response", { data, orderId: rawId, userId: user.id });
    } catch (e: unknown) {
        return serverError("unexpected_error", e);
    }
}
