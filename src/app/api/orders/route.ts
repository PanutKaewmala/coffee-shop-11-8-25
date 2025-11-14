import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { OrderItem } from "@/lib/types";

/* -----------------------------------------
   GET /api/orders
   GET /api/orders?id=xxxx (GET single order)
------------------------------------------ */
export async function GET(req: NextRequest) {
    const supabase = getSupabaseServer();
    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get("id");

    /* ------------------ GET Order by ID ------------------ */
    if (id) {
        const { data: order, error } = await supabase
            .from("orders")
            .select("*, order_items(*)")
            .eq("id", id)
            .single();

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        // ⭐ FIX: แปลง order_items → items
        const formatted = {
            ...order,
            items: order.order_items ?? [],
        };

        return NextResponse.json({ order: formatted });
    }

    /* ------------------ GET All Orders ------------------ */
    const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ⭐ FIX: แปลง order_items → items ให้ทั้ง array
    const formattedOrders = data.map((o) => ({
        ...o,
        items: o.order_items ?? [],
    }));

    return NextResponse.json({ orders: formattedOrders });
}

/* -----------------------------------------
   POST /api/orders
------------------------------------------ */
export async function POST(req: Request) {
    try {
        const supabase = getSupabaseServer();
        const body = await req.json();

        const { items, total } = body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: "No items provided" },
                { status: 400 }
            );
        }

        if (typeof total !== "number") {
            return NextResponse.json(
                { error: "Invalid total value" },
                { status: 400 }
            );
        }

        /* ------------------ 1) Insert Order ------------------ */
        const { data: createdOrder, error: orderError } = await supabase
            .from("orders")
            .insert([{ total }])
            .select()
            .single();

        if (orderError) {
            return NextResponse.json(
                { error: orderError.message },
                { status: 500 }
            );
        }

        /* ------------------ 2) Insert Order Items ------------------ */
        const itemsToInsert = items.map((item: OrderItem) => ({
            order_id: createdOrder.id,
            menu_id: item.id,
            name: item.name,
            price: item.price,
            qty: item.qty,
        }));

        const { error: itemError } = await supabase
            .from("order_items")
            .insert(itemsToInsert);

        if (itemError) {
            return NextResponse.json(
                { error: itemError.message },
                { status: 500 }
            );
        }

        /* ------------------ 3) Return Response ------------------ */
        return NextResponse.json({
            success: true,
            order: {
                ...createdOrder,
                items: itemsToInsert, // ⭐ consistent with GET
            },
        });
    } catch (error) {
        return NextResponse.json(
            { error: "Server error while creating order" },
            { status: 500 }
        );
    }
}
