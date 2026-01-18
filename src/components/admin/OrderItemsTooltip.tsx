"use client";

import React, { useEffect, useRef, useState } from "react";
import type { OrderItem } from "@/lib/types";

export default function OrderItemsTooltip({ items }: { items: OrderItem[] }) {
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [flip, setFlip] = useState(false);

    // ---- calculate item count ----
    const count = items?.reduce((sum, i) => sum + (i.qty || 0), 0) ?? 0;

    // ---- auto flip tooltip ----
    useEffect(() => {
        if (!items || items.length === 0) return;

        const checkPosition = () => {
            if (!tooltipRef.current) return;

            const rect = tooltipRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;

            setFlip(rect.bottom > viewportHeight - 10);
        };

        checkPosition();
        window.addEventListener("scroll", checkPosition);
        window.addEventListener("resize", checkPosition);

        return () => {
            window.removeEventListener("scroll", checkPosition);
            window.removeEventListener("resize", checkPosition);
        };
    }, [items]);

    // ---- if no items: show simple text ----
    if (!items || items.length === 0) {
        return <span>0 รายการ</span>;
    }

    return (
        <div ref={containerRef} className="relative group w-max mx-auto">
            {/* text */}
            <span className="cursor-default underline decoration-dotted">
                {count} รายการ
            </span>

            {/* tooltip */}
            <div
                ref={tooltipRef}
                className={`
                    absolute left-1/2 -translate-x-1/2
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
                <div className="mb-2 text-sm font-semibold opacity-90">
                    รายละเอียดรายการ
                </div>

                <div className="space-y-1 text-sm">
                    {items.map((it, idx) => (
                        <div
                            key={idx}
                            className="flex justify-between gap-4"
                        >
                            <span className="truncate">{it.name}</span>
                            <span className="whitespace-nowrap opacity-80">
                                ×{it.qty ?? 1} — {it.price ?? 0} บาท
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
