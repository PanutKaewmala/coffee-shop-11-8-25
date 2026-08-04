// src/app/admin/(protected)/layout.tsx
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerIdentity } from "@/lib/supabaseServer";
import AdminShell from "../AdminShell";
import { decideProtectedRoot } from "@/lib/accessPolicy.mjs";

// routes
const LOGIN_NEXT = "/login?next=/admin";
const SELECT_SHOP = "/admin/select-shop?next=/admin";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
    const { user, currentShopId, currentBranchId, currentShopRole, hasAnyShopMembership } = await getServerIdentity();

    const decision = decideProtectedRoot({
        authenticated: Boolean(user),
        hasCurrentShop: Boolean(currentShopId),
        hasAnyMembership: hasAnyShopMembership,
        role: currentShopRole,
    });
    if (decision.action === "login") redirect(LOGIN_NEXT);
    if (decision.action === "select-shop") redirect(SELECT_SHOP);
    if (decision.action !== "allow") redirect("/no-access");

    // ✅ ไม่บังคับ branch ที่นี่แล้ว
    // - Owner: ดูภาพรวมได้ (currentBranchId ว่างได้)
    // - Staff: จะถูกบังคับ branch เฉพาะหน้า POS / งานหน้าร้าน
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
