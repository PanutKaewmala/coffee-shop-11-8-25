// src/app/admin/AdminShell.tsx
"use client";

import { ReactNode, useCallback, useState } from "react";
import AdminNavbar from "@/components/admin/AdminNavbar";
import Sidebar from "@/components/admin/Sidebar";
import { AdminRoleProvider } from "@/components/admin/AdminRoleContext";

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
    const isPos = contentVariant === "pos";
    const [contextNames, setContextNames] = useState<{ shopName: string | null; branchName: string | null }>({
        shopName: null,
        branchName: null,
    });
    const handleContextLoaded = useCallback((context: { shopName: string | null; branchName: string | null }) => {
        setContextNames(context);
    }, []);

    return (
        <div className={`flex min-h-screen bg-[var(--background)] text-[var(--text-primary)] transition-colors duration-300 ${isPos ? "md:h-dvh md:min-h-0 md:overflow-hidden" : ""}`}>
            {!isPos ? <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                currentShopId={currentShopId}
                currentBranchId={currentBranchId}
                currentShopRole={currentShopRole}
                currentShopName={contextNames.shopName}
                currentBranchName={contextNames.branchName}
            /> : null}

            <div className="flex-1 min-w-0 flex flex-col relative z-10">
                <AdminNavbar
                    onToggleSidebar={isPos ? undefined : () => setIsSidebarOpen((v) => !v)}
                    posMode={isPos}
                    currentShopId={currentShopId}
                    currentBranchId={currentBranchId}
                    currentShopRole={currentShopRole}
                    onContextLoaded={handleContextLoaded}
                />

                <main className={`flex-1 min-w-0 ${isPos ? "md:min-h-0 md:overflow-hidden" : "overflow-auto p-4 md:p-8"}`}>
                    <AdminRoleProvider role={currentShopRole === "owner" || currentShopRole === "staff" ? currentShopRole : null}>
                        <div className={isPos ? "md:h-full" : "max-w-6xl mx-auto space-y-6"}>{children}</div>
                    </AdminRoleProvider>
                </main>
            </div>
        </div>
    );
}
