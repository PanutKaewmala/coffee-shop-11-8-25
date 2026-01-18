// app/api/ingredients/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";
import type { IngredientUpdatePayload, UUID, BaseUnit } from "@/lib/types";

export const dynamic = "force-dynamic";

/* =========================================================
   Types (no any)
========================================================= */
type IngredientRow = {
    id: UUID;
    name: string;
    stock: number | string;

    unit?: string | null;
    base_unit?: BaseUnit | null;

    // ✅ archive system (ถ้า DB ยังไม่มี ก็จะเป็น undefined ได้ ไม่พัง)
    is_active?: boolean | null;
    archived_at?: string | null;

    updated_at?: string | null;

    category?: string | null;
    cost_per_unit?: number | string | null;
};

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

function toNumber(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function toNumberOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function toBoolOrNull(v: unknown): boolean | null {
    if (typeof v === "boolean") return v;
    return null;
}

function isUuid(v: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/* =========================================================
   base_unit helpers
========================================================= */
const BASE_UNITS: BaseUnit[] = ["ml", "g", "piece"];

function isBaseUnit(v: unknown): v is BaseUnit {
    return typeof v === "string" && (BASE_UNITS as readonly string[]).includes(v);
}

function normalizeBaseUnitFromLegacyUnit(u: unknown): BaseUnit {
    const s = typeof u === "string" ? u.trim().toLowerCase() : "";
    if (["ml", "มล.", "มล"].includes(s)) return "ml";
    if (["g", "กรัม", "กร"].includes(s)) return "g";
    return "piece";
}

function normalizeIngredient(row: IngredientRow) {
    const base =
        row.base_unit && BASE_UNITS.includes(row.base_unit) ? row.base_unit : null;

    const is_active = typeof row.is_active === "boolean" ? row.is_active : true;

    return {
        id: row.id,
        name: row.name,
        stock: toNumber(row.stock, 0),

        base_unit: base,
        unit: row.unit ?? null,

        is_active,
        archived_at: row.archived_at ?? null,

        updated_at: row.updated_at ?? null,
        category: row.category ?? null,
        cost_per_unit:
            row.cost_per_unit === null || row.cost_per_unit === undefined
                ? null
                : toNumber(row.cost_per_unit, 0),
    };
}

/* =========================================================
   GET /api/ingredients
   - id=... -> single
   - archived=1 -> archived list
   default -> active list
========================================================= */
export async function GET(req: NextRequest) {
    try {
        const supabase = getSupabaseServer();
        const id = req.nextUrl.searchParams.get("id");
        const archived = req.nextUrl.searchParams.get("archived");

        if (id) {
            if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

            const { data, error } = await supabase
                .from("ingredients")
                .select("*")
                .eq("id", id)
                .single();

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

            return NextResponse.json({ ingredient: normalizeIngredient(data as IngredientRow) });
        }

        // ✅ archived=1 => is_active=false
        const isArchivedList = archived === "1" || archived === "true";

        let query = supabase.from("ingredients").select("*");

        // ถ้า DB ยังไม่มี is_active: query นี้อาจ error
        // แต่โปรเจกต์มึงน่าจะเพิ่มแล้ว (ตาม flow archive) — ถ้ายังไม่เพิ่ม ให้เพิ่มคอลัมน์ก่อน
        query = isArchivedList ? query.eq("is_active", false) : query.eq("is_active", true);

        const { data, error } = await query.order("name", { ascending: true });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const list = Array.isArray(data) ? (data as IngredientRow[]) : [];
        return NextResponse.json({ ingredients: list.map(normalizeIngredient) });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================================================
   POST /api/ingredients
   body: { name, stock?, base_unit, ... }
========================================================= */
export async function POST(req: NextRequest) {
    try {
        const supabase = getSupabaseServer();
        const body = await readJson(req);

        if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const name = toStringOrNull(body.name);
        const stock = toNumber(body.stock, 0);

        const rawBaseUnit = body.base_unit;
        const base_unit: BaseUnit = isBaseUnit(rawBaseUnit)
            ? rawBaseUnit
            : normalizeBaseUnitFromLegacyUnit(body.unit);

        const category = toStringOrNull(body.category);
        const cost_per_unit = toNumberOrNull(body.cost_per_unit);

        if (!name) return NextResponse.json({ error: "name จำเป็นต้องมี" }, { status: 400 });
        if (stock < 0) return NextResponse.json({ error: "stock ต้องไม่ติดลบ" }, { status: 400 });
        if (!BASE_UNITS.includes(base_unit)) {
            return NextResponse.json({ error: "base_unit ไม่ถูกต้อง" }, { status: 400 });
        }

        // ✅ กันชื่อซ้ำ (ignore case)
        const { data: existing, error: existErr } = await supabase
            .from("ingredients")
            .select("id")
            .ilike("name", name)
            .limit(1);

        if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
        if (existing && existing.length > 0) {
            return NextResponse.json({ error: "มีวัตถุดิบชื่อนี้อยู่แล้ว" }, { status: 409 });
        }

        const payload = {
            name,
            stock,
            base_unit,
            unit: base_unit, // legacy mirror
            category: category ?? null,
            cost_per_unit: cost_per_unit ?? null,

            // ✅ active by default
            is_active: true,
            archived_at: null,

            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from("ingredients")
            .insert(payload)
            .select("*")
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

        // ✅ log add
        await supabase.from("stock_logs").insert({
            ingredient_id: (data as IngredientRow).id,
            order_id: null,
            amount: toNumber(stock, 0),
            type: "add",
            note: "create ingredient",
            before_stock: 0,
            after_stock: toNumber(stock, 0),
        });

        return NextResponse.json({ ingredient: normalizeIngredient(data as IngredientRow) }, { status: 201 });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================================================
   PUT /api/ingredients
   - Edit name only (UI policy)
   - Also support restore: { id, is_active: true, archived_at: null }
========================================================= */
export async function PUT(req: NextRequest) {
    try {
        const supabase = getSupabaseServer();
        const body = await readJson(req);

        if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

        const id = toStringOrNull(body.id);
        if (!id) return NextResponse.json({ error: "ต้องมี id เพื่ออัพเดตวัตถุดิบ" }, { status: 400 });
        if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

        const updateData: IngredientUpdatePayload = {};

        if ("name" in body) updateData.name = toStringOrNull(body.name) ?? undefined;

        // ✅ allow restore/archiving flags
        if ("is_active" in body) {
            const b = toBoolOrNull(body.is_active);
            if (b === null) return NextResponse.json({ error: "is_active ไม่ถูกต้อง" }, { status: 400 });
            updateData.is_active = b;
        }

        if ("archived_at" in body) {
            // allow null or iso string
            if (body.archived_at === null) {
                updateData.archived_at = null;
            } else {
                const s = toStringOrNull(body.archived_at);
                if (!s) return NextResponse.json({ error: "archived_at ไม่ถูกต้อง" }, { status: 400 });
                updateData.archived_at = s;
            }
        }

        updateData.updated_at = new Date().toISOString();

        // กันชื่อซ้ำตอน rename
        if (updateData.name) {
            const { data: existing, error: existErr } = await supabase
                .from("ingredients")
                .select("id")
                .ilike("name", updateData.name)
                .neq("id", id)
                .limit(1);

            if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });
            if (existing && existing.length > 0) {
                return NextResponse.json({ error: "มีวัตถุดิบชื่อนี้อยู่แล้ว" }, { status: 409 });
            }
        }

        const keys = Object.keys(updateData);
        if (keys.length === 1 && keys[0] === "updated_at") {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("ingredients")
            .update(updateData)
            .eq("id", id)
            .select("*")
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data) return NextResponse.json({ error: "Update failed" }, { status: 500 });

        return NextResponse.json({ ingredient: normalizeIngredient(data as IngredientRow) });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/* =========================================================
   DELETE /api/ingredients?id=...
   ✅ Shop rule: delete = archive (soft delete)
   - set is_active=false, archived_at=now
   - log type `delete`
========================================================= */
export async function DELETE(req: NextRequest) {
    try {
        const supabase = getSupabaseServer();
        const id = req.nextUrl.searchParams.get("id");

        if (!id) return NextResponse.json({ error: "ต้องมี id เพื่อทำการลบ" }, { status: 400 });
        if (!isUuid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

        // load ingredient
        const { data: ing, error: ingErr } = await supabase
            .from("ingredients")
            .select("id,name,stock,is_active")
            .eq("id", id)
            .single();

        if (ingErr || !ing) {
            return NextResponse.json({ error: ingErr?.message ?? "Not found" }, { status: 404 });
        }

        const wasActive = (ing as IngredientRow).is_active ?? true;
        if (!wasActive) {
            // already archived
            return NextResponse.json({ success: true, archived: true });
        }

        const before = toNumber((ing as IngredientRow).stock, 0);

        // archive
        const archived_at = new Date().toISOString();

        const { error: updErr } = await supabase
            .from("ingredients")
            .update({
                is_active: false,
                archived_at,
                updated_at: archived_at,
            })
            .eq("id", id);

        if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

        // log delete
        await supabase.from("stock_logs").insert({
            ingredient_id: id,
            order_id: null,
            amount: 0,
            type: "delete",
            note: "archived ingredient",
            before_stock: before,
            after_stock: before,
        });

        return NextResponse.json({ success: true, archived: true });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Server error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
