"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "@/context/ThemeContext";
import { Moon, Sun, Menu, X } from "lucide-react";

export default function Navbar() {
    const { theme, toggleTheme } = useTheme();
    const [open, setOpen] = useState(false);
    const [isClient] = useState(typeof window !== "undefined"); // ✅ ไม่ต้อง setState ใน effect

    const navItems = ["home", "menu", "news", "contact"];

    return (
        <header className="sticky top-2 z-50 w-full px-2 sm:px-4">
            <div className="max-w-[1100px] mx-auto relative">
                <div
                    className="
                        relative flex items-center justify-between gap-2 sm:gap-3 p-2 rounded-2xl
                        backdrop-blur-md transition-colors duration-200
                    "
                    style={{
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-foreground)",
                    }}
                >
                    {/* Brand */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
                        <div
                            className="logo w-10 h-10 rounded-2xl flex items-center justify-center font-bold"
                            style={{
                                background:
                                    "linear-gradient(to bottom right, var(--accent), var(--accent-dark))",
                            }}
                        >
                            ☕
                        </div>
                        <div>
                            <div
                                style={{ color: "var(--color-foreground)" }}
                                className="font-bold truncate"
                            >
                                Brew & Bloom
                            </div>
                            <div
                                style={{ color: "var(--color-text-secondary)" }}
                                className="text-sm truncate"
                            >
                                Minimal Coffee
                            </div>
                        </div>
                    </div>

                    {/* Desktop nav */}
                    <nav className="hidden md:flex flex-1 justify-center">
                        <ul className="flex gap-3">
                            {navItems.map((item) => (
                                <li key={item}>
                                    <Link
                                        href={`#${item}`}
                                        className="px-3 py-1.5 rounded-lg transition-colors hover:opacity-80"
                                        style={{ color: "var(--color-foreground)" }}
                                    >
                                        {item.charAt(0).toUpperCase() + item.slice(1)}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>

                    {/* Right area */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
                        {/* ✅ Toggle Theme */}
                        <button
                            className="p-2 rounded-2xl backdrop-blur-sm transition-colors hover:opacity-80"
                            style={{
                                backgroundColor: "var(--color-surface)",
                                color: "var(--color-foreground)",
                            }}
                            onClick={toggleTheme}
                            aria-label="Toggle theme"
                        >
                            {isClient && (theme === "dark" ? <Sun size={18} /> : <Moon size={18} />)}
                        </button>

                        <Link
                            href="#menu"
                            className="px-6 py-2 rounded-full font-semibold text-white
                                        bg-gradient-to-r from-accent to-accent-dark
                                        text-surface shadow-sm
                                        transition-all duration-300 hover:brightness-110"
                            style={{
                                background:
                                    "linear-gradient(to right, var(--accent), var(--accent-dark))",
                                color: "white",
                            }}
                        >
                            View Menu
                        </Link>

                        {/* Mobile menu button */}
                        <button
                            className="md:hidden p-2 rounded-2xl transition-colors hover:opacity-80"
                            style={{ color: "var(--color-foreground)" }}
                            onClick={() => setOpen((prev) => !prev)}
                            aria-label="Menu"
                        >
                            {open ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>

                    {/* Mobile dropdown */}
                    <div
                        className={`absolute left-0 right-0 top-full mt-2 md:hidden rounded-2xl backdrop-blur-md shadow-lg transform transition-all duration-200 origin-top z-40 ${open
                            ? "scale-y-100 opacity-100"
                            : "scale-y-0 opacity-0 pointer-events-none"
                            }`}
                        style={{
                            backgroundColor: "var(--color-surface)",
                        }}
                    >
                        <nav className="px-4 py-3">
                            <ul className="flex flex-col gap-2">
                                {navItems.map((item) => (
                                    <li key={item}>
                                        <Link
                                            href={`#${item}`}
                                            onClick={() => setOpen(false)}
                                            className="block px-3 py-2 rounded-lg transition-colors hover:opacity-80"
                                            style={{ color: "var(--color-foreground)" }}
                                        >
                                            {item.charAt(0).toUpperCase() + item.slice(1)}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    </div>
                </div>
            </div>
        </header>
    );
}
