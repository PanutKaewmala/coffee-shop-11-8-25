// components/admin/OrderItemsTooltip.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import type { OrderItem } from "@/lib/types";

type Props = {
    items: OrderItem[];
    children?: React.ReactNode; // ✅ new: wrapper trigger
    label?: string; // ✅ optional fallback label
    align?: "left" | "right"; // ✅ optional: tooltip align
};

export default function OrderItemsTooltip({
    items,
    children,
    label,
    align = "left",
}: Props) {
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const [flip, setFlip] = useState(false);

    /* =========================
       Helpers
    ========================= */

    const count = items?.reduce((sum, i) => sum + (i.qty || 0), 0) ?? 0;

    function getSubLabel(it: OrderItem): string | null {
        if (it.variant_label && it.variant_label.trim()) return it.variant_label.trim();
        if (it.size && it.size.trim()) return it.size.trim();
        return null;
    }

    /* =========================
       Auto flip tooltip (viewport safe)
    ========================= */
    useEffect(() => {
        if (!items || items.length === 0) return;

        const checkPosition = () => {
            if (!tooltipRef.current) return;

            const rect = tooltipRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;

            setFlip(rect.bottom > viewportHeight - 8);
        };

        checkPosition();
        window.addEventListener("scroll", checkPosition);
        window.addEventListener("resize", checkPosition);

        return () => {
            window.removeEventListener("scroll", checkPosition);
            window.removeEventListener("resize", checkPosition);
        };
    }, [items]);

    /* =========================
       Empty state
    ========================= */
    if (!items || items.length === 0) {
        // ถ้ามี children ก็ยังโชว์ children ได้ (แต่ไม่มี tooltip)
        return children ? <>{children}</> : <span className="block text-left">0 รายการ</span>;
    }

    const trigger = children ? (
        <>{children}</>
    ) : (
        <span className="inline-block cursor-default underline decoration-dotted text-left">
            {label ?? `${count} รายการ`}
        </span>
    );

    const alignClass = align === "right" ? "right-0" : "left-0";

    return (
        <div className="relative group inline-block text-left">
            {/* trigger */}
            {trigger}

            {/* tooltip */}
            <div
                ref={tooltipRef}
                className={`
          absolute ${alignClass}
          w-[260px]
          opacity-0 group-hover:opacity-100
          transform transition-all duration-200
          pointer-events-none z-50

          ${flip ? "bottom-full mb-2" : "top-full mt-2"}

          bg-[rgba(30,30,30,0.85)]
          backdrop-blur-xl
          border border-white/10
          shadow-xl shadow-black/40
          rounded-xl p-4 text-white
        `}
            >
                <div className="mb-2 text-sm font-semibold opacity-90">รายละเอียดรายการ</div>

                <div className="space-y-1 text-sm">
                    {items.map((it, idx) => {
                        const sub = getSubLabel(it);

                        return (
                            <div key={idx} className="flex justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="truncate">{it.name}</div>
                                    {sub && <div className="text-xs opacity-70 truncate">{sub}</div>}
                                </div>

                                <span className="whitespace-nowrap opacity-80">
                                    ×{it.qty ?? 1} — {it.price ?? 0} บาท
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
