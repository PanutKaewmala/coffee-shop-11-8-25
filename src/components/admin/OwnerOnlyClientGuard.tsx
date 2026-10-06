"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminRole } from "@/components/admin/AdminRoleContext";

export default function OwnerOnlyClientGuard({ children }: { children: ReactNode }) {
    const role = useAdminRole();
    const router = useRouter();

    useEffect(() => {
        if (role === "staff") {
            router.replace("/pos");
        } else if (role !== "owner") {
            router.replace("/no-access");
        }
    }, [role, router]);

    if (role !== "owner") {
        return (
            <div className="rounded-xl border border-[var(--text-muted)]/20 bg-[var(--surface)] p-4 text-sm text-[var(--text-secondary)]">
                กำลังตรวจสอบสิทธิ์…
            </div>
        );
    }

    return <>{children}</>;
}
