import type { ReactNode } from "react";
import { requireOwnerPage } from "@/lib/adminAccess";

export default async function StaffLayout({ children }: { children: ReactNode }) {
    await requireOwnerPage("/admin/staff");
    return <>{children}</>;
}
