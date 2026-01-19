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

type Kind = "muted" | "ok" | "warn" | "bad";

/**
 * Theme-safe badge
 * - Light: pastel bg + dark text
 * - Dark: soft glow + light text
 */
function badgeClass(kind: Kind) {
    const base =
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums border";

    switch (kind) {
        case "bad":
            return `${base}
              bg-red-500/12 text-red-700 border-red-500/30
              dark:bg-red-500/15 dark:text-red-300`;

        case "warn":
            return `${base}
              bg-yellow-500/15 text-yellow-800 border-yellow-500/30
              dark:bg-yellow-500/15 dark:text-yellow-300`;

        case "ok":
            return `${base}
              bg-emerald-500/12 text-emerald-700 border-emerald-500/30
              dark:bg-emerald-500/15 dark:text-emerald-300`;

        default:
            return `${base}
              bg-surface text-text-muted border-text-muted/25`;
    }
}

export default function DaysLeftBadge({ daysLeft, abnormal }: Props) {
    if (daysLeft === null) {
        return (
            <span className={badgeClass("muted")}>
                ไม่มีการใช้
                {abnormal ? (
                    <span className="ml-1 opacity-70" title="ใช้วันนี้ผิดปกติ">
                        ⚠️
                    </span>
                ) : null}
            </span>
        );
    }

    // owner-happy thresholds
    const kind: Kind =
        daysLeft <= 3 ? "bad" : daysLeft <= 7 ? "warn" : "ok";

    return (
        <span className={badgeClass(kind)}>
            {fmtDays(daysLeft)}
            {abnormal ? (
                <span className="ml-1 opacity-80" title="ใช้วันนี้ผิดปกติ">
                    ⚠️
                </span>
            ) : null}
        </span>
    );
}
