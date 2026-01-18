// app/api/ingredients/adjust/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

type IncomingBody = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

async function readJson(req: NextRequest): Promise<IncomingBody | null> {
    try {
        const raw: unknown = await req.json();
        return isRecord(raw) ? (raw as IncomingBody) : null;
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

function isUuid(v: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        v
    );
}

type IngredientMini = {
    id: string;
    name: string;
    stock: number | string;
    unit: string | null;
};

// ✅ ให้ note เป็น optional string เท่านั้น (ห้าม null)
type AdjustRpcParams = {
    ing_id: string;
    diff: number; // signed (+/-)
    note?: string;
};

export async function POST(req: NextRequest) {
    try {
        const supabase = getSupabaseServer();
        const body = await readJson(req);

        if (!body) {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        // UI sends: ingredient_id + amount (+/-) + note
        const ingredient_id = toStringOrNull(body.ingredient_id);
        const amount = toNumberOrNull(body.amount);
        const note = toStringOrNull(body.note); // string | null

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

        // ✅ key: ถ้า note ว่าง => อย่าใส่ note field เลย
        const params: AdjustRpcParams = {
            ing_id: ingredient_id,
            diff: amount,
            ...(note ? { note } : {}),
        };

        const { error: rpcErr } = await supabase.rpc("adjust_stock", params);

        if (rpcErr) {
            return NextResponse.json({ error: rpcErr.message }, { status: 400 });
        }

        // return latest ingredient
        const { data: ing, error: ingErr } = await supabase
            .from("ingredients")
            .select("id,name,stock,unit")
            .eq("id", ingredient_id)
            .single<IngredientMini>();

        if (ingErr || !ing) {
            return NextResponse.json(
                { error: ingErr?.message ?? "Ingredient not found" },
                { status: 404 }
            );
        }

        const stockNum = typeof ing.stock === "number" ? ing.stock : Number(ing.stock ?? 0);

        return NextResponse.json({
            success: true,
            ingredient: {
                id: ing.id,
                name: ing.name,
                stock: Number.isFinite(stockNum) ? stockNum : 0,
                unit: ing.unit,
            },
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Internal Server Error";
        console.error("Adjust Error:", err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
