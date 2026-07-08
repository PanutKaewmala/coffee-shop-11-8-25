"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { isPublicTenantPath } from "@/lib/publicTenantPath";

export default function Footer({ shopName }: { shopName?: string | null }) {
    const year = new Date().getFullYear();
    const pathname = usePathname();
    const isDemoSystemRoute = pathname === "/demo-system" || pathname.startsWith("/demo-system/");
    const isTenantRoute = !isDemoSystemRoute && isPublicTenantPath(pathname);
    const tenantBase = isTenantRoute ? `/${pathname.split("/")[1]}` : "";
    const displayName = isDemoSystemRoute ? "Coffee Shop System" : shopName?.trim() || "Coffee SaaS";

    const quickLinks = isTenantRoute
        ? [{ name: "Home", href: tenantBase || "/" }, { name: "Menu", href: `${tenantBase}/menu` }, { name: "News", href: `${tenantBase}/news` }]
        : [{ name: "Features", href: "/#features" }, { name: "Demo Shops", href: "/#demo" }, { name: "Login", href: "/login" }];

    if (isDemoSystemRoute) {
        const marketingLinks = [
            { name: "หน้าแรก", href: "/" },
            { name: "แพ็กเกจ", href: "/#pricing" },
            { name: "ตัวอย่างหน้าร้าน", href: "/coffeespace-a" },
            { name: "ติดต่อ", href: "/#contact" },
        ];

        return (
            <footer className="border-t border-white/10 bg-[#12100e] px-6 py-8 text-[#f5f3f0]">
                <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="font-bold text-lg">{displayName}</div>
                        <p className="text-sm text-[#d6cbbf]">ระบบร้านกาแฟ</p>
                    </div>

                    <nav className="flex flex-wrap gap-3 text-sm text-[#d6cbbf]">
                        {marketingLinks.map((link) => (
                            <Link key={link.href} href={link.href} className="transition hover:text-[#d4a574]">
                                {link.name}
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className="mx-auto mt-6 max-w-6xl text-sm text-[#a39482]">
                    © {year} {displayName} — All rights reserved
                </div>
            </footer>
        );
    }

    return (
        <footer className="py-10 transition-colors duration-300 bg-surface text-foreground">
            <div className="max-w-6xl mx-auto grid md:grid-cols-3 sm:grid-cols-2 grid-cols-1 gap-6 px-6">
                {/* Brand */}
                <div>
                    <div className="font-bold text-lg">{displayName}</div>
                    <p className="text-sm text-foreground/70">
                        {isTenantRoute ? "Coffee Shop" : "Coffee Shop SaaS"}
                    </p>
                </div>

                {/* Quick Links */}
                <div>
                    <div className="text-sm mb-2 text-foreground/70">Quick Links</div>
                    <div className="flex flex-wrap gap-3 text-sm">
                        {quickLinks.map((link) => (
                            <a
                                key={link.name}
                                href={link.href}
                                className="rounded-lg transition-colors hover:opacity-80"
                            >
                                {link.name}
                            </a>
                        ))}
                    </div>
                </div>

                {/* Newsletter / Login */}
                <div>
                    <div className="text-sm mb-2 text-foreground/70">
                        {isTenantRoute ? "Newsletter" : "Get Started"}
                    </div>
                    {isTenantRoute ? (
                        <div className="flex gap-2">
                            <input
                                type="email"
                                placeholder="you@mail.com"
                                className="
                            flex-1 rounded-xl border border-text-muted/40 px-3 py-2 text-sm
                            bg-surface text-foreground placeholder:text-text-muted
                            border-foreground/20 transition-colors duration-300
                            focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent
                          "/>
                            <button className="
                                            px-6 py-2 rounded-full font-semibold text-white
                                            bg-gradient-to-r from-accent to-accent-dark
                                            text-surface
                                            shadow-sm
                                            transition-all duration-300
                                            hover:brightness-110
                                        ">
                                Join
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="px-6 py-2 rounded-full font-semibold text-white bg-gradient-to-r from-accent to-accent-dark transition-all duration-300 hover:brightness-110"
                        >
                            Login to Admin
                        </Link>
                    )}
                </div>
            </div>

            {/* Bottom Row */}
            <div className="max-w-6xl mx-auto mt-6 flex justify-center text-center text-sm text-foreground/70 px-6">
                <div>© {year} {displayName} — All rights reserved</div>
            </div>
        </footer>
    );
}
