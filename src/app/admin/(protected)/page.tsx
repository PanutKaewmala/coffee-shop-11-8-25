// src/app/admin/page.tsx
"use client";

import { useEffect, useMemo, useCallback, useState } from "react";
import Link from "next/link";

import Card from "@/components/admin/Card";
import Chart from "@/components/admin/Chart";
import CalendarPNL from "@/components/admin/CalendarPNL";
import type { Order as ChartOrder } from "@/lib/types";

const RANGES = ["today", "week", "month", "year", "5year", "all"] as const;
type RangeType = (typeof RANGES)[number];

type OrderStatus = "paid" | "cancelled" | "void" | "refunded";

type DashboardOrderItem = {
    id: string;
    name: string;
    price: number;
    qty: number;
};

type DashboardOrder = {
    id: string;
    created_at: string;
    paid_at: string | null;
    status: OrderStatus;
    total: number;
    items: DashboardOrderItem[];
};

type RevenueDashboardResponse = {
    range: RangeType;

    paidTotal: number;
    paidCount: number;

    cancelledTotal: number;
    cancelledCount: number;

    refundedTotal: number;
    refundedCount: number;

    voidTotal: number;
    voidCount: number;

    netTotal: number;
    aov: number;

    topItems: Array<{ name: string; qty: number; variant_label: string | null }>;
    chart: Array<{ label: string; value: number }>;

    orders: DashboardOrder[];
};

/* =========================
   Type guards (no any)
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}
function getErrorMessage(data: unknown): string | null {
    if (!isRecord(data)) return null;
    const e = data.error;
    return typeof e === "string" && e.trim() ? e.trim() : null;
}
function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}
function safeNum(v: unknown, fallback = 0) {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function parseHourLabel(label: string): number | null {
    // supports "17:00" or "17"
    const m = label.match(/^(\d{1,2})/);
    if (!m) return null;
    const h = Number(m[1]);
    if (!Number.isFinite(h)) return null;
    return clamp(h, 0, 23);
}
function hourRangeText(h: number) {
    const a = String(h).padStart(2, "0");
    const b = String((h + 1) % 24).padStart(2, "0");
    return `${a}:00–${b}:00`;
}

/** ✅ only accept truly-hourly labels ("17" or "17:00") */
function isHourlyChart(chart: Array<{ label: string; value: number }>) {
    if (!chart.length) return false;
    return chart.every((c) => {
        const s = String(c.label ?? "").trim();
        return /^(\d{1,2})(:\d{2})?$/.test(s);
    });
}

type InsightTone = "emerald" | "amber" | "rose" | "slate";

type Insight = {
    key: string;
    title: string;
    value: string;
    tone: InsightTone;
    hint: string;
};

function toneBadge(tone: InsightTone) {
    const base =
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border shadow-sm";
    if (tone === "rose") return `${base} border-rose-500/30 bg-rose-500/10 text-rose-200`;
    if (tone === "amber") return `${base} border-amber-500/30 bg-amber-500/10 text-amber-200`;
    if (tone === "emerald") return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-200`;
    return `${base} border-slate-400/25 bg-slate-400/10 text-slate-200`;
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
    const [summary, setSummary] = useState<RevenueDashboardResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<"chart" | "calendar">("chart");

    // ✅ today = no toggle + force chart always
    const isToday = range === "today";

    // optional stock risk (if API exists)
    const [stockRiskText, setStockRiskText] = useState<string | null>(null);
    const [stockRiskTone, setStockRiskTone] = useState<InsightTone>("slate");

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

    const fmtCurrency = useCallback((v: number) =>
        `${Number.isFinite(v) ? v.toLocaleString("th-TH") : "0"} ฿`,
        [],
    );

    const fmtDateTime = (iso: string) =>
        new Date(iso).toLocaleString("th-TH", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });

    function statusBadge(status: OrderStatus) {
        if (status === "paid") {
            return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
        }
        if (status === "cancelled") {
            return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-rose-500/30 bg-rose-500/10 text-rose-200";
        }
        if (status === "refunded") {
            return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-amber-500/30 bg-amber-500/10 text-amber-200";
        }
        return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-slate-400/25 bg-slate-400/10 text-slate-200";
    }

    function statusLabelTH(status: OrderStatus) {
        if (status === "paid") return "ชำระแล้ว";
        if (status === "cancelled") return "ยกเลิก";
        if (status === "refunded") return "คืนเงิน";
        return "VOID";
    }

    function rangeLabelTH(r: RangeType) {
        if (r === "today") return "วันนี้";
        if (r === "week") return "7 วัน";
        if (r === "month") return "30 วัน";
        if (r === "year") return "ปีนี้";
        if (r === "5year") return "5 ปี";
        return "ทั้งหมด";
    }

    // counts (optional)
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

                const menu: unknown = await menuRes.json().catch(() => null);
                const branch: unknown = await branchRes.json().catch(() => null);
                const news: unknown = await newsRes.json().catch(() => null);
                const contact: unknown = await contactRes.json().catch(() => null);
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

    // ✅ keep viewMode sane when switching range
    useEffect(() => {
        if (range === "today") setViewMode("chart");
    }, [range]);

    // dashboard data
    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                setLoading(true);
                setError(null);

                const res = await fetch(`/api/revenue?range=${range}`, { cache: "no-store" });
                const data: unknown = await res.json().catch(() => null);

                if (!res.ok) {
                    throw new Error(getErrorMessage(data) ?? "Failed to fetch");
                }

                if (!mounted) return;
                setSummary(data as RevenueDashboardResponse);
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

    // optional stock risk (best-effort)
    useEffect(() => {
        let mounted = true;

        async function loadStockRisk() {
            try {
                setStockRiskText(null);

                const res = await fetch("/api/ingredients");
                if (!res.ok) return;

                const data: unknown = await res.json().catch(() => null);
                if (!mounted) return;

                // accept shapes:
                // - array of ingredients
                // - { ingredients: [...] }
                let arr: unknown[] = [];
                if (Array.isArray(data)) arr = data;
                else if (isRecord(data) && Array.isArray(data.ingredients)) arr = data.ingredients as unknown[];

                if (!arr.length) return;

                // find minimum daysLeft if present
                type Candidate = { name: string; daysLeft: number };
                const candidates: Candidate[] = [];

                for (const it of arr) {
                    if (!isRecord(it)) continue;
                    const name = typeof it.name === "string" ? it.name : null;

                    const d1 = it.daysLeft;
                    const d2 = it.days_left;
                    const daysLeft = Number.isFinite(Number(d1))
                        ? Number(d1)
                        : Number.isFinite(Number(d2))
                            ? Number(d2)
                            : NaN;

                    if (name && Number.isFinite(daysLeft)) {
                        candidates.push({ name, daysLeft });
                    }
                }

                if (!candidates.length) return;

                candidates.sort((a, b) => a.daysLeft - b.daysLeft);
                const worst = candidates[0];

                const dl = worst.daysLeft;
                const display = dl <= 0 ? "หมดแล้ว" : `${dl.toFixed(dl < 1 ? 1 : 0)} วัน`;

                setStockRiskText(`${worst.name} ~${display}`);

                if (dl <= 1) setStockRiskTone("rose");
                else if (dl <= 2) setStockRiskTone("amber");
                else setStockRiskTone("emerald");
            } catch {
                // silent fail
            }
        }

        loadStockRisk();
        return () => {
            mounted = false;
        };
    }, [range]);

    const recentOrders: DashboardOrder[] = useMemo(() => {
        if (!summary?.orders) return [];
        return [...summary.orders]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 8);
    }, [summary]);

    const topSeller = summary?.topItems?.[0] ?? null;

    const paidOnlyOrders = useMemo(() => {
        return (summary?.orders ?? []).filter((o) => o.status === "paid");
    }, [summary]);

    // ✅ cast through unknown to the type Chart expects (no any)
    const chartOrders = useMemo(() => {
        return paidOnlyOrders as unknown as ChartOrder[];
    }, [paidOnlyOrders]);

    // =========================
    // Insights (Owner-first signals)
    // =========================

    const paidOrdersSorted = useMemo(() => {
        return [...paidOnlyOrders].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
    }, [paidOnlyOrders]);

    const totalQtyPaid = useMemo(() => {
        return paidOnlyOrders.reduce((sum, o) => {
            const q = o.items.reduce((s, it) => s + (Number.isFinite(it.qty) ? it.qty : 0), 0);
            return sum + q;
        }, 0);
    }, [paidOnlyOrders]);

    const cancelLikeCount = useMemo(() => {
        const c = summary?.cancelledCount ?? 0;
        const r = summary?.refundedCount ?? 0;
        const v = summary?.voidCount ?? 0;
        return c + r + v;
    }, [summary]);

    const allCount = useMemo(() => {
        const paid = summary?.paidCount ?? 0;
        return paid + cancelLikeCount;
    }, [summary, cancelLikeCount]);

    const cancelRate = useMemo(() => {
        if (!allCount) return 0;
        return cancelLikeCount / allCount;
    }, [allCount, cancelLikeCount]);

    const refundRate = useMemo(() => {
        const paid = summary?.paidCount ?? 0;
        if (!paid) return 0;
        return (summary?.refundedCount ?? 0) / paid;
    }, [summary]);

    const voidRate = useMemo(() => {
        const paid = summary?.paidCount ?? 0;
        if (!paid) return 0;
        return (summary?.voidCount ?? 0) / paid;
    }, [summary]);

    const menuConcentration = useMemo(() => {
        // use topItems[0].qty / total qty (fallback: 0)
        const top = summary?.topItems?.[0]?.qty ?? 0;
        const total = totalQtyPaid || 0;
        if (!total) return 0;
        return top / total;
    }, [summary, totalQtyPaid]);

    /** ✅ hour-based insights ONLY when chart labels are hourly */
    const hourlyOk = useMemo(() => {
        return isHourlyChart(summary?.chart ?? []);
    }, [summary]);

    const peakHour = useMemo(() => {
        const chart = summary?.chart ?? [];
        if (!chart.length || !hourlyOk) return null;

        let bestLabel = chart[0].label;
        let bestVal = safeNum(chart[0].value, 0);

        for (const c of chart) {
            const v = safeNum(c.value, 0);
            if (v > bestVal) {
                bestVal = v;
                bestLabel = c.label;
            }
        }

        const h = parseHourLabel(String(bestLabel));
        return h === null ? null : { hour: h, value: bestVal };
    }, [summary, hourlyOk]);

    const slowWindow = useMemo(() => {
        const chart = summary?.chart ?? [];
        if (chart.length < 3 || !hourlyOk) return null;

        const vals = chart.map((c) => safeNum(c.value, 0));
        let bestSum = Infinity;
        let bestIdx = 0;

        for (let i = 0; i <= vals.length - 3; i++) {
            const s = vals[i] + vals[i + 1] + vals[i + 2];
            if (s < bestSum) {
                bestSum = s;
                bestIdx = i;
            }
        }

        const h0 = parseHourLabel(String(chart[bestIdx].label));
        const h2 = parseHourLabel(String(chart[bestIdx + 2].label));

        if (h0 === null || h2 === null) return null;

        // show as start hour to end+1
        const start = h0;
        const end = (h2 + 1) % 24;
        const startTxt = String(start).padStart(2, "0");
        const endTxt = String(end).padStart(2, "0");
        return { start, end, text: `${startTxt}:00–${endTxt}:00` };
    }, [summary, hourlyOk]);

    const aovTrend = useMemo(() => {
        // no extra API: compare early vs late inside selected range
        const list = paidOrdersSorted;
        if (list.length < 4) return { deltaPct: 0, tone: "slate" as InsightTone, hint: "ข้อมูลยังน้อย" };

        const cut = Math.floor(list.length / 2);
        const first = list.slice(0, cut);
        const last = list.slice(cut);

        const a1 = first.reduce((s, o) => s + o.total, 0) / Math.max(1, first.length);
        const a2 = last.reduce((s, o) => s + o.total, 0) / Math.max(1, last.length);

        if (!Number.isFinite(a1) || !Number.isFinite(a2) || a1 <= 0) {
            return { deltaPct: 0, tone: "slate" as InsightTone, hint: "คำนวณไม่ได้" };
        }

        const delta = (a2 - a1) / a1; // + means rising
        const pct = delta * 100;

        if (pct >= 8) return { deltaPct: pct, tone: "emerald" as InsightTone, hint: "บิลเฉลี่ยกำลังขึ้น" };
        if (pct <= -8) return { deltaPct: pct, tone: "rose" as InsightTone, hint: "บิลเฉลี่ยกำลังตก" };
        return { deltaPct: pct, tone: "amber" as InsightTone, hint: "แกว่งเล็กน้อย" };
    }, [paidOrdersSorted]);

    const repeatProxy = useMemo(() => {
        // proxy: count orders that happen within 2 hours of a previous paid order
        const list = paidOrdersSorted;
        if (list.length < 3) return { count: 0, tone: "slate" as InsightTone, hint: "ข้อมูลยังน้อย" };

        const twoHours = 2 * 60 * 60 * 1000;
        let count = 0;

        for (let i = 1; i < list.length; i++) {
            const tPrev = new Date(list[i - 1].created_at).getTime();
            const tNow = new Date(list[i].created_at).getTime();
            if (tNow - tPrev <= twoHours) count++;
        }

        if (count >= 6) return { count, tone: "emerald" as InsightTone, hint: "ลูกค้าถี่/มีซ้ำในช่วงสั้น" };
        if (count >= 3) return { count, tone: "amber" as InsightTone, hint: "มีสัญญาณกลับมาซื้อซ้ำ" };
        return { count, tone: "slate" as InsightTone, hint: "ทราฟฟิคยังบาง" };
    }, [paidOrdersSorted]);

    const outlierBill = useMemo(() => {
        const list = paidOrdersSorted;
        if (!list.length) return null;

        let max = list[0];
        for (const o of list) if (o.total > max.total) max = o;

        const aov = summary?.aov ?? 0;
        if (!aov || !Number.isFinite(aov)) return null;

        const ratio = max.total / aov;
        if (!Number.isFinite(ratio)) return null;

        if (ratio >= 4) return { ratio, orderId: max.id, total: max.total, tone: "rose" as InsightTone };
        if (ratio >= 3) return { ratio, orderId: max.id, total: max.total, tone: "amber" as InsightTone };
        return { ratio, orderId: max.id, total: max.total, tone: "slate" as InsightTone };
    }, [paidOrdersSorted, summary]);

    const cancelRisk = useMemo(() => {
        if (cancelRate >= 0.15) return { label: "เสี่ยงสูง", hint: "ยกเลิกเยอะผิดปกติ", tone: "rose" as const };
        if (cancelRate >= 0.08) return { label: "เริ่มสูง", hint: "ควรเช็คปัญหาหน้าร้าน", tone: "amber" as const };
        return { label: "ปกติ", hint: "ทรงโอเค", tone: "emerald" as const };
    }, [cancelRate]);

    const insights: Insight[] = useMemo(() => {
        const list: Insight[] = [];

        // 1) Cancel rate
        list.push({
            key: "cancelRate",
            title: "อัตราการยกเลิก",
            value: `${Math.round(clamp(cancelRate * 100, 0, 100))}% • ${cancelRisk.label}`,
            tone: cancelRisk.tone,
            hint: cancelRisk.hint,
        });

        // 2) Refund / Void alarm
        const rr = Math.round(clamp(refundRate * 100, 0, 100));
        const vr = Math.round(clamp(voidRate * 100, 0, 100));
        const rvTone: InsightTone =
            rr >= 6 || vr >= 6 ? "rose" : rr >= 3 || vr >= 3 ? "amber" : "emerald";
        const rvHint =
            rr >= 6 || vr >= 6
                ? "ผิดพลาด/คุณภาพ/กดผิด เริ่มน่าห่วง"
                : rr >= 3 || vr >= 3
                    ? "เช็คจุดผิดพลาดซ้ำๆ"
                    : "โอเค";

        list.push({
            key: "refundVoid",
            title: "คืนเงิน/VOID",
            value: `คืนเงิน ${rr}% • VOID ${vr}%`,
            tone: rvTone,
            hint: rvHint,
        });

        // 3) Menu concentration risk
        const mc = Math.round(clamp(menuConcentration * 100, 0, 100));
        const mcTone: InsightTone = mc >= 55 ? "rose" : mc >= 40 ? "amber" : "emerald";
        const mcHint =
            mc >= 55
                ? "ยอดกระจุกตัวสูง—เมนูฮิตมีปัญหาคือรายได้ร่วง"
                : mc >= 40
                    ? "เริ่มกระจุก—เตรียมสต็อกเมนูฮิต"
                    : "ยอดกระจายดี";

        list.push({
            key: "concentration",
            title: "ยอดกระจุกตัว",
            value: `${mc}% ที่เมนูอันดับ 1`,
            tone: mcTone,
            hint: mcHint,
        });

        // 4) Peak hour (hourly only)
        if (peakHour) {
            const peakTone: InsightTone = peakHour.value >= 50 ? "emerald" : "amber";
            list.push({
                key: "peakHour",
                title: "ช่วงพีค",
                value: hourRangeText(peakHour.hour),
                tone: peakTone,
                hint: peakTone === "emerald" ? "ช่วงพีค—เตรียมคน/ของให้พอ" : "พีคไม่แรง—ลองดันโปรช่วงพีค",
            });
        } else {
            list.push({
                key: "peakHour",
                title: "ช่วงพีค",
                value: "-",
                tone: "slate",
                hint: hourlyOk ? "ยังไม่มีข้อมูลชั่วโมง" : "ใช้ได้เฉพาะโหมดวันนี้",
            });
        }

        // 5) Slow period (hourly only)
        if (slowWindow) {
            list.push({
                key: "slowWindow",
                title: "ช่วงเงียบ",
                value: slowWindow.text,
                tone: "amber",
                hint: "ช่วงเงียบ—เหมาะยิงโปร/คอนเทนต์",
            });
        } else {
            list.push({
                key: "slowWindow",
                title: "ช่วงเงียบ",
                value: "-",
                tone: "slate",
                hint: hourlyOk ? "ยังไม่มีข้อมูลพอ" : "ใช้ได้เฉพาะโหมดวันนี้",
            });
        }

        // 6) AOV trend
        const aovPct = Math.round(aovTrend.deltaPct);
        const aovVal = Number.isFinite(aovPct)
            ? `${aovPct > 0 ? "↑" : aovPct < 0 ? "↓" : "•"} ${Math.abs(aovPct)}%`
            : "-";

        list.push({
            key: "aovTrend",
            title: "แนวโน้มบิลเฉลี่ย",
            value: aovVal,
            tone: aovTrend.tone,
            hint:
                aovTrend.tone === "rose"
                    ? "บิลเฉลี่ยตก—ดัน add-on/ไซส์ใหญ่/เมนูคู่"
                    : aovTrend.tone === "emerald"
                        ? "บิลเฉลี่ยขึ้น—รักษา pattern เดิม"
                        : aovTrend.hint,
        });

        // 7) Repeat proxy
        list.push({
            key: "repeatProxy",
            title: "ซื้อซ้ำ (สัญญาณ)",
            value: `${repeatProxy.count} บิลใน 2 ชม.`,
            tone: repeatProxy.tone,
            hint: repeatProxy.hint,
        });

        // 8) Outlier bill
        if (outlierBill) {
            const ratio = Math.round(outlierBill.ratio * 10) / 10;
            const hint =
                outlierBill.tone === "rose"
                    ? "บิลใหญ่ผิดปกติ—เช็คส่วนลด/กดราคา/รายการ"
                    : outlierBill.tone === "amber"
                        ? "บิลใหญ่—เช็คความถูกต้องนิดนึง"
                        : "บิลใหญ่ปกติ";

            list.push({
                key: "outlier",
                title: "บิลผิดปกติ",
                value: `${fmtCurrency(outlierBill.total)} • x${ratio}`,
                tone: outlierBill.tone,
                hint,
            });
        } else {
            list.push({
                key: "outlier",
                title: "บิลผิดปกติ",
                value: "-",
                tone: "slate",
                hint: "ยังไม่มีบิล",
            });
        }

        // 9) Stock risk (optional)
        if (stockRiskText) {
            list.push({
                key: "stockRisk",
                title: "สต็อกเสี่ยงหมด",
                value: stockRiskText,
                tone: stockRiskTone,
                hint:
                    stockRiskTone === "rose"
                        ? "ควรสั่งของวันนี้"
                        : stockRiskTone === "amber"
                            ? "เริ่มตึง—เตรียมสั่ง"
                            : "โอเค",
            });
        }

        return list;
    }, [
        cancelRate,
        cancelRisk,
        refundRate,
        voidRate,
        menuConcentration,
        peakHour,
        slowWindow,
        aovTrend,
        repeatProxy,
        outlierBill,
        stockRiskText,
        stockRiskTone,
        fmtCurrency,
        hourlyOk,
    ]);

    if (!summary && loading) {
        return (
            <div className="p-6">
                <div className="max-w-6xl mx-auto space-y-6">
                    <div className="h-8 w-56 bg-surface rounded-md animate-pulse" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-24 rounded-xl bg-surface animate-pulse border border-text-muted/20"
                            />
                        ))}
                    </div>
                    <div className="h-[420px] rounded-xl bg-surface animate-pulse border border-text-muted/20" />
                </div>
            </div>
        );
    }

    if (error) return <p className="p-6 text-red-500">Error: {error}</p>;
    if (!summary) return null;

    return (
        <div className="p-6">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-1">
                        <h1 className="text-2xl md:text-3xl font-bold text-text-primary">Admin Dashboard</h1>
                        <div className="text-sm text-text-muted">
                            สรุปภาพรวมช่วง:{" "}
                            <span className="text-text-secondary font-medium">{rangeLabelTH(range)}</span>
                            {counts.menu || counts.branch || counts.news || counts.contact ? (
                                <span className="ml-2 text-xs text-text-muted">
                                    • Menu {counts.menu} • Branch {counts.branch} • News {counts.news} • Contact{" "}
                                    {counts.contact}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {/* Range pills */}
                    <div className="rounded-xl bg-surface p-1 flex flex-wrap gap-1 shadow-sm border border-text-muted/25">
                        {RANGES.map((r) => {
                            const active = range === r;
                            return (
                                <button
                                    key={r}
                                    onClick={() => setRange(r)}
                                    aria-pressed={active}
                                    className={[
                                        "px-3 py-2 text-sm rounded-lg transition",
                                        "focus:outline-none focus:ring-2 focus:ring-accent/40",
                                        active
                                            ? "bg-accent text-background shadow-sm"
                                            : "text-text-secondary hover:bg-surface/60",
                                    ].join(" ")}
                                >
                                    {r.toUpperCase()}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Owner-first strip */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="text-xs text-text-muted">{loading ? "กำลังอัปเดตข้อมูล…" : "ข้อมูลตามช่วงที่เลือก"}</div>
                </div>

                {/* ✅ Insight Badges */}
                <div className="rounded-xl border border-text-muted/20 bg-surface/40 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="text-sm font-semibold text-text-primary">Owner-first Signals</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {insights.map((it) => (
                            <div
                                key={it.key}
                                className={toneBadge(it.tone)}
                                title={it.hint}
                                aria-label={`${it.title} ${it.value}`}
                            >
                                <span className="font-semibold">{it.title}</span>
                                <span className="opacity-80">•</span>
                                <span className="text-text-muted">{it.value}</span>
                                <span className="opacity-80">—</span>
                                <span className="text-text-muted">{it.hint}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                    <Card title="ยอดขายสุทธิ (Net)">
                        <div className="text-2xl font-bold text-text-primary">{fmtCurrency(summary.netTotal)}</div>
                    </Card>

                    <Card title="ยอดขายรวม (Paid)">
                        <div className="text-2xl font-bold text-text-primary">{fmtCurrency(summary.paidTotal)}</div>
                        <div className="text-sm text-text-muted mt-1">
                            มีคืนเงิน <span className="text-text-secondary">{fmtCurrency(summary.refundedTotal)}</span>
                        </div>
                    </Card>

                    <Card title="ออเดอร์ชำระแล้ว">
                        <div className="text-2xl font-bold text-text-primary">{summary.paidCount}</div>
                    </Card>

                    <Card title="ออเดอร์ยกเลิก/ปัญหา">
                        <div className="relative group">
                            <div className="flex items-baseline justify-between gap-3">
                                <div className="text-2xl font-bold text-text-primary">{summary.cancelledCount}</div>
                                <div className="text-xs text-text-muted">
                                    {allCount ? `${Math.round(cancelRate * 100)}%` : "0%"}
                                </div>
                            </div>
                            <div className="text-sm text-text-muted mt-1">
                                มูลค่า <span className="text-text-secondary">{fmtCurrency(summary.cancelledTotal)}</span>
                            </div>

                            {/* Tooltip */}
                            <div
                                className="
                                    pointer-events-none opacity-0 translate-y-1
                                    group-hover:opacity-100 group-hover:translate-y-0
                                    transition
                                    absolute z-20 left-0 top-full mt-3
                                    w-[280px] rounded-xl border border-text-muted/25
                                    bg-surface shadow-lg p-3
                                "
                                role="tooltip"
                                aria-hidden="true"
                            >
                                <div className="text-xs text-text-muted mb-2">Breakdown (ช่วงเดียวกัน)</div>

                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-text-secondary">Cancelled</span>
                                        <span className="text-text-primary font-semibold">
                                            {summary.cancelledCount} ({fmtCurrency(summary.cancelledTotal)})
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-text-secondary">Refunded</span>
                                        <span className="text-text-primary font-semibold">
                                            {summary.refundedCount} ({fmtCurrency(summary.refundedTotal)})
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-text-secondary">Void</span>
                                        <span className="text-text-primary font-semibold">
                                            {summary.voidCount} ({fmtCurrency(summary.voidTotal)})
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-3 pt-2 border-t border-text-muted/20 text-xs text-text-muted">
                                    Owner tip: ถ้า % สูง → เช็ค “ทำไมยกเลิก” (ของหมด/รอนาน/พนักงานกดผิด)
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card title="บิลเฉลี่ย (AOV)">
                        <div className="text-2xl font-bold text-text-primary">{fmtCurrency(summary.aov)}</div>
                        <div className="text-sm text-text-muted mt-1">
                            {topSeller ? (
                                <>
                                    ดันด้วย: <span className="text-text-secondary">{topSeller.name}</span>
                                    {topSeller.variant_label ? (
                                        <span className="text-text-muted"> • {topSeller.variant_label}</span>
                                    ) : null}{" "}
                                    <span className="text-text-muted">({topSeller.qty})</span>
                                </>
                            ) : (
                                "ยังไม่มีเมนูขายดี"
                            )}
                        </div>
                    </Card>
                </div>

                {/* Main grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Chart/Calendar */}
                    <div className="lg:col-span-2">
                        <Card title="ยอดขาย (Chart / Calendar)">
                            <div className="flex items-center justify-between gap-3 mb-4">
                                <div className="text-xs text-text-muted">
                                    โหมด:{" "}
                                    <span className="text-text-secondary font-medium">
                                        {viewMode === "chart" ? "Chart" : "Calendar"}
                                    </span>
                                </div>

                                {/* ✅ Hide toggle on TODAY */}
                                {!isToday ? (
                                    <div className="rounded-lg bg-surface p-1 flex gap-1 border border-text-muted/25">
                                        <button
                                            onClick={() => setViewMode("chart")}
                                            aria-pressed={viewMode === "chart"}
                                            className={`px-3 py-1.5 text-sm rounded-md transition ${viewMode === "chart"
                                                ? "bg-accent text-background"
                                                : "text-text-secondary hover:bg-surface/60"
                                                }`}
                                        >
                                            Chart
                                        </button>

                                        <button
                                            onClick={() => setViewMode("calendar")}
                                            aria-pressed={viewMode === "calendar"}
                                            className={`px-3 py-1.5 text-sm rounded-md transition ${viewMode === "calendar"
                                                ? "bg-accent text-background"
                                                : "text-text-secondary hover:bg-surface/60"
                                                }`}
                                        >
                                            Calendar
                                        </button>
                                    </div>
                                ) : null}
                            </div>

                            {viewMode === "chart" ? (
                                <Chart orders={chartOrders} range={range} />
                            ) : (
                                <CalendarPNL orders={chartOrders} range={range} />
                            )}
                        </Card>
                    </div>

                    {/* Right side */}
                    <div className="space-y-4">
                        {/* Top 5 */}
                        <Card title="เมนูขายดี Top 5">
                            <div className="space-y-3">
                                {summary.topItems.length ? (
                                    summary.topItems.map((t, idx) => (
                                        <div
                                            key={`${t.name}__${t.variant_label ?? ""}`}
                                            className="flex items-center justify-between gap-4"
                                        >
                                            <div className="min-w-0">
                                                <div className="text-sm text-text-secondary font-medium truncate">
                                                    {idx + 1}. {t.name}
                                                    {t.variant_label ? (
                                                        <span className="text-text-muted"> • {t.variant_label}</span>
                                                    ) : null}
                                                </div>
                                                <div className="text-xs text-text-muted">ขายได้ {t.qty} แก้ว</div>
                                            </div>
                                            <div className="text-accent font-bold">{t.qty}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-text-muted">ไม่มีข้อมูล</div>
                                )}
                            </div>
                        </Card>

                        {/* Recent orders */}
                        <Card title="Recent Orders">
                            <div className="overflow-x-auto">
                                <table className="w-full table-auto text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-text-muted">
                                            <th className="pb-2">Order</th>
                                            <th className="pb-2">สถานะ</th>
                                            <th className="pb-2">เวลา</th>
                                            <th className="pb-2">จำนวน</th>
                                            <th className="pb-2 text-right">ยอดรวม</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentOrders.length ? (
                                            recentOrders.map((o) => {
                                                const totalQty = o.items.reduce(
                                                    (sum, it) => sum + (Number.isFinite(it.qty) ? it.qty : 0),
                                                    0
                                                );

                                                return (
                                                    <tr
                                                        key={o.id}
                                                        className="border-t border-text-muted/25 hover:bg-surface/40 transition"
                                                    >
                                                        <td className="py-2">
                                                            <Link
                                                                href={`/admin/orders/${o.id}`}
                                                                className="text-text-secondary hover:text-text-primary underline underline-offset-4 decoration-text-muted/30 hover:decoration-text-primary/60"
                                                                title="ดูรายละเอียดออเดอร์"
                                                            >
                                                                {o.id.slice(0, 8)}
                                                            </Link>
                                                        </td>

                                                        <td className="py-2">
                                                            <span className={statusBadge(o.status)}>
                                                                {statusLabelTH(o.status)}
                                                            </span>
                                                        </td>

                                                        <td className="py-2 text-text-secondary">{fmtDateTime(o.created_at)}</td>

                                                        <td className="py-2 text-text-secondary">
                                                            {totalQty || o.items.length}
                                                        </td>

                                                        <td className="py-2 text-right font-semibold text-text-primary">
                                                            {fmtCurrency(o.total)}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={5} className="py-4 text-center text-text-muted">
                                                    ไม่มีออเดอร์
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-3 pt-3 border-t border-text-muted/20 flex items-center justify-between text-xs text-text-muted">
                                <span>คลิก Order เพื่อดูรายละเอียด</span>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* counts debug (optional) */}
                {/* <pre className="text-xs text-text-muted">{JSON.stringify(counts, null, 2)}</pre> */}
            </div>
        </div>
    );
}
