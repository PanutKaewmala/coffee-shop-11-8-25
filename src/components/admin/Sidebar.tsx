"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

const navItems = [
    { label: "Dashboard", path: "/admin" },
    { label: "Menu", path: "/admin/menu" },
    { label: "News", path: "/admin/news" },
    { label: "Branches", path: "/admin/branch" },
    { label: "Contact", path: "/admin/contact" },
];

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
    const pathname = usePathname();

    return (
        <>
            {/* Backdrop for mobile */}
            <div
                className={`fixed inset-0 bg-black/40 z-30 md:hidden transition-opacity duration-300 ${isOpen
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                    }`}
                onClick={onClose}
            />

            {/* Sidebar */}
            <aside
                className={`fixed top-0 left-0 bottom-0 z-40 w-64 bg-[var(--surface)] text-[var(--text-primary)] border-r border-[var(--text-muted)]/20 transform transition-transform duration-300 ${isOpen ? "translate-x-0" : "-translate-x-full"
                    } md:translate-x-0 md:static md:shadow-none`}
            >
                {/* Mobile Header */}
                <div className="flex items-center justify-between mb-6 md:hidden">
                    <div className="text-lg font-semibold tracking-wide text-[var(--text-primary)]">
                        ☕ Admin
                    </div>
                    <button
                        className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition"
                        onClick={onClose}
                        aria-label="Close sidebar"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex flex-col gap-1">
                    {navItems.map((item) => {
                        const active = pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                onClick={() => onClose?.()}
                                className={`block px-4 py-2.5 rounded-lg font-medium transition-colors duration-200 ${active
                                        ? "bg-[var(--accent)] text-white shadow-sm"
                                        : "text-[var(--text-secondary)] hover:bg-[var(--accent)]/10 hover:text-[var(--text-primary)]"
                                    }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer / Version */}
                <div className="mt-8 text-xs text-[var(--text-muted)] border-t border-[var(--text-muted)]/20 pt-4 text-center select-none">
                    © {new Date().getFullYear()} Coffee Admin
                </div>
            </aside>
        </>
    );
}
