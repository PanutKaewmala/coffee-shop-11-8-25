// components/admin/CalendarPNL.tsx
"use client";

import React from "react";
import type { RevenueChartPoint } from "@/lib/types";

type RangeType = "today" | "week" | "month" | "year" | "5year" | "all";

type Props = {
    chart: RevenueChartPoint[];
    range: RangeType;
};

type Cell = { iso?: string; day?: number };

function pad(n: number) {
    return String(n).padStart(2, "0");
}

function toNumber(v: unknown): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
}

/** "YYYY-MM-DD" -> {y,m,d} (NO Date.parse / NO UTC surprise) */
function parseYMD(iso: string): { y: number; m: number; d: number } | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return { y, m: mo, d };
}

function monthKeyFromISO(iso: string): string | null {
    const p = parseYMD(iso);
    if (!p) return null;
    return `${p.y}-${pad(p.m)}`;
}

/** Hex -> "r, g, b" */
function hexToRGB(hex: string): string {
    const h = hex.replace("#", "").trim();
    if (h.length === 3) {
        const r = parseInt(h[0] + h[0], 16);
        const g = parseInt(h[1] + h[1], 16);
        const b = parseInt(h[2] + h[2], 16);
        return `${r}, ${g}, ${b}`;
    }
    const bigint = parseInt(h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
}

export default function CalendarPNL({ chart, range }: Props) {
    const [selectedMonth, setSelectedMonth] = React.useState<string>("");

    // 1) Build daily totals from API chart (label = YYYY-MM-DD)
    const dailyMap = React.useMemo(() => {
        const m = new Map<string, number>();
        const safe = Array.isArray(chart) ? chart : [];
        for (const p of safe) {
            const iso = String(p.label ?? "");
            const parsed = parseYMD(iso);
            if (!parsed) continue; // ignore non-date labels (เช่น today hourly "HH:00")
            m.set(iso, toNumber(p.value));
        }
        return m;
    }, [chart]);

    // 2) Range dates set = keys ของ dailyMap (เพราะ API เตรียมช่วงมาให้แล้ว)
    const rangeDates = React.useMemo(() => {
        return new Set(Array.from(dailyMap.keys()));
    }, [dailyMap]);

    // 3) Month list from rangeDates
    const monthList = React.useMemo(() => {
        const months = new Set<string>();
        for (const iso of rangeDates) {
            const mk = monthKeyFromISO(iso);
            if (mk) months.add(mk);
        }
        return Array.from(months).sort((a, b) => a.localeCompare(b));
    }, [rangeDates]);

    // 4) default selected month
    React.useEffect(() => {
        if (monthList.length) setSelectedMonth(monthList[monthList.length - 1]);
        else setSelectedMonth("");
    }, [monthList]);

    // 5) max value for intensity
    const maxVal = React.useMemo(() => {
        let m = 0;
        for (const iso of rangeDates) {
            m = Math.max(m, Math.abs(dailyMap.get(iso) ?? 0));
        }
        return m;
    }, [dailyMap, rangeDates]);

    // 6) build calendar weeks for selected month
    const calendarMatrix = React.useMemo(() => {
        if (!selectedMonth) return [] as Cell[][];

        const mm = /^(\d{4})-(\d{2})$/.exec(selectedMonth);
        if (!mm) return [] as Cell[][];

        const y = Number(mm[1]);
        const mth = Number(mm[2]); // 1..12
        if (!Number.isFinite(y) || !Number.isFinite(mth)) return [] as Cell[][];

        const first = new Date(y, mth - 1, 1);
        const startDow = first.getDay();
        const daysInMonth = new Date(y, mth, 0).getDate();

        const weeks: Cell[][] = [];
        let day = 1;

        const firstWeek: Cell[] = Array.from({ length: 7 }, () => ({}));
        for (let i = startDow; i < 7 && day <= daysInMonth; i++) {
            const iso = `${y}-${pad(mth)}-${pad(day)}`;
            firstWeek[i] = { iso, day };
            day++;
        }
        weeks.push(firstWeek);

        while (day <= daysInMonth) {
            const w: Cell[] = Array.from({ length: 7 }, () => ({}));
            for (let i = 0; i < 7 && day <= daysInMonth; i++) {
                const iso = `${y}-${pad(mth)}-${pad(day)}`;
                w[i] = { iso, day };
                day++;
            }
            weeks.push(w);
        }

        return weeks;
    }, [selectedMonth]);

    // 7) theme accent
    const accentHex =
        typeof window !== "undefined"
            ? getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#d4a574"
            : "#d4a574";
    const accentRGB = hexToRGB(accentHex);

    const formatMoney = (v: number) => `${v.toLocaleString("th-TH")} ฿`;

    return (
        <div className="w-full bg-surface p-4 rounded-xl border border-text-muted/25 shadow">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">ปฏิทินยอดขายรายวัน</h2>

                <div className="flex items-center gap-3">
                    <div className="text-sm text-text-muted">ช่วง: {range.toUpperCase()}</div>

                    {/* Dropdown hide when today (เพราะ today chart = hourly ไม่มีเดือนให้เลือก) */}
                    {range !== "today" && monthList.length > 0 && (
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-background border border-text-muted/25 text-text-secondary px-3 py-1 rounded-md outline-none focus:ring-2 focus:ring-accent/40"
                        >
                            {monthList.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 mb-3 text-xs text-text-muted">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-center font-medium">
                        {d}
                    </div>
                ))}
            </div>

            {/* Calendar body */}
            <div className="space-y-2">
                {calendarMatrix.map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 gap-2">
                        {week.map((cell, ci) => {
                            if (!cell.iso) return <div key={ci} className="h-[75px] rounded-lg" />;

                            const iso = cell.iso;
                            const inRange = rangeDates.has(iso);
                            const total = dailyMap.get(iso) ?? 0;

                            const intensity = maxVal ? Math.min(Math.abs(total) / maxVal, 1) : 0;

                            let bg = "transparent";
                            let dayClass = "text-text-muted";
                            let amountClass = "text-transparent";

                            if (inRange) {
                                dayClass = "text-text-secondary";
                                amountClass = total === 0 ? "text-text-muted" : "text-text-primary";

                                if (total > 0) {
                                    bg = `rgba(${accentRGB}, ${0.10 + intensity * 0.55})`;
                                } else if (total < 0) {
                                    bg = `rgba(220, 38, 38, ${0.10 + intensity * 0.55})`;
                                } else {
                                    bg = `rgba(${accentRGB}, 0.05)`;
                                }
                            }

                            return (
                                <div
                                    key={ci}
                                    className="h-[75px] rounded-lg border border-text-muted/25 p-3 flex flex-col justify-between"
                                    style={{ background: bg }}
                                >
                                    <div className={`text-[12px] ${dayClass}`}>{cell.day}</div>
                                    <div className={`text-[12px] font-semibold text-right ${amountClass}`}>
                                        {inRange ? formatMoney(total) : ""}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
