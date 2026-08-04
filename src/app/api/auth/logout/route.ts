import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { logoutPlan } from "@/lib/contextPolicy.mjs";

export async function POST() {
    const supabase = await getSupabaseServer();
    await supabase.auth.signOut();

    const cookieStore = await cookies();
    const plan = logoutPlan();
    for (const name of plan.clearCookies) {
        cookieStore.set({ name, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
    }

    return NextResponse.json({ ok: true, destination: plan.destination });
}
