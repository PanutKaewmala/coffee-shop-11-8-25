import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { cashDifferenceRequiresReason, parseDailyCloseRole } from "../src/lib/dailyClosePolicy.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../src/app/api/daily-close/route.ts");
const prep = read("../src/app/api/daily-close/prep/route.ts");
const page = read("../src/app/admin/(protected)/daily-close/page.tsx");
const reportRoute = read("../src/app/api/reports/daily-close/route.ts");
const report = read("../src/lib/dailyCloseReport.ts");
const money = read("../src/lib/dailyCloseMoney.ts");
const guardedWrites = [
  read("../src/app/api/pos/route.ts"),
  read("../src/app/api/ingredients/adjust/route.ts"),
  read("../src/app/api/cash-movements/route.ts"),
  read("../src/app/api/orders/[id]/cancel/route.ts"),
];

assert.equal(parseDailyCloseRole("owner"), "owner");
assert.equal(parseDailyCloseRole("staff"), "staff");
assert.equal(parseDailyCloseRole("manager"), null, "unknown roles fail closed");
assert.equal(cashDifferenceRequiresReason(0), false, "exact cash does not require a reason");
assert.equal(cashDifferenceRequiresReason(0.001), false, "difference uses money rounding");
assert.equal(cashDifferenceRequiresReason(-0.01), true, "cash shortage requires a reason");
assert.equal(cashDifferenceRequiresReason(0.01), true, "cash overage requires a reason");

assert.match(route, /opening_cash_float is required/);
assert.match(route, /opening_cash_float must be a non-negative number/);
assert.match(route, /status: "draft"/);
assert.match(route, /code: "DAILY_CLOSE_ALREADY_EXISTS"/);
assert.match(route, /parseDailyCloseRole\(membership\.role\)/);
assert.match(route, /if \(role !== "owner"\)/, "staff cannot call finalization PATCH");
assert.match(route, /countedCash = validateCountedCash\(body\.counted_cash\)/, "owner finalization requires counted cash");
assert.match(route, /computeSnapshotFromReport\(report, openingCashFloat\)/, "server recomputes the canonical snapshot");
assert.match(route, /supabase\.rpc\("finalize_daily_close"/, "finalization report and close commit through one DB transaction");
assert.match(route, /code: "CASH_DIFFERENCE_REASON_REQUIRED"/);
assert.match(route, /message\.includes\("not draft"\)/, "closed rows cannot be finalized again");

assert.match(prep, /countedCash = validateCountedCash\(body\.counted_cash\)/, "staff preparation requires counted cash");
assert.match(prep, /existingRecord\.status !== "draft"/, "staff cannot edit a finalized row");
assert.doesNotMatch(prep, /body\.(opening_cash_float|expected_cash|cash_difference|status|closed_by|closed_at|gross_sales)/, "staff system fields are ignored");
assert.match(prep, /updatePayload\.counted_cash = countedCash/);

assert.match(page, /ขาด \/ เกิน \(คำนวณสด\)/);
assert.match(page, /หมายเหตุ \/ สาเหตุ \{cashDifferenceNeedsReason \? "\(จำเป็น\)"/);
assert.match(page, /!countedCashIsValid \|\| !closeReasonIsValid/, "owner submit is disabled until required inputs are complete");
assert.match(page, /disabled=\{closeLoading \|\| loading \|\| !countedCashIsValid \|\| !closeReasonIsValid\}/, "staff save is disabled without counted cash or a required reason");
assert.match(page, /บันทึกยอดนับแล้ว รอเจ้าของตรวจและปิดยอด/);

assert.match(money, /openingCash[\s\S]*paidCashSales[\s\S]*cashIn[\s\S]*cashOut/);
assert.match(report, /const paidCashSales = report\.payments\.cash\.sales/);
assert.doesNotMatch(report, /expectedCash[\s\S]{0,160}promptPay/, "PromptPay is not included in expected drawer cash");
assert.match(reportRoute, /applyFinalizedDailyCloseSnapshot\(report, row\)/, "finalized reports use the stored snapshot");
assert.match(reportRoute, /\.in\("status", \["closed", "approved"\]\)/, "closed and approved both use finalized snapshots");
assert.match(report, /summary: "stored_snapshot"/);
assert.match(report, /paymentTotals: "stored_snapshot"/);
assert.match(report, /paymentOrderCounts: "current_not_snapshot"/);
assert.match(page, /Snapshot ณ เวลาปิดยอด/);
assert.match(page, /รายงานสด: ยังไม่ปิดยอด/);
assert.match(page, /border-emerald-500\/30 bg-emerald-500\/10[^\n]*text-text-primary/, "finalized banner uses readable theme text");
assert.match(page, /border-amber-500\/30 bg-amber-500\/10[^\n]*text-text-primary/, "live banner uses readable theme text");
assert.doesNotMatch(page, /dark:text-(?:emerald|amber)-100/, "daily-close banners do not use washed-out dark text overrides");
assert.match(page, /cashDifferenceNeedsReason && !closeReasonIsValid \? \(/, "cash difference warning disappears as soon as a reason is valid");
assert.match(page, /isCloseFinalized \? "ยอดจาก snapshot • ซ่อนจำนวนรายการปัจจุบัน"/, "snapshot totals are not paired with live payment counts");
for (const guardedWrite of guardedWrites) {
  assert.match(guardedWrite, /checkDailyClose\(/, "post-close operational guard remains connected");
  assert.match(guardedWrite, /BUSINESS_DAY_CLOSED/, "post-close operational guard keeps its stable block code");
}

const changedFiles = execFileSync("git", ["diff", "--name-only", "main"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
for (const forbidden of [
  "src/app/admin/(protected)/orders/[id]/OrderDetailClient.tsx",
]) {
  assert.equal(changedFiles.includes(forbidden), false, `PR20 must not change ${forbidden}`);
}

for (const source of [route, prep, reportRoute]) {
  assert.doesNotMatch(source, /error:\s*(?:auth|membership|existing|insert|update|close|finalized)\w*Error\.message/);
  assert.match(source, /Unexpected server error/, "unexpected failures use a stable sanitized response");
}

console.log("daily close owner/staff flow assertions passed");
