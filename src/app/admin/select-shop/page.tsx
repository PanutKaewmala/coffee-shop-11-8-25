// src/app/admin/select-shop/page.tsx
import { redirect } from "next/navigation";
import { getSupabaseServer, getCurrentContextFromCookies } from "@/lib/supabaseServer";
import SelectShopClient from "./SelectShopClient";
import { safeInternalPath } from "@/lib/accessPolicy.mjs";


type ShopRow = { id: string; name: string };
type MemberRow = { shop_id: string; shops: ShopRow | null };

export default async function SelectShopPage({
    searchParams,
}: {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await Promise.resolve(searchParams);
    const rawNext = Array.isArray(sp?.next) ? sp.next[0] : sp?.next;
    const next = safeInternalPath(rawNext, "/admin");
    const supabase = await getSupabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) redirect("/login?next=/admin/select-shop");

    // ถ้ามี cookie อยู่แล้ว ไม่ต้องมาเลือกซ้ำ
    const { currentShopId } = await getCurrentContextFromCookies();
    if (currentShopId) {
        const { data: member, error: mErr } = await supabase
            .from("shop_members")
            .select("shop_id")
            .eq("user_id", user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (mErr) {
            return <SelectShopClient shops={[]} error={mErr.message} />;
        }

        if (member) redirect(next);
    }

    const { data, error } = await supabase
        .from("shop_members")
        .select("shop_id, shops(id,name), created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

    if (error) {
        // โยนไปให้ client แสดง error แบบอ่านง่าย
        return <SelectShopClient shops={[]} error={error.message} />;
    }

    const shops = (data ?? [])
        .map((row) => {
            const r = row as unknown as MemberRow;
            if (!r.shops?.id) return null;
            return { id: r.shops.id, name: r.shops.name ?? r.shops.id };
        })
        .filter((x): x is ShopRow => x !== null);

    if (shops.length === 0) redirect("/no-access");

    // ถ้ามีร้านเดียว: auto-select ให้เลย (UX โหดๆ)
    if (shops.length === 1) {
        // เรียก API ตั้ง cookie ไม่ได้จาก server component ง่ายๆ แบบปลอดภัย
        // เลยให้ client ทำ auto-click แทน (ยังเร็วอยู่)
        return <SelectShopClient shops={shops} autoPickSingle />;
    }

    return <SelectShopClient shops={shops} />;
}
