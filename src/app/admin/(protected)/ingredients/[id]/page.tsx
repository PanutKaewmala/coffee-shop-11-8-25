// app/admin/ingredients/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import Card from "@/components/admin/Card";
import { Button } from "@/components/ui/button";
import AdjustStockForm from "@/components/admin/AdjustStockForm";

import { BASE_UNIT_LABEL } from "@/lib/units";

type UUID = string;

type BaseUnit = "ml" | "g" | "piece";
type StockStatus = "ok" | "low" | "out";
type StockLogType = "deduct" | "add" | "adjust" | "restock" | "waste";
type DailyCloseStatus = "draft" | "closed" | "approved" | null;

type IngredientLite = {
    id: UUID;
    name: string;
    stock: number;
    base_unit: BaseUnit;
    unit: string | null;
    min_stock: number;
    updated_at: string | null;
};

type StockLogItem = {
    id: UUID;
    ingredient_id: UUID;
    order_id: string | null;
    amount: number;
    type: StockLogType;
    title: string | null;
    subtitle: string | null;
    note: string | null;
    order_menu_lines: OrderMenuLine[];
    before_stock: number | null;
    after_stock: number | null;
    created_at: string;
};

type OrderMenuLine = {
    order_item_id: string;
    menu_name: string;
    serve_type: string | null;
    size: string | null;
    qty: number;
    price: number;
};

type AnalyticsTopMenu = {
    menu_id: UUID;
    menu_name: string;
    total_used: number;
};

type AnalyticsResponse = {
    ingredient: {
        id: UUID;
        name: string;
        stock: number;
        base_unit: BaseUnit | string;
        unit: string | null;
        min_stock?: number;
        updated_at?: string | null;
    };
    avgDailyUsage7?: number;
    totalUsage7?: number;
    todayUsage?: number;
    daysLeft?: number | null;
    daysLeftLabel?: string;
    abnormalToday?: boolean;
    abnormalLabel?: string;
    topMenus?: AnalyticsTopMenu[];
    usage?: {
        avgDailyUsage7?: number;
        totalUsage7?: number;
        todayUsage?: number;
        daysLeft?: number | null;
        daysLeftLabel?: string;
        abnormalToday?: boolean;
        abnormalLabel?: string;
    };
};

type IngredientDetailResponse = {
    ingredient?: unknown;
};

type StockEventItemFromApi = {
    id?: unknown;
    ingredient_id?: unknown;
    amount?: unknown;
    before_stock?: unknown;
    after_stock?: unknown;
};

type StockEventFromApi = {
    type?: unknown;
    title?: unknown;
    subtitle?: unknown;
    note?: unknown;
    order_id?: unknown;
    happened_at?: unknown;
    order_menu_lines?: unknown;
    items?: unknown;
};

type StockEventsResponse = {
    events?: unknown;
};

/* =========================
   Small utils (no any)
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function toStringOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
}
function toNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function normalizeBaseUnitFromLegacyUnit(u: unknown): BaseUnit {
    const s = typeof u === "string" ? u.trim().toLowerCase() : "";
    if (["ml", "มล.", "มล", "milliliter"].includes(s)) return "ml";
    if (["g", "กรัม", "กร", "gram"].includes(s)) return "g";
    return "piece";
}
function pickBaseUnit(v: unknown, fallback: BaseUnit): BaseUnit {
    if (v === "ml" || v === "g" || v === "piece") return v;
    return fallback;
}
function formatDT(v: unknown): string {
    const s = toStringOrNull(v);
    if (!s) return "-";
    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return "-";
    return d.toLocaleString("th-TH");
}
function shortId(id: string, n = 10) {
    const s = (id ?? "").trim();
    if (!s) return "-";
    return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function getBangkokToday(): string {
    return new Date().toLocaleDateString("sv-SE", {
        timeZone: "Asia/Bangkok",
    });
}

function readDailyCloseStatus(data: unknown): DailyCloseStatus {
    if (!isRecord(data)) return null;
    const close = isRecord(data.close) ? data.close : isRecord(data.dailyClose) ? data.dailyClose : null;
    if (!close) return null;

    const status = toStringOrNull(close.status);
    if (status === "draft" || status === "closed" || status === "approved") return status;
    return null;
}

function decodeOrderMenuLines(v: unknown): OrderMenuLine[] {
    if (!Array.isArray(v)) return [];

    const out: OrderMenuLine[] = [];
    for (const raw of v) {
        if (!isRecord(raw)) continue;

        const order_item_id = toStringOrNull(raw.order_item_id);
        const menu_name = toStringOrNull(raw.menu_name);
        if (!order_item_id || !menu_name) continue;

        out.push({
            order_item_id,
            menu_name,
            serve_type: toStringOrNull(raw.serve_type),
            size: toStringOrNull(raw.size),
            qty: toNumber(raw.qty, 0),
            price: toNumber(raw.price, 0),
        });
    }

    return out;
}

function menuLineLabel(line: OrderMenuLine): string {
    const meta: string[] = [];
    if (line.serve_type) meta.push(line.serve_type);
    if (line.size && line.size !== "default") meta.push(line.size);
    const metaText = meta.length ? ` (${meta.join(" / ")})` : "";
    return `${line.menu_name}${metaText} x${line.qty}`;
}

function compactOrderMenuHint(lines: OrderMenuLine[]): string | null {
    if (lines.length === 0) return null;

    const sorted = [...lines].sort((a, b) => b.qty - a.qty || a.menu_name.localeCompare(b.menu_name));
    const shown = sorted.slice(0, 2).map(menuLineLabel);
    const more = sorted.length - shown.length;
    return more > 0 ? `${shown.join(", ")} +อีก ${more}` : shown.join(", ");
}

function startOfDay(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function inLastNDays(iso: string, days: number): boolean {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return false;
    const now = new Date();
    const from = startOfDay(now).getTime() - (days - 1) * 24 * 60 * 60 * 1000;
    return t >= from && t <= now.getTime();
}
function isSameLocalDay(iso: string, base: Date): boolean {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return false;
    return (
        d.getFullYear() === base.getFullYear() &&
        d.getMonth() === base.getMonth() &&
        d.getDate() === base.getDate()
    );
}

function getStockStatus(stock: number, minStock: number): StockStatus {
    if (stock <= 0) return "out";
    if (stock <= minStock) return "low";
    return "ok";
}

function StatusBadge({ status }: { status: StockStatus }) {
    if (status === "out") {
        return (
            <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/20">
                หมด
            </span>
        );
    }
    if (status === "low") {
        return (
            <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-yellow-500/20 text-yellow-800 dark:text-yellow-300 border border-yellow-500/20">
                ใกล้หมด
            </span>
        );
    }
    return (
        <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/20">
            ปกติ
        </span>
    );
}

function TypeBadge({ type }: { type: StockLogType }) {
    const base =
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium border border-white/10";
    if (type === "add") return <span className={`${base} bg-green-500/10 text-green-700 dark:text-green-300`}>เพิ่ม</span>;
    if (type === "restock") return <span className={`${base} bg-emerald-500/10 text-emerald-700 dark:text-emerald-300`}>คืนสต็อก</span>;
    if (type === "waste") return <span className={`${base} bg-red-500/10 text-red-700 dark:text-red-300`}>ของเสีย</span>;
    if (type === "deduct") return <span className={`${base} bg-white/10 text-[var(--text-secondary)]`}>ตัดออก</span>;
    return <span className={`${base} bg-blue-500/10 text-blue-700 dark:text-blue-300`}>ปรับยอด</span>;
}

function parseStockLogType(v: unknown): StockLogType {
    const s = toStringOrNull(v);
    if (s === "add" || s === "deduct" || s === "adjust" || s === "restock" || s === "waste") return s;
    return "adjust";
}

function fallbackMovementTitle(type: StockLogType): string {
    if (type === "add") return "เพิ่มสต็อก";
    if (type === "restock") return "คืนสต็อกจากออเดอร์ที่ยกเลิก";
    if (type === "waste") return "ของเสีย/ไม่คืนสต็อก";
    if (type === "deduct") return "ตัดออกจากการขาย";
    return "ปรับยอด";
}

function cleanMovementNote(note: string | null): string | null {
    const n = (note ?? "").trim();
    if (!n) return null;
    if (n === "in") return "รับของเข้า";
    if (n === "waste") return "ของเสีย/ทิ้ง";
    if (n === "count") return "นับสต็อกจริง";
    return n;
}

function movementContext(row: StockLogItem): string | null {
    const menuHint = compactOrderMenuHint(row.order_menu_lines);
    if (menuHint) return `ขาย: ${menuHint}`;

    const subtitle = (row.subtitle ?? "").trim();
    if (subtitle && subtitle !== row.title) return subtitle;

    return cleanMovementNote(row.note);
}

// ✅ แปลง /api/stock (events) -> logs flat list + filter เฉพาะ ingredientId
function extractLogsFromStockEvents(data: unknown, ingredientId: string): StockLogItem[] {
    if (!isRecord(data)) return [];
    const eventsRaw = (data as StockEventsResponse).events;
    if (!Array.isArray(eventsRaw)) return [];

    const out: StockLogItem[] = [];

    for (const evRaw of eventsRaw) {
        if (!isRecord(evRaw)) continue;
        const ev = evRaw as StockEventFromApi;

        const itemsRaw = ev.items;
        if (!Array.isArray(itemsRaw)) continue;

        const type = parseStockLogType(ev.type);
        const title = toStringOrNull(ev.title);
        const subtitle = toStringOrNull(ev.subtitle);
        const note = toStringOrNull(ev.note);
        const order_id = toStringOrNull(ev.order_id);
        const created_at = toStringOrNull(ev.happened_at) ?? "";
        const order_menu_lines = decodeOrderMenuLines(ev.order_menu_lines);

        for (const itRaw of itemsRaw) {
            if (!isRecord(itRaw)) continue;
            const it = itRaw as StockEventItemFromApi;

            const id = toStringOrNull(it.id) ?? "";
            const ingId = toStringOrNull(it.ingredient_id) ?? "";
            if (!id || !ingId) continue;
            if (ingId !== ingredientId) continue;

            const amount = toNumber(it.amount, 0);
            const before_stock = it.before_stock == null ? null : toNumber(it.before_stock, 0);
            const after_stock = it.after_stock == null ? null : toNumber(it.after_stock, 0);

            out.push({
                id,
                ingredient_id: ingId,
                order_id,
                amount,
                type,
                title,
                subtitle,
                note,
                order_menu_lines,
                before_stock,
                after_stock,
                created_at,
            });
        }
    }

    out.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return out;
}

function parseIngredient(data: unknown): IngredientLite | null {
    if (!isRecord(data)) return null;

    const id = toStringOrNull(data.id) ?? "";
    const name = toStringOrNull(data.name) ?? "-";
    const stock = toNumber(data.stock, 0);
    const unit = toStringOrNull(data.unit);
    const min_stock = toNumber(data.min_stock, 0);
    const updated_at = data.updated_at ?? null;

    const fallbackUnit: BaseUnit = normalizeBaseUnitFromLegacyUnit(unit ?? "");
    const base_unit = pickBaseUnit(data.base_unit, fallbackUnit);

    if (!id) return null;

    return {
        id,
        name,
        stock,
        base_unit,
        unit,
        min_stock,
        updated_at: typeof updated_at === "string" ? updated_at : null,
    };
}

function parseAnalytics(data: unknown): Omit<AnalyticsResponse, "ingredient"> {
    if (!isRecord(data)) return {};

    const usage = isRecord(data.usage) ? data.usage : data;

    const meta: Omit<AnalyticsResponse, "ingredient"> = {
        avgDailyUsage7: toNumber(usage.avgDailyUsage7, 0),
        totalUsage7: toNumber(usage.totalUsage7, 0),
        todayUsage: toNumber(usage.todayUsage, 0),
        daysLeft: typeof usage.daysLeft === "number" ? usage.daysLeft : null,
        daysLeftLabel: toStringOrNull(usage.daysLeftLabel) ?? "",
        abnormalToday: usage.abnormalToday === true,
        abnormalLabel: toStringOrNull(usage.abnormalLabel) ?? "",
        topMenus: Array.isArray(data.topMenus)
            ? (data.topMenus as AnalyticsTopMenu[]).filter(
                (x) => isRecord(x) && !!toStringOrNull((x as AnalyticsTopMenu).menu_id)
            )
            : [],
    };

    return meta;
}

type LogRange = "today" | "7d" | "all";

export default function IngredientDetailPage() {
    const params = useParams();
    const idParam = params?.id;
    const ingredientId = Array.isArray(idParam) ? idParam[0] : idParam;

    const [loading, setLoading] = useState(true);
    const [loadingLogs, setLoadingLogs] = useState(true);

    const [ingredient, setIngredient] = useState<IngredientLite | null>(null);
    const [ingredientNotFound, setIngredientNotFound] = useState(false);
    const [ingredientLoadError, setIngredientLoadError] = useState<string | null>(null);
    const [logs, setLogs] = useState<StockLogItem[]>([]);
    const [dailyCloseStatus, setDailyCloseStatus] = useState<DailyCloseStatus>(null);

    // analytics
    const [avgDailyUsage7, setAvgDailyUsage7] = useState(0);
    const [todayUsage, setTodayUsage] = useState(0);
    const [daysLeft, setDaysLeft] = useState<number | null>(null);
    const [daysLeftLabel, setDaysLeftLabel] = useState<string>("");
    const [abnormalToday, setAbnormalToday] = useState(false);
    const [abnormalLabel, setAbnormalLabel] = useState<string>("");
    const [topMenus, setTopMenus] = useState<AnalyticsTopMenu[]>([]);

    const [adjustItem, setAdjustItem] = useState<IngredientLite | null>(null);

    // decision-first controls
    const [logRange, setLogRange] = useState<LogRange>("today");
    const [logLimit, setLogLimit] = useState<number>(10);

    const baseUnit = useMemo(() => ingredient?.base_unit ?? ("piece" as BaseUnit), [ingredient]);
    const unitLabel = BASE_UNIT_LABEL[baseUnit];
    const isBusinessDayClosed = dailyCloseStatus === "closed" || dailyCloseStatus === "approved";

    const status = useMemo(() => {
        if (!ingredient) return "ok" as StockStatus;
        return getStockStatus(toNumber(ingredient.stock, 0), toNumber(ingredient.min_stock, 0));
    }, [ingredient]);

    function resetAnalytics() {
        setAvgDailyUsage7(0);
        setTodayUsage(0);
        setDaysLeft(null);
        setDaysLeftLabel("");
        setAbnormalToday(false);
        setAbnormalLabel("");
        setTopMenus([]);
    }

    async function fetchIngredient(
        targetId: string,
        signal?: AbortSignal
    ): Promise<IngredientLite | null> {
        const res = await fetch(`/api/ingredients/${encodeURIComponent(targetId)}`, {
            cache: "no-store",
            signal,
        });

        if (res.status === 404) return null;
        if (!res.ok) {
            throw new Error(`Ingredient request failed: ${res.status}`);
        }

        const data: unknown = await res.json();
        if (!isRecord(data)) {
            throw new Error("Invalid ingredient response");
        }

        const parsed = parseIngredient((data as IngredientDetailResponse).ingredient);
        if (!parsed) {
            throw new Error("Invalid ingredient data");
        }

        return parsed;
    }

    async function fetchAnalytics(targetId: string, signal?: AbortSignal) {
        await Promise.resolve(); // guard for effect timing

        try {
            const res = await fetch(
                `/api/ingredients/analytics?ingredient_id=${encodeURIComponent(targetId)}`,
                { cache: "no-store", signal }
            );
            if (!res.ok) {
                if (!signal?.aborted) resetAnalytics();
                return;
            }

            const data: unknown = await res.json().catch(() => null);
            if (signal?.aborted) return;
            if (!data) {
                resetAnalytics();
                return;
            }

            const meta = parseAnalytics(data);

            setAvgDailyUsage7(toNumber(meta.avgDailyUsage7, 0));
            setTodayUsage(toNumber(meta.todayUsage, 0));
            setDaysLeft(typeof meta.daysLeft === "number" ? meta.daysLeft : null);
            setDaysLeftLabel(meta.daysLeftLabel ?? "");
            setAbnormalToday(!!meta.abnormalToday);
            setAbnormalLabel(meta.abnormalLabel ?? "");
            setTopMenus(Array.isArray(meta.topMenus) ? meta.topMenus : []);
        } catch {
            if (signal?.aborted) return;
            resetAnalytics();
        }
    }

    async function fetchLogs(targetId: string, signal?: AbortSignal) {
        await Promise.resolve();

        setLoadingLogs(true);
        try {
            const res = await fetch(`/api/stock?ingredient_id=${encodeURIComponent(targetId)}&limit=250`, {
                cache: "no-store",
                signal,
            });
            if (!res.ok) {
                if (!signal?.aborted) setLogs([]);
                return;
            }

            const data: unknown = await res.json().catch(() => null);
            if (signal?.aborted) return;
            if (!data) {
                setLogs([]);
                return;
            }
            const flat = extractLogsFromStockEvents(data, targetId);
            setLogs(flat);
        } catch {
            if (signal?.aborted) return;
            setLogs([]);
        } finally {
            if (!signal?.aborted) setLoadingLogs(false);
        }
    }

    useEffect(() => {
        if (!ingredientId) return;

        const id = String(ingredientId);
        const controller = new AbortController();

        setLoading(true);
        setIngredient(null);
        setIngredientNotFound(false);
        setIngredientLoadError(null);
        setLogs([]);
        resetAnalytics();

        void (async () => {
            try {
                const baseIngredient = await fetchIngredient(id, controller.signal);
                if (controller.signal.aborted) return;

                if (!baseIngredient) {
                    setIngredientNotFound(true);
                    return;
                }

                setIngredient(baseIngredient);
            } catch (e) {
                if (controller.signal.aborted) return;
                console.error("fetchIngredient error:", e);
                setIngredientLoadError("โหลดข้อมูลวัตถุดิบไม่สำเร็จ");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        })();

        void fetchAnalytics(id, controller.signal);
        void fetchLogs(id, controller.signal);

        // reset UI defaults for new ingredient
        setLogRange("today");
        setLogLimit(10);

        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ingredientId]);

    useEffect(() => {
        const controller = new AbortController();
        const date = getBangkokToday();

        void (async () => {
            try {
                const res = await fetch(`/api/daily-close?date=${encodeURIComponent(date)}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                if (!res.ok) {
                    if (!controller.signal.aborted) setDailyCloseStatus(null);
                    return;
                }

                const data: unknown = await res.json().catch(() => null);
                if (!controller.signal.aborted) setDailyCloseStatus(readDailyCloseStatus(data));
            } catch {
                if (!controller.signal.aborted) setDailyCloseStatus(null);
            }
        })();

        return () => controller.abort();
    }, []);

    const daysLeftUI = useMemo(() => {
        if (daysLeftLabel && daysLeftLabel.trim()) return daysLeftLabel;
        if (avgDailyUsage7 <= 0) return "ไม่มีการใช้";

        if (daysLeft == null) return "-";
        const v = Math.max(0, daysLeft);
        if (v < 1) return "หมดภายในวันนี้";
        if (v < 7) return `หมดใน ~${v.toFixed(1)} วัน`;
        return `หมดใน ~${Math.round(v)} วัน`;
    }, [daysLeftLabel, avgDailyUsage7, daysLeft]);

    const decisionHint = useMemo(() => {
        if (!ingredient) return "";
        const s = toNumber(ingredient.stock, 0);
        const min = toNumber(ingredient.min_stock, 0);

        if (s <= 0) return "ควรเติมทันที";
        if (s <= min) return "ใกล้ถึงจุดสั่งซื้อ";
        if (avgDailyUsage7 > 0 && daysLeft != null && daysLeft < 2) return "เสี่ยงหมดเร็ว";
        return "สถานะปกติ";
    }, [ingredient, avgDailyUsage7, daysLeft]);

    const showAbnormal = abnormalToday && avgDailyUsage7 > 0;

    const topMenusUI = useMemo(() => {
        const list = Array.isArray(topMenus) ? topMenus.slice(0, 3) : [];
        const sum = list.reduce((acc, x) => acc + Math.max(0, toNumber(x.total_used, 0)), 0);
        const max = list.reduce((acc, x) => Math.max(acc, Math.max(0, toNumber(x.total_used, 0))), 0);
        return { list, sum, max };
    }, [topMenus]);

    const filteredLogs = useMemo(() => {
        const now = new Date();
        if (logRange === "all") return logs;
        if (logRange === "7d") return logs.filter((x) => toStringOrNull(x.created_at) && inLastNDays(x.created_at, 7));
        return logs.filter((x) => toStringOrNull(x.created_at) && isSameLocalDay(x.created_at, now));
    }, [logs, logRange]);

    const visibleLogs = useMemo(() => filteredLogs.slice(0, logLimit), [filteredLogs, logLimit]);

    if (!ingredientId) {
        return (
            <div className="p-6">
                <Card title="วัตถุดิบ">
                    <div className="text-sm text-[var(--text-secondary)]">ไม่พบรหัสวัตถุดิบ</div>
                    <div className="mt-4">
                        <Link
                            href="/admin/ingredients"
                            className="inline-flex items-center rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5 text-sm"
                        >
                            ← กลับหน้าวัตถุดิบ
                        </Link>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Top actions */}
            <div className="flex items-center justify-between gap-3">
                <Link
                    href="/admin/ingredients"
                    className="inline-flex items-center rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5 text-sm"
                >
                    ← กลับ
                </Link>

                <div className="flex items-center gap-2">
                    <Link
                        href={`/admin/stock?ingredient_id=${encodeURIComponent(String(ingredientId))}`}
                        className="inline-flex items-center rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5 text-sm"
                        title="ไปดูประวัติสต็อกแบบภาพรวม"
                    >
                        ดูประวัติทั้งหมด
                    </Link>

                    {ingredient && (
                        <Button
                            onClick={() => {
                                if (!isBusinessDayClosed) setAdjustItem(ingredient);
                            }}
                            disabled={isBusinessDayClosed}
                            title={isBusinessDayClosed ? "วันนี้ปิดยอดแล้ว ไม่สามารถปรับสต็อกได้" : undefined}
                        >
                            ปรับสต็อก
                        </Button>
                    )}
                </div>
            </div>

            {isBusinessDayClosed ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                    วันนี้ปิดยอดแล้ว — ไม่สามารถปรับสต็อกของวันนี้ได้
                </div>
            ) : null}

            {/* Decision-first card */}
            <Card title="ภาพรวม (ตัดสินใจเร็ว)">
                {loading ? (
                    <div className="text-sm text-[var(--text-secondary)]">กำลังโหลด...</div>
                ) : ingredientNotFound ? (
                    <div className="space-y-2">
                        <div className="text-sm text-[var(--text-secondary)]">ไม่พบวัตถุดิบนี้</div>
                        <div className="text-xs text-[var(--text-secondary)]">ID: {String(ingredientId)}</div>
                    </div>
                ) : !ingredient ? (
                    <div className="space-y-2">
                        <div className="text-sm text-[var(--text-secondary)]">
                            {ingredientLoadError ?? "โหลดข้อมูลวัตถุดิบไม่สำเร็จ"}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">ID: {String(ingredientId)}</div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="text-xl font-semibold truncate">{ingredient.name ?? "-"}</div>
                                    <StatusBadge status={status} />
                                    {showAbnormal && (
                                        <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-orange-500/15 text-orange-800 dark:text-orange-200 border border-orange-500/20">
                                            {abnormalLabel?.trim() ? abnormalLabel : "ใช้มากผิดปกติ"}
                                        </span>
                                    )}
                                </div>

                                <div className="mt-2 text-sm text-[var(--text-secondary)]">
                                    อัปเดตล่าสุด:{" "}
                                    <span className="text-[var(--text)] font-medium">{formatDT(ingredient.updated_at)}</span>
                                </div>

                                <div className="mt-2 text-sm">
                                    <span className="text-[var(--text-secondary)]">สรุป: </span>
                                    <span className="font-semibold">{decisionHint}</span>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs text-[var(--text-secondary)]">คงเหลือ</div>
                                <div className="text-3xl font-semibold tabular-nums">
                                    {Math.round(ingredient.stock)}{" "}
                                    <span className="text-base font-medium text-[var(--text-secondary)]">{unitLabel}</span>
                                </div>
                                <div className="text-xs text-[var(--text-secondary)] mt-1">
                                    จุดสั่งซื้อ:{" "}
                                    <span className="text-[var(--text)] font-medium tabular-nums">
                                        {Math.round(ingredient.min_stock)} {unitLabel}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-2xl border border-white/10 p-4 bg-[var(--surface)]">
                                <div className="text-xs text-[var(--text-secondary)]">คาดว่าจะหมด</div>
                                <div className="mt-1 text-base font-semibold">{daysLeftUI}</div>
                                <div className="mt-2 text-xs text-[var(--text-secondary)]">
                                    เฉลี่ย 7 วัน:{" "}
                                    <span className="text-[var(--text)] font-medium">
                                        {avgDailyUsage7 > 0 ? `${avgDailyUsage7.toFixed(2)} ${unitLabel}/วัน` : `0 ${unitLabel}/วัน`}
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 p-4 bg-[var(--surface)]">
                                <div className="text-xs text-[var(--text-secondary)]">วันนี้ใช้ไป</div>
                                <div className="mt-1 text-base font-semibold tabular-nums">
                                    {todayUsage > 0 ? `${todayUsage.toFixed(2)} ${unitLabel}` : `0 ${unitLabel}`}
                                </div>
                                <div className="mt-2 text-xs text-[var(--text-secondary)]">
                                    ถ้าวันนี้ใช้มากกว่าค่าเฉลี่ย ระบบจะแจ้งเตือน
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 p-4 bg-[var(--surface)]">
                                <div className="text-xs text-[var(--text-secondary)]">รหัสอ้างอิง</div>
                                <div className="mt-1 text-sm font-medium">{shortId(String(ingredientId), 16)}</div>
                                <div className="mt-2 text-xs text-[var(--text-secondary)]">หน่วยระบบ: {unitLabel}</div>
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            {/* What makes it run out (top consumers) */}
            <Card title="ตัวที่ทำให้หมดเร็ว (30 วัน)">
                {loading ? (
                    <div className="text-sm text-[var(--text-secondary)]">กำลังโหลด...</div>
                ) : !ingredient ? (
                    <div className="text-sm text-[var(--text-secondary)]">-</div>
                ) : topMenusUI.list.length === 0 ? (
                    <div className="text-sm text-[var(--text-secondary)]">
                        ยังไม่มีข้อมูล (ยังไม่มีสูตร/ออเดอร์ที่ใช้วัตถุดิบนี้)
                    </div>
                ) : (
                    <div className="space-y-3">
                        {topMenusUI.list.map((m) => {
                            const used = Math.max(0, toNumber(m.total_used, 0));
                            const pct = topMenusUI.max > 0 ? Math.round((used / topMenusUI.max) * 100) : 0;

                            return (
                                <div key={m.menu_id} className="rounded-2xl border border-white/10 p-4 bg-[var(--surface)]">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-semibold truncate">{m.menu_name}</div>
                                            <div className="text-xs text-[var(--text-secondary)]">
                                                ใช้รวม ~{used.toFixed(2)} {unitLabel}
                                            </div>
                                        </div>

                                        <div className="text-right text-xs text-[var(--text-secondary)] tabular-nums">
                                            {pct}%
                                        </div>
                                    </div>

                                    <div className="mt-3 h-2 w-full rounded-full bg-white/10 overflow-hidden">
                                        <div
                                            className="h-full bg-white/30 rounded-full"
                                            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}

                        <div className="text-xs text-[var(--text-secondary)]">
                            แสดง 3 อันดับแรก (พอแล้วสำหรับตัดสินใจไว)
                        </div>
                    </div>
                )}
            </Card>

            {/* Logs - compact, owner-friendly */}
            <Card title="การเคลื่อนไหวสต็อก (ดูไว)">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setLogRange("today");
                                setLogLimit(10);
                            }}
                            className={`text-xs rounded-full px-3 py-1 border ${logRange === "today" ? "border-white/20 bg-white/10" : "border-white/10 hover:bg-white/5"
                                }`}
                        >
                            วันนี้
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setLogRange("7d");
                                setLogLimit(10);
                            }}
                            className={`text-xs rounded-full px-3 py-1 border ${logRange === "7d" ? "border-white/20 bg-white/10" : "border-white/10 hover:bg-white/5"
                                }`}
                        >
                            7 วัน
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setLogRange("all");
                                setLogLimit(10);
                            }}
                            className={`text-xs rounded-full px-3 py-1 border ${logRange === "all" ? "border-white/20 bg-white/10" : "border-white/10 hover:bg-white/5"
                                }`}
                        >
                            ทั้งหมด
                        </button>
                    </div>

                    <div className="text-xs text-[var(--text-secondary)]">
                        {loadingLogs ? "กำลังโหลด..." : `พบ ${filteredLogs.length} รายการ`}
                    </div>
                </div>

                {loadingLogs ? (
                    <div className="text-sm text-[var(--text-secondary)]">กำลังโหลดประวัติ...</div>
                ) : filteredLogs.length === 0 ? (
                    <div className="text-sm text-[var(--text-secondary)]">ยังไม่มีรายการในช่วงนี้</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[var(--text-secondary)] border-b border-white/10">
                                    <th className="py-2 pr-3 whitespace-nowrap">เวลา</th>
                                    <th className="py-2 pr-3 whitespace-nowrap">ประเภท</th>
                                    <th className="py-2 pr-3 whitespace-nowrap">จำนวน</th>
                                    <th className="py-2 pr-3 whitespace-nowrap">ก่อน → หลัง</th>
                                    <th className="py-2 pr-3 whitespace-nowrap">สาเหตุ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleLogs.map((r) => {
                                    const title = r.title ?? fallbackMovementTitle(r.type);
                                    const context = movementContext(r);
                                    const showOrderRef = Boolean(r.order_id && !context?.includes("ออเดอร์"));
                                    const amt = Math.round(toNumber(r.amount, 0));
                                    const rawDelta =
                                        r.before_stock != null && r.after_stock != null
                                            ? r.after_stock - r.before_stock
                                            : r.type === "deduct" || r.type === "waste"
                                                ? -Math.abs(amt)
                                                : Math.abs(amt);
                                    const signAmt = Math.round(rawDelta);
                                    const signAmtText = signAmt > 0 ? `+${signAmt}` : String(signAmt);
                                    const amtClass =
                                        signAmt > 0
                                            ? "text-green-700 dark:text-green-300"
                                            : signAmt < 0
                                                ? "text-red-700 dark:text-red-300"
                                                : "text-blue-700 dark:text-blue-300";

                                    return (
                                        <tr key={r.id} className="border-b border-white/5">
                                            <td className="py-2 pr-3 whitespace-nowrap">{formatDT(r.created_at)}</td>
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                <TypeBadge type={r.type} />
                                            </td>
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                <span className={`font-semibold tabular-nums ${amtClass}`}>
                                                    {signAmtText}
                                                </span>{" "}
                                                <span className="text-[var(--text-secondary)]">{unitLabel}</span>
                                            </td>
                                            <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                                                <span className="text-[var(--text-secondary)]">
                                                    {r.before_stock == null ? "-" : Math.round(r.before_stock)}
                                                </span>{" "}
                                                →{" "}
                                                <span className="font-medium">
                                                    {r.after_stock == null ? "-" : Math.round(r.after_stock)}
                                                </span>
                                            </td>
                                            <td className="py-2 pr-3 min-w-[260px]">
                                                <div className="font-medium">{title}</div>
                                                {context ? (
                                                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                                                        {context}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">-</div>
                                                )}
                                                {showOrderRef && r.order_id ? (
                                                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                                                        ออเดอร์ #{shortId(r.order_id, 10)}
                                                    </div>
                                                ) : null}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div className="mt-3 flex items-center justify-between">
                            <div className="text-xs text-[var(--text-secondary)]">
                                แสดง {visibleLogs.length} จาก {filteredLogs.length}
                            </div>

                            {filteredLogs.length > visibleLogs.length && (
                                <button
                                    type="button"
                                    onClick={() => setLogLimit((n) => Math.min(filteredLogs.length, n + 10))}
                                    className="text-xs rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
                                >
                                    ดูเพิ่ม +10
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </Card>

            {/* Adjust Modal */}
            {adjustItem && (
                <AdjustStockForm
                    ingredient={adjustItem}
                    onClose={() => setAdjustItem(null)}
                    onUpdated={() => {
                        const id = String(ingredientId);
                        void (async () => {
                            try {
                                const baseIngredient = await fetchIngredient(id);
                                if (baseIngredient) setIngredient(baseIngredient);
                            } catch (e) {
                                console.error("fetchIngredient refresh error:", e);
                            }
                        })();
                        void fetchAnalytics(id);
                        void fetchLogs(id);
                    }}
                />
            )}
        </div>
    );
}
