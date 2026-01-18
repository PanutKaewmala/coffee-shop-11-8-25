"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface MenuServeFilterProps {
    serveTypes: string[];
    serveFilter: string;
    setServeFilter: (v: string) => void;
    onAddServeType: () => void;
}

function normalizeLabel(s: string) {
    return s.trim();
}

export default function MenuServeFilter({
    serveTypes,
    serveFilter,
    setServeFilter,
    onAddServeType,
}: MenuServeFilterProps) {
    /* -----------------------------------
       NORMALIZE / DEDUPE / SORT
       ----------------------------------- */
    const normalizedServeTypes = useMemo(() => {
        const cleaned = (serveTypes ?? [])
            .map(normalizeLabel)
            .filter(Boolean);

        // dedupe by lowercase
        const map = new Map<string, string>();
        for (const s of cleaned) {
            const key = s.toLowerCase();
            if (!map.has(key)) map.set(key, s);
        }

        return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
    }, [serveTypes]);

    /* -----------------------------------
       Ensure current filter still exists
       ----------------------------------- */
    useEffect(() => {
        if (serveFilter === "all") return;
        const exists = normalizedServeTypes.some(
            (s) => s.toLowerCase() === serveFilter.toLowerCase()
        );
        if (!exists) setServeFilter("all");
    }, [serveFilter, normalizedServeTypes, setServeFilter]);

    /* -----------------------------------
       SPLIT → visible / hidden
       ----------------------------------- */
    const visible = useMemo(() => normalizedServeTypes.slice(0, 6), [normalizedServeTypes]);
    const hidden = useMemo(() => normalizedServeTypes.slice(6), [normalizedServeTypes]);

    /* -----------------------------------
       MORE dropdown
       ----------------------------------- */
    const [moreOpen, setMoreOpen] = useState(false);
    const [moreQuery, setMoreQuery] = useState("");
    const moreRef = useRef<HTMLDivElement | null>(null);

    const filteredHidden = useMemo(() => {
        const q = moreQuery.trim().toLowerCase();
        if (!q) return hidden;
        return hidden.filter((s) => s.toLowerCase().includes(q));
    }, [hidden, moreQuery]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
                setMoreOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const isActive = (label: string) =>
        serveFilter !== "all" && label.toLowerCase() === serveFilter.toLowerCase();

    /* -----------------------------------
       UI
       ----------------------------------- */
    return (
        <div className="mb-4">
            <p className="text-sm text-[var(--text-muted)] mb-2">รูปแบบเสิร์ฟ</p>

            <div className="flex items-center justify-between gap-4">
                {/* LEFT — visible serve buttons */}
                <div className="flex-1 min-w-0">
                    <div className="relative">
                        <div className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none gradient-left" />

                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-2">
                            {/* ALL */}
                            <button
                                onClick={() => setServeFilter("all")}
                                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${serveFilter === "all"
                                        ? "bg-[var(--accent)] text-black"
                                        : "bg-[var(--surface)] text-[var(--text-secondary)]"
                                    }`}
                            >
                                ทั้งหมด
                            </button>

                            {/* Visible serve types */}
                            {visible.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setServeFilter(s)}
                                    className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${isActive(s)
                                            ? "bg-[var(--accent)] text-black"
                                            : "bg-[var(--surface)] text-[var(--text-secondary)]"
                                        }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>

                        <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none gradient-right" />
                    </div>
                </div>

                {/* ADD NEW SERVE TYPE BUTTON */}
                <Button
                    variant="outline"
                    onClick={() => {
                        setMoreOpen(false);
                        setMoreQuery("");
                        onAddServeType();
                    }}
                >
                    + Add
                </Button>

                {/* MORE BUTTON → show only if hidden exists */}
                {hidden.length > 0 && (
                    <div className="relative" ref={moreRef}>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setMoreOpen((v) => !v);
                                setMoreQuery("");
                            }}
                        >
                            More ▾
                        </Button>

                        {moreOpen && (
                            <div className="absolute right-0 mt-2 w-64 bg-[var(--surface)] border rounded-lg shadow-lg z-50 p-3">
                                <input
                                    className="w-full p-2 rounded-md mb-2 bg-background border border-text-muted/40"
                                    placeholder="ค้นหาเสิร์ฟ..."
                                    value={moreQuery}
                                    onChange={(e) => setMoreQuery(e.target.value)}
                                />

                                <div className="max-h-56 overflow-auto">
                                    {filteredHidden.length === 0 ? (
                                        <div className="text-sm text-[var(--text-secondary)] p-2">
                                            ไม่พบประเภทเสิร์ฟ
                                        </div>
                                    ) : (
                                        filteredHidden.map((s) => (
                                            <div
                                                key={s}
                                                className="p-2 hover:bg-[var(--background)] rounded"
                                            >
                                                <button
                                                    className="text-sm text-left w-full"
                                                    onClick={() => {
                                                        setServeFilter(s);
                                                        setMoreOpen(false);
                                                    }}
                                                >
                                                    {s}
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
