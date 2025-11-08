"use client";

import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import MenuCard from "@/components/MenuCard";

interface MenuItem {
    id: number;
    name: string;
    price: number;
    type: string;
    cat: string;
    img: string;
}

const sampleMenu: MenuItem[] = [
    {
        id: 1,
        name: "Espresso",
        price: 60,
        type: "Hot",
        cat: "coffee",
        img: "https://images.unsplash.com/photo-1511920170033-f8396924c348?q=80&w=800&auto=format&fit=crop",
    },
    {
        id: 2,
        name: "Latte",
        price: 85,
        type: "Hot/Iced",
        cat: "coffee",
        img: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=800&auto=format&fit=crop",
    },
    {
        id: 3,
        name: "Iced Tea",
        price: 70,
        type: "Iced",
        cat: "tea",
        img: "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?q=80&w=800&auto=format&fit=crop",
    },
    {
        id: 4,
        name: "Matcha Latte",
        price: 95,
        type: "Hot/Iced",
        cat: "milk & chocolate",
        img: "https://images.unsplash.com/photo-1551024601-bec78aea704b?q=80&w=800&auto=format&fit=crop",
    },
];

export default function MenuSection() {
    const { theme } = useTheme();
    const [menuItems, setMenuItems] = useState<MenuItem[]>(sampleMenu);
    const [filter, setFilter] = useState("all");

    const handleFilter = (cat: string) => {
        setFilter(cat);
        setMenuItems(
            cat === "all" ? sampleMenu : sampleMenu.filter((i) => i.cat === cat)
        );
    };

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
                {["all", "coffee", "tea", "milk & chocolate"].map((cat) => (
                    <button
                        key={cat}
                        onClick={() => handleFilter(cat)}
                        className={`
                            px-3 py-1 rounded-full border transition-all duration-300 text-sm font-medium
                            ${filter === cat
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
                        {cat === "milk & chocolate"
                            ? "Milk / Chocolate"
                            : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                ))}
            </div>

            {/* Menu Grid */}
            <div className="menu-grid grid md:grid-cols-3 sm:grid-cols-2 grid-cols-1 gap-4">
                {menuItems.map((item) => (
                    <MenuCard key={item.id} item={item} />
                ))}
            </div>
        </section>
    );
}
