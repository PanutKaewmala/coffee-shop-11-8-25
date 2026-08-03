"use client";

import { useEffect, useRef, useState } from "react";
import { getReportsBangkokDate, type ReportsSalesRangeQuery } from "@/lib/reportsSalesRangeQuery";

const shiftMonth = (date: string, offset: number) => {
    const [year, month] = date.split("-").map(Number);
    const value = new Date(Date.UTC(year, month - 1 + offset, 1));
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
};
const lastDay = (month: string) => {
    const [year, value] = month.split("-").map(Number);
    return `${month}-${String(new Date(Date.UTC(year, value, 0)).getUTCDate()).padStart(2, "0")}`;
};

export default function ReportsDateRangePicker({ open, applied, onClose, onApply }: {
    open: boolean;
    applied: ReportsSalesRangeQuery;
    onClose: () => void;
    onApply: (query: ReportsSalesRangeQuery) => void;
}) {
    const today = getReportsBangkokDate();
    const [start, setStart] = useState(applied.key === "custom" && !applied.allTime ? applied.start : today);
    const [end, setEnd] = useState(applied.key === "custom" && !applied.allTime ? applied.end : today);
    const dialogRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus());
        return () => window.removeEventListener("keydown", handler);
    }, [onClose, open]);
    if (!open) return null;
    const error = !start || !end ? "กรุณาเลือกวันเริ่มต้นและวันสิ้นสุด"
        : start > end ? "วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด"
            : end > today ? "ไม่สามารถเลือกวันในอนาคตได้"
                : (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1 > 3_653
                    ? "ช่วงกำหนดเองต้องไม่เกิน 10 ปี" : null;
    const chooseMonth = (offset: number) => {
        const month = shiftMonth(today, offset);
        setStart(`${month}-01`);
        setEnd(offset === 0 ? today : lastDay(month));
    };
    return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="reports-range-title" className="w-full max-w-md rounded-t-2xl bg-[var(--surface)] p-5 shadow-2xl sm:rounded-2xl">
            <h2 id="reports-range-title" className="text-lg font-bold text-[var(--text-primary)]">กำหนดช่วงเวลารายงาน</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-[var(--text-secondary)]">ช่วงเริ่มต้น<input type="date" value={start} max={end || today} onChange={(e) => setStart(e.target.value)} aria-describedby="reports-range-error" className="mt-2 min-h-11 w-full rounded-xl border border-black/15 bg-[var(--background)] px-3 dark:border-white/15"/></label>
                <label className="text-sm font-semibold text-[var(--text-secondary)]">ช่วงสิ้นสุด<input type="date" value={end} max={today} onChange={(e) => setEnd(e.target.value)} aria-describedby="reports-range-error" className="mt-2 min-h-11 w-full rounded-xl border border-black/15 bg-[var(--background)] px-3 dark:border-white/15"/></label>
            </div>
            <p id="reports-range-error" aria-live="polite" className="mt-2 min-h-5 text-sm text-red-600 dark:text-red-300">{error}</p>
            <div className="mt-3 grid grid-cols-3 gap-2" aria-label="ทางลัดช่วงเวลา">
                <button type="button" onClick={() => chooseMonth(0)} className="min-h-11 rounded-xl border border-black/10 text-sm font-semibold dark:border-white/15">เดือนนี้</button>
                <button type="button" onClick={() => chooseMonth(-1)} className="min-h-11 rounded-xl border border-black/10 text-sm font-semibold dark:border-white/15">เดือนก่อน</button>
                <button type="button" onClick={() => onApply({ key: "custom", start: null, end: null, allTime: true })} className="min-h-11 rounded-xl border border-black/10 px-1 text-sm font-semibold dark:border-white/15">ตั้งแต่เริ่มใช้</button>
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 font-semibold">ยกเลิก</button><button type="button" disabled={error !== null} onClick={() => onApply({ key: "custom", start, end, allTime: false })} className="min-h-11 rounded-xl bg-[var(--accent)] px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">ดูรายงาน</button></div>
        </div>
    </div>;
}
