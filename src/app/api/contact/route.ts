import { getSupabaseServer } from "@/lib/supabaseClient";
import { NextRequest, NextResponse } from "next/server";

/* ===========================================
   GET  /api/contact
=========================================== */
export async function GET() {
    const supabase = getSupabaseServer();

    const { data, error } = await supabase
        .from("contact")
        .select("*")
        .order("created_at", { ascending: false });

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(
        data.map((item) => ({
            id: item.id,
            name: item.name,
            email: item.email,
            message: item.message,
            created_at: item.created_at,
        }))
    );
}

/* ===========================================
   POST  /api/contact
=========================================== */
export async function POST(req: NextRequest) {
    const supabase = getSupabaseServer();
    const body = await req.json();

    const { name, email, message } = body;

    if (!name || !email || !message) {
        return NextResponse.json(
            { error: "Missing required fields" },
            { status: 400 }
        );
    }

    const { data, error } = await supabase
        .from("contact")
        .insert([{ name, email, message }])
        .select()
        .single();

    if (error) {
        console.error("Supabase Insert Error →", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
}

/* ===========================================
   PUT  /api/contact
=========================================== */
export async function PUT(req: NextRequest) {
    const supabase = getSupabaseServer();
    const body = await req.json();

    const { id, name, email, message } = body;

    if (!id)
        return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data, error } = await supabase
        .from("contact")
        .update({
            ...(name !== undefined && { name }),
            ...(email !== undefined && { email }),
            ...(message !== undefined && { message }),
        })
        .eq("id", id)
        .select()
        .single();

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
}

/* ===========================================
   DELETE  /api/contact?id=xxxx
=========================================== */
export async function DELETE(req: NextRequest) {
    const supabase = getSupabaseServer();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id)
        return NextResponse.json({ error: "No id provided" }, { status: 400 });

    const { error } = await supabase
        .from("contact")
        .delete()
        .eq("id", id);

    if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
