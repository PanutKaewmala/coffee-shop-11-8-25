"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { MenuItem } from "@/lib/types";

interface Props {
    menuFilter: string;
    setMenuFilter: (v: string) => void;
    recentMenus: MenuItem[];
    menuOptions: MenuItem[];
}

export default function RecipeFilter({
    menuFilter,
    setMenuFilter,
    recentMenus,
    menuOptions
}: Props) {

    const [moreOpen, setMoreOpen] = useState(false);
    const [moreQuery, setMoreQuery] = useState("");
    const moreRef = useRef<HTMLDivElement | null>(null);

    // close dropdown when clicking outside
    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
                setMoreOpen(false);
            }
        };
        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    // Filter for items in More dropdown
    const moreList = useMemo(() => {
        const topIds = new Set(recentMenus.map((m) => m.id));

        return menuOptions
            .filter((m) => !topIds.has(m.id))
            .filter((m) =>
                m.name.toLowerCase().includes(moreQuery.toLowerCase())
            );
    }, [menuOptions, recentMenus, moreQuery]);

    return (
        <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
                <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none gradient-left" />

                    {/* Tags scroller */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-2">
                        <button
                            onClick={() => setMenuFilter("all")}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${menuFilter === "all"
                                    ? "bg-[var(--accent)] text-black"
                                    : "bg-[var(--surface)] text-[var(--text-secondary)]"
                                }`}
                        >
                            ทั้งหมด
                        </button>

                        {recentMenus.map((m) => (
                            <button
                                key={m.id}
                                onClick={() => setMenuFilter(m.id)}
                                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap ${menuFilter === m.id
                                        ? "bg-[var(--accent)] text-black"
                                        : "bg-[var(--surface)] text-[var(--text-secondary)]"
                                    }`}
                            >
                                {m.name}
                            </button>
                        ))}

                        <div style={{ width: 8 }} />
                    </div>

                    <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none gradient-right" />
                </div>
            </div>

            {/* MORE MENU */}
            <div className="relative" ref={moreRef}>
                <button
                    onClick={() => {
                        setMoreOpen((s) => !s);
                        setMoreQuery("");
                    }}
                    className="ml-2 px-3 py-1.5 rounded-lg bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-black"
                >
                    More ▾
                </button>

                {moreOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-[var(--surface)] border rounded-lg shadow-lg z-50 p-3">
                        <input
                            className="w-full p-2 rounded-md mb-2 bg-background border border-text-muted/40 focus:outline-none"
                            placeholder="ค้นหาเมนู..."
                            value={moreQuery}
                            onChange={(e) => setMoreQuery(e.target.value)}
                        />

                        <div className="max-h-56 overflow-auto">
                            {moreList.length === 0 ? (
                                <div className="text-sm text-[var(--text-secondary)] p-2">
                                    ไม่มีเมนู
                                </div>
                            ) : (
                                moreList.map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => {
                                            setMenuFilter(m.id);
                                            setMoreOpen(false);
                                        }}
                                        className="block w-full text-left px-2 py-2 rounded hover:bg-[var(--background)]"
                                    >
                                        {m.name}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
