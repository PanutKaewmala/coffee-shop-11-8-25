// app/api/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { deductStock } from "@/lib/deductStock";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Database } from "@/lib/database.types";

export const dynamic = "force-dynamic";

/* ============================================
   Types (no any)
============================================ */

type OrderStatus = "paid" | "cancelled" | "void" | "refunded";
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

    // ✅ stored label
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

    // ✅ cancel fields (new)
    cancel_reason?: string | null;
    cancel_note?: string | null;
    cancelled_at?: string | null;
    cancelled_by?: string | null;

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

function buildVariantLabel(opts: { serveTypeName?: string | null; size?: string | null }) {
    const a = cleanLabel(opts.serveTypeName);
    const b = cleanLabel(opts.size);
    const merged = compactSpaces([a, b].filter(Boolean).join(" • "));
    return merged || null;
}

/* ============================================
   GET /api/orders
   - ✅ include variant_label
   - ✅ join variant->serve_type for fallback label
   - ✅ include cancel_* fields for admin detail/history
============================================ */
export async function GET(req: NextRequest) {
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    const id = req.nextUrl.searchParams.get("id");

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
    if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
    if (!currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }
    if (!currentBranchId) {
        return NextResponse.json({ error: "No current branch selected" }, { status: 409 });
    }

    const { data: member, error: mErr } = await admin
        .from("shop_members")
        .select("role")
        .eq("user_id", auth.user.id)
        .eq("shop_id", currentShopId)
        .maybeSingle();

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    if (!member) {
        return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
    }

    const select = `
    id,
    total,
    created_at,
    status,
    payment_method,
    paid_at,
    note,
    cancel_reason,
    cancel_note,
    cancelled_at,
    cancelled_by,
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
        const q = admin
            .from("orders")
            .select(select)
            .eq("shop_id", currentShopId)
            .eq("id", id)
            .filter("branch_id", "eq", currentBranchId)
            .single();

        const { data, error } = await q.returns<OrderWithItemsRow>();

        if (error || !data) {
            return NextResponse.json(
                { error: error?.message ?? "Order not found" },
                { status: 500 }
            );
        }

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

                // ✅ cancel fields
                cancel_reason: data.cancel_reason ?? null,
                cancel_note: data.cancel_note ?? null,
                cancelled_at: data.cancelled_at ?? null,
                cancelled_by: data.cancelled_by ?? null,

                items,
            },
        });
    }

    let listQ = admin
        .from("orders")
        .select(select)
        .eq("shop_id", currentShopId)
        .order("created_at", { ascending: false });

    listQ = listQ.filter("branch_id", "eq", currentBranchId);

    const { data, error } = await listQ.returns<OrderWithItemsRow[]>();

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

                // ✅ cancel fields (for list badge / drilldown)
                cancel_reason: o.cancel_reason ?? null,
                cancel_note: o.cancel_note ?? null,
                cancelled_at: o.cancelled_at ?? null,
                cancelled_by: o.cancelled_by ?? null,

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
    const supabase = await getSupabaseServer();
    const admin = getSupabaseAdmin();
    let createdOrderId: string | null = null;
    let scopedShopId: string | null = null;

    try {
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { currentShopId, currentBranchId } = await getCurrentContextFromCookies();
        scopedShopId = currentShopId;
        if (!currentShopId) {
            return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
        }
        if (!currentBranchId) {
            return NextResponse.json({ error: "No current branch selected" }, { status: 409 });
        }

        const { data: member, error: mErr } = await admin
            .from("shop_members")
            .select("role")
            .eq("user_id", auth.user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
        if (!member) {
            return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
        }

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

        const { data: menus, error: menuErr } = await admin
            .from("menu")
            .select("id, name, price")
            .eq("shop_id", currentShopId)
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

        const { data: menuVariantsMini, error: mvMiniErr } = await admin
            .from("menu_variants")
            .select("id, menu_id")
            .eq("shop_id", currentShopId)
            .in("menu_id", menuIds)
            .returns<MenuVariantMiniRow[]>();

        if (mvMiniErr) return NextResponse.json({ error: mvMiniErr.message }, { status: 500 });

        const menusWithVariants = new Set<string>((menuVariantsMini ?? []).map((v) => v.menu_id));

        const { data: defaultsMini, error: defErr } = await admin
            .from("menu_variants")
            .select("id, menu_id")
            .eq("shop_id", currentShopId)
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

        const { data: variants, error: vErr } = await admin
            .from("menu_variants")
            .select("id, menu_id, price_override, serve_type_id, size")
            .eq("shop_id", currentShopId)
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

        const serveTypeIds = Array.from(new Set((variants ?? []).map((v) => v.serve_type_id).filter(Boolean)));

        const { data: serveTypes, error: stErr } = await admin
            .from("menu_serve_types")
            .select("id, name")
            .eq("shop_id", currentShopId)
            .in("id", serveTypeIds)
            .returns<ServeTypeRow[]>();

        if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

        const serveTypeMap = new Map<string, string>();
        (serveTypes ?? []).forEach((s) => serveTypeMap.set(s.id, s.name));

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

        const orderPayloadBase: Database["public"]["Tables"]["orders"]["Insert"] = {
            total,
            status: "paid",
            payment_method,
            paid_at: new Date().toISOString(),
            note,
            shop_id: currentShopId,
        };

        const orderPayload = {
            ...orderPayloadBase,
            branch_id: currentBranchId,
        } as unknown as Database["public"]["Tables"]["orders"]["Insert"];

        const { data: createdOrder, error: orderErr } = await admin
            .from("orders")
            .insert([orderPayload])
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

        const orderItemPayload = itemsToInsert.map((i) => ({
            order_id: createdOrderId,
            menu_id: i.menu_id,
            variant_id: i.variant_id,
            variant_label: i.variant_label,
            name: i.name,
            price: i.price,
            qty: i.qty,
            shop_id: currentShopId,
        })) as Database["public"]["Tables"]["order_items"]["Insert"][];

        const { error: itemErr } = await admin.from("order_items").insert(orderItemPayload);

        if (itemErr) {
            await admin
                .from("orders")
                .delete()
                .eq("id", createdOrderId)
                .eq("shop_id", currentShopId);
            createdOrderId = null;
            return NextResponse.json({ error: itemErr.message }, { status: 500 });
        }

        const result = await deductStock({
            order_id: createdOrderId,
            note: "", // ห้าม null
            items: itemsToInsert.map((i) => ({ variant_id: i.variant_id, qty: i.qty })),
        });

        if (!result.success) {
            await admin
                .from("order_items")
                .delete()
                .eq("order_id", createdOrderId)
                .eq("shop_id", currentShopId);
            await admin
                .from("orders")
                .delete()
                .eq("id", createdOrderId)
                .eq("shop_id", currentShopId);
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
            if (scopedShopId) {
                await admin
                    .from("order_items")
                    .delete()
                    .eq("order_id", createdOrderId)
                    .eq("shop_id", scopedShopId);
                await admin
                    .from("orders")
                    .delete()
                    .eq("id", createdOrderId)
                    .eq("shop_id", scopedShopId);
            } else {
                await admin.from("order_items").delete().eq("order_id", createdOrderId);
                await admin.from("orders").delete().eq("id", createdOrderId);
            }
        }

        const msg = err instanceof Error ? err.message : "Server error while creating order";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
