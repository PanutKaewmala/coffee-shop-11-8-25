import assert from "node:assert/strict";
import {
  cashMovementNavigationIntent,
  cashMovementReasonsFor,
  firstCashMovementReason,
  validateCashMovementReason,
} from "../src/lib/cashMovementPolicy.mjs";

const values = (type, role) => cashMovementReasonsFor(type, role).map((r) => r.value);

assert.deepEqual(values("cash_in", "staff"), ["เติมเงินทอน", "เงินคืน / รับเงินสดอื่น"]);
assert.deepEqual(values("cash_out", "staff"), ["ซื้อวัตถุดิบเข้าร้าน", "ซื้อบรรจุภัณฑ์ / ของใช้ร้าน", "ค่าใช้จ่ายร้าน", "ฝากธนาคาร"]);
assert.equal(firstCashMovementReason("cash_out", "staff").value, "ซื้อวัตถุดิบเข้าร้าน");
assert.equal(validateCashMovementReason({ type: "cash_out", reason: "เติมเงินทอน", role: "owner", note: null }).status, 400);
assert.equal(validateCashMovementReason({ type: "cash_in", reason: "ฝากธนาคาร", role: "owner", note: null }).status, 400);
assert.equal(validateCashMovementReason({ type: "cash_out", reason: "เจ้าของถอนเงิน", role: "staff", note: "x" }).status, 403);
assert.equal(validateCashMovementReason({ type: "cash_in", reason: "ปรับยอดเงินสด", role: "staff", note: "x" }).status, 403);
assert.equal(validateCashMovementReason({ type: "cash_out", reason: "เจ้าของถอนเงิน", role: "owner", note: "ถอน" }).ok, true);
assert.equal(validateCashMovementReason({ type: "cash_out", reason: "ค่าใช้จ่ายร้าน", role: "staff", note: "" }).status, 400);
assert.equal(validateCashMovementReason({ type: "cash_in", reason: "เติมเงินทอน", role: "staff", note: "" }).ok, true);
assert.deepEqual(cashMovementNavigationIntent({ id: "abc 123", type: "cash_out", reason: "ซื้อวัตถุดิบเข้าร้าน" }), { action: "ingredient_restock", href: "/admin/ingredients?intent=restock&source=cash-movement&cashMovementId=abc%20123" });
assert.equal(cashMovementNavigationIntent({ id: "x", type: "cash_out", reason: "ฝากธนาคาร" }), null);
assert.equal(validateCashMovementReason({ type: "cash_out", reason: "ซื้อของเข้าร้าน", role: "owner", note: null }).status, 400);
assert.equal(validateCashMovementReason({ type: "cash_out", reason: "เบิกเงินสด", role: "owner", note: null }).status, 400);
import { readFileSync } from "node:fs";
const dailyClosePage = readFileSync(new URL("../src/app/admin/(protected)/daily-close/page.tsx", import.meta.url), "utf8");
const ingredientsClient = readFileSync(new URL("../src/app/admin/(protected)/ingredients/(operational)/IngredientsClient.tsx", import.meta.url), "utf8");
const reportCode = readFileSync(new URL("../src/lib/dailyCloseReport.ts", import.meta.url), "utf8");
assert.match(dailyClosePage, /router\.push\(href\)/, "ingredient restock intent navigates from daily close client");
assert.match(ingredientsClient, /บันทึกเงินออกแล้ว — เพิ่มวัตถุดิบที่ซื้อเข้าสต็อกให้ครบ/, "ingredients restock banner renders from query intent");
assert.match(reportCode, /reason: row\.reason/, "historical cash movement reason renders from stored row text");
console.log("cash movement policy behavioral assertions passed");
