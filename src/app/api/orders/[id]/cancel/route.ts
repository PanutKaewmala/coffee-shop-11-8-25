// src/app/api/orders/[id]/cancel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkDailyClose, toBangkokBusinessDate } from "@/lib/dailyCloseGuard";

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

function readErrDetail(err: unknown): { message: string; code: string | null; hint: string | null } {
    if (!isRecord(err)) return { message: "unknown_error", code: null, hint: null };

    const message = readString(err.message) ?? "error";
    const code = readString(err.code);
    const hint = readString(err.hint);

    return { message, code, hint };
}

/* =========================
   Fallback: read id from URL
   /api/orders/<id>/cancel
========================= */
function readOrderIdFromPath(pathname: string): string | null {
    const m = pathname.match(/^\/api\/orders\/([^/]+)\/cancel\/?$/);
    if (!m) return null;
    const id = (m[1] ?? "").trim();
    return id || null;
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
        if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
        const user = auth.user;
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

        const { id } = await params;

        const fromParams = (id ?? "").trim();
        const fromPath = readOrderIdFromPath(req.nextUrl.pathname) ?? "";
        const rawId = (fromParams || fromPath).trim();

        if (!rawId || !isUuid(rawId)) {
            return NextResponse.json(
                {
                    error: "Invalid order id",
                    debug: { rawId, params: { id }, pathname: req.nextUrl.pathname, fromParams, fromPath },
                },
                { status: 400 }
            );
        }

        const { data: orderRow, error: orderErr } = await admin
            .from("orders")
            .select("id, shop_id, branch_id, status, paid_at, created_at")
            .eq("id", rawId)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
        if (!orderRow) {
            return NextResponse.json({ error: "Order not found in current shop" }, { status: 404 });
        }

        if ((orderRow as Record<string, unknown>).status === "paid") {
            const paidAt = (orderRow as Record<string, unknown>).paid_at as string | null;
            const createdAt = (orderRow as Record<string, unknown>).created_at as string | null;
            const timestamp = paidAt ?? createdAt;

            if (timestamp) {
                const businessDate = toBangkokBusinessDate(timestamp);
                const shopId = (orderRow as Record<string, unknown>).shop_id as string;
                const branchId = (orderRow as Record<string, unknown>).branch_id as string | null;

                if (!branchId) {
                    return NextResponse.json(
                        {
                            error: "ไม่สามารถตรวจสอบสาขาของออเดอร์นี้ได้ จึงไม่สามารถยกเลิกหลังปิดยอดได้",
                            code: "ORDER_BRANCH_REQUIRED",
                        },
                        { status: 409 }
                    );
                }

                const guardResult = await checkDailyClose(shopId, branchId, businessDate);
                if (guardResult.blocked && guardResult.closeStatus) {
                    return NextResponse.json(
                        {
                            error: "ปิดยอดของวันนี้แล้ว ไม่สามารถยกเลิกออเดอร์นี้ได้",
                            code: "BUSINESS_DAY_CLOSED",
                            business_date: businessDate,
                            close_status: guardResult.closeStatus,
                        },
                        { status: 409 }
                    );
                }
            }
        }

        const body: unknown = await req.json().catch(() => null);
        if (!isRecord(body)) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const reason = readReason(body.reason);
        const cancelNote = normalizeNote(body.cancelNote);
        const cancelledByRaw = normalizeNote(body.cancelledBy);
        const cancelledBy: "owner" | "staff" = cancelledByRaw === "owner" ? "owner" : "staff";

        // ✅ NEW: restock flag (default true)
        const restockRaw = readBoolean(body.restock);
        const restock = restockRaw ?? true;

        if (!reason) {
            return NextResponse.json(
                { error: "Invalid reason", debug: { got: readString(body.reason) ?? null } },
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
            p_cancelled_by: cancelledBy,
            p_restock: restock, // ✅ NEW
        });

        if (error) {
            const d = readErrDetail(error);
            return NextResponse.json(
                { error: "cancel_rpc_failed", detail: d.message, code: d.code, hint: d.hint },
                { status: 500 }
            );
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
            return NextResponse.json({ ok: false, ...data }, { status: 400 });
        }

        return NextResponse.json({ error: "unexpected_rpc_response", debug: { data } }, { status: 500 });
    } catch (e: unknown) {
        const d = readErrDetail(e);
        return NextResponse.json(
            { error: "server_error", detail: d.message, code: d.code, hint: d.hint },
            { status: 500 }
        );
    }
}
