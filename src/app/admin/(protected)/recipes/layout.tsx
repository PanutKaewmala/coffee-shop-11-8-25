import type { ReactNode } from "react";
import { requireOwnerPage } from "@/lib/adminAccess";

export default async function OwnerOnlyLayout({ children }: { children: ReactNode }) {
    await requireOwnerPage("/admin/recipes");
    return <>{children}</>;
}
