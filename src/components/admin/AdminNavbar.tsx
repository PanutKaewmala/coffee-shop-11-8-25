"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Menu, LogOut, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";

interface AdminNavbarProps {
    onToggleSidebar?: () => void;
}

export default function AdminNavbar({ onToggleSidebar }: AdminNavbarProps) {
    const router = useRouter();
    const [isDark, setIsDark] = useState(() => {
        if (typeof document !== "undefined") {
            return document.documentElement.classList.contains("dark");
        }
        return false;
    });

    // Toggle โหมด light/dark
    const toggleTheme = () => {
        const root = document.documentElement;
        if (root.classList.contains("dark")) {
            root.classList.remove("dark");
            setIsDark(false);
        } else {
            root.classList.add("dark");
            setIsDark(true);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/login");
    };

    return (
        <header className="sticky top-0 z-50 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--text-muted)]/20 text-[var(--text-primary)] shadow-sm transition-colors duration-300">
            <div className="flex items-center justify-between px-4 py-3 md:px-6">
                {/* Left: Logo + Sidebar toggle */}
                <div className="flex items-center gap-3">
                    <button
                        className="md:hidden p-2 rounded-lg hover:bg-[var(--accent)]/10 transition"
                        onClick={onToggleSidebar}
                        aria-label="Toggle sidebar"
                    >
                        <Menu size={20} />
                    </button>

                    <span className="font-semibold text-lg tracking-wide select-none">
                        ☕ Admin Dashboard
                    </span>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3">
                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition-colors"
                        aria-label="Toggle theme"
                    >
                        {isDark ? (
                            <Sun size={18} className="text-[var(--text-secondary)]" />
                        ) : (
                            <Moon size={18} className="text-[var(--text-secondary)]" />
                        )}
                    </button>

                    <span className="text-[var(--text-secondary)] text-sm hidden sm:inline">
                        Welcome, <strong>Admin</strong>
                    </span>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 bg-[var(--accent)] text-white px-3 py-1.5 rounded-lg hover:bg-[var(--accent-dark)] transition-colors shadow-sm"
                    >
                        <LogOut size={16} />
                        <span className="text-sm font-medium">Logout</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
