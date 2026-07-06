// components/admin/Chart.tsx
"use client";

import React from "react";
import type { Order } from "@/lib/types";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";

type RangeType = "today" | "week" | "month" | "year" | "5year" | "all";

interface Props {
    orders: Order[];
    range: RangeType;
}

function pad(n: number) {
    return String(n).padStart(2, "0");
}

function toLocalISO(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getWeekNumber(d: Date) {
    const oneJan = new Date(d.getFullYear(), 0, 1);
    const diff = d.getTime() - oneJan.getTime();
    return Math.ceil((diff / 86400000 + oneJan.getDay() + 1) / 7);
}

export default function Chart({ orders, range }: Props) {
    // -------- daily map --------
    const dailyMapLocal = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const o of orders) {
            const d = new Date(o.created_at);
            const key = toLocalISO(d);
            m.set(key, (m.get(key) || 0) + (o.total ?? 0));
        }
        return m;
    }, [orders]);

    // -------- chart data --------
    const data = React.useMemo(() => {

        /* ===================================
         * TODAY → hourly
         * =================================== */
        if (range === "today") {
            const hourly = new Map<number, number>();
            orders.forEach(o => {
                const d = new Date(o.created_at);
                const h = d.getHours();
                hourly.set(h, (hourly.get(h) || 0) + (o.total ?? 0));
            });

            return Array.from({ length: 24 }, (_, h) => ({
                date: `${String(h).padStart(2, "0")}:00`,
                value: hourly.get(h) || 0,
            }));
        }


        /* ===================================
         * WEEK → daily (7 วันย้อนหลัง)
         * =================================== */
        if (range === "week") {
            const today = new Date();
            const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

            const arr = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(localToday);
                d.setDate(localToday.getDate() - i);
                const iso = toLocalISO(d);

                arr.push({
                    date: iso,
                    value: dailyMapLocal.get(iso) ?? 0,
                });
            }
            return arr;
        }


        /* ===================================
         * MONTH → daily (เต็มเดือน)
         * =================================== */
        if (range === "month") {
            const today = new Date();
            const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

            const arr = [];

            for (let i = 29; i >= 0; i--) {
                const d = new Date(localToday);
                d.setDate(localToday.getDate() - i);
                const iso = toLocalISO(d);

                arr.push({
                    date: iso,
                    value: dailyMapLocal.get(iso) ?? 0,
                });
            }

            return arr;
        }

        /* ===================================
         * YEAR → weekly
         * =================================== */
        if (range === "year") {
            const weekly = new Map<number, number>();

            orders.forEach(o => {
                const d = new Date(o.created_at);
                const w = getWeekNumber(d);
                weekly.set(w, (weekly.get(w) || 0) + (o.total ?? 0));
            });

            return [...weekly.entries()].map(([w, total]) => ({
                date: `W${w}`,
                value: total,
            }));
        }


        /* ===================================
         * 5YEAR → monthly
         * =================================== */
        if (range === "5year") {
            const monthly = new Map<string, number>();

            orders.forEach(o => {
                const d = new Date(o.created_at);
                const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
                monthly.set(ym, (monthly.get(ym) || 0) + (o.total ?? 0));
            });

            return [...monthly.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([ym, total]) => ({
                    date: ym,
                    value: total,
                }));
        }


        /* ===================================
         * ALL → monthly
         * =================================== */
        if (range === "all") {
            const monthly = new Map<string, number>();

            orders.forEach(o => {
                const d = new Date(o.created_at);
                const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
                monthly.set(ym, (monthly.get(ym) || 0) + (o.total ?? 0));
            });

            return [...monthly.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([ym, total]) => ({
                    date: ym,
                    value: total,
                }));
        }


        /* ===================================
         * FALLBACK (should not happen)
         * =================================== */
        return [];

    }, [orders, range, dailyMapLocal]);


    // -------- render --------
    return (
        <div className="w-full min-w-0 overflow-hidden bg-surface p-3 sm:p-4 rounded-xl border border-gray-700/40 shadow">
            <h2 className="text-lg font-semibold text-white mb-4">
                {range === "today" && "ยอดขายรายชั่วโมง"}
                {range === "week" && "ยอดขายรายวัน (สัปดาห์)"}
                {range === "month" && "ยอดขายรายวัน (เดือน)"}
                {range === "year" && "ยอดขายรายสัปดาห์"}
                {range === "5year" && "ยอดขายรายเดือน (5 ปี)"}
                {range === "all" && "ยอดขายรายเดือน (ทั้งหมด)"}
            </h2>

            <div className="w-full min-w-0 h-[240px] min-h-[240px] sm:h-[280px] sm:min-h-[280px]">
                <ResponsiveContainer
                    width="100%"
                    height="100%"
                    minWidth={0}
                    minHeight={240}
                    initialDimension={{ width: 240, height: 240 }}
                >
                    <LineChart data={data} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                        <XAxis dataKey="date" stroke="#aaa" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#aaa" tick={{ fontSize: 11 }} />
                        <Tooltip
                            contentStyle={{ background: "#1f1f1f", border: "1px solid #555" }}
                            labelStyle={{ color: "#fff" }}
                        />
                        <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#d4a574"
                            strokeWidth={2}
                            dot={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
