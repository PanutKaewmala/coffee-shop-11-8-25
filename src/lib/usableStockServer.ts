import "server-only";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { parseUsableStock } from "@/lib/usableStock";

export async function loadUsableStock(shopId: string, branchId: string) {
    const client = await getSupabaseServer();
    const { data, error } = await client.rpc("get_recipe_usable_stock", { p_business_id: shopId, p_branch_id: branchId });
    if (error) throw new Error("ไม่สามารถโหลดสต็อกพร้อมใช้ได้ กรุณาลองใหม่");
    const stock = parseUsableStock(data);
    if (stock.shop_id !== shopId || stock.branch_id !== branchId) throw new Error("ข้อมูลสต็อกไม่ตรงกับสาขาที่เลือก");
    return stock;
}
