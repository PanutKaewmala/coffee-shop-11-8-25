// src/app/admin/layout.tsx
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerIdentity } from "@/lib/supabaseServer";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const { user } = await getServerIdentity();

    if (!user) redirect("/login?next=/admin");

    // ✅ ยังไม่บังคับ shop ที่นี่
    return <>{children}</>;
}
