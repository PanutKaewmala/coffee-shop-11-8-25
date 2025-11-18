import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import type { OrderItem, Recipe, Ingredient } from "@/lib/types";
import { validateStockBeforeOrder } from "@/lib/stockUtils";
import { deductStock } from "@/lib/deductStock";

/* ============================================
   GET /api/orders
============================================ */
export async function GET(req: NextRequest) {
    const supabase = getSupabaseServer();
    const id = req.nextUrl.searchParams.get("id");

    // ----- GET single order -----
    if (id) {
        const { data, error } = await supabase
            .from("orders")
            .select("*, order_items(*)")
            .eq("id", id)
            .single();

        if (error || !data) {
            return NextResponse.json(
                { error: error?.message ?? "Order not found" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            order: { ...data, items: data.order_items ?? [] },
        });
    }

    // ----- GET all orders -----
    const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });

    if (error || !data) {
        return NextResponse.json(
            { error: error?.message ?? "Load failed" },
            { status: 500 }
        );
    }

    return NextResponse.json({
        orders: data.map((o) => ({
            ...o,
            items: o.order_items ?? [],
        })),
    });
}

/* ============================================
   POST /api/orders   (Auto Stock Deduction)
============================================ */
export async function POST(req: Request) {
    try {
        const supabase = getSupabaseServer();
        const body = await req.json();

        const { items, total } = body;

        // ----- Validate body -----
        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: "No items provided" }, { status: 400 });
        }
        if (typeof total !== "number") {
            return NextResponse.json({ error: "Invalid total value" }, { status: 400 });
        }

        /* -----------------------------
           1) Create Order
        ------------------------------ */
        const { data: createdOrder, error: orderError } = await supabase
            .from("orders")
            .insert([{ total }])
            .select()
            .single();

        if (orderError || !createdOrder) {
            return NextResponse.json(
                { error: orderError?.message ?? "Failed to create order" },
                { status: 500 }
            );
        }

        const orderId = createdOrder.id;

        /* -----------------------------
           2) Insert order_items
        ------------------------------ */
        const itemsToInsert = items.map((i: OrderItem) => ({
            order_id: orderId,
            menu_id: i.id,
            name: i.name,
            price: i.price,
            qty: i.qty,
        }));

        const { error: itemError } = await supabase
            .from("order_items")
            .insert(itemsToInsert);

        if (itemError) {
            return NextResponse.json({ error: itemError.message }, { status: 500 });
        }

        /* -----------------------------
           3) Load recipes for these menus
        ------------------------------ */
        const menuIds = items.map((i: OrderItem) => i.id);

        const { data: recipes, error: recErr } = await supabase
            .from("recipes")
            .select("*")
            .in("menu_id", menuIds);

        if (recErr || !recipes) {
            return NextResponse.json(
                { error: recErr?.message ?? "Failed to load recipes" },
                { status: 500 }
            );
        }

        /* -----------------------------
           4) Build grouped ingredient usage
              → quantity: ใช้ต่อแก้ว
              → amount: จำนวนแก้วรวม
        ------------------------------ */
        const groupedItems: Record<
            string,
            { quantity: number; amount: number }
        > = {};

        items.forEach((orderItem) => {
            const recipeItems = recipes.filter(
                (r) => r.menu_id === orderItem.id
            );

            recipeItems.forEach((r) => {
                if (!groupedItems[r.ingredient_id]) {
                    groupedItems[r.ingredient_id] = {
                        quantity: r.quantity, // ใช้ต่อแก้ว
                        amount: orderItem.qty, // # แก้ว
                    };
                } else {
                    groupedItems[r.ingredient_id].amount += orderItem.qty;
                }
            });
        });

        /* -----------------------------
           5) Validate stock
        ------------------------------ */
        const { data: ingredients, error: ingErr } = await supabase
            .from("ingredients")
            .select("*");

        if (ingErr || !ingredients) {
            return NextResponse.json(
                { error: ingErr?.message ?? "Failed to load ingredients" },
                { status: 500 }
            );
        }

        // แปลง groupedItems เพื่อ validateStockBeforeOrder()
        const requiredFlat: Record<string, number> = {};
        Object.entries(groupedItems).forEach(([id, v]) => {
            requiredFlat[id] = v.quantity * v.amount;
        });

        validateStockBeforeOrder(ingredients as Ingredient[], requiredFlat);

        /* -----------------------------
           6) Deduct stock (function ใหม่)
        ------------------------------ */
        const { success, items: deductedItems } = await deductStock({
            order_id: orderId,
            note: null,
            items: Object.entries(groupedItems).map(
                ([ingredient_id, v]) => ({
                    ingredient_id,
                    quantity: v.quantity, // ต่อแก้ว
                    amount: v.amount,     // # แก้ว
                })
            ),
        });

        /* -----------------------------
           SUCCESS
        ------------------------------ */
        return NextResponse.json({
            success: true,
            order: { ...createdOrder, items: itemsToInsert },
            deducted: deductedItems,
        });
    } catch (err) {
        console.error(err);
        return NextResponse.json(
            { error: "Server error while creating order" },
            { status: 500 }
        );
    }
}
