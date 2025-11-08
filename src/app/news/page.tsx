"use client";

import { cn } from "@/lib/utils";

export interface NewsItem {
    id: number;
    category: string;
    title: string;
    description?: string;
}

const newsData: NewsItem[] = [
    {
        id: 1,
        category: "News",
        title: "Autumn Tasting — Nov 10",
        description: "Join us for a seasonal tasting and small batch pour-over.",
    },
    {
        id: 2,
        category: "Calendar",
        title: "Nov 10 — Tasting\nNov 25 — Live Music",
    },
    {
        id: 3,
        category: "Newsletter",
        title: "Get updates on seasonal drinks & events.",
    },
];

export default function NewsSection() {
    return (
        <section
            id="news"
            className="py-12 transition-colors duration-300"
            style={{ backgroundColor: "var(--color-background)", color: "var(--color-foreground)" }}
        >
            <h2
                className="text-2xl font-bold mb-6 text-left max-w-6xl"
                style={{ color: "var(--color-foreground)" }}
            >
                News & Events
            </h2>

            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl xl:max-w-7xl">
                {newsData.map((item) => (
                    <div
                        key={item.id}
                        className={cn(
                            "p-5 rounded-2xl shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-md",
                            "bg-surface/90"
                        )}
                    >
                        <div
                            className="text-sm uppercase tracking-wide font-medium mb-1"
                            style={{ color: "var(--color-text-secondary)" }}
                        >
                            {item.category}
                        </div>

                        <div
                            className="font-semibold mt-1 whitespace-pre-line text-lg"
                            style={{ color: "var(--color-text-primary)" }}
                        >
                            {item.title}
                        </div>

                        {item.description && (
                            <p className="text-sm mt-2" style={{ color: "var(--color-text-muted)" }}>
                                {item.description}
                            </p>
                        )}

                        {item.category === "Newsletter" && (
                            <div className="mt-4 flex items-center gap-2">
                                <input
                                    type="email"
                                    placeholder="your@mail.com"
                                    className="flex-1 min-w-0 p-2 rounded-lg border border-text-muted/40 transition-colors duration-300 focus:ring-1 focus:ring-accent"
                                    style={{
                                        backgroundColor: "var(--color-surface)",
                                        color: "var(--color-text-primary)",
                                    }}
                                    aria-label="Email for newsletter"
                                />
                                <button
                                    className="
                                        px-6 py-2 rounded-full font-semibold text-white
                                        bg-gradient-to-r from-accent to-accent-dark
                                        text-surface
                                        shadow-sm
                                        transition-all duration-300
                                        hover:brightness-110
                                        "
                                    style={{
                                        background: "linear-gradient(90deg, var(--color-accent), var(--color-accent-dark))",
                                        color: "white",
                                    }}
                                    aria-label="Subscribe to newsletter"
                                    type="button"
                                >
                                    Subscribe
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
