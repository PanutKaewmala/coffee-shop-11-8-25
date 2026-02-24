// app/admin/orders/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import Pagination from "@/components/admin/Pagination";
import OrderItemsTooltip from "@/components/admin/OrderItemsTooltip";
import SearchBox from "@/components/admin/search/SearchBox";
import QuickDateFilter from "@/components/admin/QuickDateFilter";
import useOrdersSearch from "@/hooks/useOrdersSearch";

import type { OrderItem } from "@/lib/types";

type DateFilter = "all" | "today" | "yesterday" | "7days" | "month";
type Preset = "today" | "7days" | "month";

type RevenueSummary = {
    preset: Preset;
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
    items?: OrderItem[];
};

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

function shortId(id: string) {
    return id?.length > 10 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
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
        <div className="p-4 rounded-xl bg-card border border-border/40">
            <div className="text-text-secondary">{label}</div>
            <div className="text-3xl font-bold mt-1 tabular-nums">{value}</div>
            {sub ? <div className={`text-sm mt-1 ${subClass ?? "text-text-secondary"}`}>{sub}</div> : null}
        </div>
    );
}

export default function AdminOrdersPage() {
    const rowsPerPage = 20;

    const {
        loading,
        search,
        setSearch,
        dateFilter,
        setDateFilter,
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

    const headers = ["#", "Order ID", "Status", "Items", "Total", "Date"];

    const rows = useMemo(() => {
        const list = (paginatedOrders as unknown as OrderRow[]) ?? [];

        return list.map((order, idx) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const n = (page - 1) * rowsPerPage + (idx + 1);

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

                <span key={`items-${order.id}`} className="text-text-secondary">
                    <OrderItemsTooltip items={items} />
                </span>,

                <span key={`total-${order.id}`} className="tabular-nums text-text-secondary">
                    {formatMoneyTHB(order.total)} บาท
                </span>,

                <span key={`date-${order.id}`} className="text-text-secondary whitespace-nowrap">
                    {safeDateTH(order.created_at)}
                </span>,
            ];
        });
    }, [paginatedOrders, page]);

    const isEmpty = !loading && (filteredOrders?.length ?? 0) === 0;
    const showReset = search.trim().length > 0 || df !== "today";

    return (
        <div className="p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                <Card title="รายการออเดอร์ทั้งหมด">
                    {/* FILTER + SEARCH */}
                    <div className="space-y-3">
                        <QuickDateFilter
                            dateFilter={df}
                            setDateFilter={(v) => {
                                setDateFilter(v as DateFilter);
                                setPage(1);
                                setInputPage("1");
                            }}
                        />

                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="flex-1">
                                <SearchBox
                                    value={search}
                                    setValue={(v) => {
                                        setSearch(v);
                                        setPage(1);
                                        setInputPage("1");
                                    }}
                                    placeholder="ค้นหา Order ID / วันที่ / เวลา"
                                />
                            </div>

                            {showReset ? (
                                <button
                                    type="button"
                                    className="text-sm text-accent hover:underline whitespace-nowrap self-end md:self-auto"
                                    onClick={() => {
                                        setSearch("");
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
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                            {/* SUMMARY */}
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6 mb-6">
                                <StatCard
                                    label="ยอดขายสุทธิ (Net)"
                                    value={`${formatMoneyTHB(computed.netSales)} บาท`}
                                    sub={
                                        computed.refundedValue > 0
                                            ? `คืนเงิน: -${formatMoneyTHB(computed.refundedValue)} บาท`
                                            : null
                                    }
                                    subClass="text-text-secondary"
                                />

                                <StatCard
                                    label="ยอดขายรวม (Paid)"
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
                                    label="บิลเฉลี่ย (AOV)"
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
                                    <div className="text-lg font-semibold">ไม่เจอออเดอร์</div>
                                    <div className="text-text-secondary mt-1">
                                        ลองเปลี่ยนช่วงเวลา หรือเคลียร์คำค้นหา
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* TABLE */}
                                    <div className="rounded-xl overflow-visible">
                                        <Table headers={headers} data={rows} />
                                    </div>

                                    <div className="text-xs text-text-secondary mt-2">
                                        ทิป: คลิกที่ Order ID เพื่อดูรายละเอียด/ยกเลิกออเดอร์
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
