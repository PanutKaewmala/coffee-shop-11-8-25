// admin/page.tsx (ปรับให้ใช้ Chart ใหม่แบบ CalendarPNL)
"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/admin/Card";
import Chart from "@/components/admin/Chart";
import CalendarPNL from "@/components/admin/CalendarPNL";
import type { RevenueSummary, Order } from "@/lib/types";

const RANGES = ["today", "week", "month", "year", "5year", "all"] as const;
type RangeType = (typeof RANGES)[number];

export default function AdminDashboard() {
    type CountData = {
        menu: number;
        branch: number;
        news: number;
        contact: number;
    };
    
    const [counts, setCounts] = useState<CountData>({ menu: 0, branch: 0, news: 0, contact: 0 });
    const [range, setRange] = useState<RangeType>("today");
    const [summary, setSummary] = useState<RevenueSummary | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"chart" | "calendar">("chart");

    function extractCountFromUnknown(data: unknown, keys: string[]): number {
        if (Array.isArray(data)) return data.length;
        if (typeof data === "object" && data !== null) {
            const obj = data as Record<string, unknown>;
            for (const k of keys) if (Array.isArray(obj[k])) return obj[k]!.length as number;
        }
        return 0;
    }

    useEffect(() => {
        let mounted = true;
        async function load() {
            try {
                const [menuRes, branchRes, newsRes, contactRes] = await Promise.all([
                    fetch("/api/menu"),
                    fetch("/api/branch?all=true"),
                    fetch("/api/news"),
                    fetch("/api/contact"),
                ]);

                const menu = await menuRes.json();
                const branch = await branchRes.json();
                const news = await newsRes.json();
                const contact = await contactRes.json();
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
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        let mounted = true;
        async function load() {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(`/api/revenue?range=${range}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error ?? "Failed to fetch");
                if (mounted) setSummary(data as RevenueSummary);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Unknown error";
                if (mounted) setError(msg);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [range]);

    const recentOrders: Order[] = useMemo(() => {
        if (!summary?.orders) return [];
        return [...summary.orders]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 8);
    }, [summary]);

    const topSeller = summary?.topItems?.[0] ?? null;
    const fmtCurrency = (v: number) => v.toLocaleString("th-TH") + " ฿";
    const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("th-TH", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });

    if (!summary && loading) return <p className="p-6 text-gray-500">Loading...</p>;
    if (error) return <p className="p-6 text-red-400">Error: {error}</p>;
    if (!summary) return null;

    return (
        <div className="p-6 space-y-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
                <div className="rounded-lg bg-surface p-1 flex gap-1 shadow-sm border border-gray-700/40">
                    {RANGES.map(r => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-3 py-2 text-sm rounded-md transition ${range === r ? "bg-accent text-black" : "text-gray-300 hover:bg-surface/60"}`}
                        >
                            {r.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card title="ยอดขายรวม">
                    <div className="text-2xl font-bold text-white">{fmtCurrency(summary.totalRevenue)}</div>
                    <div className="text-sm text-gray-400 mt-1">ช่วง: {range.toUpperCase()}</div>
                </Card>
                <Card title="จำนวนบิล"><div className="text-2xl font-bold text-white">{summary.totalOrders}</div></Card>
                <Card title="เฉลี่ยต่อบิล"><div className="text-2xl font-bold text-white">{fmtCurrency(summary.avgOrder)}</div></Card>
                <Card title="เมนูขายดี (Top)">
                    <div className="text-2xl font-bold text-white">{topSeller ? topSeller.name : "-"}</div>
                    <div className="text-sm text-gray-400 mt-1">{topSeller ? `${topSeller.qty} ชิ้น` : "ไม่มีข้อมูล"}</div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card title="ยอดขาย (Chart / Calendar)">
                        {range === "today" ? (
                            <Chart orders={summary.orders} range={range} />
                        ) : (
                            <>
                                <div className="flex gap-2 mb-4 justify-end">
                                    <button
                                        onClick={() => setViewMode("chart")}
                                        className={`px-3 py-1 text-sm rounded-md ${viewMode === "chart" ? "bg-accent text-black" : "text-gray-300 hover:bg-surface/60"}`}
                                    >Chart</button>

                                    <button
                                        onClick={() => setViewMode("calendar")}
                                        className={`px-3 py-1 text-sm rounded-md ${viewMode === "calendar" ? "bg-accent text-black" : "text-gray-300 hover:bg-surface/60"}`}
                                    >Calendar</button>
                                </div>

                                {viewMode === "chart" ? (
                                    <Chart orders={summary.orders} range={range} />
                                ) : (
                                    <CalendarPNL orders={summary.orders} range={range} />
                                )}
                            </>
                        )}
                    </Card>
                </div>

                <div>
                    <Card title="เมนูขายดี Top 5">
                        <div className="space-y-3">
                            {summary.topItems.length ? (
                                summary.topItems.map((t, idx) => (
                                    <div key={t.name} className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm text-gray-300 font-medium">{idx + 1}. {t.name}</div>
                                            <div className="text-xs text-gray-500">Sold: {t.qty}</div>
                                        </div>
                                        <div className="text-accent font-bold">{t.qty}</div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-gray-500">ไม่มีข้อมูล</div>
                            )}
                        </div>
                    </Card>

                    <div className="mt-4">
                        <Card title="Recent Orders">
                            <div className="overflow-x-auto">
                                <table className="w-full table-auto text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-gray-400">
                                            <th className="pb-2">Order ID</th>
                                            <th className="pb-2">เวลา</th>
                                            <th className="pb-2">จำนวน</th>
                                            <th className="pb-2">ยอดรวม</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentOrders.length ? (
                                            recentOrders.map(o => (
                                                <tr key={o.id} className="border-t border-gray-700/30">
                                                    <td className="py-2 text-gray-300">{o.id.slice(0, 8)}</td>
                                                    <td className="py-2 text-gray-300">{fmtDateTime(o.created_at)}</td>
                                                    <td className="py-2 text-gray-300">{o.items.length}</td>
                                                    <td className="py-2 font-semibold text-white">{fmtCurrency(o.total)}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="py-4 text-center text-gray-500">ไม่มีออเดอร์</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
