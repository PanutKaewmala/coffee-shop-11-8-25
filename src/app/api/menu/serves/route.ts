import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";

/**
 * MENU SERVE TYPES CRUD
 * Tables: menu_serve_types (id uuid, name text)
 */

// GET — list all
export async function GET() {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
        .from("menu_serve_types")
        .select("*")
        .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// POST — add new
export async function POST(req: NextRequest) {
    const body = await req.json();
    const name = body?.name?.trim();

    if (!name) {
        return NextResponse.json(
            { error: "Name is required" },
            { status: 400 }
        );
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
        .from("menu_serve_types")
        .insert({ name })
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// PUT — update
export async function PUT(req: NextRequest) {
    const body = await req.json();
    const id = body?.id;
    const name = body?.name?.trim();

    if (!id || !name) {
        return NextResponse.json(
            { error: "ID and name are required" },
            { status: 400 }
        );
    }

    const supabase = getSupabaseServer();

    const { data, error } = await supabase
        .from("menu_serve_types")
        .update({ name })
        .eq("id", id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// DELETE — remove
export async function DELETE(req: NextRequest) {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
        return NextResponse.json(
            { error: "ID is required" },
            { status: 400 }
        );
    }

    const supabase = getSupabaseServer();

    const { error } = await supabase
        .from("menu_serve_types")
        .delete()
        .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
}
