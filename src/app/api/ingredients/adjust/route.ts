// app/api/ingredients/adjust/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type IncomingBody = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

async function readJson(req: NextRequest): Promise<IncomingBody | null> {
    try {
        const raw: unknown = await req.json();
        return isRecord(raw) ? raw : null;
    } catch {
        return null;
    }
}

function toStringOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
}

function toNumberOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function toNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function isUuid(v: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

type IngredientMini = {
    id: string;
    name: string;
    stock: number | string;
    unit: string | null;
    is_active?: boolean | null;
};

export async function POST(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const admin = getSupabaseAdmin();
        const body = await readJson(req);

        if (!body) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const ingredient_id = toStringOrNull(body.ingredient_id);
        const amount = toNumberOrNull(body.amount);
        const note = toStringOrNull(body.note);

        if (!ingredient_id) {
            return NextResponse.json({ error: "Missing ingredient_id" }, { status: 400 });
        }
        if (!isUuid(ingredient_id)) {
            return NextResponse.json({ error: "Invalid ingredient_id" }, { status: 400 });
        }
        if (amount === null) {
            return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
        }
        if (amount === 0) {
            return NextResponse.json({ error: "No change (amount = 0)" }, { status: 400 });
        }

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
        if (!member || member.role !== "owner") {
            return NextResponse.json({ error: "Owner only" }, { status: 403 });
        }

        const { data: ing, error: ingErr } = await admin
            .from("ingredients")
            .select("id,name,stock,unit,is_active")
            .eq("id", ingredient_id)
            .eq("shop_id", currentShopId)
            .filter("branch_id", "eq", currentBranchId)
            .single();

        if (ingErr || !ing) {
            return NextResponse.json({ error: ingErr?.message ?? "Ingredient not found" }, { status: 404 });
        }

        const row = ing as IngredientMini;
        if (row.is_active === false) {
            return NextResponse.json({ error: "Ingredient is inactive" }, { status: 400 });
        }

        const before = toNumber(row.stock, 0);
        const after = Math.max(0, before + amount);
        const now = new Date().toISOString();

        const { error: upErr } = await admin
            .from("ingredients")
            .update({ stock: after, updated_at: now })
            .eq("id", ingredient_id)
            .eq("shop_id", currentShopId)
            .filter("branch_id", "eq", currentBranchId);

        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

        const logPayload = {
            ingredient_id,
            order_id: null,
            amount: Math.abs(amount),
            type: "adjust",
            note: note ?? null,
            before_stock: before,
            after_stock: after,
            shop_id: currentShopId,
            branch_id: currentBranchId,
        } as unknown as Record<string, unknown>;

        const { error: logErr } = await admin.from("stock_logs").insert(logPayload as never);

        if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 });

        return NextResponse.json({
            success: true,
            ingredient: {
                id: row.id,
                name: row.name,
                stock: after,
                unit: row.unit,
            },
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Internal Server Error";
        console.error("Adjust Error:", err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
