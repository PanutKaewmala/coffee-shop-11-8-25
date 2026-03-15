// src/app/admin/(protected)/layout.tsx
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerIdentity } from "@/lib/supabaseServer";
import AdminShell from "../AdminShell";

// routes
const LOGIN_NEXT = "/login?next=/admin";
const SELECT_SHOP = "/admin/select-shop?next=/admin";

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
    const { user, currentShopId, currentBranchId } = await getServerIdentity();

    if (!user) redirect(LOGIN_NEXT);

    // ✅ ต้องมี shop ก่อน (กันข้อมูลปนแบบ multi-tenant)
    if (!currentShopId) redirect(SELECT_SHOP);

    // ✅ ไม่บังคับ branch ที่นี่แล้ว
    // - Owner: ดูภาพรวมได้ (currentBranchId ว่างได้)
    // - Staff: จะถูกบังคับ branch เฉพาะหน้า POS / งานหน้าร้าน
    return (
        <AdminShell currentShopId={currentShopId} currentBranchId={currentBranchId}>
            {children}
        </AdminShell>
    );
}
