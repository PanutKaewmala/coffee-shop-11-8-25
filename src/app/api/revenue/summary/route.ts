// app/api/revenue/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type Preset = "today" | "7days" | "month";

type Summary = {
    preset: Preset;
    legacy_paid_at_fallback_count: number;
    current: { start: string; end: string; total: number; count: number };
    previous: { start: string; end: string; total: number; count: number };
    delta: { total: number; count: number };
    percent: { total: number | null; count: number | null };
};

type PaidOrderRow = {
    total: number | null;
    paid_at: string | null;
    created_at: string | null;
};

type SumResult = {
    total: number;
    count: number;
    legacy_paid_at_fallback_count: number;
};

const TZ = "Asia/Bangkok";

function fmtKey(d: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(d);
}

function keyToDate(key: string): Date {
    return new Date(`${key}T00:00:00+07:00`);
}

function addDays(key: string, days: number): string {
    const d = keyToDate(key);
    d.setDate(d.getDate() + days);
    return fmtKey(d);
}

function firstDayOfMonthKey(key: string): string {
    return `${key.slice(0, 7)}-01`;
}

function firstDayNextMonthKey(key: string): string {
    const d = keyToDate(firstDayOfMonthKey(key));
    d.setMonth(d.getMonth() + 1);
    return fmtKey(d).slice(0, 7) + "-01";
}

function isoStart(key: string) {
    return `${key}T00:00:00+07:00`;
}

function pct(current: number, previous: number): number | null {
    if (!Number.isFinite(previous) || previous <= 0) return null;
    return ((current - previous) / previous) * 100;
}

function getRanges(preset: Preset, todayKey: string) {
    if (preset === "today") {
        const curStartKey = todayKey;
        const curEndKey = addDays(todayKey, 1);
        const prevStartKey = addDays(todayKey, -1);
        const prevEndKey = todayKey;

        return {
            current: { startISO: isoStart(curStartKey), endISO: isoStart(curEndKey) },
            previous: { startISO: isoStart(prevStartKey), endISO: isoStart(prevEndKey) },
        };
    }

    if (preset === "7days") {
        const curStartKey = addDays(todayKey, -6);
        const curEndKey = addDays(todayKey, 1);

        const prevStartKey = addDays(curStartKey, -7);
        const prevEndKey = curStartKey;

        return {
            current: { startISO: isoStart(curStartKey), endISO: isoStart(curEndKey) },
            previous: { startISO: isoStart(prevStartKey), endISO: isoStart(prevEndKey) },
        };
    }

    const curStartKey = firstDayOfMonthKey(todayKey);
    const curEndKey = firstDayNextMonthKey(todayKey);

    const lastDayPrevMonthKey = addDays(curStartKey, -1);
    const prevStartKey = firstDayOfMonthKey(lastDayPrevMonthKey);
    const prevEndKey = curStartKey;

    return {
        current: { startISO: isoStart(curStartKey), endISO: isoStart(curEndKey) },
        previous: { startISO: isoStart(prevStartKey), endISO: isoStart(prevEndKey) },
    };
}

async function sumAndCountPaid(
    startISO: string,
    endISO: string,
    currentShopId: string,
    currentBranchId: string | null
): Promise<SumResult> {
    const supabase = await getSupabaseServer();

    let paidQ = supabase
        .from("orders")
        .select("total", { count: "exact" })
        .eq("status", "paid")
        .eq("shop_id", currentShopId);

    let legacyQ = supabase
        .from("orders")
        .select("total", { count: "exact" })
        .eq("status", "paid")
        .eq("shop_id", currentShopId);

    if (currentBranchId) {
        paidQ = paidQ.eq("branch_id", currentBranchId);
        legacyQ = legacyQ.eq("branch_id", currentBranchId);
    }

    const [paidRes, legacyRes] = await Promise.all([
        paidQ.gte("paid_at", startISO).lt("paid_at", endISO).returns<PaidOrderRow[]>(),
        legacyQ.is("paid_at", null).gte("created_at", startISO).lt("created_at", endISO).returns<PaidOrderRow[]>(),
    ]);

    if (paidRes.error) throw new Error(paidRes.error.message);
    if (legacyRes.error) throw new Error(legacyRes.error.message);

    const paidRows = Array.isArray(paidRes.data) ? paidRes.data : [];
    const legacyRows = Array.isArray(legacyRes.data) ? legacyRes.data : [];

    const paidTotal = paidRows.reduce((sum, r) => sum + (typeof r.total === "number" ? r.total : 0), 0);
    const legacyTotal = legacyRows.reduce((sum, r) => sum + (typeof r.total === "number" ? r.total : 0), 0);

    const total = paidTotal + legacyTotal;
    const count = (paidRes.count ?? paidRows.length) + (legacyRes.count ?? legacyRows.length);
    const legacyFallbackCount = legacyRes.count ?? legacyRows.length;

    return { total, count, legacy_paid_at_fallback_count: legacyFallbackCount };
}

export async function GET(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const admin = getSupabaseAdmin();

        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
        const user = auth.user;
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
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

        if (currentBranchId) {
            const { data: branchRow, error: branchErr } = await admin
                .from("branch")
                .select("id")
                .eq("id", currentBranchId)
                .eq("shop_id", currentShopId)
                .maybeSingle();

            if (branchErr) return NextResponse.json({ error: branchErr.message }, { status: 500 });
            if (!branchRow) {
                return NextResponse.json({ error: "Branch not in current shop" }, { status: 403 });
            }
        }

        const presetRaw = req.nextUrl.searchParams.get("preset");
        const preset: Preset =
            presetRaw === "today" || presetRaw === "7days" || presetRaw === "month"
                ? presetRaw
                : "today";

        const todayKey = fmtKey(new Date());
        const { current, previous } = getRanges(preset, todayKey);

        const [cur, prev] = await Promise.all([
            sumAndCountPaid(current.startISO, current.endISO, currentShopId, currentBranchId),
            sumAndCountPaid(previous.startISO, previous.endISO, currentShopId, currentBranchId),
        ]);

        const out: Summary = {
            preset,
            legacy_paid_at_fallback_count: cur.legacy_paid_at_fallback_count + prev.legacy_paid_at_fallback_count,
            current: { start: current.startISO, end: current.endISO, total: cur.total, count: cur.count },
            previous: { start: previous.startISO, end: previous.endISO, total: prev.total, count: prev.count },
            delta: { total: cur.total - prev.total, count: cur.count - prev.count },
            percent: { total: pct(cur.total, prev.total), count: pct(cur.count, prev.count) },
        };

        return NextResponse.json(out);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load revenue summary";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
