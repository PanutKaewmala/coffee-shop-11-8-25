import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";

export async function GET() {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase.from("hero").select("*").limit(1).single();

    if (error) {
        console.error("Hero fetch error:", error);
        return NextResponse.json({ error: "Failed to load hero data" }, { status: 500 });
    }

    return NextResponse.json(data);
}
