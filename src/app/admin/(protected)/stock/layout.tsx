import type { ReactNode } from "react";
import { requireOperationalPage } from "@/lib/adminAccess";

export default async function OperationalLayout({ children }: { children: ReactNode }) {
    await requireOperationalPage("/admin/stock");
    return <>{children}</>;
}
