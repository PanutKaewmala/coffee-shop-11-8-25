// app/api/stock/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type UUID = string;

type StockLogType = "deduct" | "add" | "adjust";
type UnitKey = "g" | "ml" | "piece";

type IngredientJoinRow = {
    id: UUID;
    name: string;
    unit: string | null; // display unit (อาจเป็น kg/bottle/etc)
    base_unit: string | null; // ✅ ควรเป็น ml/g/piece
    stock: number | string | null;
    min_stock: number | string | null;
    is_active?: boolean | null;
};

type StockLogJoinRow = {
    id: UUID;
    ingredient_id: UUID;
    order_id: string | null; // text ใน DB
    amount: number | string;
    type: StockLogType;
    note: string | null;
    before_stock: number | string | null;
    after_stock: number | string | null;
    created_at: string;
    ingredient?: IngredientJoinRow | null;
};

type StockEventItem = {
    id: UUID;
    ingredient_id: UUID;
    ingredient_name: string | null;
    unit: string | null; // display
    base_unit: string | null; // base
    amount: number;
    delta: number | null;
    before_stock: number | null;
    after_stock: number | null;
    flags: { big_amount: boolean };
};

type OrderMenuLine = {
    order_item_id: UUID;
    menu_id: UUID | null;
    variant_id: UUID | null;
    menu_name: string;
    serve_type: string | null;
    size: string | null;
    qty: number;
    price: number;
};

type StockEvent = {
    event_id: string;
    happened_at: string;
    type: StockLogType;
    order_id: string | null;

    title: string;
    subtitle: string | null;
    note: string | null;

    items_count: number;
    impact_by_unit: Record<UnitKey, number>;

    flags: {
        manual_adjust: boolean;
        has_big_amount: boolean;
    };

    items: StockEventItem[];
    order_menu_lines?: OrderMenuLine[];
};

type StockSummary = {
    total_events: number;
    total_items: number;
    events_by_type: Record<StockLogType, number>;
    items_by_type: Record<StockLogType, number>;
    impact_by_unit: Record<UnitKey, number>;
};

type KpiSummary = {
    range: { from: string | null; to: string | null };
    events_count: number;
    critical_count: number;
    inflow: Record<UnitKey, number>;
    outflow: Record<UnitKey, number>;
    by_type: Record<StockLogType, number>;
};

type IngredientCriticalRow = {
    stock: number | string | null;
    min_stock: number | string | null;
    is_active: boolean;
};

type IngredientCriticalListRow = {
    id: UUID;
    name: string;
    unit: string | null;
    base_unit: string | null;
    stock: number | string | null;
    min_stock: number | string | null;
    is_active: boolean;
};

type CriticalItem = {
    ingredient_id: UUID;
    name: string;
    base_unit: UnitKey; // ✅ บังคับ 3 หน่วย
    display_unit: string | null; // unit เดิม
    current_stock: number;
    min_stock: number;
    status: "out" | "low" | "ok";
};

/* =========================
   Helpers
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function toStringOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
}

function toInt(v: unknown, fallback: number): number {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
}

function toNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function readNumberField(obj: Record<string, unknown>, key: string): number | null {
    const v = obj[key];
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function isStockLogType(v: string | null): v is StockLogType {
    return v === "deduct" || v === "add" || v === "adjust";
}

function normalizeFromTo(input: string | null, mode: "from" | "to"): string | null {
    if (!input) return null;
    const s = input.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return mode === "from" ? `${s}T00:00:00` : `${s}T23:59:59.999`;
    }
    return s;
}

// ✅ บังคับ 3 หน่วย: g/ml/piece
function unitKey(unit: string | null): UnitKey {
    const u = (unit ?? "").toLowerCase().trim();
    if (u === "g" || u === "gram" || u === "grams") return "g";
    if (u === "ml" || u === "milliliter" || u === "milliliters") return "ml";
    if (u === "piece" || u === "pcs" || u === "pc") return "piece";

    // ถ้าหลุดมาแปลว่า data มีปัญหา แต่ไม่ควรทำ API พังกลางร้าน
    console.warn("[stock] invalid base_unit:", unit);
    return "piece";
}

function initImpact(): Record<UnitKey, number> {
    return { g: 0, ml: 0, piece: 0 };
}

const SAFE_BIG_INGREDIENTS = new Set(["น้ำแข็ง", "น้ำร้อน", "น้ำเปล่า", "น้ำ"]);

function shortId(id: string, n = 8) {
    const s = (id ?? "").trim();
    if (!s) return "-";
    return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function eventKey(row: { order_id: string | null; type: StockLogType; note: string | null; created_at: string }): string {
    if (row.order_id) return `order:${row.order_id}`;
    const minute = row.created_at?.slice(0, 16) || "unknown-minute";
    const note = (row.note ?? "").trim().toLowerCase();
    return `batch:${row.type}:${minute}:${note || "-"}`;
}

function calcSignedImpact(params: { type: StockLogType; amount: number; before_stock: number | null; after_stock: number | null }): number {
    const { type, amount, before_stock, after_stock } = params;

    // ใช้ delta ถ้ามี before/after
    if (before_stock != null && after_stock != null) {
        const d = after_stock - before_stock;

        // กัน data เพี้ยน: deduct แต่ delta เป็นบวก -> ถือว่าเป็นลบ
        if (type === "deduct" && d > 0) return -Math.abs(amount);
        // add แต่ delta เป็นลบ -> ถือว่าเป็นบวก
        if (type === "add" && d < 0) return Math.abs(amount);

        return d;
    }

    if (type === "deduct") return -Math.abs(amount);
    if (type === "add") return Math.abs(amount);
    return 0;
}

function isBigAmountDeduct(amountAbs: number, unit: UnitKey): boolean {
    if (unit === "g") return amountAbs >= 500;
    if (unit === "ml") return amountAbs >= 1000;
    // piece
    return amountAbs >= 10;
}

function buildTitle(type: StockLogType, hasOrder: boolean): string {
    if (hasOrder) return "POS Checkout";
    if (type === "adjust") return "ปรับสต็อก";
    if (type === "add") return "เพิ่มสต็อก";
    return "ตัดตามออเดอร์";
}

function buildSubtitle(type: StockLogType, order_id: string | null, note: string | null): string | null {
    if (order_id) return `Order #${shortId(order_id, 10)}`;
    const n = (note ?? "").trim();
    if (n) return n.length > 60 ? `${n.slice(0, 60)}…` : n;
    if (type === "adjust") return "Manual adjustment";
    if (type === "add") return "Stock added";
    return null;
}

/* =========================
   Order menu lines (best-effort)
========================= */
type OrderItemJoinRow = {
    id: UUID;
    order_id: UUID | null;
    menu_id: UUID | null;
    variant_id: UUID | null;
    name: string;
    price: number | string;
    qty: number | string;
    variant?: {
        id: UUID;
        size: string | null;
        serve_type_id: UUID | null;
        serve_type?: { id: UUID; name: string } | null;
        menu?: { id: UUID; name: string } | null;
    } | null;
};

async function fetchOrderMenuLinesByOrderIds(
    supabase: ReturnType<typeof getSupabaseServer>,
    orderIds: string[]
): Promise<Map<string, OrderMenuLine[]>> {
    const map = new Map<string, OrderMenuLine[]>();
    if (orderIds.length === 0) return map;

    const CHUNK = 150;
    for (let i = 0; i < orderIds.length; i += CHUNK) {
        const batch = orderIds.slice(i, i + CHUNK);

        const select = `
      id,
      order_id,
      menu_id,
      variant_id,
      name,
      price,
      qty,
      variant:menu_variants!order_items_variant_id_fkey (
        id,
        size,
        serve_type_id,
        serve_type:menu_serve_types!menu_variants_serve_type_id_fkey ( id, name ),
        menu:menu!menu_variants_menu_id_fkey ( id, name )
      )
    `;

        const { data, error } = await supabase
            .from("order_items")
            .select(select)
            .in("order_id", batch)
            .returns<OrderItemJoinRow[]>();

        if (error) continue;

        for (const r of data ?? []) {
            const oid = (r.order_id ?? "").toString().trim();
            if (!oid) continue;

            const menuName = r.variant?.menu?.name?.trim()
                ? r.variant.menu.name
                : (r.name ?? "").trim() || "-";

            const serveType = r.variant?.serve_type?.name ?? null;
            const size = r.variant?.size ?? null;

            const line: OrderMenuLine = {
                order_item_id: r.id,
                menu_id: r.menu_id ?? null,
                variant_id: r.variant_id ?? null,
                menu_name: menuName,
                serve_type: serveType,
                size,
                qty: toInt(r.qty, 0),
                price: toNumber(r.price, 0),
            };

            const arr = map.get(oid) ?? [];
            arr.push(line);
            map.set(oid, arr);
        }
    }

    for (const [oid, lines] of map.entries()) {
        lines.sort((a, b) => b.qty - a.qty || a.menu_name.localeCompare(b.menu_name));
        map.set(oid, lines);
    }

    return map;
}

/* =========================
   Critical helpers
========================= */
async function countCriticalActiveIngredients(
    supabase: ReturnType<typeof getSupabaseServer>
): Promise<number> {
    const { data, error } = await supabase
        .from("ingredients")
        .select("stock,min_stock,is_active")
        .eq("is_active", true)
        .returns<IngredientCriticalRow[]>();

    if (error) return 0;

    return (data ?? []).filter((r) => {
        const s = toNumber(r.stock, 0);
        const m = toNumber(r.min_stock, 0);
        return s <= 0 || s <= m;
    }).length;
}

/* =========================
   GET
========================= */
export async function GET(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const url = new URL(req.url);

        const mode = (toStringOrNull(url.searchParams.get("mode")) ?? "events").toLowerCase();

        /* =========================
           MODE: CRITICAL
        ========================= */
        if (mode === "critical") {
            const { data, error } = await supabase
                .from("ingredients")
                .select("id,name,unit,base_unit,stock,min_stock,is_active")
                .eq("is_active", true)
                .order("stock", { ascending: true })
                .returns<IngredientCriticalListRow[]>();

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            const all: CriticalItem[] = (data ?? []).map((r) => {
                const stock = toNumber(r.stock, 0);
                const min = toNumber(r.min_stock, 0);

                const bu = unitKey((r.base_unit ?? r.unit ?? "piece").toString());

                const status: CriticalItem["status"] =
                    stock <= 0 ? "out" : stock <= min ? "low" : "ok";

                return {
                    ingredient_id: r.id,
                    name: r.name,
                    base_unit: bu,
                    display_unit: r.unit ?? null,
                    current_stock: stock,
                    min_stock: min,
                    status,
                };
            });

            const critical = all.filter((x) => x.status !== "ok");

            return NextResponse.json({
                critical_count: critical.length,
                items: critical.slice(0, 50),
            });
        }

        /* =========================
           MODE: SUMMARY (KPI)
        ========================= */
        if (mode === "summary") {
            const from = normalizeFromTo(toStringOrNull(url.searchParams.get("from")), "from");
            const to = normalizeFromTo(toStringOrNull(url.searchParams.get("to")), "to");

            const select2 = `
        id,
        amount,
        type,
        note,
        before_stock,
        after_stock,
        created_at,
        ingredient:ingredients!stock_logs_ingredient_id_fkey (
          id,
          name,
          unit,
          base_unit,
          stock,
          min_stock,
          is_active
        )
      `;

            let q = supabase
                .from("stock_logs")
                .select(select2)
                .order("created_at", { ascending: false });

            if (from) q = q.gte("created_at", from);
            if (to) q = q.lte("created_at", to);

            const { data, error } = await q.returns<StockLogJoinRow[]>();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            const inflow = initImpact();
            const outflow = initImpact();
            const byType: Record<StockLogType, number> = { deduct: 0, add: 0, adjust: 0 };

            for (const r of data ?? []) {
                byType[r.type] += 1;

                const amount = toNumber(r.amount, 0);
                const before_stock = r.before_stock == null ? null : toNumber(r.before_stock, 0);
                const after_stock = r.after_stock == null ? null : toNumber(r.after_stock, 0);

                const uKey = unitKey(r.ingredient?.base_unit ?? r.ingredient?.unit ?? null);
                const signed = calcSignedImpact({ type: r.type, amount, before_stock, after_stock });

                if (signed > 0) inflow[uKey] += signed;
                if (signed < 0) outflow[uKey] += Math.abs(signed);
            }

            const criticalCount = await countCriticalActiveIngredients(supabase);

            const payload: KpiSummary = {
                range: { from: from ?? null, to: to ?? null },
                events_count: (data ?? []).length,
                critical_count: criticalCount,
                inflow,
                outflow,
                by_type: byType,
            };

            return NextResponse.json(payload);
        }

        /* =========================
           DEFAULT: EVENTS (เดิม) + order menu lines
        ========================= */
        const ingredient_id = toStringOrNull(url.searchParams.get("ingredient_id"));
        const order_id = toStringOrNull(url.searchParams.get("order_id"));
        const typeRaw = toStringOrNull(url.searchParams.get("type"));
        const type = isStockLogType(typeRaw) ? typeRaw : null;

        const from = normalizeFromTo(toStringOrNull(url.searchParams.get("from")), "from");
        const to = normalizeFromTo(toStringOrNull(url.searchParams.get("to")), "to");

        const qText = toStringOrNull(url.searchParams.get("q"));

        const limit = Math.min(Math.max(toInt(url.searchParams.get("limit"), 400), 1), 1000);
        const offset = Math.max(toInt(url.searchParams.get("offset"), 0), 0);

        const select = `
      id,
      ingredient_id,
      order_id,
      amount,
      type,
      note,
      before_stock,
      after_stock,
      created_at,
      ingredient:ingredients!stock_logs_ingredient_id_fkey (
        id,
        name,
        unit,
        base_unit,
        stock,
        min_stock
      )
    `;

        let query = supabase
            .from("stock_logs")
            .select(select)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (ingredient_id) query = query.eq("ingredient_id", ingredient_id);
        if (order_id) query = query.eq("order_id", order_id);
        if (type) query = query.eq("type", type);

        if (from) query = query.gte("created_at", from);
        if (to) query = query.lte("created_at", to);

        if (qText) {
            const qEsc = qText.replace(/%/g, "\\%").replace(/_/g, "\\_");
            query = query.or(
                [
                    `order_id.ilike.%${qEsc}%`,
                    `note.ilike.%${qEsc}%`,
                    `ingredient.name.ilike.%${qEsc}%`,
                ].join(",")
            );
        }

        const { data, error } = await query.returns<StockLogJoinRow[]>();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const rows = data ?? [];

        const map = new Map<string, StockEvent>();
        const orderIdsSet = new Set<string>();

        for (const r of rows) {
            if (r.order_id) orderIdsSet.add(r.order_id);

            const amount = toNumber(r.amount, 0);
            const before_stock = r.before_stock == null ? null : toNumber(r.before_stock, 0);
            const after_stock = r.after_stock == null ? null : toNumber(r.after_stock, 0);

            const ingName = r.ingredient?.name ?? null;
            const uKey = unitKey(r.ingredient?.base_unit ?? r.ingredient?.unit ?? null);

            const signedImpact = calcSignedImpact({
                type: r.type,
                amount,
                before_stock,
                after_stock,
            });

            const key = eventKey({
                order_id: r.order_id ?? null,
                type: r.type,
                note: r.note ?? null,
                created_at: r.created_at,
            });

            let ev = map.get(key);
            if (!ev) {
                const hasOrder = Boolean(r.order_id);
                ev = {
                    event_id: key,
                    happened_at: r.created_at,
                    type: r.type,
                    order_id: r.order_id ?? null,

                    title: buildTitle(r.type, hasOrder),
                    subtitle: buildSubtitle(r.type, r.order_id ?? null, r.note ?? null),

                    note: r.note ?? null,

                    items_count: 0,
                    impact_by_unit: initImpact(),
                    flags: {
                        manual_adjust: r.type === "adjust",
                        has_big_amount: false,
                    },
                    items: [],
                };
                map.set(key, ev);
            }

            const isSafe = ingName ? SAFE_BIG_INGREDIENTS.has(ingName.trim()) : false;
            const big = r.type === "deduct" && !isSafe && isBigAmountDeduct(Math.abs(amount), uKey);

            ev.items.push({
                id: r.id,
                ingredient_id: r.ingredient_id,
                ingredient_name: ingName,
                unit: r.ingredient?.unit ?? null,
                base_unit: r.ingredient?.base_unit ?? null,
                amount,
                delta: before_stock != null && after_stock != null ? after_stock - before_stock : null,
                before_stock,
                after_stock,
                flags: { big_amount: big },
            });

            ev.items_count += 1;
            ev.impact_by_unit[uKey] += signedImpact;
            if (big) ev.flags.has_big_amount = true;
        }

        let events = Array.from(map.values()).sort((a, b) => {
            const ta = Date.parse(a.happened_at);
            const tb = Date.parse(b.happened_at);
            return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
        });

        // attach order menu lines (best-effort)
        const orderIds = Array.from(orderIdsSet);
        const orderLinesMap = await fetchOrderMenuLinesByOrderIds(supabase, orderIds);

        events = events.map((e) => {
            if (!e.order_id) return e;
            const lines = orderLinesMap.get(e.order_id) ?? [];
            return { ...e, order_menu_lines: lines };
        });

        const summary: StockSummary = {
            total_events: events.length,
            total_items: events.reduce((s, e) => s + e.items_count, 0),
            events_by_type: { deduct: 0, add: 0, adjust: 0 },
            items_by_type: { deduct: 0, add: 0, adjust: 0 },
            impact_by_unit: initImpact(),
        };

        for (const e of events) {
            summary.events_by_type[e.type] += 1;
            summary.items_by_type[e.type] += e.items_count;

            summary.impact_by_unit.g += e.impact_by_unit.g;
            summary.impact_by_unit.ml += e.impact_by_unit.ml;
            summary.impact_by_unit.piece += e.impact_by_unit.piece;
        }

        return NextResponse.json({
            summary,
            events,
            meta: {
                limit,
                offset,
                returned_logs: rows.length,
                returned_events: events.length,
                returned_orders_joined: orderIds.length,
                filters: {
                    ingredient_id: ingredient_id ?? null,
                    order_id: order_id ?? null,
                    type: type ?? null,
                    from: from ?? null,
                    to: to ?? null,
                    q: qText ?? null,
                },
            },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================
   POST (Adjust stock from admin)
========================= */
type PostMode = "add" | "deduct" | "set";
type PostReason = "receive" | "waste" | "count";

function isPostMode(v: unknown): v is PostMode {
    return v === "add" || v === "deduct" || v === "set";
}

function isPostReason(v: unknown): v is PostReason {
    return v === "receive" || v === "waste" || v === "count";
}

function normalizeNote(reason: PostReason | null, note: string | null): string | null {
    const n = (note ?? "").trim();
    const r = reason ? reason.trim() : "";
    if (!n && !r) return null;

    // Prefix เพื่ออ่านใน Stock History ได้ทันที (ไม่ต้องแก้ schema)
    const prefix = r ? `${r}: ` : "";
    return `${prefix}${n || ""}`.trim() || null;
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();

        const raw = (await req.json().catch(() => null)) as unknown;
        if (!isRecord(raw)) {
            return NextResponse.json({ error: "Invalid body" }, { status: 400 });
        }
        const body: Record<string, unknown> = raw;

        const ingredient_id = toStringOrNull(body.ingredient_id);
        const modeRaw = body.mode;
        const reasonRaw = body.reason;

        if (!ingredient_id) {
            return NextResponse.json({ error: "ingredient_id is required" }, { status: 400 });
        }
        if (typeof modeRaw !== "string" || !isPostMode(modeRaw)) {
            return NextResponse.json({ error: "mode must be add|deduct|set" }, { status: 400 });
        }

        const reason: PostReason | null =
            typeof reasonRaw === "string" && isPostReason(reasonRaw) ? reasonRaw : null;

        const note = typeof body.note === "string" ? body.note : null;
        const finalNote = normalizeNote(reason, note);

        // read ingredient current stock
        const { data: ing, error: ingErr } = await supabase
            .from("ingredients")
            .select("id,stock,is_active")
            .eq("id", ingredient_id)
            .maybeSingle<{ id: UUID; stock: number | string | null; is_active: boolean | null }>();

        if (ingErr) return NextResponse.json({ error: ingErr.message }, { status: 500 });
        if (!ing) return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
        if (ing.is_active === false) {
            return NextResponse.json({ error: "Ingredient is inactive" }, { status: 400 });
        }

        const before_stock = toNumber(ing.stock, 0);

        // compute after + log type + amount
        let after_stock = before_stock;
        let logType: StockLogType = "adjust";
        let amount = 0;

        if (modeRaw === "set") {
            const v = readNumberField(body, "value");
            if (v == null || v < 0) {
                return NextResponse.json({ error: "value must be a number >= 0" }, { status: 400 });
            }
            after_stock = v;
            logType = "adjust";
            amount = Math.abs(after_stock - before_stock); // delta
        }

        if (modeRaw === "add") {
            const a = readNumberField(body, "amount");
            if (a == null || a <= 0) {
                return NextResponse.json({ error: "amount must be a number > 0" }, { status: 400 });
            }
            after_stock = before_stock + a;
            logType = "add";
            amount = a;
        }

        if (modeRaw === "deduct") {
            const a = readNumberField(body, "amount");
            if (a == null || a <= 0) {
                return NextResponse.json({ error: "amount must be a number > 0" }, { status: 400 });
            }
            after_stock = Math.max(0, before_stock - a);
            logType = "deduct";
            amount = a;
        }

        // update ingredient stock + updated_at
        const { error: upErr } = await supabase
            .from("ingredients")
            .update({
                stock: after_stock,
                updated_at: new Date().toISOString(),
            })
            .eq("id", ingredient_id);

        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

        // insert stock log
        const { error: logErr } = await supabase.from("stock_logs").insert({
            ingredient_id,
            order_id: null,
            amount,
            type: logType,
            note: finalNote,
            before_stock,
            after_stock,
        });

        if (logErr) {
            return NextResponse.json({ error: logErr.message }, { status: 500 });
        }

        return NextResponse.json({
            ok: true,
            ingredient_id,
            mode: modeRaw,
            type: logType,
            before_stock,
            after_stock,
            amount,
            note: finalNote,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
