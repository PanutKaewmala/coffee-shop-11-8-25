"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LogoutButton() {
    const router = useRouter();

    return (
        <button
            type="button"
            onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/login");
                router.refresh();
            }}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
            ออกจากระบบ
        </button>
    );
}
