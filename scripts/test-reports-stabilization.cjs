#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
    return resolveFilename.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = (module, filename) => {
    const source = fs.readFileSync(filename, "utf8");
    module._compile(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
        fileName: filename,
    }).outputText, filename);
};

const queryModule = require(path.join(root, "src/lib/reportsSalesRangeQuery.ts"));
const reports = require(path.join(root, "src/lib/reportsSales.ts"));
const now = new Date("2026-08-03T17:00:00.000Z"); // Bangkok midnight, 4 August.
const parse = (value) => queryModule.parseReportsSalesRangeQuery(new URLSearchParams(value), now);
const invalid = [
    "range=7d&range=30d", "range=custom&start=2026-08-01&start=2026-08-02&end=2026-08-03",
    "range=custom&start=2026-08-01&end=2026-08-03&end=2026-08-04", "range=custom&preset=all&preset=all",
    "range=7d&start=", "range=7d&end=", "range=7d&preset=", "range=custom&preset=all&start=",
    "range=custom&preset=all&end=", "range=custom&start=2026-08-01&end=2026-08-03&preset=",
];
for (const value of invalid) assert.equal(parse(value).ok, false, value);
assert.deepEqual(parse("range=custom&preset=all").value, { key: "custom", start: null, end: null, allTime: true });
assert.equal(parse("range=custom&start=2026-08-01&end=2026-08-03").ok, true);
const unrelated = new URLSearchParams("branch=abc&range=wat");
if (!parse(unrelated).ok) {
    unrelated.set("range", "7d"); unrelated.delete("start"); unrelated.delete("end"); unrelated.delete("preset");
}
assert.equal(unrelated.get("branch"), "abc");
assert.equal(unrelated.toString(), "branch=abc&range=7d");

const fixed = (key) => ({ key, start: null, end: null, allTime: false });
const queries = [fixed("today"), fixed("7d"), fixed("30d"), fixed("90d"), fixed("year"),
    { key: "custom", start: "2026-07-01", end: "2026-07-31", allTime: false },
    { key: "custom", start: null, end: null, allTime: true }];
for (const query of queries) {
    const range = reports.buildReportsSalesRange(query, now, null);
    assert.ok(Date.parse(range.startInclusive) < Date.parse(range.endExclusive), query.key);
    assert.ok(Date.parse(range.endExclusive) <= now.getTime(), query.key);
    if (range.comparisonStartInclusive) {
        assert.ok(Date.parse(range.comparisonStartInclusive) < Date.parse(range.comparisonEndExclusive), query.key);
        assert.ok(Date.parse(range.comparisonEndExclusive) <= Date.parse(range.startInclusive), query.key);
    }
    assert.doesNotThrow(() => reports.buildReportsSalesTrend([], range));
    assert.doesNotThrow(() => reports.buildReportsSalesCalendar([], range));
}
const newYear = reports.buildReportsSalesRange(fixed("year"), new Date("2025-12-31T17:00:00.000Z"));
assert.ok(Date.parse(newYear.startInclusive) < Date.parse(newYear.endExclusive));

const orders = [{ id: "1", total: 125, occurredAt: "2026-07-15T05:00:00.000Z", timestampSource: "paid_at", paymentMethod: "cash", items: [] }];
const metrics = reports.calculateReportsSalesMetrics(orders);
assert.equal(metrics.paidSales, 125); assert.equal(metrics.paidOrderCount, 1);
assert.equal(reports.buildReportsSalesPayments(orders, metrics.paidSales).reduce((sum, item) => sum + item.paidSales, 0), metrics.paidSales);

const picker = fs.readFileSync(path.join(root, "src/components/admin/reports/ReportsDateRangePicker.tsx"), "utf8");
for (const behavior of ["event.key !== \"Tab\"", "event.shiftKey", "last.focus()", "first.focus()", "event.key === \"Escape\"", "setDraft(appliedDraft())", "aria-pressed={allTime}"]) assert.ok(picker.includes(behavior), behavior);
const route = fs.readFileSync(path.join(root, "src/app/api/reports/sales/route.ts"), "utf8");
for (const behavior of ["crypto.randomUUID()", "REPORTS_INTERNAL_ERROR", "requestId", "console.error", 'stage: ReportsErrorStage']) assert.ok(route.includes(behavior), behavior);
assert.ok(!route.includes("error instanceof Error ? error.message"));

console.log(`reports stabilization: ${invalid.length} invalid URL cases and ${queries.length + 1} range cases passed`);
