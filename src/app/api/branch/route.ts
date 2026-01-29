// app/api/branch/route.ts
import { getSupabaseServer } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

/* ---------------------------------------
   GET - ดึงข้อมูลสาขา (รองรับ search + primary + pagination)
---------------------------------------- */
export async function GET(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const searchParams = req.nextUrl.searchParams;

    // Query params
    const all = searchParams.get("all");
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const primary = searchParams.get("primary") === "true";

    const page = Number(searchParams.get("page")) || null;
    const limit = Number(searchParams.get("limit")) || null;

    /* -----------------------------------------
     * 1) PAGINATED MODE (Admin table with filters)
     * ----------------------------------------- */
    if (page && limit) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // baseQuery = const (ไม่ต้อง reassignment)
        const baseQuery = supabase
            .from("branch")
            .select("*", { count: "exact" });

        const searchQuery = search
            ? baseQuery.or(
                `name.ilike.%${search}%,address.ilike.%${search}%`
            )
            : baseQuery;

        const finalQuery = primary
            ? searchQuery.eq("is_primary", true)
            : searchQuery;

        const { data, count, error } = await finalQuery
            .order("created_at", { ascending: false })
            .range(from, to);

        if (error) {
            console.error("Branch GET (paginated) →", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            data,
            total: count,
            page,
            totalPages: Math.ceil((count || 0) / limit),
        });
    }

    /* -----------------------------------------
     * 2) Admin: ดึงทั้งหมด (ไม่มี pagination)
     * ----------------------------------------- */
    if (all) {
        const { data, error } = await supabase
            .from("branch")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    }

    /* -----------------------------------------
     * 3) Frontend: ดึง primary branch เดียว
     * ----------------------------------------- */
    const { data, error } = await supabase
        .from("branch")
        .select("*")
        .eq("is_primary", true)
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

/* ---------------------------------------
   POST - เพิ่มสาขา
---------------------------------------- */
export async function POST(req: NextRequest) {
    const supabase = await getSupabaseServer();
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
    const supabase = await getSupabaseServer();
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
    const supabase = await getSupabaseServer();
    const id = new URL(req.url).searchParams.get("id");

    if (!id)
        return NextResponse.json({ error: "No id provided" }, { status: 400 });

    const { error } = await supabase.from("branch").delete().eq("id", id);

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
