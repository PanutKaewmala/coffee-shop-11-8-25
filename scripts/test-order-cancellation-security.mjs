import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAppRole } from "../src/lib/accessPolicy.mjs";

const route = readFileSync(
  new URL("../src/app/api/orders/[id]/cancel/route.ts", import.meta.url),
  "utf8",
);
const client = readFileSync(
  new URL("../src/app/admin/(protected)/orders/[id]/OrderDetailClient.tsx", import.meta.url),
  "utf8",
);

assert.equal(parseAppRole("owner"), "owner", "owner membership produces the owner audit actor");
assert.equal(parseAppRole("staff"), "staff", "staff membership produces the staff audit actor");
assert.equal(parseAppRole("manager"), null, "unknown membership roles fail closed");

assert.match(route, /select\("shop_id, role"\)/, "the server loads the role from current-shop membership");
assert.match(route, /const actorRole = parseAppRole\(member\.role\)/, "the audit actor derives from membership");
assert.match(route, /p_cancelled_by: actorRole/, "the server role is forwarded to cancel_order");
assert.doesNotMatch(route, /body\.cancelledBy|body\[(["'])cancelledBy\1\]/, "a spoofed client actor is ignored");
assert.doesNotMatch(client, /cancelledBy\s*:/, "the UI no longer sends an actor field");

assert.match(route, /if \(!member\)[^\n]*status: 403/, "non-members are rejected");
assert.match(route, /\.eq\("shop_id", currentShopId\)[\s\S]*\.eq\("branch_id", currentBranchId\)/, "order lookup is scoped to current shop and branch");
assert.match(route, /code: "ORDER_NOT_FOUND"/, "cross-shop and cross-branch misses use a stable response");
assert.match(route, /checkDailyClose\(shopId, branchId, businessDate\)/, "the closed-business-day guard remains active");
assert.match(route, /code: "BUSINESS_DAY_CLOSED"/, "closed days retain their stable error code");
assert.match(route, /error\.message\.toLowerCase\(\)\.includes\("business_day_closed"\)/, "the authoritative cancellation RPC closed-day error stays a 409");

assert.match(route, /p_restock: restock/, "the validated restock flag is forwarded unchanged");
assert.match(route, /already_refunded: data\.already_refunded/, "RPC retry/restock idempotency state remains in the success contract");
assert.match(route, /already_cancelled: data\.already_cancelled/, "repeat cancellation state remains in the success contract");

assert.match(route, /console\.error\(`\[order-cancel\] \$\{scope\}`/, "unexpected server errors are logged");
assert.match(route, /code: "ORDER_CANCELLATION_FAILED"/, "RPC and database failures return a stable code");
assert.doesNotMatch(route, /detail:|hint:|debug:/, "raw RPC details and debug payloads are not returned");
assert.doesNotMatch(route, /error:\s*[a-zA-Z]+(?:Err|Error)\.message/, "raw Supabase errors are not returned");
assert.match(route, /code: "INVALID_ORDER_ID"/, "invalid IDs use a stable error code");
assert.doesNotMatch(route, /pathname|fromParams|fromPath/, "invalid IDs do not expose routing internals");

console.log("order cancellation security assertions passed");
