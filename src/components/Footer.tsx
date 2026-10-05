"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isPublicTenantPath } from "@/lib/publicTenantPath";

export default function Footer({ shopName }: { shopName?: string | null }) {
    const year = new Date().getFullYear();
    const pathname = usePathname();
    const isDemoSystemRoute = pathname === "/demo-system" || pathname.startsWith("/demo-system/");
    const isTenantRoute = !isDemoSystemRoute && isPublicTenantPath(pathname);
    const tenantBase = isTenantRoute ? `/${pathname.split("/")[1]}` : "";

    if (isTenantRoute) {
        const displayName = shopName?.trim() || "Coffee Shop";
        return (
            <footer className="bg-surface py-10 text-foreground transition-colors duration-300">
                <div className="mx-auto grid max-w-6xl gap-6 px-6 sm:grid-cols-2 md:grid-cols-3">
                    <div>
                        <div className="text-lg font-bold">{displayName}</div>
                        <p className="text-sm text-foreground/70">Coffee Shop</p>
                    </div>
                    <div>
                        <div className="mb-2 text-sm text-foreground/70">Quick Links</div>
                        <div className="flex flex-wrap gap-3 text-sm">
                            <Link href={tenantBase || "/"}>Home</Link>
                            <Link href={`${tenantBase}/menu`}>Menu</Link>
                            <Link href={`${tenantBase}/news`}>News</Link>
                            <Link href={`${tenantBase}/contact`}>Contact</Link>
                        </div>
                    </div>
                    <div className="text-sm text-foreground/70">
                        © {year} {displayName} — All rights reserved
                    </div>
                </div>
            </footer>
        );
    }

    const dark = isDemoSystemRoute;

    return (
        <footer
            className={dark ? "border-t border-white/10 bg-[#12100e] px-6 py-10 text-[#f5f3f0]" : "border-t border-accent/10 bg-surface px-6 py-10 text-foreground"}
        >
            <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_auto] md:items-start">
                <div className="max-w-md">
                    <div className="text-xl font-bold">TALVO</div>
                    <p className={dark ? "mt-2 text-sm leading-6 text-[#d6cbbf]" : "mt-2 text-sm leading-6 text-text-secondary"}>
                        ระบบจัดการร้านกาแฟที่เชื่อม POS สต็อก และการปิดยอดรายวันให้เป็น flow เดียวกัน
                    </p>
                </div>

                <nav className={dark ? "flex flex-wrap gap-x-5 gap-y-3 text-sm text-[#d6cbbf]" : "flex flex-wrap gap-x-5 gap-y-3 text-sm text-text-secondary"}>
                    <Link href="/#workflow" className="transition hover:text-accent">วิธีทำงาน</Link>
                    <Link href="/#features" className="transition hover:text-accent">ฟีเจอร์</Link>
                    <Link href="/#pricing" className="transition hover:text-accent">ราคา</Link>
                    <Link href="/demo-system" className="transition hover:text-accent">Product tour</Link>
                    <Link href="/#contact" className="transition hover:text-accent">ติดต่อ</Link>
                </nav>
            </div>

            <div className={dark ? "mx-auto mt-8 max-w-6xl border-t border-white/10 pt-5 text-sm text-[#a39482]" : "mx-auto mt-8 max-w-6xl border-t border-accent/10 pt-5 text-sm text-text-muted"}>
                © {year} TALVO — ระบบจัดการร้านกาแฟ
            </div>
        </footer>
    );
}
