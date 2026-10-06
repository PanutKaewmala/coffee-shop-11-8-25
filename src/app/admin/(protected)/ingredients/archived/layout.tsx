import type { ReactNode } from "react";
import OwnerOnlyClientGuard from "@/components/admin/OwnerOnlyClientGuard";

export default function ArchivedIngredientsLayout({ children }: { children: ReactNode }) {
    return <OwnerOnlyClientGuard>{children}</OwnerOnlyClientGuard>;
}
