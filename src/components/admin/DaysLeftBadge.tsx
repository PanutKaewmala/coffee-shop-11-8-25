// components/admin/DaysLeftBadge.tsx
"use client";

import React from "react";

type Props = {
    daysLeft: number | null;
    abnormal?: boolean;
};

function fmtDays(d: number): string {
    if (!Number.isFinite(d)) return "-";
    if (d <= 0.9) return "วันนี้";
    if (d <= 1.9) return "พรุ่งนี้";
    return `${Math.ceil(d)} วัน`;
}

function badgeClass(kind: "muted" | "ok" | "warn" | "bad") {
    const base =
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ring-1";
    if (kind === "bad") return `${base} bg-red-500/10 text-red-300 ring-red-500/30`;
    if (kind === "warn") return `${base} bg-yellow-500/10 text-yellow-200 ring-yellow-500/30`;
    if (kind === "ok") return `${base} bg-emerald-500/10 text-emerald-200 ring-emerald-500/30`;
    return `${base} bg-white/5 text-white/60 ring-white/10`;
}

export default function DaysLeftBadge({ daysLeft, abnormal }: Props) {
    if (daysLeft === null) {
        return (
            <span className={badgeClass("muted")}>
                ไม่มีการใช้ {abnormal ? <span title="ใช้ผิดปกติ">⚠️</span> : null}
            </span>
        );
    }

    // ✅ owner-happy thresholds:
    // <=3 วัน = ต้องสั่งด่วน (แดง)
    // <=7 วัน = ใกล้หมด (เหลือง)
    // >7 วัน = ปกติ (เขียว)
    const kind = daysLeft <= 3 ? "bad" : daysLeft <= 7 ? "warn" : "ok";

    return (
        <span className={badgeClass(kind)}>
            {fmtDays(daysLeft)} {abnormal ? <span title="ใช้วันนี้ผิดปกติ">⚠️</span> : null}
        </span>
    );
}
