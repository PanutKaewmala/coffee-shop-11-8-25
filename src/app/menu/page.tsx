"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import MenuCard from "@/components/MenuCard";
import type { MenuWithRelations } from "@/lib/types";

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function asMenuList(data: unknown): MenuWithRelations[] {
    // รองรับ array ตรงๆ
    if (Array.isArray(data)) return data as MenuWithRelations[];

    // รองรับ { menu: [...] }
    if (isRecord(data) && Array.isArray(data.menu)) {
        return data.menu as MenuWithRelations[];
    }

    return [];
}

export default function MenuSection() {
    const { theme } = useTheme();

    const [menuItems, setMenuItems] = useState<MenuWithRelations[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>("all");

    /* -----------------------------
     * Fetch menu
     * ----------------------------*/
    useEffect(() => {
        let alive = true;

        const loadMenu = async () => {
            try {
                setLoading(true);

                const res = await fetch("/api/menu", { cache: "no-store" });
                const data: unknown = await res.json();

                const list = asMenuList(data);

                if (!alive) return;
                setMenuItems(Array.isArray(list) ? list : []);
            } catch (err) {
                console.error("Failed to load menu:", err);
                if (!alive) return;
                setMenuItems([]);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        };

        loadMenu();

        return () => {
            alive = false;
        };
    }, []);

    /* -----------------------------
     * Categories = string ล้วน
     * (จาก types: category เป็น string | null)
     * ----------------------------*/
    const categories = useMemo(() => {
        const names = menuItems
            .map((item) => (typeof item.category === "string" && item.category.trim() ? item.category.trim() : "อื่นๆ"))
            .filter(Boolean);

        return ["all", ...Array.from(new Set(names))];
    }, [menuItems]);

    /* -----------------------------
     * Filtered items (no extra state)
     * ----------------------------*/
    const filteredItems = useMemo(() => {
        if (filter === "all") return menuItems;

        return menuItems.filter((item) => {
            const cat =
                typeof item.category === "string" && item.category.trim()
                    ? item.category.trim()
                    : "อื่นๆ";
            return cat === filter;
        });
    }, [menuItems, filter]);

    return (
        <section
            id="menu"
            className="py-12 transition-colors duration-300 bg-[var(--color-background)] text-[var(--color-text-primary)]"
        >
            <h2 className="text-2xl font-bold mb-2">Menu</h2>
            <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
                Filter by category — view details and allergen info.
            </p>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2 mb-6">
                {categories.map((cat) => {
                    const label =
                        cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1);

                    const isActive = filter === cat;

                    return (
                        <button
                            key={cat}
                            onClick={() => setFilter(cat)}
                            className={`
                                px-3 py-1 rounded-full border text-sm font-medium transition-all
                                ${isActive
                                    ? "bg-[var(--color-accent)] text-white border-transparent shadow-sm"
                                    : `
                                        ${theme === "dark"
                                        ? "bg-zinc-900/60 text-text-secondary hover:bg-zinc-800"
                                        : "bg-white/70 text-text-secondary hover:bg-zinc-100"
                                    }
                                        border border-[var(--color-text-muted)]
                                      `
                                }
                            `}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* Menu Grid */}
            <div className="menu-grid grid md:grid-cols-3 sm:grid-cols-2 grid-cols-1 gap-4">
                {loading ? (
                    <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
                ) : filteredItems.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)]">
                        No menu items found.
                    </p>
                ) : (
                    filteredItems.map((item) => <MenuCard key={item.id} item={item} />)
                )}
            </div>
        </section>
    );
}
