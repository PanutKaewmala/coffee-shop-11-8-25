// app/api/branch/primary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";

/* ---------------------------------------
   GET primary branch
---------------------------------------- */
export async function GET() {
    const supabase = getSupabaseServer();

    const { data, error } = await supabase
        .from("branch")
        .select("*")
        .eq("is_primary", true)
        .single();

    if (error) {
        console.error("primary branch error →", error.message);
        return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
}

/* ---------------------------------------
   PUT - Set new primary branch
---------------------------------------- */
export async function PUT(req: NextRequest) {
    const supabase = getSupabaseServer();

    // รับ id จาก query param
    const id = new URL(req.url).searchParams.get("id");

    if (!id) {
        return NextResponse.json(
            { error: "Missing id" },
            { status: 400 }
        );
    }

    console.log("Setting new primary branch:", id);

    // 1) Reset primary ของทุกสาขา ยกเว้นสาขาที่เลือก
    const { error: resetError } = await supabase
        .from("branch")
        .update({ is_primary: false })
        .neq("id", id);

    if (resetError) {
        console.error("reset primary error →", resetError);
        return NextResponse.json({ error: resetError.message }, { status: 500 });
    }

    // 2) Set primary ให้สาขานั้น
    const { data, error } = await supabase
        .from("branch")
        .update({ is_primary: true })
        .eq("id", id)
        .select()
        .single();

    if (error) {
        console.error("set primary error →", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
}
