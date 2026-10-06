// src/app/admin/(protected)/layout.tsx
import { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerIdentity } from "@/lib/supabaseServer";
import AdminShell from "../AdminShell";
import {
    decideProtectedRoot,
    isOperationalPath,
    isOwnerOnlyPath,
} from "@/lib/accessPolicy.mjs";

const LOGIN_NEXT = "/login?next=/admin";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
    const requestHeaders = await headers();
    const pathname = requestHeaders.get("x-talvo-pathname") || "/admin";

    const {
        user,
        currentShopId,
        currentBranchId,
        currentShopRole,
        hasAnyShopMembership,
    } = await getServerIdentity();

    const decision = decideProtectedRoot({
        authenticated: Boolean(user),
        hasCurrentShop: Boolean(currentShopId),
        hasAnyMembership: hasAnyShopMembership,
        role: currentShopRole,
    });

    if (decision.action === "login") redirect(LOGIN_NEXT);
    if (decision.action === "select-shop") {
        redirect(`/api/context/resolve?next=${encodeURIComponent(pathname)}`);
    }
    if (decision.action !== "allow") redirect("/no-access");

    if (currentShopRole === "staff" && isOwnerOnlyPath(pathname)) {
        redirect("/pos");
    }

    if (currentShopRole === "staff" && isOperationalPath(pathname) && !currentBranchId) {
        redirect(`/api/context/resolve?next=${encodeURIComponent(pathname)}`);
    }

    return (
        <AdminShell
            currentShopId={currentShopId!}
            currentBranchId={currentBranchId}
            currentShopRole={currentShopRole}
        >
            {children}
        </AdminShell>
    );
}
