"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminRole } from "@/components/admin/AdminRoleContext";

type ResolvedRole = "owner" | "staff" | null;

export default function OwnerOnlyClientGuard({ children }: { children: ReactNode }) {
    const parentRole = useAdminRole();
    const router = useRouter();
    const [fallbackRole, setFallbackRole] = useState<ResolvedRole>(null);
    const [fallbackChecked, setFallbackChecked] = useState(false);

    const resolvedRole = parentRole ?? fallbackRole;
    const checked = parentRole !== null || fallbackChecked;

    useEffect(() => {
        if (parentRole === "owner") return;

        if (parentRole === "staff") {
            router.replace("/pos");
            return;
        }

        let cancelled = false;

        async function resolveRole() {
            try {
                const response = await fetch("/api/context/access", { cache: "no-store" });
                const data = await response.json().catch(() => null);
                if (cancelled) return;

                const role: ResolvedRole =
                    data?.role === "owner" || data?.role === "staff" ? data.role : null;

                setFallbackRole(role);
                setFallbackChecked(true);

                if (role === "staff") {
                    router.replace("/pos");
                } else if (role !== "owner") {
                    router.replace("/no-access");
                }
            } catch {
                if (cancelled) return;
                setFallbackRole(null);
                setFallbackChecked(true);
                router.replace("/no-access");
            }
        }

        void resolveRole();

        return () => {
            cancelled = true;
        };
    }, [parentRole, router]);

    if (!checked || resolvedRole !== "owner") {
        return (
            <div className="rounded-xl border border-[var(--text-muted)]/20 bg-[var(--surface)] p-4 text-sm text-[var(--text-secondary)]">
                กำลังตรวจสอบสิทธิ์…
            </div>
        );
    }

    return <>{children}</>;
}
