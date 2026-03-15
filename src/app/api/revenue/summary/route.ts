// app/api/revenue/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type Preset = "today" | "7days" | "month";

type Summary = {
    preset: Preset;
    current: { start: string; end: string; total: number; count: number };
    previous: { start: string; end: string; total: number; count: number };
    delta: { total: number; count: number };
    percent: { total: number | null; count: number | null };
};

type PaidOrderRow = { total: number | null };

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

async function sumAndCountPaid(startISO: string, endISO: string, currentBranchId: string | null) {
    const supabase = await getSupabaseServer();

    let query = supabase
        .from("orders")
        .select("total", { count: "exact" })
        .eq("status", "paid")
        .gte("paid_at", startISO)
        .lt("paid_at", endISO);

    if (currentBranchId) {
        query = query.filter("branch_id", "eq", currentBranchId);
    }

    const { data, error, count } = await query.returns<PaidOrderRow[]>();

    if (error) throw new Error(error.message);

    const rows = Array.isArray(data) ? data : [];
    const total = rows.reduce((sum, r) => sum + (typeof r.total === "number" ? r.total : 0), 0);

    return { total, count: typeof count === "number" ? count : rows.length };
}

export async function GET(req: NextRequest) {
    try {
        const { currentBranchId } = await getCurrentContextFromCookies();
        const presetRaw = req.nextUrl.searchParams.get("preset");
        const preset: Preset =
            presetRaw === "today" || presetRaw === "7days" || presetRaw === "month"
                ? presetRaw
                : "today";

        const todayKey = fmtKey(new Date());
        const { current, previous } = getRanges(preset, todayKey);

        const [cur, prev] = await Promise.all([
            sumAndCountPaid(current.startISO, current.endISO, currentBranchId),
            sumAndCountPaid(previous.startISO, previous.endISO, currentBranchId),
        ]);

        const out: Summary = {
            preset,
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
