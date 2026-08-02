"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReportsSalesTrendBucket } from "@/lib/reportsSales";
import { formatReportsMoney } from "@/lib/reportsSalesPresentation";

const TIME_ZONE = "Asia/Bangkok";
const WEEKDAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

function dateKey(value: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(value));
}

function monthLabel(monthKey: string): string {
    return new Intl.DateTimeFormat("th-TH", { timeZone: TIME_ZONE, month: "long", year: "numeric" })
        .format(new Date(`${monthKey}-01T00:00:00+07:00`));
}

function dayLabel(key: string): string {
    return new Intl.DateTimeFormat("th-TH", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" })
        .format(new Date(`${key}T00:00:00+07:00`));
}

function compactMoney(value: number): string {
    return `${value.toLocaleString("th-TH", { notation: "compact", maximumFractionDigits: 1 })}฿`;
}

function monthCells(monthKey: string): Array<{ key: string; day: number } | null> {
    const [year, month] = monthKey.split("-").map(Number);
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells: Array<{ key: string; day: number } | null> = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push({ key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, day });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

function heatClass(sales: number, maximum: number): string {
    if (sales <= 0) return "border-black/5 bg-[var(--background)] dark:border-white/10";
    const ratio = maximum > 0 ? sales / maximum : 0;
    if (ratio >= 0.75) return "border-[var(--accent)]/60 bg-[var(--accent)]/35";
    if (ratio >= 0.4) return "border-[var(--accent)]/40 bg-[var(--accent)]/20";
    return "border-[var(--accent)]/25 bg-[var(--accent)]/10";
}

export default function ReportsSalesCalendar({ trend }: { trend: ReportsSalesTrendBucket[] }) {
    const buckets = useMemo(() => new Map(trend.map((bucket) => [dateKey(bucket.start), bucket])), [trend]);
    const months = useMemo(() => [...new Set([...buckets.keys()].map((key) => key.slice(0, 7)))].sort(), [buckets]);
    const [selectedMonth, setSelectedMonth] = useState(() => months.at(-1) ?? "");
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const monthIndex = months.indexOf(selectedMonth);
    const visibleBuckets = [...buckets.entries()].filter(([key]) => key.startsWith(`${selectedMonth}-`));
    const maximum = Math.max(0, ...visibleBuckets.map(([, bucket]) => bucket.paidSales));
    const strongest = visibleBuckets.reduce<{ key: string; bucket: ReportsSalesTrendBucket } | null>((best, [key, bucket]) =>
        !best || bucket.paidSales > best.bucket.paidSales ? { key, bucket } : best, null);
    const selectedBucket = selectedDay ? buckets.get(selectedDay) ?? null : null;

    const moveMonth = (nextIndex: number) => {
        const nextMonth = months[nextIndex];
        if (!nextMonth) return;
        setSelectedMonth(nextMonth);
        setSelectedDay(null);
    };

    if (!selectedMonth) return null;

    return <div className="min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-3">
            <button type="button" aria-label="เดือนก่อนหน้า" disabled={monthIndex <= 0} onClick={() => moveMonth(monthIndex - 1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/10 text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/10"><ChevronLeft size={18}/></button>
            <div className="min-w-0 text-center"><h3 className="font-bold text-[var(--text-primary)]">ปฏิทินยอดขาย</h3><p className="text-sm text-[var(--text-muted)]">{monthLabel(selectedMonth)}</p></div>
            <button type="button" aria-label="เดือนถัดไป" disabled={monthIndex < 0 || monthIndex >= months.length - 1} onClick={() => moveMonth(monthIndex + 1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/10 text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/10"><ChevronRight size={18}/></button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--text-muted)] sm:gap-2 sm:text-xs">{WEEKDAYS.map((day) => <div key={day} className="py-1 font-semibold">{day}</div>)}</div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">{monthCells(selectedMonth).map((cell, index) => {
            if (!cell) return <div key={`blank-${index}`} aria-hidden="true"/>;
            const bucket = buckets.get(cell.key);
            const selected = selectedDay === cell.key;
            return <button type="button" key={cell.key} disabled={!bucket} aria-pressed={selected} aria-label={`${dayLabel(cell.key)}${bucket ? ` ยอดขาย ${formatReportsMoney(bucket.paidSales)}` : " ไม่มีข้อมูลในช่วงรายงาน"}`} onClick={() => setSelectedDay(cell.key)} className={`min-h-14 min-w-0 rounded-lg border p-1 text-left transition sm:min-h-20 sm:p-2 ${heatClass(bucket?.paidSales ?? 0, maximum)} ${selected ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)]" : ""} disabled:opacity-35`}>
                <span className="block text-xs font-semibold text-[var(--text-primary)]">{cell.day}</span>
                {bucket ? <><span className="mt-1 block truncate text-[9px] font-bold text-[var(--text-primary)] sm:text-xs">{compactMoney(bucket.paidSales)}</span><span className="hidden text-[10px] text-[var(--text-muted)] sm:block">{bucket.paidOrderCount.toLocaleString("th-TH")} ออเดอร์</span></> : null}
            </button>;
        })}</div>

        <div className="grid gap-3 rounded-xl bg-[var(--background)] p-4 sm:grid-cols-2">
            <div><p className="text-xs text-[var(--text-muted)]">ภาพรวมเดือนที่แสดง</p><p className="mt-1 font-semibold text-[var(--text-primary)]">มีข้อมูล {visibleBuckets.length.toLocaleString("th-TH")} วัน</p>{strongest ? <p className="mt-1 text-xs text-[var(--text-muted)]">ยอดขายรายวันสูงสุด {formatReportsMoney(strongest.bucket.paidSales)} · {dayLabel(strongest.key)}</p> : null}</div>
            <div><p className="text-xs text-[var(--text-muted)]">วันที่เลือก</p>{selectedBucket && selectedDay ? <><p className="mt-1 font-semibold text-[var(--text-primary)]">{dayLabel(selectedDay)} · {formatReportsMoney(selectedBucket.paidSales)}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{selectedBucket.paidOrderCount.toLocaleString("th-TH")} ออเดอร์ที่ชำระแล้ว</p></> : <p className="mt-1 text-sm text-[var(--text-muted)]">เลือกวันที่เพื่อดูรายละเอียด</p>}</div>
        </div>
        <p className="text-xs text-[var(--text-muted)]">สีเข้มขึ้นหมายถึงยอดขายรายวันสูงกว่าเมื่อเทียบกับวันอื่นในเดือนที่แสดง</p>
    </div>;
}
