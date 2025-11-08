"use client";
import { useTheme } from "@/context/ThemeContext";

export default function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer className="py-10 transition-colors duration-300 bg-surface text-foreground">
            <div className="max-w-6xl mx-auto grid md:grid-cols-3 sm:grid-cols-2 grid-cols-1 gap-6 px-6">
                {/* Brand */}
                <div>
                    <div className="font-bold text-lg">Brew & Bloom</div>
                    <p className="text-sm text-foreground/70">Minimal coffee shop</p>
                </div>

                {/* Quick Links */}
                <div>
                    <div className="text-sm mb-2 text-foreground/70">Quick Links</div>
                    <div className="flex flex-wrap gap-3 text-sm">
                        {["Home", "Menu", "News"].map((item) => (
                            <a
                                key={item}
                                href={`#${item.toLowerCase()}`}
                                className="rounded-lg transition-colors hover:opacity-80"
                            >
                                {item}
                            </a>
                        ))}
                    </div>
                </div>

                {/* Newsletter */}
                <div>
                    <div className="text-sm mb-2 text-foreground/70">Newsletter</div>
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
                </div>
            </div>

            {/* Bottom Row */}
            <div className="max-w-6xl mx-auto mt-6 flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-foreground/70 px-6">
                <div>© {year} Brew & Bloom — All rights reserved</div>
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
