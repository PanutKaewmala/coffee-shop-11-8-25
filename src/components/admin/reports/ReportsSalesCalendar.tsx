"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReportsSalesCalendar as CalendarData } from "@/lib/reportsSales";
import {
    formatReportsMoney,
    getDefaultReportsCalendarDay,
    getDefaultReportsCalendarMonth,
    getReportsCalendarMonthSummary,
} from "@/lib/reportsSalesPresentation";

const weekDays = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const monthFormatter = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
const dayFormatter = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const keyDate = (key: string) => new Date(`${key}T00:00:00.000Z`);
const monthKey = (date: string) => date.slice(0, 7);
const daysInMonth = (month: string) => {
    const [year, monthNumber] = month.split("-").map(Number);
    return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
};
const shiftMonth = (month: string, amount: number) => {
    const [year, monthNumber] = month.split("-").map(Number);
    return new Date(Date.UTC(year, monthNumber - 1 + amount, 1)).toISOString().slice(0, 7);
};
const bangkokToday = () => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

function compactMoney(value: number) {
    if (value === 0) return "0฿";
    return `${value.toLocaleString("th-TH", { notation: "compact", maximumFractionDigits: 1 })}฿`;
}

export default function ReportsSalesCalendar({ calendar }: { calendar: CalendarData }) {
    const today = bangkokToday();
    const [selectedMonth, setSelectedMonth] = useState(() => getDefaultReportsCalendarMonth(calendar));
    const [selectedDate, setSelectedDate] = useState<string | null>(() => getDefaultReportsCalendarDay(calendar.days, getDefaultReportsCalendarMonth(calendar), today));

    const monthDays = useMemo(() => calendar.days.filter((day) => monthKey(day.date) === selectedMonth), [calendar.days, selectedMonth]);
    const byDate = useMemo(() => new Map(monthDays.map((day) => [day.date, day])), [monthDays]);
    const summary = useMemo(() => getReportsCalendarMonthSummary(monthDays), [monthDays]);
    const selectedDay = selectedDate ? byDate.get(selectedDate) ?? null : null;
    const firstMonth = monthKey(calendar.days[0]?.date ?? selectedMonth);
    const lastMonth = monthKey(calendar.days.at(-1)?.date ?? selectedMonth);
    const firstWeekday = new Date(`${selectedMonth}-01T00:00:00.000Z`).getUTCDay();
    const cells = Array.from({ length: firstWeekday + daysInMonth(selectedMonth) }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);
    const maxSales = Math.max(0, ...monthDays.map((day) => day.paidSales));

    const changeMonth = (amount: number) => {
        const next = shiftMonth(selectedMonth, amount);
        setSelectedMonth(next);
        setSelectedDate(getDefaultReportsCalendarDay(calendar.days, next, today));
    };

    return <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
            <button type="button" aria-label="เดือนก่อนหน้า" disabled={selectedMonth <= firstMonth} onClick={() => changeMonth(-1)} className="rounded-xl border border-black/10 p-2 text-[var(--text-secondary)] disabled:opacity-30 dark:border-white/10"><ChevronLeft/></button>
            <h3 className="text-lg font-bold text-[var(--text-primary)]">{monthFormatter.format(keyDate(`${selectedMonth}-01`))}</h3>
            <button type="button" aria-label="เดือนถัดไป" disabled={selectedMonth >= lastMonth} onClick={() => changeMonth(1)} className="rounded-xl border border-black/10 p-2 text-[var(--text-secondary)] disabled:opacity-30 dark:border-white/10"><ChevronRight/></button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[var(--text-muted)]">{weekDays.map((day) => <div key={day} className="py-1">{day}</div>)}</div>
        <div className="grid grid-cols-7 gap-1" aria-label="ปฏิทินยอดขายรายวัน">
            {cells.map((number, index) => {
                if (number === null) return <div key={`blank-${index}`} aria-hidden="true"/>;
                const date = `${selectedMonth}-${String(number).padStart(2, "0")}`;
                const day = byDate.get(date);
                const isToday = date === today;
                const selected = date === selectedDate;
                const intensity = day && maxSales > 0 ? day.paidSales / maxSales : 0;
                return <button key={date} type="button" disabled={!day} aria-pressed={selected} aria-label={`${date}${isToday ? " วันนี้" : ""}`} onClick={() => setSelectedDate(date)} style={day && day.paidSales > 0 ? { backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(8 + intensity * 24)}%, var(--surface))` } : undefined} className={`relative min-h-20 rounded-lg border p-1 text-left transition sm:min-h-24 sm:p-2 ${selected ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/35" : isToday ? "border-[var(--accent)] border-dashed" : "border-black/5 dark:border-white/10"} ${day ? "text-[var(--text-primary)]" : "cursor-default opacity-25"}`}>
                    <span className="block font-bold">{number}{isToday ? <span className="ml-1 hidden text-[10px] text-[var(--accent)] sm:inline">วันนี้</span> : null}</span>
                    {day ? <><span className={`mt-2 block text-[11px] font-semibold sm:hidden ${day.paidSales === 0 ? "text-[var(--text-muted)]" : ""}`}>{compactMoney(day.paidSales)}</span><span className={`mt-2 hidden text-xs font-semibold sm:block ${day.paidSales === 0 ? "text-[var(--text-muted)]" : ""}`}>{formatReportsMoney(day.paidSales)}</span><span className="mt-1 block text-[10px] text-[var(--text-muted)] sm:text-xs"><span className="sm:hidden">{day.paidOrderCount.toLocaleString("th-TH")}</span><span className="hidden sm:inline">{day.paidOrderCount.toLocaleString("th-TH")} ออเดอร์</span></span></> : null}
                </button>;
            })}
        </div>

        <div className="grid gap-3 rounded-xl bg-[var(--background)] p-4 sm:grid-cols-3">
            <div><p className="text-xs text-[var(--text-muted)]">ยอดขายรวมเดือนนี้ในช่วงที่เลือก</p><p className="mt-1 font-bold text-[var(--text-primary)]">{formatReportsMoney(summary.paidSales)}</p></div>
            <div><p className="text-xs text-[var(--text-muted)]">วันที่มียอดขาย</p><p className="mt-1 font-bold text-[var(--text-primary)]">{summary.paidDayCount.toLocaleString("th-TH")} วัน</p></div>
            <div><p className="text-xs text-[var(--text-muted)]">วันที่ยอดขายสูงสุด</p><p className="mt-1 font-bold text-[var(--text-primary)]">{summary.peakDay ? dayFormatter.format(keyDate(summary.peakDay.date)) : "—"}</p></div>
        </div>

        {selectedDay ? <div className="rounded-xl border border-black/10 p-4 dark:border-white/10"><h4 className="font-bold text-[var(--text-primary)]">{dayFormatter.format(keyDate(selectedDay.date))}{selectedDay.date === today ? " · วันนี้" : ""}</h4>{selectedDay.paidOrderCount === 0 ? <p className="mt-3 text-sm text-[var(--text-muted)]">ยังไม่มียอดขายที่ชำระแล้วในวันนี้</p> : <dl className="mt-3 grid gap-3 sm:grid-cols-3"><div><dt className="text-xs text-[var(--text-muted)]">ยอดขายที่ชำระแล้ว</dt><dd className="font-bold text-[var(--text-primary)]">{formatReportsMoney(selectedDay.paidSales)}</dd></div><div><dt className="text-xs text-[var(--text-muted)]">ออเดอร์ที่ชำระแล้ว</dt><dd className="font-bold text-[var(--text-primary)]">{selectedDay.paidOrderCount.toLocaleString("th-TH")} ออเดอร์</dd></div><div><dt className="text-xs text-[var(--text-muted)]">เฉลี่ยต่อออเดอร์</dt><dd className="font-bold text-[var(--text-primary)]">{formatReportsMoney(selectedDay.averagePaidOrderValue)}</dd></div></dl>}</div> : null}
    </div>;
}
