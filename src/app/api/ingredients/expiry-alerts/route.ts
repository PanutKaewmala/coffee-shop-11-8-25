import { NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
    getDaysToExpiry,
    getExpiryAlertTone,
    getExpiryStatusLabel,
} from "@/lib/ingredientExpiry";

export const dynamic = "force-dynamic";

type IngredientLotExpiryRow = {
    id: string | null;
    ingredient_id: string | null;
    ingredient_name: string | null;
    lot_code: string | null;
    qty_remaining: number | null;
    unit: string | null;
    received_at: string | null;
    opened_at: string | null;
    expires_at: string | null;
    best_before_at: string | null;
    effective_expiry_at: string | null;
};

function normalizeLot(row: IngredientLotExpiryRow) {
    const daysToExpiry = getDaysToExpiry(row.effective_expiry_at ?? row.expires_at ?? null);
    const alertTone = getExpiryAlertTone(daysToExpiry);

    return {
        id: row.id,
        ingredient_id: row.ingredient_id,
        ingredient_name: row.ingredient_name,
        lot_code: row.lot_code,
        qty_remaining: Number(row.qty_remaining ?? 0),
        unit: row.unit,
        received_at: row.received_at,
        opened_at: row.opened_at,
        expires_at: row.expires_at,
        best_before_at: row.best_before_at,
        effective_expiry_at: row.effective_expiry_at,
        days_to_expiry: daysToExpiry,
        status_label: getExpiryStatusLabel(daysToExpiry),
        alert_tone: alertTone,
    };
}

export async function GET() {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    if (!currentShopId) return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    if (!currentBranchId) return NextResponse.json({ error: "No current branch selected" }, { status: 409 });

    const { data: member, error: memberErr } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
    if (!member) return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });

    const { data, error } = await admin
        .from("ingredient_lot_expiry_status")
        .select(
            "id,ingredient_id,ingredient_name,lot_code,qty_remaining,unit,received_at,opened_at,expires_at,best_before_at,effective_expiry_at"
        )
        .eq("shop_id", currentShopId)
        .eq("branch_id", currentBranchId)
        .gt("qty_remaining", 0)
        .limit(250)
        .returns<IngredientLotExpiryRow[]>();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const lots = (data ?? []).map(normalizeLot);
    const withExpiry = lots.filter((lot) => lot.days_to_expiry != null);
    const alerts = withExpiry
        .filter((lot) => lot.alert_tone === "danger" || lot.alert_tone === "warning")
        .sort((a, b) => (a.days_to_expiry ?? 9999) - (b.days_to_expiry ?? 9999));

    const summary = {
        total_lots: lots.length,
        lots_with_expiry: withExpiry.length,
        expired_count: withExpiry.filter((lot) => (lot.days_to_expiry ?? 0) < 0).length,
        danger_count: withExpiry.filter((lot) => lot.alert_tone === "danger").length,
        warning_count: withExpiry.filter((lot) => lot.alert_tone === "warning").length,
        normal_count: withExpiry.filter((lot) => lot.alert_tone === "normal").length,
    };

    return NextResponse.json({
        source: "ingredient_lot_expiry_status",
        hasLotData: lots.length > 0,
        hasExpiryData: withExpiry.length > 0,
        summary,
        alerts: alerts.slice(0, 8),
    });
}
