// src/app/admin/AdminShell.tsx
"use client";

import { ReactNode, useState } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import Sidebar from "@/components/admin/Sidebar";

export default function AdminShell({
    children,
    currentShopId,
    currentBranchId,
}: {
    children: ReactNode;
    currentShopId: string;
    currentBranchId: string | null;
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-[var(--background)] text-[var(--text-primary)] transition-colors duration-300">
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                currentShopId={currentShopId}
                currentBranchId={currentBranchId}
            />

            <div className="flex-1 flex flex-col relative z-10">
                <AdminNavbar
                    onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
                    currentShopId={currentShopId}
                    currentBranchId={currentBranchId}
                />

                <main className="flex-1 p-4 md:p-8 overflow-auto">
                    <div className="max-w-6xl mx-auto space-y-6">{children}</div>
                </main>
            </div>
        </div>
    );
}
