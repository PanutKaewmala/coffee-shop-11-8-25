// components/admin/Chart.tsx
"use client";

import React from "react";
import type { RevenueChartPoint } from "@/lib/types";
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

type Props = {
    chart: RevenueChartPoint[];
    range: RangeType;
};

type ChartRow = {
    date: string;
    value: number;
};

function toNumber(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

export default function Chart({ chart, range }: Props) {
    const data: ChartRow[] = React.useMemo(() => {
        const safe = Array.isArray(chart) ? chart : [];
        return safe
            .map((p) => ({
                date: String(p.label ?? ""),
                value: toNumber(p.value),
            }))
            .filter((x) => x.date.length > 0);
    }, [chart]);

    return (
        <div className="w-full bg-surface p-4 rounded-xl border border-gray-700/40 shadow">
            <h2 className="text-lg font-semibold text-white mb-4">
                {range === "today" && "ยอดขายรายชั่วโมง"}
                {range === "week" && "ยอดขายรายวัน (สัปดาห์)"}
                {range === "month" && "ยอดขายรายวัน (เดือน)"}
                {range === "year" && "ยอดขายรายวัน (ปี)"} {/* ✅ ให้ตรงกับ API ตอนนี้ */}
                {range === "5year" && "ยอดขายรายวัน (5 ปี)"} {/* ✅ ให้ตรงกับ API ตอนนี้ */}
                {range === "all" && "ยอดขายรายวัน (ทั้งหมด)"} {/* ✅ ให้ตรงกับ API ตอนนี้ */}
            </h2>

            <div className="w-full h-[280px]">
                <ResponsiveContainer>
                    <LineChart data={data} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                        <XAxis dataKey="date" stroke="#aaa" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#aaa" tick={{ fontSize: 11 }} />
                        <Tooltip
                            contentStyle={{ background: "#1f1f1f", border: "1px solid #555" }}
                            labelStyle={{ color: "#fff" }}
                        />
                        <Line type="monotone" dataKey="value" stroke="#d4a574" strokeWidth={2} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
