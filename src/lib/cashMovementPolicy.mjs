export const CASH_MOVEMENT_TYPES = ["cash_in", "cash_out"];

export const CASH_MOVEMENT_REASONS = [
    { value: "เติมเงินทอน", label: "เติมเงินทอน", type: "cash_in", requiresNote: false, ownerOnly: false },
    { value: "เงินคืน / รับเงินสดอื่น", label: "เงินคืน / รับเงินสดอื่น", type: "cash_in", requiresNote: true, ownerOnly: false, notePlaceholder: "เช่น ร้านค้าคืนเงินค่าสินค้า" },
    { value: "ปรับยอดเงินสด", label: "ปรับยอดเงินสด", type: "cash_in", requiresNote: true, ownerOnly: true, notePlaceholder: "ระบุสาเหตุและยอดที่ตรวจพบ" },
    { value: "ซื้อวัตถุดิบเข้าร้าน", label: "ซื้อวัตถุดิบเข้าร้าน", type: "cash_out", requiresNote: false, ownerOnly: false, guidedAction: "ingredient_restock" },
    { value: "ซื้อบรรจุภัณฑ์ / ของใช้ร้าน", label: "ซื้อบรรจุภัณฑ์ / ของใช้ร้าน", type: "cash_out", requiresNote: true, ownerOnly: false, notePlaceholder: "เช่น ซื้อแก้ว 2 แพ็ก" },
    { value: "ค่าใช้จ่ายร้าน", label: "ค่าใช้จ่ายร้าน", type: "cash_out", requiresNote: true, ownerOnly: false, notePlaceholder: "เช่น ค่าส่งวัตถุดิบ" },
    { value: "ฝากธนาคาร", label: "ฝากธนาคาร", type: "cash_out", requiresNote: false, ownerOnly: false },
    { value: "เจ้าของถอนเงิน", label: "เจ้าของถอนเงิน", type: "cash_out", requiresNote: true, ownerOnly: true, notePlaceholder: "ระบุวัตถุประสงค์ของการถอน" },
    { value: "ปรับยอดเงินสด", label: "ปรับยอดเงินสด", type: "cash_out", requiresNote: true, ownerOnly: true, notePlaceholder: "ระบุสาเหตุและยอดที่ตรวจพบ" },
];

export function isCashMovementType(value) {
    return CASH_MOVEMENT_TYPES.includes(value);
}

export function cashMovementReasonsFor(type, role) {
    if (!isCashMovementType(type)) return [];
    return CASH_MOVEMENT_REASONS.filter((reason) => reason.type === type && (!reason.ownerOnly || role === "owner"));
}

export function firstCashMovementReason(type, role) {
    return cashMovementReasonsFor(type, role)[0] ?? null;
}

export function findCashMovementReason(type, value) {
    if (!isCashMovementType(type) || typeof value !== "string") return null;
    return CASH_MOVEMENT_REASONS.find((reason) => reason.type === type && reason.value === value) ?? null;
}

export function validateCashMovementReason({ type, reason, role, note }) {
    if (!isCashMovementType(type)) return { ok: false, status: 400, error: "Invalid type. Use cash_in or cash_out." };
    const policy = findCashMovementReason(type, reason);
    if (!policy) return { ok: false, status: 400, error: "Invalid reason for cash movement type." };
    if (policy.ownerOnly && role !== "owner") return { ok: false, status: 403, error: "Owner role required for this cash movement reason." };
    if (policy.requiresNote && (typeof note !== "string" || note.trim() === "")) return { ok: false, status: 400, error: "Note is required for this cash movement reason." };
    return { ok: true, policy };
}

export function cashMovementNavigationIntent(movement) {
    const policy = findCashMovementReason(movement?.type, movement?.reason);
    if (policy?.guidedAction !== "ingredient_restock") return null;
    const id = typeof movement?.id === "string" && movement.id ? `&cashMovementId=${encodeURIComponent(movement.id)}` : "";
    return { action: "ingredient_restock", href: `/admin/ingredients?intent=restock&source=cash-movement${id}` };
}
