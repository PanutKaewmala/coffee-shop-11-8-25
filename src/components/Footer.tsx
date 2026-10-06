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

    return (
        <footer className="border-t border-black/[0.06] bg-[#f5f1e9] px-6 py-12 text-text-primary dark:border-white/10 dark:bg-[#12110f] dark:text-[#f4f1eb]">
            <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_auto] md:items-start">
                <div className="max-w-md">
                    <div className="text-xl font-bold">TALVO</div>
                    <p className="mt-3 max-w-sm text-sm leading-7 text-text-secondary">
                        ช่วยให้การรับออเดอร์ สต็อก และการเช็กยอดปลายวันอยู่ในที่เดียวกัน
                    </p>
                </div>

                <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-text-secondary">
                    <Link href="/#workflow" className="transition hover:text-accent">วิธีทำงาน</Link>
                    <Link href="/#features" className="transition hover:text-accent">ทำอะไรได้</Link>
                    <Link href="/#pricing" className="transition hover:text-accent">ราคา</Link>
                    <Link href="/demo-system" className="transition hover:text-accent">ดูหน้าจอจริง</Link>
                    <Link href="/#contact" className="transition hover:text-accent">ติดต่อ</Link>
                </nav>
            </div>

            <div className="mx-auto mt-10 max-w-6xl border-t border-black/[0.06] pt-6 text-sm text-text-muted dark:border-white/10">
                © {year} TALVO — ระบบจัดการร้านกาแฟ
            </div>
        </footer>
    );
}
