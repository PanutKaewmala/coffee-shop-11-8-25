import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity, getSupabaseServer } from "@/lib/supabaseServer";
import { loadUsableStock } from "@/lib/usableStockServer";
import { validMinimum } from "@/lib/usableStock";

export const dynamic = "force-dynamic";
const failure = (error: string, status: number) => NextResponse.json({ error }, { status });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const POSITIVE_QUANTITY_RE = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validReceiveQuantity(value: unknown): value is string {
    return typeof value === "string"
        && POSITIVE_QUANTITY_RE.test(value)
        && Number.isFinite(Number(value))
        && Number(value) > 0;
}

function receiveCommandStatus(code: string): number {
    if (code === "FORBIDDEN") return 403;
    if (code === "VALIDATION_FAILED") return 400;
    if (code === "NOT_FOUND") return 404;
    if (["IDEMPOTENCY_CONFLICT", "COMMAND_IN_PROGRESS", "INVALID_STATE", "BUSINESS_DAY_CLOSED"].includes(code)) return 409;
    return 503;
}

async function context(ownerOnly = false) {
    const identity = await getServerIdentity();
    if (!identity.user) return { response: failure("กรุณาเข้าสู่ระบบ", 401) };
    if (!identity.currentShopId || !identity.currentBranchId) return { response: failure("กรุณาเลือกร้านและสาขา", 409) };
    if (!["owner", "staff"].includes(identity.currentShopRole ?? "") || (ownerOnly && identity.currentShopRole !== "owner")) {
        return { response: failure("ไม่มีสิทธิ์ดำเนินการ", 403) };
    }
    return { shopId: identity.currentShopId, branchId: identity.currentBranchId };
}

export async function GET() {
    const ctx = await context(true);
    if (ctx.response) return ctx.response;
    try {
        return NextResponse.json(await loadUsableStock(ctx.shopId!, ctx.branchId!), { headers: { "Cache-Control": "no-store" } });
    } catch {
        return failure("ไม่สามารถโหลดสต็อกพร้อมใช้ได้ กรุณาลองใหม่", 503);
    }
}

export async function POST(request: NextRequest) {
    const ctx = await context(true);
    if (ctx.response) return ctx.response;

    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey || !IDEMPOTENCY_RE.test(idempotencyKey)) {
        return failure("คำขอรับของเข้าไม่ถูกต้อง กรุณาลองใหม่", 400);
    }

    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body)) return failure("ข้อมูลไม่ถูกต้อง", 400);

    if (body.shop_id !== ctx.shopId || body.branch_id !== ctx.branchId) {
        return failure("สาขาเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่", 409);
    }
    if (
        body.source_type !== "supply_item"
        || typeof body.item_id !== "string"
        || !UUID_RE.test(body.item_id)
        || !validReceiveQuantity(body.quantity)
    ) {
        return failure("จำนวนรับเข้าต้องมากกว่า 0 และมีทศนิยมไม่เกิน 6 ตำแหน่ง", 400);
    }

    const note = typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, 512)
        : "TALVO web receiving";

    const client = await getSupabaseServer();
    const { data, error } = await client.rpc("receive_talvo_supply_item", {
        p_business_id: ctx.shopId!,
        p_branch_id: ctx.branchId!,
        p_supply_item_id: body.item_id,
        p_quantity_base: Number(body.quantity),
        p_provenance_source_ref: note,
        p_external_batch_code: null,
        p_manufacturer_use_by_at: null,
        p_idempotency_key: idempotencyKey,
    });

    if (error) {
        const closed = error.message === "BUSINESS_DAY_CLOSED";
        return failure(
            closed ? "ปิดยอดวันนี้แล้ว ไม่สามารถรับของเข้าได้" : "รับของเข้าไม่สำเร็จ กรุณาลองใหม่",
            closed ? 409 : error.code === "42501" ? 403 : error.code === "22023" ? 400 : 503
        );
    }

    if (!isRecord(data) || typeof data.ok !== "boolean") {
        return failure("รับของเข้าไม่สำเร็จ กรุณาลองใหม่", 503);
    }
    if (data.ok === false) {
        const commandError = isRecord(data.error) ? data.error : null;
        const code = commandError && typeof commandError.code === "string" ? commandError.code : "UNKNOWN";
        const message = code === "BUSINESS_DAY_CLOSED"
            ? "ปิดยอดวันนี้แล้ว ไม่สามารถรับของเข้าได้"
            : code === "FORBIDDEN"
                ? "ไม่มีสิทธิ์รับของเข้า"
                : code === "VALIDATION_FAILED"
                    ? "จำนวนหรือข้อมูลรับเข้าไม่ถูกต้อง"
                    : "รับของเข้าไม่สำเร็จ กรุณาลองใหม่";
        return failure(message, receiveCommandStatus(code));
    }

    return NextResponse.json({ ok: true, data: isRecord(data.data) ? data.data : null });
}

export async function PATCH(request: NextRequest) {
    const ctx = await context(true);
    if (ctx.response) return ctx.response;
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure("ข้อมูลไม่ถูกต้อง", 400);
    const input = body as Record<string, unknown>;
    if (input.shop_id !== ctx.shopId || input.branch_id !== ctx.branchId) return failure("สาขาเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่", 409);
    if (!["ingredient", "supply_item"].includes(String(input.source_type)) ||
        typeof input.item_id !== "string" || !UUID_RE.test(input.item_id) ||
        !validMinimum(input.minimum_stock)) return failure("ขั้นต่ำต้องเป็นเลข 0 ขึ้นไป และมีทศนิยมไม่เกิน 6 ตำแหน่ง", 400);
    const client = await getSupabaseServer();
    const { error } = await client.rpc("set_recipe_stock_minimum", {
        p_business_id: ctx.shopId!, p_branch_id: ctx.branchId!, p_source_type: String(input.source_type),
        p_item_id: input.item_id, p_minimum_stock: input.minimum_stock as unknown as number,
    });
    if (error) return failure(error.message === "BUSINESS_DAY_CLOSED" ? "ปิดยอดวันนี้แล้ว ไม่สามารถแก้ไขขั้นต่ำได้" : "บันทึกขั้นต่ำไม่สำเร็จ กรุณาโหลดข้อมูลแล้วลองใหม่", error.code === "42501" ? 403 : error.code === "22023" ? 400 : error.message === "BUSINESS_DAY_CLOSED" ? 409 : 503);
    return NextResponse.json({ ok: true });
}
