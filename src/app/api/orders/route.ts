// app/api/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { checkDailyClose, toBangkokBusinessDate } from "@/lib/dailyCloseGuard";
import type { InventorySnapshot, RecipeSnapshot } from "@/lib/saleSnapshot";

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
    recipe_snapshot?: RecipeSnapshot | null;

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
    paid_amount: number | null;
    change_amount: number | null;
    paid_at?: string | null;
    note?: string | null;
    inventory_snapshot?: InventorySnapshot | null;

    // ✅ cancel fields (new)
    cancel_reason?: string | null;
    cancel_note?: string | null;
    cancelled_at?: string | null;
    cancelled_by?: string | null;

    order_items: OrderItemRow[] | null;
};

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
    paid_amount,
    change_amount,
    paid_at,
    note,
    cancel_reason,
    cancel_note,
    cancelled_at,
    cancelled_by,
    shop_id,
    branch_id,
    inventory_snapshot,
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
      recipe_snapshot,
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

        const { data, error } = await q.returns<
            OrderWithItemsRow & { shop_id: string; branch_id: string }
        >();

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
                recipe_snapshot: it.recipe_snapshot ?? null,
            };
        });

        let cancelEligibility: {
            canCancel: boolean;
            code: string | null;
            message: string | null;
            businessDate: string | null;
            closeStatus: string | null;
        } = {
            canCancel: true,
            code: null,
            message: null,
            businessDate: null,
            closeStatus: null,
        };

        if (data.status === "paid") {
            const timestamp = data.paid_at ?? data.created_at;
            if (timestamp) {
                const businessDate = toBangkokBusinessDate(timestamp);
                const guardResult = await checkDailyClose(
                    data.shop_id,
                    data.branch_id,
                    businessDate
                );
                if (guardResult.blocked && guardResult.closeStatus) {
                    cancelEligibility = {
                        canCancel: false,
                        code: "BUSINESS_DAY_CLOSED",
                        message: "ออเดอร์นี้อยู่ในวันที่ปิดยอดแล้ว จึงไม่สามารถยกเลิกได้",
                        businessDate: guardResult.businessDate,
                        closeStatus: guardResult.closeStatus,
                    };
                } else {
                    cancelEligibility = {
                        canCancel: true,
                        code: null,
                        message: null,
                        businessDate,
                        closeStatus: null,
                    };
                }
            }
        }

        return NextResponse.json({
            order: {
                id: data.id,
                total: data.total,
                created_at: data.created_at,
                status: data.status ?? "paid",
                payment_method: data.payment_method ?? "cash",
                paid_amount: data.paid_amount ?? null,
                change_amount: data.change_amount ?? null,
                paid_at: data.paid_at ?? null,
                note: data.note ?? null,
                branch_id: data.branch_id,
                inventory_snapshot: data.inventory_snapshot ?? null,

                // ✅ cancel fields
                cancel_reason: data.cancel_reason ?? null,
                cancel_note: data.cancel_note ?? null,
                cancelled_at: data.cancelled_at ?? null,
                cancelled_by: data.cancelled_by ?? null,

                cancelEligibility,

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
                paid_amount: o.paid_amount ?? null,
                change_amount: o.change_amount ?? null,
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

/** Sales have one mutation entry point, with atomic inventory and replay protection. */
export async function POST() {
    return NextResponse.json(
        { error: "Create sales through /api/pos with an Idempotency-Key", code: "USE_POS_CHECKOUT" },
        { status: 405, headers: { Allow: "GET" } }
    );
}
