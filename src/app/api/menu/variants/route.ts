// app/api/menu/variants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/* =========================
   Types
========================= */
type UUID = string;

type MenuVariantRow = {
    id: UUID;
    menu_id: UUID;
    serve_type_id: UUID;
    size: string; // NOT NULL
    price_override: number | null;
    image_url: string | null;
    is_default: boolean;
    created_at: string;
};

type VariantView = {
    id: UUID;
    menu_id: UUID;
    serve_type_id: UUID;
    serve_type_name: string | null;
    size: string;
    price_override: number | null;
    image_url: string | null;
    is_default: boolean;
    created_at: string;
};

type MenuVariantInsert = {
    menu_id: UUID;
    serve_type_id: UUID;
    size: string;
    price_override: number | null;
    image_url: string | null;
    is_default: boolean;
};

type MenuVariantUpdate = Partial<
    Pick<MenuVariantRow, "size" | "price_override" | "image_url" | "is_default">
>;

/* =========================
   Utils
========================= */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function toStringOrNull(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function toBool(v: unknown, fallback = false): boolean {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
        const s = v.toLowerCase().trim();
        if (s === "true" || s === "1") return true;
        if (s === "false" || s === "0") return false;
    }
    if (typeof v === "number") return v === 1;
    return fallback;
}

function toNumberOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function toView(row: MenuVariantRow, serveTypeName: string | null): VariantView {
    return {
        id: row.id,
        menu_id: row.menu_id,
        serve_type_id: row.serve_type_id,
        serve_type_name: serveTypeName,
        size: row.size,
        price_override: row.price_override ?? null,
        image_url: row.image_url ?? null,
        is_default: Boolean(row.is_default),
        created_at: row.created_at,
    };
}

const SELECT_BASE = `
  id,
  menu_id,
  serve_type_id,
  size,
  price_override,
  image_url,
  is_default,
  created_at
`;

async function loadServeTypeNameMap(args: {
    supabase: Awaited<ReturnType<typeof getSupabaseServer>>;
    serveTypeIds: UUID[];
    shopId?: string | null;
}) {
    const { supabase, serveTypeIds, shopId } = args;
    const map = new Map<UUID, string>();
    if (!serveTypeIds.length) return map;

    let q = supabase
        .from("menu_serve_types")
        .select("id,name")
        .in("id", serveTypeIds);
    if (shopId) q = q.eq("shop_id", shopId);

    const { data, error } = await q;

    if (error) return map;

    for (const row of data ?? []) {
        if (row.id && row.name) map.set(row.id, row.name);
    }

    return map;
}

/**
 * หา "ตัวแทน default" ในกลุ่มเดียวกัน (menu_id, serve_type_id) โดยไม่เอาตัวเดิม
 * - ถ้าไม่มี => null
 */
async function findReplacementVariantId(args: {
    supabase: ReturnType<typeof getSupabaseServer>;
    menu_id: UUID;
    serve_type_id: UUID;
    exclude_id: UUID;
}): Promise<UUID | null> {
    const { supabase, menu_id, serve_type_id, exclude_id } = args;

    const { data, error } = await supabase
        .from("menu_variants")
        .select("id")
        .eq("menu_id", menu_id)
        .eq("serve_type_id", serve_type_id)
        .neq("id", exclude_id)
        .order("created_at", { ascending: false })
        .limit(1);

    if (error) return null;
    const first = (data ?? [])[0] as { id?: UUID } | undefined;
    return first?.id ?? null;
}

/* =========================================================
   GET /api/menu/variants
========================================================= */
export async function GET(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const admin = getSupabaseAdmin();
        const url = new URL(req.url);

        const id = url.searchParams.get("id");
        const menu_id = url.searchParams.get("menu_id");
        const serve_type_id = url.searchParams.get("serve_type_id");
        const is_default_q = url.searchParams.get("is_default");

        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { currentShopId } = await getCurrentContextFromCookies();
        if (!currentShopId) {
            return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
        }

        const { data: member, error: memberErr } = await admin
            .from("shop_members")
            .select("role")
            .eq("user_id", auth.user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
        if (!member) {
            return NextResponse.json({ error: "Not a member of current shop" }, { status: 403 });
        }

        if (id) {
            const { data, error } = await admin
                .from("menu_variants")
                .select(SELECT_BASE)
                .eq("id", id)
                .eq("shop_id", currentShopId)
                .maybeSingle();

            if (error) {
                return NextResponse.json(
                    { error: error.message },
                    { status: 500 }
                );
            }
            if (!data) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

            const row = data as unknown as MenuVariantRow;
            const serveTypeMap = await loadServeTypeNameMap({
                supabase: admin,
                serveTypeIds: row.serve_type_id ? [row.serve_type_id] : [],
                shopId: currentShopId,
            });

            return NextResponse.json({
                variant: toView(row, serveTypeMap.get(row.serve_type_id) ?? null),
            });
        }

        let q = admin
            .from("menu_variants")
            .select(SELECT_BASE)
            .eq("shop_id", currentShopId)
            .order("created_at", { ascending: false });

        if (menu_id) q = q.eq("menu_id", menu_id);
        if (serve_type_id) q = q.eq("serve_type_id", serve_type_id);
        if (is_default_q !== null) q = q.eq("is_default", toBool(is_default_q));

        const { data, error } = await q;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const list = (data ?? []) as unknown as MenuVariantRow[];
        const serveTypeIds = Array.from(
            new Set(list.map((r) => r.serve_type_id).filter(Boolean))
        ) as UUID[];
        const serveTypeMap = await loadServeTypeNameMap({
            supabase: admin,
            serveTypeIds,
            shopId: currentShopId,
        });

        return NextResponse.json({
            variants: list.map((row) => toView(row, serveTypeMap.get(row.serve_type_id) ?? null)),
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================================================
   POST /api/menu/variants
========================================================= */
export async function POST(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const raw = (await req.json().catch(() => null)) as unknown;

        if (!isRecord(raw)) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const menu_id = toStringOrNull(raw.menu_id);
        const serve_type_id = toStringOrNull(raw.serve_type_id);
        if (!menu_id || !serve_type_id) {
            return NextResponse.json(
                { error: "menu_id and serve_type_id are required" },
                { status: 400 }
            );
        }

        const size = toStringOrNull(raw.size) ?? "default"; // NOT NULL
        const price_override = toNumberOrNull(raw.price_override);
        const image_url = toStringOrNull(raw.image_url);
        const is_default = toBool(raw.is_default, false);

        if (is_default) {
            const { error: unsetErr } = await supabase
                .from("menu_variants")
                .update({ is_default: false })
                .eq("menu_id", menu_id)
                .eq("serve_type_id", serve_type_id)
                .eq("is_default", true);

            if (unsetErr) return NextResponse.json({ error: unsetErr.message }, { status: 500 });
        }

        const payload: MenuVariantInsert = {
            menu_id,
            serve_type_id,
            size,
            price_override,
            image_url: image_url ?? null,
            is_default,
        };

        const { data, error } = await supabase
            .from("menu_variants")
            .insert(payload)
            .select(SELECT_BASE)
            .single();

        if (error || !data) {
            return NextResponse.json(
                { error: error?.message ?? "Failed to create variant" },
                { status: 500 }
            );
        }

        const row = data as unknown as MenuVariantRow;
        const serveTypeMap = await loadServeTypeNameMap({
            supabase,
            serveTypeIds: row.serve_type_id ? [row.serve_type_id] : [],
        });

        return NextResponse.json(
            { variant: toView(row, serveTypeMap.get(row.serve_type_id) ?? null) },
            { status: 201 }
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================================================
   PUT /api/menu/variants
========================================================= */
export async function PUT(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const raw = (await req.json().catch(() => null)) as unknown;

        if (!isRecord(raw)) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const id = toStringOrNull(raw.id);
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

        const { data: current, error: curErr } = await supabase
            .from("menu_variants")
            .select("id, menu_id, serve_type_id, is_default")
            .eq("id", id)
            .single();

        if (curErr || !current) {
            return NextResponse.json(
                { error: curErr?.message ?? "Variant not found" },
                { status: 404 }
            );
        }

        const cur = current as { menu_id: UUID; serve_type_id: UUID; is_default: boolean };
        const update: MenuVariantUpdate = {};

        if ("size" in raw) update.size = toStringOrNull(raw.size) ?? "default";
        if ("image_url" in raw) update.image_url = toStringOrNull(raw.image_url);
        if ("price_override" in raw) update.price_override = toNumberOrNull(raw.price_override);

        let requestedDefault: boolean | null = null;
        if ("is_default" in raw) requestedDefault = toBool(raw.is_default);

        if (requestedDefault === true) {
            const { error: unsetErr } = await supabase
                .from("menu_variants")
                .update({ is_default: false })
                .eq("menu_id", cur.menu_id)
                .eq("serve_type_id", cur.serve_type_id)
                .eq("is_default", true);

            if (unsetErr) return NextResponse.json({ error: unsetErr.message }, { status: 500 });
            update.is_default = true;
        } else if (requestedDefault === false) {
            // ✅ กัน “no default” ในกลุ่มเดียวกัน
            if (cur.is_default) {
                const replacementId = await findReplacementVariantId({
                    supabase,
                    menu_id: cur.menu_id,
                    serve_type_id: cur.serve_type_id,
                    exclude_id: id,
                });

                if (!replacementId) {
                    return NextResponse.json(
                        {
                            error:
                                "Cannot unset default: this is the last variant for this serve type. Create another variant first.",
                        },
                        { status: 400 }
                    );
                }

                // promote ตัวอื่นให้เป็น default ก่อน
                const { error: promoteErr } = await supabase
                    .from("menu_variants")
                    .update({ is_default: true })
                    .eq("id", replacementId);

                if (promoteErr) {
                    return NextResponse.json({ error: promoteErr.message }, { status: 500 });
                }
            }

            update.is_default = false;
        }

        if (Object.keys(update).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("menu_variants")
            .update(update)
            .eq("id", id)
            .select(SELECT_BASE)
            .single();

        if (error || !data) {
            return NextResponse.json(
                { error: error?.message ?? "Failed to update variant" },
                { status: 500 }
            );
        }

        const row = data as unknown as MenuVariantRow;
        const serveTypeMap = await loadServeTypeNameMap({
            supabase,
            serveTypeIds: row.serve_type_id ? [row.serve_type_id] : [],
        });

        return NextResponse.json({
            variant: toView(row, serveTypeMap.get(row.serve_type_id) ?? null),
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================================================
   DELETE /api/menu/variants?id=...
   ✅ FIX: if deleting default -> promote another variant first
========================================================= */
export async function DELETE(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const id = new URL(req.url).searchParams.get("id");

        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

        // 1) read current row (need menu_id, serve_type_id, is_default)
        const { data: current, error: curErr } = await supabase
            .from("menu_variants")
            .select("id, menu_id, serve_type_id, is_default")
            .eq("id", id)
            .single();

        if (curErr || !current) {
            return NextResponse.json(
                { error: curErr?.message ?? "Variant not found" },
                { status: 404 }
            );
        }

        const cur = current as { menu_id: UUID; serve_type_id: UUID; is_default: boolean };

        // 2) If deleting default, ensure a replacement default exists
        if (cur.is_default) {
            const replacementId = await findReplacementVariantId({
                supabase,
                menu_id: cur.menu_id,
                serve_type_id: cur.serve_type_id,
                exclude_id: id,
            });

            if (!replacementId) {
                return NextResponse.json(
                    {
                        error:
                            "Cannot delete the last default variant for this serve type. Create another variant first.",
                    },
                    { status: 400 }
                );
            }

            const { error: promoteErr } = await supabase
                .from("menu_variants")
                .update({ is_default: true })
                .eq("id", replacementId);

            if (promoteErr) return NextResponse.json({ error: promoteErr.message }, { status: 500 });
        }

        // 3) delete
        const { error } = await supabase.from("menu_variants").delete().eq("id", id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
