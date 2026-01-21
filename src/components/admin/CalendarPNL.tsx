// components/admin/CalendarPNL.tsx
"use client";

import React from "react";
import type { Order } from "@/lib/types";

type RangeType = "today" | "week" | "month" | "year" | "5year" | "all";

interface Props {
    orders: Order[];
    range: RangeType;
}

type Cell = { iso?: string; day?: number };

const RANGE_DAYS: Record<Exclude<RangeType, "all">, number> = {
    today: 1,
    week: 7,
    month: 30,
    year: 365,
    "5year": 5 * 365,
};

/* -------------------------
 * Helpers
 * ------------------------- */
function pad(n: number) {
    return String(n).padStart(2, "0");
}

/** Format a Date object as local YYYY-MM-DD */
function toLocalISO(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Hex -> r,g,b */
function hexToRGB(hex: string) {
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

/* -------------------------
 * Component
 * ------------------------- */
export default function CalendarPNL({ orders, range }: Props) {
    const [selectedMonth, setSelectedMonth] = React.useState<string>("");

    // 1) Build daily totals keyed by LOCAL date (YYYY-MM-DD)
    const dailyMapLocal = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const o of orders) {
            const d = new Date(o.created_at);
            const key = toLocalISO(d);
            m.set(key, (m.get(key) || 0) + (o.total ?? 0));
        }
        return m;
    }, [orders]);

    // 2) Build rangeDates
    const rangeDates = React.useMemo(() => {
        const s = new Set<string>();
        const today = new Date();
        const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        if (range === "all") {
            if (orders.length === 0) return s;
            let earliest: Date | null = null;
            for (const o of orders) {
                const d = new Date(o.created_at);
                const localDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                if (!earliest || localDay < earliest) earliest = localDay;
            }
            if (!earliest) return s;
            for (let d = new Date(earliest); d <= localToday; d.setDate(d.getDate() + 1)) {
                s.add(toLocalISO(new Date(d)));
            }
            return s;
        }

        // For 'year' and '5year' subtract calendar years (so startLocal matches backend)
        if (range === "year" || range === "5year") {
            const yearsBack = range === "year" ? 1 : 5;
            const start = new Date(localToday.getFullYear() - yearsBack, localToday.getMonth(), localToday.getDate());
            for (let d = new Date(start); d <= localToday; d.setDate(d.getDate() + 1)) {
                s.add(toLocalISO(new Date(d)));
            }
            return s;
        }

        // For other ranges (week, month, etc.) day-count from local midnight
        const days = RANGE_DAYS[range as Exclude<RangeType, "all">];
        const start = new Date(localToday.getFullYear(), localToday.getMonth(), localToday.getDate() - (days - 1));
        for (let d = new Date(start); d <= localToday; d.setDate(d.getDate() + 1)) {
            s.add(toLocalISO(new Date(d)));
        }
        return s;
    }, [orders, range]);

    // 3) Month list
    const monthList = React.useMemo(() => {
        if (rangeDates.size === 0) return [] as string[];
        const days = Array.from(rangeDates).sort((a, b) => a.localeCompare(b));
        const first = new Date(days[0]);
        const last = new Date(days[days.length - 1]);
        const months: string[] = [];
        const cur = new Date(first.getFullYear(), first.getMonth(), 1);
        const end = new Date(last.getFullYear(), last.getMonth(), 1);
        while (cur <= end) {
            months.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`);
            cur.setMonth(cur.getMonth() + 1);
        }
        return months;
    }, [rangeDates]);

    // 4) default selected month
    React.useEffect(() => {
        if (monthList.length) setSelectedMonth(monthList[monthList.length - 1]);
        else setSelectedMonth("");
    }, [monthList]);

    // 5) max value for intensity
    const maxVal = React.useMemo(() => {
        let m = 0;
        for (const day of rangeDates) {
            m = Math.max(m, Math.abs(dailyMapLocal.get(day) ?? 0));
        }
        return m;
    }, [dailyMapLocal, rangeDates]);

    // 6) build calendar weeks
    const calendarMatrix = React.useMemo(() => {
        if (!selectedMonth) return [] as Cell[][];
        const [yStr, mmStr] = selectedMonth.split("-");
        const y = Number(yStr);
        const mm = Number(mmStr);
        const first = new Date(y, mm - 1, 1);
        const startDow = first.getDay();
        const daysInMonth = new Date(y, mm, 0).getDate();

        const weeks: Cell[][] = [];
        let day = 1;

        const firstWeek: Cell[] = Array.from({ length: 7 }, () => ({} as Cell));
        for (let i = startDow; i < 7 && day <= daysInMonth; i++) {
            firstWeek[i] = { iso: toLocalISO(new Date(y, mm - 1, day)), day };
            day++;
        }
        weeks.push(firstWeek);

        while (day <= daysInMonth) {
            const w: Cell[] = Array.from({ length: 7 }, () => ({} as Cell));
            for (let i = 0; i < 7 && day <= daysInMonth; i++) {
                w[i] = { iso: toLocalISO(new Date(y, mm - 1, day)), day };
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
                    {range !== "week" && (
                        <div className="text-sm text-text-muted">ช่วง: {range.toUpperCase()}</div>
                    )}

                    {/* Dropdown hide when range = week/today */}
                    {range !== "week" && range !== "today" && monthList.length > 0 && (
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
                            const total = dailyMapLocal.get(iso) ?? 0;

                            const intensity = maxVal ? Math.min(Math.abs(total) / maxVal, 1) : 0;

                            // defaults (out of range)
                            let bg = "transparent";
                            let dayClass = "text-text-muted";
                            let amountClass = "text-transparent";

                            if (inRange) {
                                // วันในช่วง
                                dayClass = "text-text-secondary";

                                // ตัวเลข: ให้อ่านได้ใน light + dark
                                // - total > 0 -> primary (เพราะพื้นมี tint accent)
                                // - total = 0 -> muted (อย่าใช้ขาว)
                                // - total < 0 -> primary (พื้นแดง tint)
                                amountClass = total === 0 ? "text-text-muted" : "text-text-primary";

                                // background tint
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
