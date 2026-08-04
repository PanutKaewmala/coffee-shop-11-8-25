import assert from "node:assert/strict";
import { safeInternalPath } from "../src/lib/accessPolicy.mjs";
import { logoutPlan, resolveBranchContext, resolveShopContext, shopSwitchPlan } from "../src/lib/contextPolicy.mjs";

const memberships = (ids) => ids.map((shopId) => ({ shopId }));
assert.equal(resolveShopContext([], null).action, "no-access");
assert.deepEqual(resolveShopContext(memberships(["a"]), null), { action: "select", shopId: "a", clearShop: false, clearBranch: true });
assert.equal(resolveShopContext(memberships(["a", "b"]), null).action, "select-shop");
assert.equal(resolveShopContext(memberships(["a"]), "stale").shopId, "a");
assert.equal(resolveShopContext(memberships(["a", "b"]), "stale").action, "select-shop");

const branches = [{ id: "one", isPrimary: false }, { id: "primary", isPrimary: true }];
assert.equal(resolveBranchContext(branches, "one", "owner").action, "keep");
assert.equal(resolveBranchContext(branches, "stale", "owner").clearBranch, true);
assert.equal(resolveBranchContext(branches, null, "owner").branchId, "primary");
assert.equal(resolveBranchContext([{ id: "only", isPrimary: false }], null, "staff").branchId, "only");
assert.equal(resolveBranchContext(branches.map((b) => ({ ...b, isPrimary: false })), null, "staff").action, "select-branch");
assert.deepEqual(resolveBranchContext([], null, "owner"), { action: "no-branch", role: "owner", clearBranch: false });
assert.deepEqual(resolveBranchContext([], null, "staff"), { action: "no-branch", role: "staff", clearBranch: false });

const primarySwitch = shopSwitchPlan(branches, "/pos", "staff");
assert.equal(primarySwitch.clearOldBranch, true);
assert.equal(primarySwitch.branch.branchId, "primary");
assert.equal(primarySwitch.href, "/pos");
assert.equal(primarySwitch.readyToReloadDestination, true);
const choiceSwitch = shopSwitchPlan(branches.map((b) => ({ ...b, isPrimary: false })), "/admin/orders?status=paid", "staff");
assert.equal(choiceSwitch.href, "/select-branch?next=%2Fadmin%2Forders%3Fstatus%3Dpaid");
assert.equal(choiceSwitch.readyToReloadDestination, false);

for (const path of ["/pos", "/admin/orders", "/admin/orders?status=paid", "/admin/orders/abc"]) assert.equal(safeInternalPath(path), path);
assert.equal(safeInternalPath("//external.example", "/admin"), "/admin");
assert.equal(safeInternalPath("https://external.example", "/admin"), "/admin");
assert.deepEqual(logoutPlan(), { destination: "/login", clearCookies: ["current_shop_id", "current_branch_id"] });
console.log("context reliability behavioral tests passed");
