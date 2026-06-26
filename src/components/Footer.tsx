"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { isPublicTenantPath } from "@/lib/publicTenantPath";

export default function Footer({ shopName }: { shopName?: string | null }) {
    const year = new Date().getFullYear();
    const pathname = usePathname();
    const isTenantRoute = isPublicTenantPath(pathname);
    const tenantBase = isTenantRoute ? `/${pathname.split("/")[1]}` : "";
    const displayName = shopName?.trim() || "Coffee SaaS";

    const quickLinks = isTenantRoute
        ? [{ name: "Home", href: tenantBase || "/" }, { name: "Menu", href: `${tenantBase}/menu` }, { name: "News", href: `${tenantBase}/news` }]
        : [{ name: "Features", href: "/#features" }, { name: "Demo Shops", href: "/#demo-shops" }, { name: "Login", href: "/login" }];

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
            <div className="max-w-6xl mx-auto mt-6 flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-foreground/70 px-6">
                <div>© {year} {displayName} — All rights reserved</div>
                <div className="flex gap-3 flex-wrap">
                    <a href="#" className="rounded-lg transition-colors hover:opacity-80">
                        Terms
                    </a>
                    <a href="#" className="rounded-lg transition-colors hover:opacity-80">
                        Privacy
                    </a>
                </div>
            </div>
        </footer>
    );
}