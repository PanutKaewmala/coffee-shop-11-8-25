"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { Moon, Sun, Menu, X } from "lucide-react";
import { isPublicTenantPath } from "@/lib/publicTenantPath";

export default function Navbar({ shopName }: { shopName?: string | null }) {
    const { toggleTheme } = useTheme();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    const isTenantRoute = isPublicTenantPath(pathname);
    const tenantBase = isTenantRoute ? `/${pathname.split("/")[1]}` : "";
    const displayName = isTenantRoute ? shopName?.trim() || "Coffee SaaS" : "Coffee Shop System";
    const subtitle = isTenantRoute ? "Coffee Shop" : "ระบบร้านกาแฟ";

    const navItems = isTenantRoute
        ? [
            { label: "Home", href: tenantBase || "/" },
            { label: "Menu", href: `${tenantBase}/menu` },
            { label: "News", href: `${tenantBase}/news` },
            { label: "Contact", href: `${tenantBase}/contact` },
        ]
        : [
            { label: "ฟีเจอร์", href: "/#features" },
            { label: "แพ็กเกจ", href: "/#pricing" },
            { label: "ตัวอย่างระบบ", href: "/#demo" },
            { label: "ติดต่อ", href: "/#contact" },
        ];

    const ctaHref = isTenantRoute ? `${tenantBase}/menu` : "/coffeespace-a";
    const ctaLabel = isTenantRoute ? "View Menu" : "ขอดู Demo";

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
                        <div className="min-w-0">
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
                                {subtitle}
                            </div>
                        </div>
                    </div>

                    {/* Desktop nav */}
                    <nav className="hidden md:flex flex-1 justify-center">
                        <ul className="flex gap-3">
                            {navItems.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className="px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                                        style={{ color: "var(--color-foreground)" }}
                                    >
                                        {item.label}
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
                            <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center" aria-hidden="true">
                                <Sun size={18} className="hidden dark:block" />
                                <Moon size={18} className="block dark:hidden" />
                            </span>
                        </button>

                        <Link
                            href={ctaHref}
                            className="hidden sm:inline-flex px-6 py-2 rounded-full font-semibold text-white
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
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            onClick={() => setOpen(false)}
                                            className="block px-3 py-2 rounded-lg transition-colors hover:opacity-80"
                                            style={{ color: "var(--color-foreground)" }}
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                            <Link
                                href={ctaHref}
                                onClick={() => setOpen(false)}
                                className="mt-3 block rounded-full px-4 py-2 text-center font-semibold text-white transition-all duration-300 hover:brightness-110"
                                style={{
                                    background: "linear-gradient(to right, var(--accent), var(--accent-dark))",
                                    color: "white",
                                }}
                            >
                                {ctaLabel}
                            </Link>
                        </nav>
                    </div>
                </div>
            </div>
        </header>
    );
}
