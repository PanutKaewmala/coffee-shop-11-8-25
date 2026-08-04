// src/app/admin/AdminShell.tsx
"use client";

import { ReactNode, useCallback, useState } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import Sidebar from "@/components/admin/Sidebar";

export default function AdminShell({
    children,
    currentShopId,
    currentBranchId,
    currentShopRole,
    contentVariant = "admin",
}: {
    children: ReactNode;
    currentShopId: string;
    currentBranchId: string | null;
    currentShopRole: string | null;
    contentVariant?: "admin" | "pos";
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [contextNames, setContextNames] = useState<{ shopName: string | null; branchName: string | null }>({
        shopName: null,
        branchName: null,
    });
    const handleContextLoaded = useCallback((context: { shopName: string | null; branchName: string | null }) => {
        setContextNames(context);
    }, []);

    return (
        <div className="flex min-h-screen bg-[var(--background)] text-[var(--text-primary)] transition-colors duration-300">
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                currentShopId={currentShopId}
                currentBranchId={currentBranchId}
                currentShopRole={currentShopRole}
                currentShopName={contextNames.shopName}
                currentBranchName={contextNames.branchName}
            />

            <div className="flex-1 min-w-0 flex flex-col relative z-10">
                <AdminNavbar
                    onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
                    currentShopId={currentShopId}
                    currentBranchId={currentBranchId}
                    currentShopRole={currentShopRole}
                    onContextLoaded={handleContextLoaded}
                />

                <main className={`flex-1 min-w-0 overflow-auto ${contentVariant === "admin" ? "p-4 md:p-8" : ""}`}>
                    <div className={contentVariant === "admin" ? "max-w-6xl mx-auto space-y-6" : "min-h-full"}>{children}</div>
                </main>
            </div>
        </div>
    );
}
