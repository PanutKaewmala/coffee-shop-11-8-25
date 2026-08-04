import type { ReactNode } from "react";
import { requireOwnerPage } from "@/lib/adminAccess";

export default async function ArchivedIngredientsLayout({ children }: { children: ReactNode }) {
    await requireOwnerPage("/admin/ingredients/archived");
    return <>{children}</>;
}
