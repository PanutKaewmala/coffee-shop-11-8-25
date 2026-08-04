// app/admin/orders/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { CalendarDays, X } from "lucide-react";

import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/search/SearchBox";
import QuickDateFilter from "@/components/admin/QuickDateFilter";
import useOrdersSearch from "@/hooks/useOrdersSearch";

import type { OrderItem } from "@/lib/types";

type DateFilter = "all" | "today" | "yesterday" | "7days" | "month";
type Preset = "today" | "7days" | "month";

type RevenueSummary = {
    preset: Preset;
    legacy_paid_at_fallback_count: number;
    current: { total: number; count: number };
    previous: { total: number; count: number };
    delta: { total: number; count: number };
    percent: { total: number | null; count: number | null };
};

type OrderStatusUI = "paid" | "cancelled" | "void" | "refunded" | "unknown";

type OrderRow = {
    id: string;
    total: number;
    created_at: string;
    status?: string | null;
    payment_method?: string | null;
    paid_amount?: number | null;
    change_amount?: number | null;
    items?: OrderItem[];
};

type HoverPreview = {
    order: OrderRow;
    top: number;
    left: number;
};

const HOVER_PREVIEW_ITEM_LIMIT = 3;

/* =========================
   Safe readers
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function toNum(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function toNullNum(v: unknown): number | null {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function parseRevenueSummary(j: unknown): RevenueSummary | null {
    if (!isRecord(j)) return null;
    if (typeof j.error === "string") return null;

    const preset = j.preset;
    if (preset !== "today" && preset !== "7days" && preset !== "month") return null;

    const current = isRecord(j.current) ? j.current : null;
    const previous = isRecord(j.previous) ? j.previous : null;
    const delta = isRecord(j.delta) ? j.delta : null;
    const percent = isRecord(j.percent) ? j.percent : null;

    if (!current || !previous || !delta || !percent) return null;

    return {
        preset,
        legacy_paid_at_fallback_count: toNum(j.legacy_paid_at_fallback_count, 0),
        current: { total: toNum(current.total), count: toNum(current.count) },
        previous: { total: toNum(previous.total), count: toNum(previous.count) },
        delta: { total: toNum(delta.total), count: toNum(delta.count) },
        percent: { total: toNullNum(percent.total), count: toNullNum(percent.count) },
    };
}

/* =========================
   UI helpers
========================= */
function formatMoneyTHB(n: number) {
    const v = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("th-TH").format(v);
}

function safeDateTH(dateStr: string) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("th-TH");
}

function formatExactDateTH(dateKey: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!match) return "เลือกวันที่";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
    return new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(date);
}

function shortId(id: string) {
    return id?.length > 10 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function paymentLabelTH(method: string | null | undefined) {
    const pm = (method ?? "").toLowerCase();
    if (pm === "promptpay") return "พร้อมเพย์";
    if (pm === "cash") return "เงินสด";
    return method ?? "-";
}

function compactItemsTH(items: OrderItem[]) {
    if (!items.length) return "ไม่มีรายการสินค้า";

    const first = items[0]?.name ?? "";
    const more = items.length > 1 ? ` +${items.length - 1}` : "";
    const qty = items.reduce((sum, item) => {
        const q = Number(item.qty);
        return sum + (Number.isFinite(q) ? q : 0);
    }, 0);

    return `${first}${more} · ${qty} ชิ้น`;
}

function itemSubLabel(it: OrderItem): string | null {
    if (it.variant_label && it.variant_label.trim()) return it.variant_label.trim();
    if (it.size && it.size.trim()) return it.size.trim();
    return null;
}

function clamp(n: number, min: number, max: number) {
    return Math.min(Math.max(n, min), max);
}

function getFloatingPreviewPosition(clientX: number, clientY: number) {
    const margin = 16;
    const gap = 18;
    const width = 340;
    const estimatedHeight = 420;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const canShowRight = clientX + gap + width <= viewportWidth - margin;
    const left = canShowRight ? clientX + gap : clientX - gap - width;

    const canShowBelow = clientY + gap + estimatedHeight <= viewportHeight - margin;
    const top = canShowBelow ? clientY + gap : clientY - gap - estimatedHeight;

    return {
        left: clamp(left, margin, Math.max(margin, viewportWidth - width - margin)),
        top: clamp(top, margin, Math.max(margin, viewportHeight - estimatedHeight - margin)),
    };
}

function OrderHoverPreview({ preview }: { preview: HoverPreview | null }) {
    if (!preview) return null;

    const { order, top, left } = preview;
    const items = Array.isArray(order.items) ? order.items : [];
    const visibleItems = items.slice(0, HOVER_PREVIEW_ITEM_LIMIT);
    const hiddenItemCount = Math.max(0, items.length - visibleItems.length);
    const qty = items.reduce((sum, item) => {
        const q = Number(item.qty);
        return sum + (Number.isFinite(q) ? q : 0);
    }, 0);

    const paid = Number.isFinite(order.paid_amount as number) ? (order.paid_amount as number) : null;
    const change = Number.isFinite(order.change_amount as number) ? (order.change_amount as number) : null;

    return (
        <div
            className="pointer-events-none fixed z-[9999] hidden w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[var(--surface)] p-4 text-sm text-[var(--text-secondary)] shadow-2xl shadow-black/40 ring-1 ring-black/30 lg:block"
            style={{ top, left }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs text-[var(--text-muted)]">รายละเอียดออเดอร์</div>
                    <div className="mt-1 truncate font-mono text-base font-semibold text-[var(--accent)]">
                        {shortId(order.id)}
                    </div>
                </div>
                <StatusPill status={order.status ?? null} />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                    <div className="text-xs text-[var(--text-muted)]">ยอดรวม</div>
                    <div className="mt-0.5 font-semibold tabular-nums text-[var(--text-primary)]">
                        {formatMoneyTHB(order.total)} บาท
                    </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                    <div className="text-xs text-[var(--text-muted)]">ชำระ</div>
                    <div className="mt-0.5 font-semibold text-[var(--text-primary)]">
                        {paymentLabelTH(order.payment_method)}
                    </div>
                </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-2">
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                    <span>รายการสินค้า</span>
                    <span>{qty} ชิ้น</span>
                </div>
                <div className="mt-2 space-y-1.5">
                    {visibleItems.length > 0 ? (
                        visibleItems.map((item, idx) => {
                            const sub = itemSubLabel(item);

                            return (
                                <div key={`${order.id}-${idx}`} className="flex justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-[var(--text-primary)]">{item.name}</div>
                                        {sub ? <div className="truncate text-xs text-[var(--text-muted)]">{sub}</div> : null}
                                    </div>
                                    <div className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-[var(--text-primary)]">
                                        ×{item.qty ?? 1} · {formatMoneyTHB(Number(item.price) || 0)} บาท
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-[var(--text-muted)]">ไม่มีรายการสินค้า</div>
                    )}
                    {hiddenItemCount > 0 ? (
                        <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-2 py-1.5 text-xs font-medium text-[var(--accent)]">
                            + อีก {hiddenItemCount} รายการสินค้า
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-[var(--text-muted)]">รับเงิน</div>
                    <div className="mt-0.5 tabular-nums text-[var(--text-primary)]">
                        {paid == null ? "-" : `${formatMoneyTHB(paid)} บาท`}
                    </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-[var(--text-muted)]">เงินทอน</div>
                    <div className="mt-0.5 tabular-nums text-[var(--text-primary)]">
                        {change == null ? "-" : `${formatMoneyTHB(change)} บาท`}
                    </div>
                </div>
            </div>

            <div className="mt-3 border-t border-white/10 pt-3 text-xs text-[var(--text-muted)]">
                <div>{safeDateTH(order.created_at)}</div>
                <div className="mt-1 font-medium text-[var(--accent)]">
                    คลิกเลขออเดอร์เพื่อดูรายละเอียดทั้งหมด
                </div>
            </div>
        </div>
    );
}

/* =========================
   Trend helpers
========================= */
function trendText(delta: number, pct: number | null) {
    const up = delta > 0;
    const down = delta < 0;
    const arrow = up ? "▲" : down ? "▼" : "•";
    const sign = up ? "+" : "";
    const pctText = pct == null ? "" : ` (${sign}${pct.toFixed(1)}%)`;
    return `${arrow} ${sign}${delta.toLocaleString("th-TH")}${pctText}`;
}

function trendClass(delta: number) {
    if (delta > 0) return "text-emerald-400";
    if (delta < 0) return "text-rose-400";
    return "text-text-secondary";
}

/* =========================
   Status helpers
========================= */
function normalizeStatus(s: string | null | undefined): OrderStatusUI {
    const v = (s ?? "").toLowerCase().trim();
    if (v === "paid") return "paid";
    if (v === "cancelled") return "cancelled";
    if (v === "void") return "void";
    if (v === "refunded") return "refunded";
    return "unknown";
}

function statusLabelTH(k: OrderStatusUI) {
    switch (k) {
        case "paid":
            return "ชำระแล้ว";
        case "cancelled":
        case "void":
            return "ยกเลิก";
        case "refunded":
            return "คืนเงิน";
        default:
            return "ไม่ทราบ";
    }
}

function StatusPill({ status }: { status: string | null | undefined }) {
    const k = normalizeStatus(status);

    const base =
        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold whitespace-nowrap";

    if (k === "paid") {
        return (
            <span className={`${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-200`}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                {statusLabelTH(k)}
            </span>
        );
    }

    if (k === "refunded") {
        return (
            <span className={`${base} border-blue-500/30 bg-blue-500/10 text-blue-200`}>
                <span className="h-1.5 w-1.5 rounded-full bg-blue-300" />
                {statusLabelTH(k)}
            </span>
        );
    }

    if (k === "cancelled" || k === "void") {
        return (
            <span className={`${base} border-rose-500/30 bg-rose-500/10 text-rose-200`}>
                <span className="h-1.5 w-1.5 rounded-full bg-rose-300" />
                {statusLabelTH(k)}
            </span>
        );
    }

    return (
        <span className={`${base} border-white/10 bg-white/5 text-text-secondary`}>
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
            {statusLabelTH(k)}
        </span>
    );
}

/* =========================
   Revenue preset mapping
   - yesterday / all: ไม่โชว์ compare (API summary ยังไม่รองรับ)
========================= */
function presetFromDateFilter(df: DateFilter): Preset | null {
    if (df === "today") return "today";
    if (df === "7days") return "7days";
    if (df === "month") return "month";
    return null;
}

function StatCard({
    label,
    value,
    sub,
    subClass,
}: {
    label: string;
    value: string;
    sub?: string | null;
    subClass?: string;
}) {
    return (
        <div className="rounded-xl border border-border/40 bg-card p-3 sm:p-4 min-w-0">
            <div className="text-sm text-text-secondary sm:text-base break-words">{label}</div>
            <div className="mt-1 break-words text-2xl font-bold tabular-nums sm:text-3xl">{value}</div>
            {sub ? <div className={`mt-1 text-xs sm:text-sm break-words ${subClass ?? "text-text-secondary"}`}>{sub}</div> : null}
        </div>
    );
}

export default function OrdersClient() {
    const rowsPerPage = 20;

    const {
        loading,
        search,
        setSearch,
        dateFilter,
        setDateFilter,
        exactDate,
        setExactDate,
        filteredOrders,
        paginatedOrders,
        page,
        setPage,
        inputPage,
        setInputPage,
        totalPages,

        // ✅ list-based KPI (ตรงกับตารางเสมอ)
        paidTotalList,
        paidCountList,

        // ✅ preset paid_at KPI (ไว้สำรอง)
        paidTotalPreset,
        paidCountPreset,
    } = useOrdersSearch({ rowsPerPage, initialFilter: "today" });

    const df = (dateFilter as DateFilter) ?? "today";
    const preset = useMemo(() => presetFromDateFilter(df), [df]);

    const [rev, setRev] = useState<RevenueSummary | null>(null);
    const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);

    // ✅ block compare when search active (dataset mismatch)
    const hasSearch = search.trim().length > 0;

    // ✅ only show compare when preset exists and no search
    const revToShow = preset && !hasSearch ? rev : null;

    useEffect(() => {
        if (!preset) return;
        if (hasSearch) return;

        const ac = new AbortController();

        fetch(`/api/revenue/summary?preset=${preset}`, {
            cache: "no-store",
            signal: ac.signal,
        })
            .then((r) => r.json() as Promise<unknown>)
            .then((j) => setRev(parseRevenueSummary(j)))
            .catch((e) => {
                if (e?.name !== "AbortError") setRev(null);
            });

        return () => ac.abort();
    }, [preset, hasSearch]);

    useEffect(() => {
        const clearPreview = () => setHoverPreview(null);

        window.addEventListener("resize", clearPreview);
        window.addEventListener("scroll", clearPreview, true);

        return () => {
            window.removeEventListener("resize", clearPreview);
            window.removeEventListener("scroll", clearPreview, true);
        };
    }, []);

    /**
     * ✅ KPI source of truth:
     * - compare mode (today/7days/month + no search) -> API summary current (rev.current)
     * - otherwise -> list-based (filteredOrders) so numbers match the table
     */
    const paidTotalToShow = useMemo(() => {
        if (revToShow) return revToShow.current.total;
        if (preset && !hasSearch) return paidTotalPreset; // fallback if API not ready
        return paidTotalList;
    }, [revToShow, preset, hasSearch, paidTotalPreset, paidTotalList]);

    const paidCountToShow = useMemo(() => {
        if (revToShow) return revToShow.current.count;
        if (preset && !hasSearch) return paidCountPreset; // fallback if API not ready
        return paidCountList;
    }, [revToShow, preset, hasSearch, paidCountPreset, paidCountList]);

    const computed = useMemo(() => {
        const list = (filteredOrders as unknown as OrderRow[]) ?? [];

        let cancelledCount = 0;
        let refundedCount = 0;
        let unknownCount = 0;

        let cancelledValue = 0;
        let refundedValue = 0;
        let unknownValue = 0;

        for (const o of list) {
            const st = normalizeStatus(o.status ?? null);
            const t = Number.isFinite(o.total) ? o.total : 0;

            if (st === "cancelled" || st === "void") {
                cancelledCount += 1;
                cancelledValue += t;
            } else if (st === "refunded") {
                refundedCount += 1;
                refundedValue += t;
            } else if (st === "unknown") {
                unknownCount += 1;
                unknownValue += t;
            }
        }

        const aov = paidCountToShow > 0 ? paidTotalToShow / paidCountToShow : 0;

        // Net = Paid KPI - refunded from the current list (match what user is viewing)
        const netSales = Math.max(0, paidTotalToShow - refundedValue);

        return {
            cancelledCount,
            refundedCount,
            unknownCount,
            cancelledValue,
            refundedValue,
            unknownValue,
            aov,
            netSales,
            totalCount: list.length,
        };
    }, [filteredOrders, paidTotalToShow, paidCountToShow]);

    const headers = ["#", "เลขออเดอร์", "สถานะ", "การชำระเงิน", "รายการ", "ยอดรวม", "วันที่"];

    const rows = useMemo(() => {
        const list = (paginatedOrders as unknown as OrderRow[]) ?? [];

        return list.map((order, idx) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const n = (page - 1) * rowsPerPage + (idx + 1);

            const paidDisplay = (() => {
                const paid = Number.isFinite(order.paid_amount as number) ? (order.paid_amount as number) : null;
                const change = Number.isFinite(order.change_amount as number) ? (order.change_amount as number) : null;
                if (paid == null && change == null) return order.total ? formatMoneyTHB(order.total) : "-";
                const parts: string[] = [];
                if (paid != null) parts.push(`รับ ฿${formatMoneyTHB(paid)}`);
                if (change != null) parts.push(`ทอน ฿${formatMoneyTHB(change)}`);
                return parts.join(" • ");
            })();

            const paymentBadge = (() => {
                const pm = (order.payment_method ?? "").toLowerCase();
                if (pm === "promptpay") return "พร้อมเพย์";
                if (pm === "cash") return "เงินสด";
                return order.payment_method ?? "-";
            })();

            return [
                <span key={`idx-${order.id}`} className="text-text-secondary tabular-nums">
                    {n}
                </span>,

                <Link
                    key={`id-${order.id}`}
                    href={`/admin/orders/${order.id}`}
                    className="text-accent hover:underline font-mono"
                    title={order.id}
                >
                    {shortId(order.id)}
                </Link>,

                <span key={`st-${order.id}`}>
                    <StatusPill status={order.status ?? null} />
                </span>,

                <span key={`pm-${order.id}`} className="text-xs">
                    <span className="inline-flex items-center rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-text-secondary">
                        {paymentBadge}
                    </span>
                </span>,

                <span
                    key={`items-${order.id}`}
                    className="block max-w-[220px] truncate text-text-secondary"
                >
                    {compactItemsTH(items)}
                </span>,

                <span key={`paid-${order.id}`} className="tabular-nums text-text-secondary">
                    {paidDisplay}
                </span>,

                <span key={`date-${order.id}`} className="text-text-secondary whitespace-nowrap">
                    {safeDateTH(order.created_at)}
                </span>,
            ];
        });
    }, [paginatedOrders, page]);

    const mobileOrders = useMemo(() => {
        const list = (paginatedOrders as unknown as OrderRow[]) ?? [];

        return list.map((order, idx) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const n = (page - 1) * rowsPerPage + (idx + 1);
            const paid = Number.isFinite(order.paid_amount as number) ? (order.paid_amount as number) : null;
            const change = Number.isFinite(order.change_amount as number) ? (order.change_amount as number) : null;
            const paymentDisplay =
                paid == null && change == null
                    ? `${formatMoneyTHB(order.total)} บาท`
                    : [
                        paid != null ? `รับ ฿${formatMoneyTHB(paid)}` : null,
                        change != null ? `ทอน ฿${formatMoneyTHB(change)}` : null,
                    ]
                        .filter(Boolean)
                        .join(" · ");

            return {
                order,
                n,
                items,
                paymentLabel: paymentLabelTH(order.payment_method),
                paymentDisplay,
                itemSummary: compactItemsTH(items),
            };
        });
    }, [paginatedOrders, page]);

    const isEmpty = !loading && (filteredOrders?.length ?? 0) === 0;
    const showReset = search.trim().length > 0 || df !== "today" || exactDate.length > 0;

    function updateHoverPreview(rowIndex: number, event: ReactMouseEvent<HTMLTableRowElement>) {
        if (typeof window === "undefined" || !window.matchMedia("(min-width: 1024px)").matches) {
            setHoverPreview(null);
            return;
        }

        const order = ((paginatedOrders as unknown as OrderRow[]) ?? [])[rowIndex];
        if (!order) {
            setHoverPreview(null);
            return;
        }

        const position = getFloatingPreviewPosition(event.clientX, event.clientY);
        setHoverPreview({ order, ...position });
    }

    return (
        <div className="p-3 sm:p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <Card title="รายการออเดอร์ทั้งหมด">
                    {/* FILTER + SEARCH */}
                    <div className="space-y-2 sm:space-y-3">
                        <div className="[&>div]:mb-0">
                            <QuickDateFilter
                                dateFilter={df}
                                setDateFilter={(v) => {
                                    setDateFilter(v as DateFilter);
                                    setPage(1);
                                    setInputPage("1");
                                }}
                            />
                        </div>

                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
                            <div className="relative w-full min-w-0 rounded-xl focus-within:ring-2 focus-within:ring-accent/35 md:w-[240px] md:shrink-0">
                                <div className="pointer-events-none flex h-11 min-w-0 items-center gap-2 rounded-xl border border-border/50 bg-card px-3 text-sm text-text-primary shadow-sm transition-colors">
                                    <CalendarDays size={18} className="shrink-0 text-accent" aria-hidden="true" />
                                    <span className={`min-w-0 flex-1 truncate text-left ${exactDate ? "font-medium" : "text-text-secondary"}`}>
                                        {exactDate ? formatExactDateTH(exactDate) : "เลือกวันที่"}
                                    </span>
                                    {exactDate ? <span className="h-7 w-7 shrink-0" aria-hidden="true" /> : null}
                                </div>
                                <input
                                    type="date"
                                    value={exactDate}
                                    aria-label="เลือกวันที่ออเดอร์"
                                    onChange={(event) => {
                                        setExactDate(event.target.value);
                                        setPage(1);
                                        setInputPage("1");
                                    }}
                                    className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 focus:outline-none"
                                />
                                {exactDate ? (
                                    <button
                                        type="button"
                                        aria-label="ล้างวันที่"
                                        className="absolute right-2 top-1/2 z-20 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary transition hover:bg-border/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                        onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setExactDate("");
                                            setPage(1);
                                            setInputPage("1");
                                        }}
                                    >
                                        <X size={16} aria-hidden="true" />
                                    </button>
                                ) : null}
                            </div>
                            <div className="min-w-0 flex-1 [&>div]:mb-0">
                                <SearchBox
                                    value={search}
                                    setValue={(v) => {
                                        setSearch(v);
                                        setPage(1);
                                        setInputPage("1");
                                    }}
                                    placeholder="ค้นหาเลขออเดอร์ / ข้อความ / รายการสินค้า"
                                />
                            </div>

                            {showReset ? (
                                <button
                                    type="button"
                                    className="self-end whitespace-nowrap text-sm text-accent hover:underline md:self-auto"
                                    onClick={() => {
                                        setSearch("");
                                        setExactDate("");
                                        setDateFilter("today" as DateFilter);
                                        setPage(1);
                                        setInputPage("1");
                                    }}
                                >
                                    รีเซ็ต
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {loading ? (
                        <div className="mt-6 space-y-4">
                            <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="p-4 rounded-xl bg-card border border-border/40 animate-pulse"
                                    >
                                        <div className="h-4 w-28 bg-border/40 rounded" />
                                        <div className="h-8 w-44 bg-border/40 rounded mt-3" />
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 rounded-xl bg-card border border-border/40 animate-pulse">
                                <div className="h-10 w-full bg-border/30 rounded" />
                                <div className="h-10 w-full bg-border/20 rounded mt-3" />
                                <div className="h-10 w-full bg-border/10 rounded mt-3" />
                            </div>
                        </div>
                    ) : (
                        <>
                            {revToShow && revToShow.legacy_paid_at_fallback_count > 0 && (
<div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
                                มีรายการเก่า {revToShow.legacy_paid_at_fallback_count} รายการที่ไม่มีวันที่ชำระเงิน
                                ระบบจึงใช้วันที่สร้างรายการแทนในการคำนวณช่วงเปรียบเทียบนี้
                            </div>
                            )}

                            {/* SUMMARY */}
                            <div className="mt-4 mb-4 grid grid-cols-1 gap-3 sm:mt-6 sm:mb-6 sm:gap-4 sm:grid-cols-2 xl:grid-cols-5">
                                <StatCard
                                    label="ยอดขายสุทธิ"
                                    value={`${formatMoneyTHB(computed.netSales)} บาท`}
                                    sub={
                                        computed.refundedValue > 0
                                            ? `คืนเงิน: -${formatMoneyTHB(computed.refundedValue)} บาท`
                                            : null
                                    }
                                    subClass="text-text-secondary"
                                />

                                <StatCard
                                    label="ยอดขายที่ชำระแล้ว"
                                    value={`${formatMoneyTHB(paidTotalToShow)} บาท`}
                                    sub={
                                        revToShow
                                            ? `เทียบช่วงก่อนหน้า: ${trendText(
                                                    revToShow.delta.total,
                                                    revToShow.percent.total
                                                )}`
                                            : null
                                    }
                                    subClass={revToShow ? trendClass(revToShow.delta.total) : "text-text-secondary"}
                                />

                                <StatCard
                                    label="ออเดอร์ชำระแล้ว"
                                    value={`${paidCountToShow} รายการ`}
                                    sub={
                                        revToShow
                                            ? `เทียบช่วงก่อนหน้า: ${trendText(
                                                revToShow.delta.count,
                                                revToShow.percent.count
                                            )}`
                                            : null
                                    }
                                    subClass={revToShow ? trendClass(revToShow.delta.count) : "text-text-secondary"}
                                />

                                <StatCard
                                    label="ออเดอร์ยกเลิก"
                                    value={`${computed.cancelledCount} รายการ`}
                                    sub={
                                        computed.cancelledValue > 0
                                            ? `มูลค่า: ${formatMoneyTHB(computed.cancelledValue)} บาท`
                                            : null
                                    }
                                />

                                <StatCard
                                    label="บิลเฉลี่ย"
                                    value={`${formatMoneyTHB(computed.aov)} บาท`}
                                    sub={
                                        computed.unknownCount > 0
                                            ? `สถานะไม่ทราบ: ${computed.unknownCount} รายการ`
                                            : null
                                    }
                                />
                            </div>

                            {/* EMPTY */}
                            {isEmpty ? (
                                <div className="p-6 rounded-xl bg-card border border-border/40 text-center">
                                    <div className="text-lg font-semibold">ไม่พบออเดอร์</div>
                                    <div className="text-text-secondary mt-1">
                                        ลองเปลี่ยนช่วงเวลา หรือเคลียร์คำค้นหา
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* TABLE */}
                                    <div className="hidden rounded-xl overflow-x-auto sm:block">
                                        <Table
                                            headers={headers}
                                            data={rows}
                                            onRowMouseEnter={updateHoverPreview}
                                            onRowMouseMove={updateHoverPreview}
                                            onRowMouseLeave={() => setHoverPreview(null)}
                                        />
                                    </div>
                                    <OrderHoverPreview preview={hoverPreview} />

                                    <div className="space-y-3 sm:hidden">
                                        {mobileOrders.map(({ order, n, paymentLabel, paymentDisplay, itemSummary }) => (
                                            <Link
                                                key={order.id}
                                                href={`/admin/orders/${order.id}`}
                                                className="block min-w-0 rounded-xl border border-border/40 bg-card p-3 shadow-sm transition active:scale-[0.99]"
                                            >
                                                <div className="flex min-w-0 items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-xs text-text-secondary">#{n}</div>
                                                        <div className="mt-1 truncate font-mono text-sm font-semibold text-accent">
                                                            {shortId(order.id)}
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0">
                                                        <StatusPill status={order.status ?? null} />
                                                    </div>
                                                </div>

                                                <div className="mt-3 space-y-2 text-sm">
                                                    <div className="min-w-0">
                                                        <div className="text-xs text-text-secondary">วันที่</div>
                                                        <div className="mt-0.5 break-words text-text-primary">
                                                            {safeDateTH(order.created_at)}
                                                        </div>
                                                    </div>

                                                    <div className="grid min-w-0 grid-cols-2 gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-xs text-text-secondary">ชำระ</div>
                                                            <div className="mt-0.5 truncate text-text-primary">
                                                                {paymentLabel}
                                                            </div>
                                                        </div>
                                                        <div className="min-w-0 text-right">
                                                            <div className="text-xs text-text-secondary">ยอดรวม</div>
                                                            <div className="mt-0.5 truncate font-semibold tabular-nums text-text-primary">
                                                                {formatMoneyTHB(order.total)} บาท
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="min-w-0">
                                                        <div className="text-xs text-text-secondary">รายการ</div>
                                                        <div className="mt-0.5 break-words text-text-primary">
                                                            {itemSummary}
                                                        </div>
                                                    </div>

                                                    <div className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-text-secondary">
                                                        {paymentDisplay}
                                                    </div>
                                                </div>

                                                <div className="mt-3 rounded-lg bg-accent px-3 py-2 text-center text-sm font-semibold text-black">
                                                    ดูรายละเอียด
                                                </div>
                                            </Link>
                                        ))}
                                    </div>

                                    <div className="text-xs text-text-secondary mt-2">
                                        คำแนะนำ: คลิกเลขออเดอร์เพื่อดูรายละเอียดหรือยกเลิก
                                    </div>

                                    {/* PAGINATION */}
                                    <Pagination
                                        page={page}
                                        setPage={setPage}
                                        totalPages={totalPages}
                                        inputPage={inputPage}
                                        setInputPage={setInputPage}
                                    />
                                </>
                            )}
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
