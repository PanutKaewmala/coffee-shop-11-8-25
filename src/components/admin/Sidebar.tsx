// components/admin/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

/* ================================
   Types
================================ */
export interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;

    // SaaS context
    currentShopId?: string;
    currentBranchId?: string | null;
    currentShopRole?: string | null;

    // optional: ถ้าส่งชื่อมาจาก server
    currentShopName?: string | null;
    currentBranchName?: string | null;
}

type NavItem = {
    label: string;
    path: string;
    children?: NavItem[];
    badge?: string;
};

/* ================================
   Navigation config
================================ */
const navSections: { title: string; items: NavItem[] }[] = [
    {
        title: "ภาพรวม",
        items: [
            { label: "ภาพรวมวันนี้", path: "/admin" },
            { label: "รายงาน", path: "/admin/reports" },
        ],
    },
    {
        title: "จัดการสินค้า",
        items: [
            { label: "เมนู", path: "/admin/menu" },
            {
                label: "วัตถุดิบ",
                path: "/admin/ingredients",
                children: [{ label: "คลังเก่า", path: "/admin/ingredients/archived" }],
            },
            { label: "สูตรเมนู", path: "/admin/recipes" },
            { label: "ประวัติสต็อก", path: "/admin/stock" },
        ],
    },
    {
        title: "การดำเนินธุรกิจ",
        items: [
            { label: "ออเดอร์", path: "/admin/orders" },
            { label: "ปิดยอดวัน", path: "/admin/daily-close" },
            { label: "ข่าวสาร", path: "/admin/news" },
            { label: "สาขา", path: "/admin/branch" },
            { label: "ติดต่อ", path: "/admin/contact" },
        ],
    },
];

/* ================================
   Helpers
================================ */
function isActivePath(pathname: string, itemPath: string) {
    if (itemPath === "/admin") return pathname === "/admin";
    return pathname === itemPath || pathname.startsWith(itemPath + "/");
}

/* ================================
   Component
================================ */
export default function Sidebar({
    isOpen = false,
    onClose,
    currentShopId,
    currentBranchId,
    currentShopRole,
    currentShopName,
    currentBranchName,
}: SidebarProps) {
    const pathname = usePathname();
    const visibleSections = currentShopRole === "owner"
        ? navSections
        : navSections.filter((section) => section.title !== "ภาพรวม");

    const shopLabel =
        currentShopName ??
        (currentShopId ? "กำลังโหลดชื่อร้าน…" : "ยังไม่ได้เลือกร้าน");

    const branchLabel =
        currentBranchName ??
        (currentBranchId ? "กำลังโหลดชื่อสาขา…" : "ยังไม่ได้เลือกสาขา");

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
           fixed top-0 left-0 bottom-0 z-40 w-64 max-w-[85vw]
          bg-[var(--surface)] text-[var(--text-primary)]
          border-r border-[var(--text-muted)]/20
          transform transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 md:static
        `}
            >
                {/* Mobile header */}
                <div className="flex items-center justify-between md:hidden px-4 py-3 border-b border-[var(--text-muted)]/20">
                    <div className="text-lg font-semibold">☕ จัดการร้าน</div>
                    <button
                        className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition"
                        onClick={onClose}
                        aria-label="ปิดเมนูด้านข้าง"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Current context */}
                <div className="px-4 mt-4">
                    <div className="rounded-xl border border-[var(--text-muted)]/20 bg-[var(--surface)] p-3">
                        <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                            ร้าน/สาขาที่ใช้งาน
                        </div>
                        <div className="mt-1 text-sm font-semibold truncate">{shopLabel}</div>
                        <div className="text-xs text-[var(--text-secondary)] truncate">{branchLabel}</div>
                    </div>
                </div>

                {/* Navigation Sections */}
                <nav className="flex flex-col gap-6 px-3 mt-6">
                    {visibleSections.map((section) => (
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

                                            {/* Children */}
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
                    © {new Date().getFullYear()} ระบบจัดการร้านกาแฟ
                </div>
            </aside>
        </>
    );
}
