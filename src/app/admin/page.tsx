// src/app/admin/page.tsx (theme-safe)
"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/admin/Card";
import Chart from "@/components/admin/Chart";
import CalendarPNL from "@/components/admin/CalendarPNL";
import type { RevenueSummary } from "@/lib/types";

const RANGES = ["today", "week", "month", "year", "5year", "all"] as const;
type RangeType = (typeof RANGES)[number];

/* =========================
   Safe readers (no any)
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function readNum(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

type ExtraRevenueFields = {
    netRevenue: number;
    refundedTotal: number;
    cancelledCount: number;
    cancelledTotal: number;
    unknownCount: number;
};

function readExtraFields(data: unknown, fallbackTotalRevenue: number): ExtraRevenueFields | null {
    if (!isRecord(data)) return null;

    const hasAnyExtra =
        "netRevenue" in data ||
        "refundedTotal" in data ||
        "cancelledCount" in data ||
        "cancelledTotal" in data ||
        "unknownCount" in data;

    if (!hasAnyExtra) return null;

    return {
        netRevenue: readNum(data.netRevenue, fallbackTotalRevenue),
        refundedTotal: readNum(data.refundedTotal, 0),
        cancelledCount: readNum(data.cancelledCount, 0),
        cancelledTotal: readNum(data.cancelledTotal, 0),
        unknownCount: readNum(data.unknownCount, 0),
    };
}

export default function AdminDashboard() {
    type CountData = {
        menu: number;
        branch: number;
        news: number;
        contact: number;
    };

    const [counts, setCounts] = useState<CountData>({
        menu: 0,
        branch: 0,
        news: 0,
        contact: 0,
    });

    const [range, setRange] = useState<RangeType>("today");
    const [summary, setSummary] = useState<RevenueSummary | null>(null);
    const [extra, setExtra] = useState<ExtraRevenueFields | null>(null);

    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"chart" | "calendar">("chart");

    function extractCountFromUnknown(data: unknown, keys: string[]): number {
        if (Array.isArray(data)) return data.length;
        if (isRecord(data)) {
            for (const k of keys) {
                const v = data[k];
                if (Array.isArray(v)) return v.length;
            }
        }
        return 0;
    }

    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                const [menuRes, branchRes, newsRes, contactRes] = await Promise.all([
                    fetch("/api/menu", { cache: "no-store" }),
                    fetch("/api/branch?all=true", { cache: "no-store" }),
                    fetch("/api/news", { cache: "no-store" }),
                    fetch("/api/contact", { cache: "no-store" }),
                ]);

                const menu: unknown = await menuRes.json();
                const branch: unknown = await branchRes.json();
                const news: unknown = await newsRes.json();
                const contact: unknown = await contactRes.json();

                if (!mounted) return;

                setCounts({
                    menu: extractCountFromUnknown(menu, ["menu"]),
                    branch: extractCountFromUnknown(branch, ["branch", "branches"]),
                    news: extractCountFromUnknown(news, ["news"]),
                    contact: extractCountFromUnknown(contact, ["contact", "contacts"]),
                });
            } catch (err) {
                console.error("fetchCounts error:", err);
            }
        }

        load();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                setLoading(true);
                setError(null);

                const res = await fetch(`/api/revenue?range=${range}`, { cache: "no-store" });
                const data: unknown = await res.json();

                if (!res.ok) {
                    const msg = isRecord(data) && typeof data.error === "string" ? data.error : "Failed to fetch";
                    throw new Error(msg);
                }

                if (!mounted) return;

                const s = data as RevenueSummary;
                setSummary(s);
                setExtra(readExtraFields(data, s.totalRevenue));
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Unknown error";
                if (mounted) setError(msg);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        load();
        return () => {
            mounted = false;
        };
    }, [range]);

    const recentOrders = useMemo(() => {
        if (!summary?.orders) return [];
        return [...summary.orders]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 8);
    }, [summary]);

    const topSeller = summary?.topItems?.[0] ?? null;

    const fmtCurrency = (v: number) => v.toLocaleString("th-TH") + " ฿";
    const fmtDateTime = (iso: string) =>
        new Date(iso).toLocaleString("th-TH", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });

    if (!summary && loading) return <p className="p-6 text-text-muted">Loading...</p>;
    if (error) return <p className="p-6 text-red-500">Error: {error}</p>;
    if (!summary) return null;

    const mainRevenue = extra ? extra.netRevenue : summary.totalRevenue;

    return (
        <div className="p-6 space-y-8">
            {/* Header */}
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <h1 className="text-2xl font-bold text-text-primary">Admin Dashboard</h1>

                {/* Range pills */}
                <div className="rounded-lg bg-surface p-1 flex gap-1 shadow-sm border border-text-muted/25">
                    {RANGES.map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-3 py-2 text-sm rounded-md transition ${range === r ? "bg-accent text-background" : "text-text-secondary hover:bg-surface/60"
                                }`}
                        >
                            {r.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card title="ยอดขายรวม">
                    <div className="text-2xl font-bold text-text-primary">{fmtCurrency(mainRevenue)}</div>
                    <div className="text-sm text-text-muted mt-1">ช่วง: {range.toUpperCase()}</div>

                    {extra && extra.refundedTotal > 0 ? (
                        <div className="text-xs text-text-muted mt-1">คืนเงิน: {fmtCurrency(extra.refundedTotal)}</div>
                    ) : null}
                </Card>

                <Card title="จำนวนบิล">
                    <div className="text-2xl font-bold text-text-primary">{summary.totalOrders}</div>

                    {extra && extra.unknownCount > 0 ? (
                        <div className="text-xs text-text-muted mt-1">unknown: {extra.unknownCount}</div>
                    ) : null}
                </Card>

                <Card title="เฉลี่ยต่อบิล">
                    <div className="text-2xl font-bold text-text-primary">{fmtCurrency(summary.avgOrder)}</div>
                </Card>

                <Card title="เมนูขายดี (Top)">
                    <div className="text-2xl font-bold text-text-primary">{topSeller ? topSeller.name : "-"}</div>
                    <div className="text-sm text-text-muted mt-1">{topSeller ? `${topSeller.qty} ชิ้น` : "ไม่มีข้อมูล"}</div>
                </Card>
            </div>

            {/* Optional cancelled card */}
            {extra ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Card title="ออเดอร์ยกเลิก">
                        <div className="text-2xl font-bold text-text-primary">{extra.cancelledCount}</div>
                        <div className="text-sm text-text-muted mt-1">มูลค่า: {fmtCurrency(extra.cancelledTotal)}</div>
                    </Card>
                    <div className="hidden sm:block lg:col-span-3" />
                </div>
            ) : null}

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card title="ยอดขาย (Chart / Calendar)">
                        {range === "today" ? (
                            // ✅ TODAY ก็ใช้ chart ได้เลย (label = "HH:00")
                            <Chart chart={summary.chart} range={range} />
                        ) : (
                            <>
                                <div className="flex gap-2 mb-4 justify-end">
                                    <button
                                        onClick={() => setViewMode("chart")}
                                        className={`px-3 py-1 text-sm rounded-md transition ${viewMode === "chart" ? "bg-accent text-background" : "text-text-secondary hover:bg-surface/60"
                                            }`}
                                    >
                                        Chart
                                    </button>

                                    <button
                                        onClick={() => setViewMode("calendar")}
                                        className={`px-3 py-1 text-sm rounded-md transition ${viewMode === "calendar" ? "bg-accent text-background" : "text-text-secondary hover:bg-surface/60"
                                            }`}
                                    >
                                        Calendar
                                    </button>
                                </div>

                                {viewMode === "chart" ? (
                                    <Chart chart={summary.chart} range={range} />
                                ) : (
                                    <CalendarPNL chart={summary.chart} range={range} />
                                )}
                            </>
                        )}
                    </Card>
                </div>

                {/* Right side */}
                <div>
                    <Card title="เมนูขายดี Top 5">
                        <div className="space-y-3">
                            {summary.topItems.length ? (
                                summary.topItems.map((t, idx) => (
                                    <div key={t.name} className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm text-text-secondary font-medium">
                                                {idx + 1}. {t.name}
                                            </div>
                                            <div className="text-xs text-text-muted">Sold: {t.qty}</div>
                                        </div>
                                        <div className="text-accent font-bold">{t.qty}</div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-text-muted">ไม่มีข้อมูล</div>
                            )}
                        </div>
                    </Card>

                    <div className="mt-4">
                        <Card title="Recent Orders">
                            <div className="overflow-x-auto">
                                <table className="w-full table-auto text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-text-muted">
                                            <th className="pb-2">Order ID</th>
                                            <th className="pb-2">เวลา</th>
                                            <th className="pb-2">จำนวน</th>
                                            <th className="pb-2">ยอดรวม</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentOrders.length ? (
                                            recentOrders.map((o) => (
                                                <tr key={o.id} className="border-t border-text-muted/25">
                                                    <td className="py-2 text-text-secondary">{o.id.slice(0, 8)}</td>
                                                    <td className="py-2 text-text-secondary">{fmtDateTime(o.created_at)}</td>
                                                    <td className="py-2 text-text-secondary">{o.items.length}</td>
                                                    <td className="py-2 font-semibold text-text-primary">{fmtCurrency(o.total)}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="py-4 text-center text-text-muted">
                                                    ไม่มีออเดอร์
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>

            {/* <pre className="text-xs text-text-muted">{JSON.stringify(counts, null, 2)}</pre> */}
        </div>
    );
}
