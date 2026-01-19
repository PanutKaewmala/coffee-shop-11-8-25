// app/api/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import { deductStock } from "@/lib/deductStock";

export const dynamic = "force-dynamic";

/* ============================================
   Types (no any)
============================================ */

type OrderStatus = "paid" | "void" | "refunded";
type PaymentMethod = "cash" | "promptpay";

type OrderItemRow = {
    id: string;
    order_id: string | null;
    menu_id: string | null;
    variant_id: string | null;
    name: string | null;
    price: number | null;
    qty: number | null;
    created_at?: string | null;

    // ✅ new
    variant_label?: string | null;

    // ✅ join fallback (computed if variant_label null)
    variant?: {
        id: string;
        size: string | null;
        serve_type_id: string | null;
        serve_type?: { id: string; name: string } | null;
    } | null;
};

type OrderWithItemsRow = {
    id: string;
    total: number | null;
    created_at: string;

    status: OrderStatus | null;
    payment_method: PaymentMethod | null;
    paid_at?: string | null;
    note?: string | null;

    order_items: OrderItemRow[] | null;
};

type MenuRow = {
    id: string;
    name: string;
    price: number | null;
};

type VariantRow = {
    id: string;
    menu_id: string;
    price_override: number | null;

    // ✅ for label
    serve_type_id: string;
    size: string;
};

type MenuVariantMiniRow = {
    id: string;
    menu_id: string;
};

type ServeTypeRow = {
    id: string;
    name: string;
};

type IncomingItem = {
    menu_id?: unknown;
    id?: unknown; // legacy menu_id
    variant_id?: unknown;
    qty?: unknown;
};

type IncomingBody = {
    items?: unknown;
    total?: unknown; // ignore (server compute)

    payment_method?: unknown; // ✅ new
    note?: unknown; // ✅ optional
};

function toStringOrNull(v: unknown): string | null {
    if (typeof v === "string" && v.trim()) return v.trim();
    return null;
}

function toNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function isPaymentMethod(v: string | null): v is PaymentMethod {
    return v === "cash" || v === "promptpay";
}

function isStockErrorMessage(msg: string) {
    const m = msg.toLowerCase();
    return (
        msg.includes("ไม่พอ") ||
        m.includes("stock") ||
        m.includes("ingredient") ||
        m.includes("recipe")
    );
}

function compactSpaces(s: string) {
    return s.replace(/\s+/g, " ").trim();
}

// ✅ hide implementation detail ("default") from users
function cleanLabel(s: string | null | undefined): string | null {
    if (!s) return null;
    const cleaned = compactSpaces(String(s).replace(/\bdefault\b/gi, ""));
    return cleaned || null;
}

function buildVariantLabel(opts: {
    serveTypeName?: string | null;
    size?: string | null;
}) {
    const a = cleanLabel(opts.serveTypeName);
    const b = cleanLabel(opts.size);
    const merged = compactSpaces([a, b].filter(Boolean).join(" • "));
    return merged || null;
}

/* ============================================
   GET /api/orders
   - ✅ include variant_label
   - ✅ join variant->serve_type for fallback label
============================================ */
export async function GET(req: NextRequest) {
    const supabase = getSupabaseServer();
    const id = req.nextUrl.searchParams.get("id");

    // ✅ include join (variant -> serve_type)
    const select = `
    id,
    total,
    created_at,
    status,
    payment_method,
    paid_at,
    note,
    order_items(
      id,
      order_id,
      menu_id,
      variant_id,
      variant_label,
      name,
      price,
      qty,
      created_at,
      variant:menu_variants(
        id,
        size,
        serve_type_id,
        serve_type:menu_serve_types(
          id,
          name
        )
      )
    )
  `;

    if (id) {
        const { data, error } = await supabase
            .from("orders")
            .select(select)
            .eq("id", id)
            .single()
            .returns<OrderWithItemsRow>();

        if (error || !data) {
            return NextResponse.json(
                { error: error?.message ?? "Order not found" },
                { status: 500 }
            );
        }

        // ✅ fallback label if missing (and cleanup)
        const items = (data.order_items ?? []).map((it) => {
            const label =
                cleanLabel(it.variant_label) ??
                buildVariantLabel({
                    serveTypeName: it.variant?.serve_type?.name ?? null,
                    size: it.variant?.size ?? null,
                });

            return {
                id: it.id,
                order_id: it.order_id,
                menu_id: it.menu_id,
                variant_id: it.variant_id,
                variant_label: label,
                name: it.name,
                price: it.price,
                qty: it.qty,
                created_at: it.created_at ?? null,
            };
        });

        return NextResponse.json({
            order: {
                id: data.id,
                total: data.total,
                created_at: data.created_at,
                status: data.status ?? "paid",
                payment_method: data.payment_method ?? "cash",
                paid_at: data.paid_at ?? null,
                note: data.note ?? null,
                items,
            },
        });
    }

    const { data, error } = await supabase
        .from("orders")
        .select(select)
        .order("created_at", { ascending: false })
        .returns<OrderWithItemsRow[]>();

    if (error || !data) {
        return NextResponse.json(
            { error: error?.message ?? "Load failed" },
            { status: 500 }
        );
    }

    return NextResponse.json({
        orders: data.map((o) => {
            const items = (o.order_items ?? []).map((it) => {
                const label =
                    cleanLabel(it.variant_label) ??
                    buildVariantLabel({
                        serveTypeName: it.variant?.serve_type?.name ?? null,
                        size: it.variant?.size ?? null,
                    });

                return {
                    id: it.id,
                    order_id: it.order_id,
                    menu_id: it.menu_id,
                    variant_id: it.variant_id,
                    variant_label: label,
                    name: it.name,
                    price: it.price,
                    qty: it.qty,
                    created_at: it.created_at ?? null,
                };
            });

            return {
                id: o.id,
                total: o.total,
                created_at: o.created_at,
                status: o.status ?? "paid",
                payment_method: o.payment_method ?? "cash",
                paid_at: o.paid_at ?? null,
                note: o.note ?? null,
                items,
            };
        }),
    });
}

/* ============================================
   POST /api/orders
   - ✅ compute variant_label แล้ว insert ลง order_items
   - ✅ cleanup "default" in label
============================================ */
export async function POST(req: NextRequest) {
    const supabase = getSupabaseServer();
    let createdOrderId: string | null = null;

    try {
        const raw = (await req.json().catch(() => null)) as IncomingBody | null;
        const rawItems = raw?.items;

        if (!Array.isArray(rawItems) || rawItems.length === 0) {
            return NextResponse.json({ error: "No items provided" }, { status: 400 });
        }

        const paymentRaw = toStringOrNull(raw?.payment_method);
        const payment_method: PaymentMethod = isPaymentMethod(paymentRaw)
            ? paymentRaw
            : "cash";

        const noteRaw = toStringOrNull(raw?.note);
        const note = noteRaw ? noteRaw : null;

        const normalized = (rawItems as IncomingItem[])
            .map((i) => {
                const menu_id = toStringOrNull(i.menu_id) ?? toStringOrNull(i.id);
                const variant_id = toStringOrNull(i.variant_id);
                const qty = toNumber(i.qty, 0);
                return { menu_id, variant_id, qty };
            })
            .filter((i) => i.menu_id && i.qty > 0) as Array<{
                menu_id: string;
                variant_id: string | null;
                qty: number;
            }>;

        if (normalized.length === 0) {
            return NextResponse.json({ error: "Invalid items" }, { status: 400 });
        }

        const menuIds = Array.from(new Set(normalized.map((i) => i.menu_id)));

        const { data: menus, error: menuErr } = await supabase
            .from("menu")
            .select("id, name, price")
            .in("id", menuIds)
            .returns<MenuRow[]>();

        if (menuErr) return NextResponse.json({ error: menuErr.message }, { status: 500 });

        const menuMap = new Map<string, MenuRow>();
        (menus ?? []).forEach((m) => menuMap.set(m.id, m));

        for (const it of normalized) {
            if (!menuMap.has(it.menu_id)) {
                return NextResponse.json(
                    { error: `Menu not found: ${it.menu_id}` },
                    { status: 400 }
                );
            }
        }

        const { data: menuVariantsMini, error: mvMiniErr } = await supabase
            .from("menu_variants")
            .select("id, menu_id")
            .in("menu_id", menuIds)
            .returns<MenuVariantMiniRow[]>();

        if (mvMiniErr) return NextResponse.json({ error: mvMiniErr.message }, { status: 500 });

        const menusWithVariants = new Set<string>(
            (menuVariantsMini ?? []).map((v) => v.menu_id)
        );

        const { data: defaultsMini, error: defErr } = await supabase
            .from("menu_variants")
            .select("id, menu_id")
            .in("menu_id", menuIds)
            .eq("is_default", true)
            .returns<MenuVariantMiniRow[]>();

        if (defErr) return NextResponse.json({ error: defErr.message }, { status: 500 });

        const defaultsByMenu = new Map<string, string[]>();
        (defaultsMini ?? []).forEach((d) => {
            const arr = defaultsByMenu.get(d.menu_id) ?? [];
            arr.push(d.id);
            defaultsByMenu.set(d.menu_id, arr);
        });

        const items = normalized.map((it) => {
            if (it.variant_id) return it;

            if (menusWithVariants.has(it.menu_id)) {
                const defs = defaultsByMenu.get(it.menu_id) ?? [];
                if (defs.length === 1) return { ...it, variant_id: defs[0] };
                return { ...it, variant_id: null };
            }

            return { ...it, variant_id: null };
        });

        for (const it of items) {
            if (!it.variant_id) {
                return NextResponse.json(
                    {
                        error: menusWithVariants.has(it.menu_id)
                            ? "Please select a variant for this menu item (default not found / ambiguous)."
                            : "This menu has no variants. Create a default variant first so stock can be deducted by variant.",
                        debug: { menu_id: it.menu_id },
                    },
                    { status: 400 }
                );
            }
        }

        const variantIds = Array.from(new Set(items.map((i) => i.variant_id))) as string[];

        // ✅ load variants w/ serve_type_id + size
        const { data: variants, error: vErr } = await supabase
            .from("menu_variants")
            .select("id, menu_id, price_override, serve_type_id, size")
            .in("id", variantIds)
            .returns<VariantRow[]>();

        if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

        const variantMap = new Map<string, VariantRow>();
        (variants ?? []).forEach((v) => variantMap.set(v.id, v));

        for (const it of items) {
            const v = variantMap.get(it.variant_id!);
            if (!v) {
                return NextResponse.json(
                    { error: `Variant not found: ${it.variant_id}` },
                    { status: 400 }
                );
            }
            if (v.menu_id !== it.menu_id) {
                return NextResponse.json({ error: "Variant does not belong to menu" }, { status: 400 });
            }
        }

        // ✅ load serve types to build label
        const serveTypeIds = Array.from(
            new Set((variants ?? []).map((v) => v.serve_type_id).filter(Boolean))
        );

        const { data: serveTypes, error: stErr } = await supabase
            .from("menu_serve_types")
            .select("id, name")
            .in("id", serveTypeIds)
            .returns<ServeTypeRow[]>();

        if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

        const serveTypeMap = new Map<string, string>();
        (serveTypes ?? []).forEach((s) => serveTypeMap.set(s.id, s.name));

        // ✅ compute order_items + total + variant_label (cleaned)
        const itemsToInsert = items.map((it) => {
            const menu = menuMap.get(it.menu_id)!;
            const basePrice = toNumber(menu.price, 0);
            const v = variantMap.get(it.variant_id!)!;
            const finalPrice = toNumber(v.price_override ?? basePrice, basePrice);

            const variant_label = buildVariantLabel({
                serveTypeName: serveTypeMap.get(v.serve_type_id) ?? null,
                size: v.size ?? null,
            });

            return {
                menu_id: it.menu_id,
                variant_id: it.variant_id!,
                variant_label,
                name: menu.name,
                price: finalPrice,
                qty: it.qty,
            };
        });

        const total = itemsToInsert.reduce((sum, i) => sum + i.price * i.qty, 0);

        const { data: createdOrder, error: orderErr } = await supabase
            .from("orders")
            .insert([
                {
                    total,
                    status: "paid",
                    payment_method,
                    paid_at: new Date().toISOString(),
                    note,
                },
            ])
            .select("id,total,created_at,status,payment_method,paid_at,note")
            .single()
            .returns<
                Pick<
                    OrderWithItemsRow,
                    "id" | "total" | "created_at" | "status" | "payment_method" | "paid_at" | "note"
                >
            >();

        if (orderErr || !createdOrder) {
            return NextResponse.json(
                { error: orderErr?.message ?? "Failed to create order" },
                { status: 500 }
            );
        }

        createdOrderId = createdOrder.id;

        const { error: itemErr } = await supabase.from("order_items").insert(
            itemsToInsert.map((i) => ({
                order_id: createdOrderId,
                menu_id: i.menu_id,
                variant_id: i.variant_id,
                variant_label: i.variant_label,
                name: i.name,
                price: i.price,
                qty: i.qty,
            }))
        );

        if (itemErr) {
            await supabase.from("orders").delete().eq("id", createdOrderId);
            createdOrderId = null;
            return NextResponse.json({ error: itemErr.message }, { status: 500 });
        }

        const result = await deductStock({
            order_id: createdOrderId,
            note: "", // ห้าม null
            items: itemsToInsert.map((i) => ({ variant_id: i.variant_id, qty: i.qty })),
        });

        if (!result.success) {
            await supabase.from("order_items").delete().eq("order_id", createdOrderId);
            await supabase.from("orders").delete().eq("id", createdOrderId);
            createdOrderId = null;

            return NextResponse.json(
                { error: result.error, deducted: result.items },
                { status: isStockErrorMessage(result.error) ? 400 : 500 }
            );
        }

        return NextResponse.json({
            success: true,
            order: { ...createdOrder, items: itemsToInsert },
            deducted: result.items,
        });
    } catch (err: unknown) {
        console.error(err);

        if (createdOrderId) {
            const supa = getSupabaseServer();
            await supa.from("order_items").delete().eq("order_id", createdOrderId);
            await supa.from("orders").delete().eq("id", createdOrderId);
        }

        const msg = err instanceof Error ? err.message : "Server error while creating order";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
