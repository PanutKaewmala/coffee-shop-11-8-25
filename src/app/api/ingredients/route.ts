import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { IngredientUpdatePayload } from "@/lib/types";

// 👉 ถ้านายมี supabaseAdmin.ts อยู่แล้ว ใช้อันนั้นแทนได้เลย
// import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ใช้ server-side supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // service role ใช้สำหรับ admin API
);

/**
 * GET /api/ingredients
 * ดึงวัตถุดิบทั้งหมด
 */
export async function GET() {
    const { data, error } = await supabase
        .from("ingredients")
        .select("*")
        .order("name", { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

/**
 * POST /api/ingredients
 * เพิ่มวัตถุดิบใหม่
 */
export async function POST(request: Request) {
    const body = await request.json();

    if (!body.name || !body.unit) {
        return NextResponse.json(
            { error: "name และ unit จำเป็นต้องมี" },
            { status: 400 }
        );
    }

    const { data, error } = await supabase
        .from("ingredients")
        .insert({
            name: body.name,
            stock: body.stock ?? 0,
            unit: body.unit,
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

/**
 * PUT /api/ingredients
 * อัพเดตวัตถุดิบ หรือเติมสต๊อก
 */
export async function PUT(request: Request) {
    const body = await request.json();

    if (!body.id) {
        return NextResponse.json(
            { error: "ต้องมี id เพื่ออัพเดตวัตถุดิบ" },
            { status: 400 }
        );
    }

    const updateData: IngredientUpdatePayload = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.stock !== undefined) updateData.stock = body.stock;

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from("ingredients")
        .update(updateData)
        .eq("id", body.id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

/**
 * DELETE /api/ingredients?id=...
 */
export async function DELETE(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
        return NextResponse.json(
            { error: "ต้องมี id เพื่อทำการลบ" },
            { status: 400 }
        );
    }

    const { error } = await supabase
        .from("ingredients")
        .delete()
        .eq("id", id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
