export type UsableStockItem = {
    source_type: "supply_item" | "ingredient";
    id: string;
    name: string;
    unit: string;
    minimum_stock: number | null;
    usable_stock: number | null;
    unavailable_reason: string | null;
};

export type UsableStock = {
    shop_id: string;
    branch_id: string;
    branch_name: string;
    as_of: string;
    can_edit_minimum: boolean;
    items: UsableStockItem[];
};

export type StockStatus = "normal" | "low" | "out" | "unavailable";

export function stockStatus(item: UsableStockItem): StockStatus {
    if (item.usable_stock === null || item.unavailable_reason) return "unavailable";
    if (item.usable_stock <= 0) return "out";
    if (item.minimum_stock !== null && item.usable_stock <= item.minimum_stock) return "low";
    return "normal";
}

export const stockStatusLabel: Record<StockStatus, string> = {
    normal: "ปกติ (Normal)", low: "ใกล้หมด (Low Stock)", out: "หมด (Out of Stock)", unavailable: "ไม่สามารถระบุยอดพร้อมใช้",
};

export function unavailableStockLabel(reason: string | null): string {
    if (reason === "LEGACY_LOT_BALANCE_UNAVAILABLE") return "ยอดล็อตเดิมยังไม่เชื่อมกับการขาย จึงไม่สามารถยืนยันจำนวนที่ไม่หมดอายุได้";
    if (reason === "ITEM_ARCHIVED") return "สูตรยังอ้างอิงวัตถุดิบที่เลิกใช้งานแล้ว";
    if (reason === "BRANCH_INACTIVE") return "สาขานี้ไม่ได้เปิดใช้งาน";
    return "ข้อมูลยอดคงเหลือไม่พร้อมใช้งาน";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

const quantity = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

// Reject malformed/partial responses; never coerce unknown balances to zero.
export function parseUsableStock(value: unknown): UsableStock {
    const invalid = () => { throw new Error("ข้อมูลสต็อกพร้อมใช้ไม่ครบถ้วน กรุณาลองใหม่"); };
    if (!isRecord(value) || typeof value.shop_id !== "string" || typeof value.branch_id !== "string" ||
        typeof value.branch_name !== "string" || typeof value.as_of !== "string" || !Number.isFinite(Date.parse(value.as_of)) ||
        typeof value.can_edit_minimum !== "boolean" || !Array.isArray(value.items)) return invalid();
    const keys = new Set<string>();
    for (const item of value.items) {
        if (!isRecord(item) || !["supply_item", "ingredient"].includes(String(item.source_type)) ||
            typeof item.id !== "string" || typeof item.name !== "string" || typeof item.unit !== "string" ||
            !(item.minimum_stock === null || quantity(item.minimum_stock)) ||
            !(item.usable_stock === null || quantity(item.usable_stock)) ||
            !(item.unavailable_reason === null || typeof item.unavailable_reason === "string") ||
            ((item.usable_stock === null) !== (typeof item.unavailable_reason === "string"))) return invalid();
        const key = `${item.source_type}:${item.id}`;
        if (keys.has(key)) return invalid();
        keys.add(key);
    }
    return value as UsableStock;
}

export function validMinimum(value: unknown): value is string {
    return typeof value === "string" && /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(value);
}
