// src/app/select-branch/page.tsx
import "server-only";

import { redirect } from "next/navigation";
import SelectBranchClient from "./SelectBranchClient";
import { safeInternalPath } from "@/lib/accessPolicy.mjs";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer, getServerIdentity } from "@/lib/supabaseServer";

type Branch = {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    is_primary: boolean;
};

export default async function SelectBranchPage({
    searchParams,
}: {
    // รองรับทั้งแบบ object และ Promise (Next 16 บาง config ส่งมาเป็น Promise)
    searchParams?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await Promise.resolve(searchParams);

    const nextParam = sp?.next;
    const nextStr = Array.isArray(nextParam) ? nextParam[0] : nextParam;

    const next = safeInternalPath(nextStr, "/admin");

    const { user, currentShopId, currentShopRole, hasAnyShopMembership } = await getServerIdentity();

    if (!user) {
        redirect(`/login?next=${encodeURIComponent(`/select-branch?next=${next}`)}`);
    }

    if (!currentShopId) {
        if (!hasAnyShopMembership) redirect("/no-access");
        redirect(`/admin/select-shop?next=${encodeURIComponent(next)}`);
    }

    if (!currentShopRole) redirect("/no-access");

    const supabase = await getSupabaseServer();

    const { data: member } = await supabase
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (!member) {
        redirect(`/admin/select-shop?next=${encodeURIComponent(next)}`);
    }

    const admin = getSupabaseAdmin();

    const { data, error } = await admin
        .from("branch")
        .select("id,name,address,phone,is_primary")
        .eq("shop_id", currentShopId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });

    return (
        <SelectBranchClient
            branches={(data ?? []) as Branch[]}
            error={error?.message}
            autoPick
            next={next}
            role={currentShopRole}
        />
    );
}
