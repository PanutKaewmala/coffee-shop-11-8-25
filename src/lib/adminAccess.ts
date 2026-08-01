import "server-only";

import { redirect } from "next/navigation";
import { getServerIdentity } from "@/lib/supabaseServer";

export const STAFF_HOME = "/pos";

export function isOwnerOnlyAdminPath(pathname: string) {
    return pathname === "/admin" || pathname === "/admin/reports" || pathname.startsWith("/admin/reports/");
}

export async function requireOwnerPage() {
    const identity = await getServerIdentity();
    if (!identity.user) redirect("/login?next=/admin");
    if (identity.currentShopRole !== "owner") redirect(STAFF_HOME);
    return identity;
}
