"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { Moon, Sun, Menu, X } from "lucide-react";
import { isPublicTenantPath } from "@/lib/publicTenantPath";

export default function Navbar({ shopName }: { shopName?: string | null }) {
    const { theme, toggleTheme } = useTheme();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    const isTenantRoute = isPublicTenantPath(pathname);
    const tenantBase = isTenantRoute ? `/${pathname.split("/")[1]}` : "";
    const displayName = shopName?.trim() || "Coffee SaaS";

    // Non-tenant product navigation vs tenant shop navigation
    const navItems = isTenantRoute
        ? ["home", "menu", "news", "contact"]
        : ["features", "demo-shops", "login"];

    const itemLabel = (item: string) => {
        return item.charAt(0).toUpperCase() + item.slice(1).replace("-", " ");
    };

    const itemHref = (item: string) => {
        if (item === "login") return "/login";
        return isTenantRoute
            ? `${tenantBase}${item === "home" ? "" : `/${item}`}`
            : `#${item}`;
    };

    const ctaHref = isTenantRoute ? `${tenantBase}/menu` : "/#demo-shops";
    const ctaLabel = isTenantRoute ? "View Menu" : "Try Demo";

    return (
        <header className="sticky top-2 z-50 w-full px-2 sm:px-4">
            <div className="max-w-[1100px] mx-auto relative">
                <div
                    className="
            relative flex items-center justify-between gap-2 sm:gap-3 p-2 rounded-2xl
            backdrop-blur-md transition-colors duration-200
          "
                    style={{
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-foreground)",
                    }}
                >
                    {/* Brand */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
                        <div
                            className="logo w-10 h-10 rounded-2xl flex items-center justify-center font-bold"
                            style={{
                                background:
                                    "linear-gradient(to bottom right, var(--accent), var(--accent-dark))",
                            }}
                        >
                            ☕
                        </div>
                        <div>
                            <div
                                style={{ color: "var(--color-foreground)" }}
                                className="font-bold truncate"
                            >
                                {displayName}
                            </div>
                            <div
                                style={{ color: "var(--color-text-secondary)" }}
                                className="text-sm truncate"
                            >
                                {isTenantRoute ? "Coffee Shop" : "Product"}
                            </div>
                        </div>
                    </div>

                    {/* Desktop nav */}
                    <nav className="hidden md:flex flex-1 justify-center">
                        <ul className="flex gap-3">
                            {navItems.map((item) => (
                                <li key={item}>
                                    <Link
                                        href={itemHref(item)}
                                        className="px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                                        style={{ color: "var(--color-foreground)" }}
                                    >
                                        {itemLabel(item)}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    {/* Right area */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
                        {/* Toggle Theme */}
                        <button
                            className="p-2 rounded-2xl backdrop-blur-sm transition-colors hover:opacity-80"
                            style={{
                                backgroundColor: "var(--color-surface)",
                                color: "var(--color-foreground)",
                            }}
                            onClick={toggleTheme}
                            aria-label="Toggle theme"
                        >
                            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                        </button>

                        <Link
                            href={ctaHref}
                            className="px-6 py-2 rounded-full font-semibold text-white
                        bg-gradient-to-r from-accent to-accent-dark
                        text-surface shadow-sm
                        transition-all duration-300 hover:brightness-110"
                            style={{
                                background: "linear-gradient(to right, var(--accent), var(--accent-dark))",
                                color: "white",
                            }}
                        >
                            {ctaLabel}
                        </Link>

                        {/* Mobile menu button */}
                        <button
                            className="md:hidden p-2 rounded-2xl transition-colors hover:opacity-80"
                            style={{ color: "var(--color-foreground)" }}
                            onClick={() => setOpen((prev) => !prev)}
                            aria-label="Menu"
                        >
                            {open ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>

                    {/* Mobile dropdown */}
                    <div
                        className={`absolute left-0 right-0 top-full mt-2 md:hidden rounded-2xl backdrop-blur-md shadow-lg transform transition-all duration-200 origin-top z-40 ${open ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0 pointer-events-none"
                            }`}
                        style={{ backgroundColor: "var(--color-surface)" }}
                    >
                        <nav className="px-4 py-3">
                            <ul className="flex flex-col gap-2">
                                {navItems.map((item) => (
                                    <li key={item}>
                                        <Link
                                            href={itemHref(item)}
                                            onClick={() => setOpen(false)}
                                            className="block px-3 py-2 rounded-lg transition-colors hover:opacity-80"
                                            style={{ color: "var(--color-foreground)" }}
                                        >
                                            {itemLabel(item)}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    </div>
                </div>
            </div>
        </header>
    );
}