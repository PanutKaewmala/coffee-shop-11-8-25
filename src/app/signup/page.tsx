import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabaseServer";
import SignupClient from "./SignupClient";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
    const supabase = await getSupabaseServer();
    const { data: auth } = await supabase.auth.getUser();

    if (auth.user) redirect("/onboarding");

    return (
        <Suspense fallback={<div className="p-6 text-sm opacity-70">กำลังโหลด...</div>}>
            <SignupClient />
        </Suspense>
    );
}
