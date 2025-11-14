import { getSupabaseServer } from "@/lib/supabaseClient";
import { NextRequest, NextResponse } from "next/server";

// ✅ GET: ดึงข่าวทั้งหมด
export async function GET() {
    const supabase = getSupabaseServer(); // ✅ ใช้ service key
    const { data, error } = await supabase
        .from("news")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// ✅ POST: เพิ่มข่าวใหม่
export async function POST(req: NextRequest) {
    const supabase = getSupabaseServer(); // ✅ ใช้ service key
    const body = await req.json();
    const { title, content, image, date } = body;

    if (!title || !content)
        return NextResponse.json({ error: "Missing title or content" }, { status: 400 });

    const { data, error } = await supabase
        .from("news")
        .insert([
            {
                title,
                content,
                image_url: image,
                created_at: date || new Date().toISOString(),
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

// ✅ PUT: อัปเดตข่าว
export async function PUT(req: NextRequest) {
    const supabase = getSupabaseServer(); // ✅ ใช้ service key
    const body = await req.json();
    const { id, title, content, image, date } = body;

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data, error } = await supabase
        .from("news")
        .update({
            ...(title && { title }),
            ...(content && { content }),
            ...(image && { image_url: image }),
            ...(date && { created_at: date }),
        })
        .eq("id", id)
        .select()
        .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

// ✅ DELETE: ลบข่าวตาม id
export async function DELETE(req: NextRequest) {
    const supabase = getSupabaseServer(); // ✅ ใช้ service key
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "No id provided" }, { status: 400 });

    const { error } = await supabase.from("news").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
