"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { isPublicTenantPath } from "@/lib/publicTenantPath";

type PublicTenantShop = {
    id: string;
    name: string;
    slug: string;
};

type ShopNameState = {
    slug: string;
    name: string | null;
} | null;

function getTenantSlug(pathname: string): string | null {
    const tenantSlug = pathname.split("/")[1]?.trim().toLowerCase();

    if (!tenantSlug || !isPublicTenantPath(pathname)) {
        return null;
    }

    return tenantSlug;
}

export default function ClientWrapper({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const tenantSlug = getTenantSlug(pathname);
    const [shopNameState, setShopNameState] = useState<ShopNameState>(null);

    useEffect(() => {
        if (!tenantSlug) {
            return;
        }

        let alive = true;

        fetch(`/api/public/tenant?slug=${encodeURIComponent(tenantSlug)}`)
            .then(async (res) => {
                if (!res.ok) return null;
                const data = (await res.json()) as { shop?: PublicTenantShop };
                return data.shop?.name ?? null;
            })
            .then((name) => {
                if (alive) setShopNameState({ slug: tenantSlug, name });
            })
            .catch(() => {
                if (alive) setShopNameState({ slug: tenantSlug, name: null });
            });

        return () => {
            alive = false;
        };
    }, [tenantSlug]);

    const displayShopName =
        tenantSlug && shopNameState?.slug === tenantSlug
            ? shopNameState.name ?? "Coffee SaaS"
            : "Coffee SaaS";

    // ซ่อน Navbar / Footer ในหน้า admin, login และ pos
    const hideNavAndFooter =
        pathname.startsWith("/admin") ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/pos");

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground transition-colors duration-300">
            {!hideNavAndFooter && <Navbar shopName={displayShopName} />}
            <main className="flex-1">{children}</main>
            {!hideNavAndFooter && <Footer shopName={displayShopName} />}
        </div>
    );
}
