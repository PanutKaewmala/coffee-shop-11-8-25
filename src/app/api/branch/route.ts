// app/api/branch/route.ts
import { getSupabaseServer } from "@/lib/supabaseClient";
import { NextRequest, NextResponse } from "next/server";

/* ---------------------------------------
   GET - ดึงข้อมูลสาขาทั้งหมด
---------------------------------------- */
export async function GET(req: NextRequest) {
    const supabase = getSupabaseServer();
    const searchParams = req.nextUrl.searchParams;
    const all = searchParams.get("all");

    let data, error;

    if (all) {
        // Admin: ดึงทั้งหมด
        ({ data, error } = await supabase
            .from("branch")
            .select("*")
            .order("created_at", { ascending: false }));
    } else {
        // Frontend: ดึง primary branch
        ({ data, error } = await supabase
            .from("branch")
            .select("*")
            .eq("is_primary", true)
            .single());
    }

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

/* ---------------------------------------
   POST - เพิ่มสาขา
---------------------------------------- */
export async function POST(req: NextRequest) {
    const supabase = getSupabaseServer();
    const body = await req.json();

    const { name, address, phone, mapLink, openingHours } = body;

    if (!name || !address) {
        return NextResponse.json(
            { error: "Missing required fields: name, address" },
            { status: 400 }
        );
    }

    const { data, error } = await supabase
        .from("branch")
        .insert([
            {
                name,
                address,
                phone,
                map_url: mapLink || null,
                opening_hours: openingHours || null,
            },
        ])
        .select()
        .single();

    if (error) {
        console.error("branch insert error →", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}

/* ---------------------------------------
   PUT - อัปเดตสาขา
---------------------------------------- */
export async function PUT(req: NextRequest) {
    const supabase = getSupabaseServer();
    const body = await req.json();

    const { id, name, address, phone, mapLink, openingHours } = body;

    if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("branch")
        .update({
            ...(name !== undefined && { name }),
            ...(address !== undefined && { address }),
            ...(phone !== undefined && { phone }),
            ...(mapLink !== undefined && { map_url: mapLink }),
            ...(openingHours !== undefined && { opening_hours: openingHours }),
        })
        .eq("id", id)
        .select()
        .single();

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
}

/* ---------------------------------------
   DELETE - ลบสาขา
---------------------------------------- */
export async function DELETE(req: NextRequest) {
    const supabase = getSupabaseServer();
    const id = new URL(req.url).searchParams.get("id");

    if (!id)
        return NextResponse.json({ error: "No id provided" }, { status: 400 });

    const { error } = await supabase.from("branch").delete().eq("id", id);

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
