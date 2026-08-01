import type { ReactNode } from "react";
import { requireOwnerPage } from "@/lib/adminAccess";

export default async function OwnerReportsLayout({ children }: { children: ReactNode }) {
    await requireOwnerPage();
    return <>{children}</>;
}
