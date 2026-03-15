// app/api/ingredients/analytics/batch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type UUID = string;

function isUUID(s: unknown): s is UUID {
    return typeof s === "string" && s.length >= 16;
}

function num(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

function startOfLocalDayISO(): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

function daysAgoISO(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
}

type IngredientRow = {
    id: UUID;
    stock: number;
    name: string;
    base_unit: string | null;
    unit: string | null;
};

type StockLogRow = {
    ingredient_id: UUID;
    amount: number;
    type: string | null;
    created_at: string | null;
};

function usageFromLog(l: StockLogRow): number {
    const a = num(l.amount);
    const t = (l.type ?? "").toLowerCase();

    if (a < 0) return Math.abs(a);
    if (t === "deduct") return Math.abs(a);

    return 0;
}

export async function POST(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
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
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!member) return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const ingredient_ids = (body as { ingredient_ids?: unknown }).ingredient_ids;
    if (!Array.isArray(ingredient_ids) || ingredient_ids.length === 0) {
        return NextResponse.json({ error: "Missing ingredient_ids" }, { status: 400 });
    }

    const ids = ingredient_ids.filter(isUUID);
    if (ids.length === 0) {
        return NextResponse.json({ error: "No valid ingredient_ids" }, { status: 400 });
    }

    const since7d = daysAgoISO(7);
    const sinceToday = startOfLocalDayISO();

    // 1) fetch ingredients (current stock)
    const ingRes = await admin
        .from("ingredients")
        .select("id,name,stock,base_unit,unit")
        .eq("shop_id", currentShopId)
        .filter("branch_id", "eq", currentBranchId)
        .in("id", ids);

    if (ingRes.error) {
        return NextResponse.json({ error: ingRes.error.message }, { status: 500 });
    }

    const ingredients = (ingRes.data ?? []) as IngredientRow[];

    // 2) fetch logs last 7d for these ingredients
    const logsRes = await admin
        .from("stock_logs")
        .select("ingredient_id,amount,type,created_at")
        .eq("shop_id", currentShopId)
        .filter("branch_id", "eq", currentBranchId)
        .in("ingredient_id", ids)
        .gte("created_at", since7d);

    if (logsRes.error) {
        return NextResponse.json({ error: logsRes.error.message }, { status: 500 });
    }

    const logs = (logsRes.data ?? []) as StockLogRow[];

    // aggregate per ingredient
    const totalUsage7 = new Map<UUID, number>();
    const todayUsage = new Map<UUID, number>();

    for (const l of logs) {
        const u = usageFromLog(l);
        if (u <= 0) continue;

        const id = l.ingredient_id;
        totalUsage7.set(id, (totalUsage7.get(id) ?? 0) + u);

        if (l.created_at && new Date(l.created_at) >= new Date(sinceToday)) {
            todayUsage.set(id, (todayUsage.get(id) ?? 0) + u);
        }
    }

    const result = ingredients.map((ing) => {
        const usage7 = totalUsage7.get(ing.id) ?? 0;
        const today = todayUsage.get(ing.id) ?? 0;

        const avgDailyUsage7 = usage7 > 0 ? usage7 / 7 : 0;
        const stockNow = num(ing.stock);
        const daysLeft = avgDailyUsage7 > 0 ? Math.max(0, stockNow / avgDailyUsage7) : null;

        const abnormalToday = avgDailyUsage7 > 0 && today > avgDailyUsage7 * 1.3;

        return {
            ingredient_id: ing.id,
            avgDailyUsage7,
            todayUsage: today,
            daysLeft,
            abnormalToday,
            unit: ing.base_unit ?? ing.unit ?? null,
        };
    });

    return NextResponse.json({
        items: result,
        meta: { window_days_avg: 7 },
    });
}
