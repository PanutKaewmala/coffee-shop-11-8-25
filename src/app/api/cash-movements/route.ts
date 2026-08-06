// src/app/api/cash-movements/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkDailyClose } from "@/lib/dailyCloseGuard";
import { parseAppRole } from "@/lib/accessPolicy.mjs";
import { cashMovementNavigationIntent, validateCashMovementReason } from "@/lib/cashMovementPolicy.mjs";

export const dynamic = "force-dynamic";

/* =========================
   Types
========================= */
type CashMovementType = "cash_in" | "cash_out";

type CashMovement = {
    id: string;
    shop_id: string;
    branch_id: string;
    business_date: string;
    type: CashMovementType;
    reason: string;
    amount: number;
    note: string | null;
    created_by: string | null;
    created_at: string;
};

/* =========================
   Safe readers (no any)
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function readString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readNumber(v: unknown): number | null {
    if (typeof v !== "number") return null;
    return Number.isFinite(v) ? v : null;
}

/* =========================
   Constants
========================= */
const CASH_MOVEMENT_TYPES: CashMovementType[] = ["cash_in", "cash_out"];

/* =========================
   Helpers
========================= */
function isValidDateKey(value: string | null | undefined): value is string {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}


async function branchBelongsToShop(admin: ReturnType<typeof getSupabaseAdmin>, shopId: string, branchId: string): Promise<boolean> {
    const { data, error } = await admin
        .from("branch")
        .select("id")
        .eq("id", branchId)
        .eq("shop_id", shopId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data);
}

function normalizeAmount(v: unknown): number | null {
    const n = readNumber(v);
    if (n === null) return null;
    if (n <= 0) return null;
    return Math.round(n * 100) / 100;
}

/* =========================
   Typed query helpers (cash_movements not in database.types yet)
========================= */
type CashMovementRow = {
    id: string;
    shop_id: string;
    branch_id: string;
    business_date: string;
    type: CashMovementType;
    reason: string;
    amount: string | number;
    note: string | null;
    created_by: string | null;
    created_at: string;
};

type CashMovementQuery = {
    select: (cols: string) => CashMovementQuery;
    eq: (col: string, val: string | undefined) => CashMovementQuery;
    order: (col: string, opts: { ascending: boolean }) => CashMovementQuery;
    limit: (count: number) => CashMovementQuery;
    insert: (payload: unknown) => {
        select: (cols: string) => {
            single: () => Promise<{
                data: CashMovementRow | null;
                error: { message: string } | null;
            }>;
        };
    };
    single: () => Promise<{
        data: CashMovementRow | null;
        error: { message: string } | null;
    }>;
};

type CashMovementFrom = {
    from: (table: "cash_movements") => CashMovementQuery;
};

function cashAdmin(admin: ReturnType<typeof getSupabaseAdmin>) {
    return admin as unknown as CashMovementFrom;
}

function unexpectedServerErrorResponse(scope: string, error: unknown) {
    console.error(scope, error);
    return NextResponse.json(
        { error: "Unexpected server error", code: "UNEXPECTED_SERVER_ERROR" },
        { status: 500 }
    );
}

/* =========================
   GET /api/cash-movements
========================= */
export async function GET(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const admin = getSupabaseAdmin();
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) return unexpectedServerErrorResponse("cash_movements_get_auth_error", authErr);
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
        if (!currentShopId) {
            return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
        }
        if (!currentBranchId) {
            return NextResponse.json({ error: "No current branch selected" }, { status: 409 });
        }

        const { data: member, error: mErr } = await admin
            .from("shop_members")
            .select("shop_id")
            .eq("user_id", auth.user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (mErr) return unexpectedServerErrorResponse("cash_movements_get_membership_error", mErr);
        if (!member) {
            return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
        }

        const date = req.nextUrl.searchParams.get("date");
        if (!isValidDateKey(date)) {
            return NextResponse.json(
                { error: "Invalid date. Use YYYY-MM-DD." },
                { status: 400 }
            );
        }

        const cmAdmin = cashAdmin(admin);

        const { data: rows, error: qErr } =
            (await (cmAdmin
                .from("cash_movements")
                .select(
                    "id, shop_id, branch_id, business_date, type, reason, amount, note, created_by, created_at"
                )
                .eq("shop_id", currentShopId)
                .eq("branch_id", currentBranchId)
                .eq("business_date", date)
                .order("created_at", { ascending: false }) as unknown)) as {
                data: CashMovementRow[] | null;
                error: { message: string } | null;
            };

        if (qErr) {
            return unexpectedServerErrorResponse("cash_movements_get_query_error", qErr);
        }

        const movements: CashMovement[] = (rows ?? []).map((row) => ({
            id: row.id as string,
            shop_id: row.shop_id as string,
            branch_id: row.branch_id as string,
            business_date: row.business_date as string,
            type: row.type as CashMovementType,
            reason: row.reason as string,
            amount: Number(row.amount),
            note: (row.note as string | null) ?? null,
            created_by: (row.created_by as string | null) ?? null,
            created_at: row.created_at as string,
        }));

        return NextResponse.json({
            date,
            context: { shopId: currentShopId, branchId: currentBranchId },
            movements,
        });
    } catch (e: unknown) {
        return unexpectedServerErrorResponse("cash_movements_get_unexpected", e);
    }
}

/* =========================
   POST /api/cash-movements
========================= */
export async function POST(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const admin = getSupabaseAdmin();
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) return unexpectedServerErrorResponse("cash_movements_post_auth_error", authErr);
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
            .eq("user_id", auth.user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (mErr) return unexpectedServerErrorResponse("cash_movements_post_membership_error", mErr);
        if (!member) {
            return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
        }
        const role = parseAppRole((member as { role?: unknown }).role);
        if (!role) {
            return NextResponse.json({ error: "Invalid member role" }, { status: 403 });
        }
        if (!(await branchBelongsToShop(admin, currentShopId, currentBranchId))) {
            return NextResponse.json({ error: "Branch does not belong to the current shop" }, { status: 403 });
        }

        const body: unknown = await req.json().catch(() => null);
        if (!isRecord(body)) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const businessDateRaw = readString((body as Record<string, unknown>).business_date);
        if (!isValidDateKey(businessDateRaw)) {
            return NextResponse.json(
                { error: "Invalid business_date. Use YYYY-MM-DD." },
                { status: 400 }
            );
        }
        const businessDate = businessDateRaw;

        const typeRaw = body.type;
        const type = CASH_MOVEMENT_TYPES.includes(typeRaw as CashMovementType)
            ? (typeRaw as CashMovementType)
            : null;
        if (!type) {
            return NextResponse.json(
                { error: "Invalid type. Use cash_in or cash_out." },
                { status: 400 }
            );
        }

        const reason = readString(body.reason);
        const note = readString(body.note);
        const reasonValidation = validateCashMovementReason({ type, reason, role, note });
        if (!reasonValidation.ok) {
            return NextResponse.json(
                { error: reasonValidation.error },
                { status: reasonValidation.status }
            );
        }

        const amount = normalizeAmount(body.amount);
        if (amount === null) {
            return NextResponse.json(
                { error: "Invalid amount. Must be a positive number." },
                { status: 400 }
            );
        }

        // Closed-day guard
        const guardResult = await checkDailyClose(currentShopId, currentBranchId, businessDate);
        if (guardResult.blocked && guardResult.closeStatus) {
            return NextResponse.json(
                {
                    error: "ปิดยอดของวันนี้แล้ว ไม่สามารถบันทึกรายการเงินสดได้",
                    code: "BUSINESS_DAY_CLOSED",
                    business_date: businessDate,
                    close_status: guardResult.closeStatus,
                },
                { status: 409 }
            );
        }

        const cmAdmin = cashAdmin(admin);

        const { data: inserted, error: insErr } = await cmAdmin
            .from("cash_movements")
            .insert({
                shop_id: currentShopId,
                branch_id: currentBranchId,
                business_date: businessDate,
                type,
                reason,
                amount,
                note,
                created_by: auth.user.id,
            })
            .select(
                "id, shop_id, branch_id, business_date, type, reason, amount, note, created_by, created_at"
            )
            .single();

        if (insErr || !inserted) {
            console.error("cash_movement_insert_failed", {
                error: insErr,
                shop_id: currentShopId,
                branch_id: currentBranchId,
                business_date: businessDate,
                type,
                reason,
                created_by: auth.user.id,
            });
            return NextResponse.json(
                { error: "Failed to create cash movement", code: "CASH_MOVEMENT_INSERT_FAILED" },
                { status: 500 }
            );
        }

        const movement: CashMovement = {
            id: inserted.id as string,
            shop_id: inserted.shop_id as string,
            branch_id: inserted.branch_id as string,
            business_date: inserted.business_date as string,
            type: inserted.type as CashMovementType,
            reason: inserted.reason as string,
            amount: Number(inserted.amount),
            note: (inserted.note as string | null) ?? null,
            created_by: (inserted.created_by as string | null) ?? null,
            created_at: inserted.created_at as string,
        };

        return NextResponse.json({ movement, navigationIntent: cashMovementNavigationIntent(movement) }, { status: 201 });
    } catch (e: unknown) {
        return unexpectedServerErrorResponse("cash_movements_post_unexpected", e);
    }
}
