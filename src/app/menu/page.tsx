"use client";

import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import MenuCard from "@/components/MenuCard";
import { MenuItem } from "@/lib/types";

export default function MenuSection() {
    const { theme } = useTheme();

    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
    const [filter, setFilter] = useState("all");

    /* -----------------------------
     * Fetch menu
     * ----------------------------*/
    useEffect(() => {
        const loadMenu = async () => {
            try {
                const res = await fetch("/api/menu");
                const data = await res.json();

                setMenuItems(data);
                setFilteredItems(data);
            } catch (err) {
                console.error("Failed to load menu:", err);
            }
        };

        loadMenu();
    }, []);

    /* -----------------------------
     * Filtering
     * ----------------------------*/
    const handleFilter = (cat: string) => {
        setFilter(cat);

        if (cat === "all") {
            setFilteredItems(menuItems);
            return;
        }

        setFilteredItems(menuItems.filter((item) => item.category === cat));
    };

    // auto-generate categories from DB
    const categories = [
        "all",
        ...Array.from(new Set(menuItems.map((item) => item.category))),
    ];

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
                        cat === "all"
                            ? "All"
                            : cat.charAt(0).toUpperCase() + cat.slice(1);

                    const isActive = filter === cat;

                    return (
                        <button
                            key={cat}
                            onClick={() => handleFilter(cat)}
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
                {filteredItems.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)]">
                        No menu items found.
                    </p>
                ) : (
                    filteredItems.map((item) => (
                        <MenuCard key={item.id} item={item} />
                    ))
                )}
            </div>
        </section>
    );
}
