// src/lib/routeSupabase.ts
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export async function withSupabase<T>(
    fn: (supabase: Awaited<ReturnType<typeof getSupabaseServer>>) => Promise<T>
) {
    const supabase = await getSupabaseServer();
    return fn(supabase);
}

export function jsonError(message: string, status = 500) {
    return NextResponse.json({ error: message }, { status });
}
