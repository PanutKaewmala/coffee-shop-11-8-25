// components/Hero.tsx
"use client";

import { useTheme } from "@/context/ThemeContext";

interface HeroProps {
    title?: string;
    subtitle?: string;
    ctaText?: string;
    ctaLink?: string;
    secondaryText?: string;
    secondaryLink?: string;
    signature?: string;
    seasonal?: string;
    imageUrl?: string;
}

export default function Hero({
    title = "Slow moments, great coffee.",
    subtitle = "A minimal coffee shop serving seasonal coffee & handcrafted drinks. Quiet space — good vibes.",
    ctaText = "View Menu",
    ctaLink = "#menu",
    secondaryText = "Latest Events",
    secondaryLink = "#news",
    signature = "Caramel Oat Latte",
    seasonal = "Chestnut Cold Brew",
    imageUrl = "https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=1200&auto=format&fit=crop&ixlib=rb-4.0.3&s=placeholder",
}: HeroProps) {
    const { theme } = useTheme();

    return (
        <section
            id="home"
            className="
                grid md:grid-cols-2 gap-8 items-center py-16
                transition-colors duration-300
                bg-background text-foreground
            "
        >
            {/* LEFT SIDE - Text Content */}
            <div
                className={`
                    p-8 rounded-2xl
                    transition-colors duration-300
                    bg-surface/95
                    shadow-sm
                    ${theme === "dark" ? "backdrop-blur-sm" : ""}
                `}
                style={{ border: "1px solid transparent" }}
            >
                <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
                    {title}
                </h1>

                <p className="mb-6 text-base md:text-lg text-text-secondary">
                    {subtitle}
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-wrap gap-3 mb-6">
                    {/* Primary CTA */}
                    <a
                        href={ctaLink}
                        className="     px-6 py-2 rounded-full font-semibold text-white
                                        bg-gradient-to-r from-accent to-accent-dark
                                        text-surface
                                        shadow-sm
                                        transition-all duration-300
                                        hover:brightness-110
                                        "
                        style={{
                            background:
                                "linear-gradient(90deg, var(--color-accent), var(--color-accent-dark))",
                        }}
                    >
                        {ctaText}
                    </a>

                    {/* Secondary CTA (Now Clickable) */}
                    <a
                        href={secondaryLink}
                        className={`
                            px-6 py-2.5 rounded-full text-sm font-medium border
                            transition-all duration-300
                            ${theme === "dark"
                                ? "bg-zinc-900/60 text-text-secondary hover:bg-zinc-800"
                                : "bg-white/70 text-text-secondary hover:bg-zinc-100"
                            }
                        `}
                    >
                        {secondaryText}
                    </a>
                </div>

                {/* Signature & Seasonal */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 p-4 rounded-xl shadow-sm transition-colors duration-300 bg-surface/92">
                        <div className="text-sm text-text-secondary">Signature</div>
                        <div className="font-semibold mt-1">{signature}</div>
                    </div>
                    <div className="flex-1 p-4 rounded-xl shadow-sm transition-colors duration-300 bg-surface/92">
                        <div className="text-sm text-text-secondary">Seasonal</div>
                        <div className="font-semibold mt-1">{seasonal}</div>
                    </div>
                </div>
            </div>

            {/* RIGHT SIDE - Hero Image */}
            <div
                className={`
                    rounded-2xl overflow-hidden shadow-lg transition-transform duration-500 hover:scale-[1.02]
                    ${theme === "dark" ? "bg-transparent" : "bg-transparent"}
                `}
            >
                <img
                    src={imageUrl}
                    alt="coffee shop"
                    className="w-full h-full object-cover"
                />
            </div>
        </section>
    );
}
