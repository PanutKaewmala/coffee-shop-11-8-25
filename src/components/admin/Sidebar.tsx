"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

type NavItem = {
    label: string;
    path: string;
    children?: NavItem[];
    badge?: string;
};

// จัดกลุ่มเมนูเป็น section
const navSections: { title: string; items: NavItem[] }[] = [
    {
        title: "Overview",
        items: [{ label: "Dashboard", path: "/admin" }],
    },
    {
        title: "Product Management",
        items: [
            { label: "Menu", path: "/admin/menu" },
            {
                label: "Ingredients",
                path: "/admin/ingredients",
                children: [
                    {
                        label: "Archived",
                        path: "/admin/ingredients/archived",
                        // badge: "NEW",
                    },
                ],
            },
            { label: "Recipes", path: "/admin/recipes" },
            { label: "Stock History", path: "/admin/stock" },
        ],
    },
    {
        title: "Business Operations",
        items: [
            { label: "Orders", path: "/admin/orders" },
            { label: "News", path: "/admin/news" },
            { label: "Branches", path: "/admin/branch" },
            { label: "Contact", path: "/admin/contact" },
        ],
    },
];

function isActivePath(pathname: string, itemPath: string) {
    if (itemPath === "/admin") return pathname === "/admin";
    return pathname === itemPath || pathname.startsWith(itemPath + "/");
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
    const pathname = usePathname();

    return (
        <>
            {/* Backdrop for mobile */}
            <div
                className={`
          fixed inset-0 bg-black/40 z-30 md:hidden transition-opacity duration-300 
          ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
                onClick={onClose}
            />

            {/* Sidebar */}
            <aside
                className={`
          fixed top-0 left-0 bottom-0 z-40 w-64 
          bg-[var(--surface)] text-[var(--text-primary)]
          border-r border-[var(--text-muted)]/20
          transform transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 md:static
        `}
            >
                {/* Mobile header */}
                <div className="flex items-center justify-between mb-6 md:hidden px-4">
                    <div className="text-lg font-semibold">☕ Admin</div>
                    <button
                        className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition"
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Navigation Sections */}
                <nav className="flex flex-col gap-6 px-3 mt-4">
                    {navSections.map((section) => (
                        <div key={section.title}>
                            {/* Section header */}
                            <div className="text-xs uppercase tracking-wide text-[var(--text-muted)] px-2 mb-2">
                                {section.title}
                            </div>

                            {/* Items */}
                            <div className="flex flex-col gap-1">
                                {section.items.map((item) => {
                                    const active = isActivePath(pathname, item.path);
                                    const hasChildren = Array.isArray(item.children) && item.children.length > 0;

                                    // ถ้าอยู่หน้า child ให้ parent ดู active ด้วย
                                    const childActive =
                                        hasChildren && item.children!.some((c) => isActivePath(pathname, c.path));

                                    const parentActive = active || childActive;

                                    return (
                                        <div key={item.path}>
                                            <Link
                                                href={item.path}
                                                onClick={() => onClose?.()}
                                                className={`
                          block px-4 py-2.5 rounded-lg font-medium transition-colors duration-200
                          ${parentActive
                                                        ? "bg-[var(--accent)] text-white shadow-sm"
                                                        : "text-[var(--text-secondary)] hover:bg-[var(--accent)]/10 hover:text-[var(--text-primary)]"
                                                    }
                        `}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span>{item.label}</span>
                                                    {item.badge ? (
                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/15">
                                                            {item.badge}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </Link>

                                            {/* Children (nested) */}
                                            {hasChildren ? (
                                                <div className="mt-1 ml-3 pl-2 border-l border-[var(--text-muted)]/20 flex flex-col gap-1">
                                                    {item.children!.map((child) => {
                                                        const childIsActive = isActivePath(pathname, child.path);

                                                        return (
                                                            <Link
                                                                key={child.path}
                                                                href={child.path}
                                                                onClick={() => onClose?.()}
                                                                className={`
                                  block px-3 py-2 rounded-lg text-sm transition-colors
                                  ${childIsActive
                                                                        ? "bg-[var(--accent)]/20 text-[var(--text-primary)]"
                                                                        : "text-[var(--text-secondary)] hover:bg-[var(--accent)]/10 hover:text-[var(--text-primary)]"
                                                                    }
                                `}
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span>{child.label}</span>
                                                                    {child.badge ? (
                                                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/20">
                                                                            {child.badge}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Footer */}
                <div className="mt-10 text-xs text-[var(--text-muted)] border-t border-[var(--text-muted)]/20 pt-4 text-center">
                    © {new Date().getFullYear()} Coffee Admin
                </div>
            </aside>
        </>
    );
}
