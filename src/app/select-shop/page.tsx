import "server-only";

import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/accessPolicy.mjs";

export default async function SelectShopAliasPage({
    searchParams,
}: {
    searchParams?: Record<string, string | string[] | undefined> | Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await Promise.resolve(searchParams);
    const nextParam = sp?.next;
    const nextStr = Array.isArray(nextParam) ? nextParam[0] : nextParam;
    const next = safeInternalPath(nextStr, "/admin");

    redirect(`/admin/select-shop?next=${encodeURIComponent(next)}`);
}
