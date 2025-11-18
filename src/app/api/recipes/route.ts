import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";

// GET all recipes
export async function GET() {
    const supabase = getSupabaseServer();

    const { data, error } = await supabase
        .from("recipes")
        .select("*")
        .order("menu_id", { ascending: true });

    if (error) {
        console.error("GET /recipes:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
}

// POST create recipe
export async function POST(req: Request) {
    const supabase = getSupabaseServer();
    const body = await req.json();

    const { menu_id, ingredient_id, quantity } = body;

    if (!menu_id || !ingredient_id || quantity === undefined) {
        return NextResponse.json(
            { error: "menu_id, ingredient_id and quantity are required" },
            { status: 400 }
        );
    }

    // Convert if quantity is string
    const qty = Number(quantity);
    if (Number.isNaN(qty) || qty <= 0) {
        return NextResponse.json(
            { error: "quantity must be a valid number > 0" },
            { status: 400 }
        );
    }

    const { data, error } = await supabase
        .from("recipes")
        .insert([{ menu_id, ingredient_id, quantity: qty }])
        .select()
        .single();

    if (error) {
        console.error("POST /recipes:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// PUT update recipe
export async function PUT(req: Request) {
    const supabase = getSupabaseServer();
    const body = await req.json();

    const { id, menu_id, ingredient_id, quantity } = body;

    if (!id) {
        return NextResponse.json({ error: "Missing recipe id" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (menu_id !== undefined) updateData.menu_id = menu_id;
    if (ingredient_id !== undefined) updateData.ingredient_id = ingredient_id;
    if (quantity !== undefined) {
        const qty = Number(quantity);
        if (Number.isNaN(qty) || qty <= 0) {
            return NextResponse.json(
                { error: "quantity must be a valid number > 0" },
                { status: 400 }
            );
        }
        updateData.quantity = qty;
    }

    const { data, error } = await supabase
        .from("recipes")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        console.error("PUT /recipes:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// DELETE recipe
export async function DELETE(req: Request) {
    const supabase = getSupabaseServer();

    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
        return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const { error } = await supabase.from("recipes").delete().eq("id", id);

    if (error) {
        console.error("DELETE /recipes:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
