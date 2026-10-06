import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";
import FirstShopOnboardingClient from "./FirstShopOnboardingClient";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
    const supabase = await getSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) redirect("/login?next=/onboarding");

    const admin = getSupabaseAdmin();
    const { data: memberships, error } = await admin
        .from("shop_members")
        .select("shop_id")
        .eq("user_id", auth.user.id)
        .limit(1);

    if (error) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6 text-[var(--text-primary)]">
                <div className="w-full max-w-lg rounded-2xl border border-[var(--text-muted)]/20 bg-[var(--surface)] p-6">
                    <h1 className="text-xl font-bold">เปิดหน้าตั้งค่าร้านไม่สำเร็จ</h1>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{error.message}</p>
                </div>
            </main>
        );
    }

    if ((memberships ?? []).length > 0) {
        redirect("/api/context/resolve?next=%2Fadmin");
    }

    return <FirstShopOnboardingClient email={auth.user.email ?? ""} />;
}
