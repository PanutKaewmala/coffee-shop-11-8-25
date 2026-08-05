import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cashMovementNavigationIntent,
  cashMovementReasonsFor,
  firstCashMovementReason,
  validateCashMovementReason,
} from "../src/lib/cashMovementPolicy.mjs";

const values = (type, role) => cashMovementReasonsFor(type, role).map((r) => r.value);

assert.deepEqual(values("cash_in", "staff"), ["เติมเงินทอน", "เงินคืน / รับเงินสดอื่น"]);
assert.deepEqual(values("cash_out", "staff"), ["ซื้อวัตถุดิบเข้าร้าน", "ซื้อบรรจุภัณฑ์ / ของใช้ร้าน", "ค่าใช้จ่ายร้าน", "ฝากธนาคาร"]);
assert.deepEqual(values("cash_out", "owner"), ["ซื้อวัตถุดิบเข้าร้าน", "ซื้อบรรจุภัณฑ์ / ของใช้ร้าน", "ค่าใช้จ่ายร้าน", "ฝากธนาคาร", "เจ้าของถอนเงิน", "ปรับยอดเงินสด"]);
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

const dailyClosePage = readFileSync(new URL("../src/app/admin/(protected)/daily-close/page.tsx", import.meta.url), "utf8");
const ingredientsClient = readFileSync(new URL("../src/app/admin/(protected)/ingredients/(operational)/IngredientsClient.tsx", import.meta.url), "utf8");
const reportCode = readFileSync(new URL("../src/lib/dailyCloseReport.ts", import.meta.url), "utf8");

assert.match(dailyClosePage, /router\.push\(href\)/, "ingredient restock intent navigates from daily close client");
assert.match(
  dailyClosePage,
  /const nextReason = e\.target\.value;[\s\S]*setCmReason\(nextReason\);[\s\S]*setCmNote\(""\);[\s\S]*setCmError\(null\);/,
  "changing cash movement reason resets the note and previous validation error"
);
assert.match(
  dailyClosePage,
  /disabled=\{cmLoading \|\| !cmAmount \|\| Number\(cmAmount\) <= 0 \|\| \(isCmNoteRequired && cmNote\.trim\(\) === ""\)\}/,
  "required-note reasons cannot submit using a stale note after the reason change reset"
);
assert.match(ingredientsClient, /restockStartRef\.current\?\.scrollIntoView/, "guided restock scrolls to the visible ingredient search/list start");
assert.match(ingredientsClient, /querySelector\("input:not\(\[disabled\]\)"\)/, "guided restock focuses the ingredient search input rather than create CTA");
assert.doesNotMatch(ingredientsClient, /ref=\{[^}]*stockActionRef/, "guided restock does not rely on canCreate action section refs");
assert.doesNotMatch(ingredientsClient, /sr-only[^\n]*ref=|ref=\{[^}]+\}[^\n]*sr-only/, "guided restock does not use an sr-only element as scroll target");
assert.match(ingredientsClient, /!permissionLoading && !canManageIngredients[\s\S]*ยังไม่มีวัตถุดิบให้รับเข้า กรุณาแจ้งเจ้าของร้านให้เพิ่มวัตถุดิบก่อน/, "staff empty ingredients state explains owner must create ingredients first");
assert.match(ingredientsClient, /บันทึกเงินออกสำเร็จแล้ว แต่วันนี้ปิดยอดแล้ว จึงไม่สามารถปรับสต็อกของวันนี้ได้/, "closed business day restock intent shows no-adjustment banner copy");
assert.match(ingredientsClient, /if \(isBusinessDayClosed\) \{[\s\S]*restockGuideRef\.current\?\.focus\(\);[\s\S]*return;[\s\S]*\}/, "closed business day focuses the banner, not a disabled action");
assert.match(ingredientsClient, /actionVisibility\.canCreate \? \([\s\S]*\+ เพิ่มวัตถุดิบ/, "owner create CTA remains available when permissions allow it");
assert.match(reportCode, /reason: row\.reason/, "historical cash movement reason renders from stored row text");
console.log("cash movement policy behavioral assertions passed");
