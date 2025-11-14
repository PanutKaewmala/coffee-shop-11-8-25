import { getSupabaseServer } from "@/lib/supabaseClient";
import { NextRequest, NextResponse } from "next/server";

/** -----------------------
 *  GET  /api/menu
 *  ----------------------*/
export async function GET() {
    const supabase = getSupabaseServer();

    const { data, error } = await supabase
        .from("menu")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map DB → Frontend
    const mapped = data.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        category: item.category,
        serveTypes: item.serve_types ?? [],   // ⭐ array
        image: item.image_url,
        description: item.description,
        createdAt: item.created_at,
    }));

    return NextResponse.json(mapped);
}

/** -----------------------
 *  POST  /api/menu
 *  ----------------------*/
export async function POST(req: NextRequest) {
    const supabase = getSupabaseServer();
    const body = await req.json();

    const {
        name,
        price,
        category,
        serveTypes,     // ⭐ array เช่น ["Hot", "Iced"]
        image,
        description,
    } = body;

    // Validation
    if (!name || price === "" || !Array.isArray(serveTypes) || serveTypes.length === 0) {
        return NextResponse.json(
            { error: "Missing required fields: name, price, or serveTypes[]" },
            { status: 400 }
        );
    }

    const { data, error } = await supabase
        .from("menu")
        .insert([
            {
                name,
                price,
                category,
                serve_types: serveTypes,   // ⭐ array
                image_url: image,
                description,
            },
        ])
        .select()
        .single();

    if (error) {
        console.error("supabase insert error ->", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}

/** -----------------------
 *  PUT  /api/menu
 *  ----------------------*/
export async function PUT(req: NextRequest) {
    const supabase = getSupabaseServer();
    const body = await req.json();

    const { id, name, price, category, serveTypes, image, description } = body;

    if (!id)
        return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data, error } = await supabase
        .from("menu")
        .update({
            ...(name !== undefined && { name }),
            ...(price !== undefined && { price }),
            ...(category !== undefined && { category }),
            ...(serveTypes !== undefined && { serve_types: serveTypes }), // ⭐ array
            ...(image !== undefined && { image_url: image }),
            ...(description !== undefined && { description }),
        })
        .eq("id", id)
        .select()
        .single();

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
}

/** -----------------------
 *  DELETE  /api/menu
 *  ----------------------*/
export async function DELETE(req: NextRequest) {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id)
        return NextResponse.json({ error: "No id provided" }, { status: 400 });

    const { error } = await supabase.from("menu").delete().eq("id", id);

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
