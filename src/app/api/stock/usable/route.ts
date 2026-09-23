import { NextRequest, NextResponse } from "next/server";
import { getServerIdentity, getSupabaseServer } from "@/lib/supabaseServer";
import { loadUsableStock } from "@/lib/usableStockServer";
import { validMinimum } from "@/lib/usableStock";

export const dynamic = "force-dynamic";
const failure = (error: string, status: number) => NextResponse.json({ error }, { status });

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
    const ctx = await context();
    if (ctx.response) return ctx.response;
    try {
        return NextResponse.json(await loadUsableStock(ctx.shopId!, ctx.branchId!), { headers: { "Cache-Control": "no-store" } });
    } catch {
        return failure("ไม่สามารถโหลดสต็อกพร้อมใช้ได้ กรุณาลองใหม่", 503);
    }
}

export async function PATCH(request: NextRequest) {
    const ctx = await context(true);
    if (ctx.response) return ctx.response;
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure("ข้อมูลไม่ถูกต้อง", 400);
    const input = body as Record<string, unknown>;
    if (input.shop_id !== ctx.shopId || input.branch_id !== ctx.branchId) return failure("สาขาเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่", 409);
    if (!["ingredient", "supply_item"].includes(String(input.source_type)) ||
        typeof input.item_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.item_id) ||
        !validMinimum(input.minimum_stock)) return failure("ขั้นต่ำต้องเป็นเลข 0 ขึ้นไป และมีทศนิยมไม่เกิน 6 ตำแหน่ง", 400);
    const client = await getSupabaseServer();
    const { error } = await client.rpc("set_recipe_stock_minimum", {
        p_business_id: ctx.shopId!, p_branch_id: ctx.branchId!, p_source_type: String(input.source_type),
        p_item_id: input.item_id, p_minimum_stock: input.minimum_stock as unknown as number,
    });
    if (error) return failure(error.message === "BUSINESS_DAY_CLOSED" ? "ปิดยอดวันนี้แล้ว ไม่สามารถแก้ไขขั้นต่ำได้" : "บันทึกขั้นต่ำไม่สำเร็จ กรุณาโหลดข้อมูลแล้วลองใหม่", error.code === "42501" ? 403 : error.code === "22023" ? 400 : error.message === "BUSINESS_DAY_CLOSED" ? 409 : 503);
    return NextResponse.json({ ok: true });
}
