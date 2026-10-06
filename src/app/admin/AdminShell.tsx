// src/app/admin/AdminShell.tsx
"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AdminNavbar from "@/components/admin/AdminNavbar";
import Sidebar from "@/components/admin/Sidebar";
import { AdminRoleProvider } from "@/components/admin/AdminRoleContext";
import {
    contextSelectorPath,
    isOperationalPath,
    isOwnerOnlyPath,
} from "@/lib/accessPolicy.mjs";

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
    const pathname = usePathname();
    const router = useRouter();
    const [contextNames, setContextNames] = useState<{ shopName: string | null; branchName: string | null }>({
        shopName: null,
        branchName: null,
    });

    const staffOnOwnerRoute = currentShopRole === "staff" && isOwnerOnlyPath(pathname);
    const staffNeedsBranch =
        currentShopRole === "staff"
        && isOperationalPath(pathname)
        && !currentBranchId;

    useEffect(() => {
        if (staffOnOwnerRoute) {
            router.replace("/pos");
            return;
        }

        if (staffNeedsBranch) {
            router.replace(contextSelectorPath("branch", pathname));
        }
    }, [pathname, router, staffNeedsBranch, staffOnOwnerRoute]);

    const handleContextLoaded = useCallback((context: { shopName: string | null; branchName: string | null }) => {
        setContextNames(context);
    }, []);

    const routeGuardPending = staffOnOwnerRoute || staffNeedsBranch;

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
                        <div className={isPos ? "md:h-full" : "max-w-6xl mx-auto space-y-6"}>
                            {routeGuardPending ? (
                                <div className="flex min-h-40 items-center justify-center text-sm text-[var(--text-muted)]">
                                    กำลังเปิดหน้าที่ใช้งานได้…
                                </div>
                            ) : children}
                        </div>
                    </AdminRoleProvider>
                </main>
            </div>
        </div>
    );
}
