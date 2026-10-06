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

    const isDemoSystemRoute = pathname === "/demo-system" || pathname.startsWith("/demo-system/");
    const isTenantRoute = !isDemoSystemRoute && isPublicTenantPath(pathname);
    const tenantBase = isTenantRoute ? `/${pathname.split("/")[1]}` : "";

    const displayName = isTenantRoute ? shopName?.trim() || "Coffee Shop" : "TALVO";
    const subtitle = isTenantRoute ? "Coffee Shop" : "ระบบจัดการร้านกาแฟ";

    const navItems = isTenantRoute
        ? [
            { label: "Home", href: tenantBase || "/" },
            { label: "Menu", href: `${tenantBase}/menu` },
            { label: "News", href: `${tenantBase}/news` },
            { label: "Contact", href: `${tenantBase}/contact` },
        ]
        : isDemoSystemRoute
        ? [
            { label: "หน้าแรก", href: "/" },
            { label: "วิธีทำงาน", href: "/#workflow" },
            { label: "ราคา", href: "/#pricing" },
            { label: "ติดต่อ", href: "/#contact" },
        ]
        : [
            { label: "วิธีทำงาน", href: "/#workflow" },
            { label: "ทำอะไรได้", href: "/#features" },
            { label: "ราคา", href: "/#pricing" },
            { label: "ดูหน้าจอจริง", href: "/demo-system" },
        ];

    const ctaHref = isTenantRoute
        ? `${tenantBase}/menu`
        : isDemoSystemRoute
        ? "/#contact"
        : "/demo-system";

    const ctaLabel = isTenantRoute
        ? "ดูเมนู"
        : isDemoSystemRoute
        ? "คุยกับเรา"
        : "ดูหน้าจอจริง";

    return (
        <header className="sticky top-2 z-50 w-full px-2 sm:px-4">
            <div className="relative mx-auto max-w-[1120px]">
                <div
                    className="relative flex items-center justify-between gap-2 rounded-full border border-black/[0.06] p-1.5 shadow-[0_10px_35px_rgba(46,45,42,0.06)] backdrop-blur-xl transition-colors duration-200 dark:border-white/10"
                    style={{
                        backgroundColor: "color-mix(in srgb, var(--surface) 88%, transparent)",
                        color: "var(--color-foreground)",
                    }}
                >
                    <Link href={isTenantRoute ? tenantBase || "/" : "/"} className="flex min-w-0 flex-shrink-0 items-center gap-2 sm:gap-3">
                        <div
                            className="flex h-10 w-10 items-center justify-center rounded-full font-bold text-white"
                            style={{ background: "var(--accent)" }}
                        >
                            ☕
                        </div>
                        <div className="min-w-0">
                            <div className="truncate font-bold" style={{ color: "var(--color-foreground)" }}>
                                {displayName}
                            </div>
                            <div className="truncate text-xs sm:text-sm" style={{ color: "var(--color-text-secondary)" }}>
                                {subtitle}
                            </div>
                        </div>
                    </Link>

                    <nav className="hidden flex-1 justify-center md:flex">
                        <ul className="flex gap-1 lg:gap-2">
                            {navItems.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className="rounded-full px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-black/[0.035] hover:text-text-primary dark:hover:bg-white/[0.05]"
                                        >
                                        {item.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    <div className="flex min-w-0 flex-shrink-0 items-center gap-2">
                        <button
                            className="rounded-full p-2 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                            onClick={toggleTheme}
                            aria-label="สลับธีมสี"
                        >
                            <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center" aria-hidden="true">
                                <Sun size={18} className="hidden dark:block" />
                                <Moon size={18} className="block dark:hidden" />
                            </span>
                        </button>

                        <Link
                            href={ctaHref}
                            className="hidden rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(169,120,69,0.18)] transition hover:bg-accent-dark sm:inline-flex"
                        >
                            {ctaLabel}
                        </Link>

                        <button
                            className="rounded-full p-2 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06] md:hidden"
                            onClick={() => setOpen((prev) => !prev)}
                            aria-label="เปิดเมนูนำทาง"
                        >
                            {open ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>

                    <div
                        className={`absolute left-0 right-0 top-full z-40 mt-3 origin-top rounded-3xl border border-black/[0.06] shadow-[0_18px_45px_rgba(46,45,42,0.08)] backdrop-blur-xl dark:border-white/10 transition-all duration-200 md:hidden ${
                            open ? "scale-y-100 opacity-100" : "pointer-events-none scale-y-0 opacity-0"
                        }`}
                        style={{ backgroundColor: "var(--color-surface)" }}
                    >
                        <nav className="px-4 py-3">
                            <ul className="flex flex-col gap-1">
                                {navItems.map((item) => (
                                    <li key={item.href}>
                                        <Link
                                            href={item.href}
                                            onClick={() => setOpen(false)}
                                            className="block rounded-lg px-3 py-2 font-medium transition hover:bg-accent/10"
                                        >
                                            {item.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                            <Link
                                href={ctaHref}
                                onClick={() => setOpen(false)}
                                className="mt-3 block rounded-full bg-accent px-4 py-2.5 text-center font-semibold text-white transition hover:bg-accent-dark"
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
