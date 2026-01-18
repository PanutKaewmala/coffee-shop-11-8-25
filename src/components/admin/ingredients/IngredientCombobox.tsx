"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Ingredient } from "@/lib/types";

type Props = {
    ingredients: Ingredient[];
    value: string;
    onChange: (id: string) => void;

    disabledIds?: Set<string>;
    placeholder?: string;

    // recent/pinned
    recentIds?: string[];
    onPickRecent?: (id: string) => void;

    // empty state action
    emptyHint?: string;
};

type Item = {
    id: string;
    name: string;

    // ✅ group by “ประเภทวัตถุดิบ”
    typeLabel: string;

    // ✅ show as subtitle (หมวดเล็ก)
    categoryLabel: string;

    unitLabel: string;
    disabled: boolean;
};

function norm(s: string) {
    return s.trim().toLowerCase();
}

function unitLabel(ing: Ingredient): string {
    const u = (ing.base_unit ?? "") || (ing.unit ?? "");
    return u ? String(u) : "-";
}

// ✅ หมวดเล็ก (ไว้เป็น subtitle)
function categoryLabel(ing: Ingredient): string {
    const c = (ing.category ?? "").trim();
    return c || "อื่นๆ";
}

// ✅ ประเภทวัตถุดิบ (group หลัก) = base_unit
function typeLabel(ing: Ingredient): string {
    const t = (ing.base_unit ?? "").toString().toLowerCase();

    // your BaseUnit: "ml" | "g" | "piece"
    if (t === "ml") return "ของเหลว";
    if (t === "g") return "ผง/เมล็ด";
    if (t === "piece") return "ของชิ้น";

    return "อื่นๆ";
}

function scoreMatch(name: string, q: string): number {
    const n = norm(name);
    const query = norm(q);
    if (!query) return 0;
    if (n === query) return 100;
    if (n.startsWith(query)) return 80;
    if (n.includes(query)) return 50;
    return 0;
}

function clampIndex(idx: number, len: number): number {
    if (len <= 0) return 0;
    if (idx < 0) return 0;
    if (idx >= len) return len - 1;
    return idx;
}

// ✅ order ประเภทให้ “เหมือนร้านจริง”
const TYPE_ORDER: Record<string, number> = {
    "ของเหลว": 0,
    "ผง/เมล็ด": 1,
    "ของชิ้น": 2,
    "อื่นๆ": 99,
};

export default function IngredientCombobox({
    ingredients,
    value,
    onChange,
    disabledIds,
    placeholder = "พิมพ์เพื่อค้นหา...",
    recentIds = [],
    onPickRecent,
    emptyHint = "ไม่เจอวัตถุดิบ — ไปเพิ่มที่ Ingredients",
}: Props) {
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);

    const selected = useMemo(() => {
        const ing = ingredients.find((x) => x.id === value);
        if (!ing) return null;
        return {
            id: ing.id,
            name: ing.name,
            typeLabel: typeLabel(ing),
            categoryLabel: categoryLabel(ing),
            unitLabel: unitLabel(ing),
        };
    }, [ingredients, value]);

    const items = useMemo<Item[]>(() => {
        const dis = disabledIds ?? new Set<string>();

        const base: Item[] = ingredients.map((ing) => ({
            id: ing.id,
            name: ing.name,
            typeLabel: typeLabel(ing),
            categoryLabel: categoryLabel(ing),
            unitLabel: unitLabel(ing),
            disabled: dis.has(ing.id),
        }));

        const q = query.trim();
        if (q) {
            return base
                .map((it) => ({ it, score: scoreMatch(it.name, q) }))
                .filter((x) => x.score > 0)
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    // tie-break: type order -> name
                    const ta = TYPE_ORDER[a.it.typeLabel] ?? 50;
                    const tb = TYPE_ORDER[b.it.typeLabel] ?? 50;
                    if (ta !== tb) return ta - tb;
                    return a.it.name.localeCompare(b.it.name);
                })
                .map((x) => x.it);
        }

        // no query: type order -> name
        return [...base].sort((a, b) => {
            const ta = TYPE_ORDER[a.typeLabel] ?? 50;
            const tb = TYPE_ORDER[b.typeLabel] ?? 50;
            if (ta !== tb) return ta - tb;
            return a.name.localeCompare(b.name);
        });
    }, [ingredients, disabledIds, query]);

    const grouped = useMemo(() => {
        const map = new Map<string, Item[]>();
        for (const it of items) {
            const key = it.typeLabel; // ✅ group by type
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(it);
        }

        const keys = Array.from(map.keys()).sort((a, b) => {
            const ra = TYPE_ORDER[a] ?? 50;
            const rb = TYPE_ORDER[b] ?? 50;
            return ra - rb;
        });

        return keys.map((k) => ({ group: k, items: map.get(k)! }));
    }, [items]);

    const flatList = useMemo(() => {
        const out: Item[] = [];
        for (const g of grouped) out.push(...g.items);
        return out;
    }, [grouped]);

    // ✅ ไม่ setState ใน effect เพื่อ clamp (กัน warning)
    const safeActiveIndex = useMemo(
        () => clampIndex(activeIndex, flatList.length),
        [activeIndex, flatList.length]
    );

    // close on outside click
    useEffect(() => {
        function onDocDown(e: MouseEvent) {
            const el = wrapRef.current;
            if (!el) return;
            if (!el.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onDocDown);
        return () => document.removeEventListener("mousedown", onDocDown);
    }, []);

    // ✅ scroll active into view (DOM sync OK)
    useEffect(() => {
        if (!open) return;
        const listEl = listRef.current;
        if (!listEl) return;
        const row = listEl.querySelector<HTMLButtonElement>(
            `[data-idx="${safeActiveIndex}"]`
        );
        if (!row) return;
        row.scrollIntoView({ block: "nearest" });
    }, [open, safeActiveIndex]);

    const openAndFocus = () => {
        setOpen(true);
        setActiveIndex(0);
        queueMicrotask(() => inputRef.current?.focus());
    };

    const pick = (id: string) => {
        onChange(id);
        onPickRecent?.(id);
        setOpen(false);
        setQuery("");
        setActiveIndex(0);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => clampIndex(i + 1, flatList.length));
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => clampIndex(i - 1, flatList.length));
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            if (!open) {
                setOpen(true);
                setActiveIndex(0);
                return;
            }
            const it = flatList[safeActiveIndex];
            if (it && !it.disabled) pick(it.id);
        }
    };

    // recent list (top 10)
    const recentItems = useMemo(() => {
        const idset = new Set(recentIds);
        const dis = disabledIds ?? new Set<string>();

        const list = ingredients
            .filter((x) => idset.has(x.id))
            .map((ing) => ({
                id: ing.id,
                name: ing.name,
                typeLabel: typeLabel(ing),
                categoryLabel: categoryLabel(ing),
                unitLabel: unitLabel(ing),
                disabled: dis.has(ing.id),
            }));

        const byId = new Map(list.map((x) => [x.id, x]));
        return recentIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .slice(0, 10) as Item[];
    }, [ingredients, recentIds, disabledIds]);

    const inputValue = open ? query : selected?.name ?? "";

    return (
        <div ref={wrapRef} className="relative">
            <div
                className="
          w-full rounded-lg bg-background border border-text-muted/40
          px-3 py-2 flex items-center gap-2
          focus-within:border-accent
        "
                onClick={openAndFocus}
            >
                <input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                        setActiveIndex(0);
                    }}
                    onFocus={() => {
                        setOpen(true);
                        setActiveIndex(0);
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={selected ? "" : placeholder}
                    className="w-full bg-transparent outline-none text-text-primary"
                />

                <div className="text-xs text-text-secondary whitespace-nowrap">
                    {selected ? selected.unitLabel : ""}
                </div>

                {(value || query) && (
                    <button
                        type="button"
                        className="text-xs px-2 py-1 rounded-md border border-text-muted/20 hover:border-accent"
                        onClick={(e) => {
                            e.stopPropagation();
                            setQuery("");
                            setActiveIndex(0);
                            if (value) onChange("");
                            setOpen(true);
                            queueMicrotask(() => inputRef.current?.focus());
                        }}
                        title="ล้าง"
                    >
                        x
                    </button>
                )}
            </div>

            {open && (
                <div className="absolute mt-2 w-full rounded-xl border border-text-muted/20 bg-surface shadow-xl z-50 overflow-hidden">
                    {/* Recent */}
                    {recentItems.length > 0 && !query.trim() && (
                        <div className="px-3 py-2 border-b border-text-muted/10">
                            <div className="text-xs text-text-secondary mb-2">ล่าสุดที่เลือก</div>
                            <div className="flex flex-wrap gap-2">
                                {recentItems.map((it) => (
                                    <button
                                        key={`recent-${it.id}`}
                                        type="button"
                                        disabled={it.disabled}
                                        onClick={() => !it.disabled && pick(it.id)}
                                        className={`
                      text-xs px-2 py-1 rounded-full border
                      ${it.disabled
                                                ? "opacity-40 cursor-not-allowed border-text-muted/20"
                                                : "border-text-muted/30 hover:border-accent"
                                            }
                    `}
                                        title={it.disabled ? "มีในสูตรแล้ว" : ""}
                                    >
                                        {it.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div ref={listRef} className="max-h-[320px] overflow-auto">
                        {flatList.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-text-secondary text-center">
                                {emptyHint}
                            </div>
                        ) : (
                            (() => {
                                let globalIdx = -1;

                                return grouped.map((g) => (
                                    <div key={g.group} className="py-1">
                                        <div className="px-3 pt-2 pb-1 text-xs font-semibold text-text-secondary">
                                            {g.group}
                                        </div>

                                        {g.items.map((it) => {
                                            globalIdx += 1;
                                            const idx = globalIdx;
                                            const active = idx === safeActiveIndex;

                                            return (
                                                <button
                                                    key={it.id}
                                                    type="button"
                                                    data-idx={idx}
                                                    disabled={it.disabled}
                                                    onMouseEnter={() => setActiveIndex(idx)}
                                                    onClick={() => !it.disabled && pick(it.id)}
                                                    className={`
                            w-full text-left px-3 py-2 flex items-center justify-between gap-3
                            ${active ? "bg-[var(--accent)]/10" : "hover:bg-white/5"}
                            ${it.disabled ? "opacity-40 cursor-not-allowed" : ""}
                          `}
                                                    title={it.disabled ? "มีในสูตรแล้ว" : ""}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-medium truncate">{it.name}</div>

                                                        {/* ✅ subtitle = หมวดเล็ก (category) */}
                                                        <div className="text-xs text-text-secondary truncate">
                                                            {it.categoryLabel}
                                                            {it.disabled ? " • มีในสูตรแล้ว" : ""}
                                                        </div>
                                                    </div>

                                                    <div className="text-xs text-text-secondary whitespace-nowrap">
                                                        {it.unitLabel}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ));
                            })()
                        )}
                    </div>

                    <div className="px-3 py-2 border-t border-text-muted/10 text-xs text-text-secondary">
                        ↑↓ เลือก • Enter ตกลง • Esc ปิด
                    </div>
                </div>
            )}
        </div>
    );
}
