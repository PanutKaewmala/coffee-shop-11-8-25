"use client";

import { useTheme } from "@/context/ThemeContext";
import Hero from "@/components/Hero";
import PublicContactSection from "@/components/public/PublicContactSection";
import PublicNewsSection from "@/components/public/PublicNewsSection";
import PublicMenuSection from "@/components/public/PublicMenuSection";

export default function PublicHome({ shopId }: { shopId?: string | null }) {
    const { theme } = useTheme();

    return (
        <div
            className="flex flex-col min-h-screen font-sans overflow-x-hidden bg-background text-foreground transition-colors duration-300"
        >
            <main className="flex-1 px-4 sm:px-6 lg:px-auto max-w-7xl mx-auto">
                <Hero shopId={shopId} />
                <PublicMenuSection shopId={shopId} />
                <PublicNewsSection shopId={shopId} />
                <PublicContactSection shopId={shopId} />
            </main>
        </div>
    );
}