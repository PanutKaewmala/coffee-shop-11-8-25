"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface MenuCategoryFilterProps {
    categories: string[];
    categoryFilter: string;
    setCategoryFilter: (v: string) => void;
    onAddCategory: () => void;
}

export default function MenuCategoryFilter({
    categories,
    categoryFilter,
    setCategoryFilter,
    onAddCategory,
}: MenuCategoryFilterProps) {
    const visible = useMemo(() => categories.slice(0, 6), [categories]);
    const hidden = useMemo(() => categories.slice(6), [categories]);

    const [moreOpen, setMoreOpen] = useState(false);
    const [moreQuery, setMoreQuery] = useState("");
    const moreRef = useRef<HTMLDivElement | null>(null);

    const filteredHidden = useMemo(
        () =>
            hidden.filter((c) =>
                c.toLowerCase().includes(moreQuery.toLowerCase())
            ),
        [hidden, moreQuery]
    );

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
                setMoreOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const pillBase =
        "px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors";

    // ✅ Active: light -> text-primary, dark -> background (ตามที่คุณอยากได้)
    const pillClass = (active: boolean) =>
        active
            ? `${pillBase} bg-[var(--accent)] text-[var(--text-primary)] dark:text-[var(--background)]`
            : `${pillBase} bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--background)]`;

    return (
        <div className="mb-4">
            <p className="text-sm text-[var(--text-muted)] mb-2">หมวดหมู่</p>

            <div className="flex items-center justify-between gap-4">
                {/* LEFT LIST */}
                <div className="flex-1 min-w-0">
                    <div className="relative">
                        <div className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none gradient-left" />

                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-2">
                            <button
                                onClick={() => setCategoryFilter("all")}
                                className={pillClass(categoryFilter === "all")}
                            >
                                ทั้งหมด
                            </button>

                            {visible.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setCategoryFilter(c)}
                                    className={pillClass(categoryFilter === c)}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>

                        <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none gradient-right" />
                    </div>
                </div>

                {/* ADD */}
                <Button variant="outline" onClick={onAddCategory}>
                    + Add
                </Button>

                {/* MORE — ONLY IF hidden > 0 */}
                {hidden.length > 0 && (
                    <div className="relative" ref={moreRef}>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setMoreOpen(!moreOpen);
                                setMoreQuery("");
                            }}
                        >
                            More ▾
                        </Button>

                        {moreOpen && (
                            <div className="absolute right-0 mt-2 w-64 bg-[var(--surface)] border rounded-lg shadow-lg z-50 p-3">
                                <input
                                    className="w-full p-2 rounded-md mb-2 bg-background border border-text-muted/40"
                                    placeholder="ค้นหาหมวดหมู่..."
                                    value={moreQuery}
                                    onChange={(e) => setMoreQuery(e.target.value)}
                                />

                                <div className="max-h-56 overflow-auto">
                                    {filteredHidden.length === 0 ? (
                                        <div className="text-sm text-[var(--text-secondary)] p-2">
                                            ไม่พบหมวดหมู่
                                        </div>
                                    ) : (
                                        filteredHidden.map((c) => (
                                            <div
                                                key={c}
                                                className="p-2 hover:bg-[var(--background)] rounded"
                                            >
                                                <button
                                                    className="text-sm text-left w-full"
                                                    onClick={() => {
                                                        setCategoryFilter(c);
                                                        setMoreOpen(false);
                                                    }}
                                                >
                                                    {c}
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
