// app/api/ingredients/analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/lib/database.types";

export const dynamic = "force-dynamic";

type UUID = string;

type IngredientRow = Database["public"]["Tables"]["ingredients"]["Row"];
type StockLogRow = Database["public"]["Tables"]["stock_logs"]["Row"];
type RecipeItemRow = Database["public"]["Tables"]["recipe_items"]["Row"];
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];

// menu_variants join menu (typed แบบพอใช้)
type MenuVariantJoin = {
    id: UUID;
    menu_id: UUID;
    menu: { id: UUID; name: string } | null;
};

function isUUID(s: string | null): s is UUID {
    return !!s && s.length >= 16;
}

function num(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * เราอยากใช้ "วันไทย" (+07:00) แบบชัวร์ ๆ ไม่พึ่ง timezone ของ server (บางทีเป็น UTC)
 * คืนค่า ISO ของจุดเริ่มวัน (00:00) ใน timezone +07
 */
function startOfBangkokDayISO(now = new Date()): string {
    const offsetMin = 7 * 60; // +07:00
    const t = now.getTime();

    // แปลงเป็น "เวลาไทย" ด้วยการบวก offset
    const local = new Date(t + offsetMin * 60_000);
    local.setHours(0, 0, 0, 0);

    // แปลงกลับเป็น UTC ISO โดยลบ offset คืน
    const utcStart = new Date(local.getTime() - offsetMin * 60_000);
    return utcStart.toISOString();
}

function daysAgoISO(days: number, now = new Date()): string {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d.toISOString();
}

function chunk<T>(arr: T[], size: number): T[][] {
    if (arr.length === 0) return [];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

// usage rules: รองรับทั้งแบบ amount ติดลบ และแบบ type = deduct
function usageFromLog(l: Pick<StockLogRow, "amount" | "type">): number {
    const a = num(l.amount);
    const t = String(l.type ?? "").toLowerCase();

    if (a < 0) return Math.abs(a);
    if (t === "deduct") return Math.abs(a);

    return 0;
}

export async function GET(req: NextRequest) {
    const supabase = getSupabaseServer();

    const ingredientId = req.nextUrl.searchParams.get("ingredient_id");
    if (!isUUID(ingredientId)) {
        return NextResponse.json({ error: "Missing ingredient_id" }, { status: 400 });
    }

    const now = new Date();
    const since7d = daysAgoISO(7, now); // last 7 days window
    const since30d = daysAgoISO(30, now);
    const sinceToday = startOfBangkokDayISO(now);

    // 1) ingredient current stock (ดึง min_stock ด้วย)
    const ingRes = await supabase
        .from("ingredients")
        .select("id,name,stock,min_stock,base_unit,unit,updated_at")
        .eq("id", ingredientId)
        .single<IngredientRow>();

    if (ingRes.error || !ingRes.data) {
        return NextResponse.json(
            { error: ingRes.error?.message ?? "Ingredient not found" },
            { status: 404 }
        );
    }

    const ingredient = ingRes.data;
    const stockNow = num(ingredient.stock);
    const minStock = num((ingredient as unknown as { min_stock?: unknown }).min_stock);

    // 2) stock_logs (7 วันล่าสุด)
    const logsRes = await supabase
        .from("stock_logs")
        .select("id,ingredient_id,amount,type,created_at")
        .eq("ingredient_id", ingredientId)
        .gte("created_at", since7d)
        .order("created_at", { ascending: false });

    if (logsRes.error) {
        return NextResponse.json({ error: logsRes.error.message }, { status: 500 });
    }

    const logs = (logsRes.data ?? []) as Pick<
        StockLogRow,
        "id" | "ingredient_id" | "amount" | "type" | "created_at"
    >[];

    let totalUsage7 = 0;
    let todayUsage = 0;

    for (const l of logs) {
        const u = usageFromLog(l);
        totalUsage7 += u;

        const created = l.created_at ? new Date(l.created_at).getTime() : NaN;
        if (Number.isFinite(created) && created >= new Date(sinceToday).getTime()) {
            todayUsage += u;
        }
    }

    const avgDailyUsage7 = totalUsage7 > 0 ? totalUsage7 / 7 : 0;

    // 8) days left
    // ถ้า avg = 0 -> ไม่มีการใช้
    const daysLeft = avgDailyUsage7 > 0 ? Math.max(0, stockNow / avgDailyUsage7) : null;
    const daysLeftLabel =
        avgDailyUsage7 > 0 ? `~ ${Math.max(0, Math.ceil(stockNow / avgDailyUsage7))} วัน` : "ไม่มีการใช้";

    // 9) abnormal badge (วันนี้ใช้มากกว่า avg*1.3)
    const abnormalToday = avgDailyUsage7 > 0 && todayUsage > avgDailyUsage7 * 1.3;

    // 10) Top Menu Consumers (30 days)
    // A) recipe_items -> perUnit usage per variant
    const recipeRes = await supabase
        .from("recipe_items")
        .select("variant_id,ingredient_id,quantity")
        .eq("ingredient_id", ingredientId);

    if (recipeRes.error) {
        return NextResponse.json({ error: recipeRes.error.message }, { status: 500 });
    }

    const recipeItems = (recipeRes.data ?? []) as Pick<
        RecipeItemRow,
        "variant_id" | "ingredient_id" | "quantity"
    >[];

    const variantToPerUnit = new Map<UUID, number>();
    for (const r of recipeItems) {
        const vid = r.variant_id as unknown as UUID | null;
        if (!vid) continue;
        variantToPerUnit.set(vid, (variantToPerUnit.get(vid) ?? 0) + num(r.quantity));
    }

    let topMenus: Array<{ menu_id: UUID; menu_name: string; total_used: number }> = [];

    if (variantToPerUnit.size > 0) {
        const variantIds = Array.from(variantToPerUnit.keys());

        // B) order_items last 30 days (sum qty per variant)
        const variantOrderQty = new Map<UUID, number>();
        for (const c of chunk(variantIds, 200)) {
            const oiRes = await supabase
                .from("order_items")
                .select("variant_id,qty,created_at")
                .in("variant_id", c)
                .gte("created_at", since30d);

            if (oiRes.error) {
                return NextResponse.json({ error: oiRes.error.message }, { status: 500 });
            }

            const items = (oiRes.data ?? []) as Pick<
                OrderItemRow,
                "variant_id" | "qty" | "created_at"
            >[];

            for (const it of items) {
                const vid = it.variant_id as unknown as UUID | null;
                if (!vid) continue;
                variantOrderQty.set(vid, (variantOrderQty.get(vid) ?? 0) + Math.max(0, num(it.qty)));
            }
        }

        // C) menu_variants join menu (ชื่อเมนู)
        const mvRes = await supabase
            .from("menu_variants")
            .select("id,menu_id,menu:menu_id(id,name)")
            .in("id", variantIds);

        if (mvRes.error) {
            return NextResponse.json({ error: mvRes.error.message }, { status: 500 });
        }

        const mvs = (mvRes.data ?? []) as unknown as MenuVariantJoin[];

        const menuAgg = new Map<UUID, { menu_name: string; total_used: number }>();

        for (const mv of mvs) {
            const vid = mv.id;
            const mid = mv.menu_id;
            const menuName = mv.menu?.name ?? "Unknown";

            const perUnit = variantToPerUnit.get(vid) ?? 0;
            const orderedQty = variantOrderQty.get(vid) ?? 0;

            const used = perUnit * orderedQty;
            if (used <= 0) continue;

            const prev = menuAgg.get(mid);
            if (!prev) menuAgg.set(mid, { menu_name: menuName, total_used: used });
            else menuAgg.set(mid, { menu_name: prev.menu_name, total_used: prev.total_used + used });
        }

        topMenus = Array.from(menuAgg.entries())
            .map(([menu_id, v]) => ({ menu_id, menu_name: v.menu_name, total_used: v.total_used }))
            .sort((a, b) => b.total_used - a.total_used)
            .slice(0, 5);
    }

    return NextResponse.json({
        ingredient: {
            id: ingredient.id,
            name: ingredient.name,
            stock: stockNow,
            min_stock: minStock,
            base_unit: ingredient.base_unit,
            unit: ingredient.unit,
            updated_at: ingredient.updated_at ?? null,
        },
        usage: {
            avgDailyUsage7,
            totalUsage7,
            todayUsage,
            daysLeft, // number | null
            daysLeftLabel, // string: "~ X วัน" | "ไม่มีการใช้"
            abnormalToday, // boolean
            abnormalLabel: abnormalToday ? "⚠️ ใช้มากผิดปกติ" : "",
        },
        topMenus,
        meta: {
            window_days_avg: 7,
            window_days_top: 30,
            sinceTodayISO: sinceToday,
            since7dISO: since7d,
            since30dISO: since30d,
        },
    });
}
