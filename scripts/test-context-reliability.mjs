import assert from "node:assert/strict";
import fs from "node:fs";
import { safeInternalPath } from "../src/lib/accessPolicy.mjs";
import { contextMutationOutcome, logoutOutcome, logoutPlan, resolveBranchContext, resolveShopContext, shopSwitchPlan } from "../src/lib/contextPolicy.mjs";

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
assert.deepEqual(contextMutationOutcome({ sourceError: new Error("membership query") }), { ok: false, stage: "source", mutateCookies: false });
assert.deepEqual(contextMutationOutcome({ sourceError: new Error("branch query") }), { ok: false, stage: "source", mutateCookies: false });
assert.deepEqual(contextMutationOutcome({ profileError: new Error("profile update") }), { ok: false, stage: "profile", mutateCookies: false });
assert.deepEqual(contextMutationOutcome(), { ok: true, stage: "complete", mutateCookies: true });
assert.deepEqual(logoutOutcome(new Error("sign out")), { ok: false, destination: null, clearCookies: false });
assert.deepEqual(logoutOutcome(null), { ok: true, destination: "/login", clearCookies: true });

const supabaseServer = fs.readFileSync("src/lib/supabaseServer.ts", "utf8");
assert.match(supabaseServer, /import \{ cache \} from "react"/, "server identity should use request-scoped React cache");
assert.match(supabaseServer, /export const getServerIdentity = cache\(loadServerIdentity\)/, "server identity should still be reused within a render");

const middleware = fs.readFileSync("middleware.ts", "utf8");
const protectedLayout = fs.readFileSync("src/app/admin/(protected)/layout.tsx", "utf8");
const adminShell = fs.readFileSync("src/app/admin/AdminShell.tsx", "utf8");
const protectedRouteFiles = [
    "src/app/admin/(protected)/page.tsx",
    "src/app/admin/(protected)/branch/layout.tsx",
    "src/app/admin/(protected)/contact/layout.tsx",
    "src/app/admin/(protected)/daily-close/layout.tsx",
    "src/app/admin/(protected)/ingredients/(operational)/page.tsx",
    "src/app/admin/(protected)/ingredients/(operational)/[id]/page.tsx",
    "src/app/admin/(protected)/ingredients/archived/layout.tsx",
    "src/app/admin/(protected)/menu/layout.tsx",
    "src/app/admin/(protected)/news/layout.tsx",
    "src/app/admin/(protected)/orders/page.tsx",
    "src/app/admin/(protected)/orders/[id]/page.tsx",
    "src/app/admin/(protected)/recipes/layout.tsx",
    "src/app/admin/(protected)/reports/layout.tsx",
    "src/app/admin/(protected)/staff/layout.tsx",
    "src/app/admin/(protected)/stock/layout.tsx",
];

assert.match(middleware, /requestHeaders\.set\("x-talvo-pathname", req\.nextUrl\.pathname\)/, "middleware should forward the requested admin pathname to the protected root");
assert.match(protectedLayout, /headers\(\)/, "protected root should read the forwarded pathname");
assert.match(protectedLayout, /isOwnerOnlyPath\(pathname\)/, "protected root should enforce owner-only paths before rendering children");
assert.match(protectedLayout, /isOperationalPath\(pathname\)[\s\S]*!currentBranchId/, "protected root should require a branch for staff operational routes");
assert.match(adminShell, /staffOnOwnerRoute[\s\S]*router\.replace\("\/pos"\)/, "client navigation should keep staff out of owner-only screens");
assert.match(adminShell, /staffNeedsBranch[\s\S]*contextSelectorPath\("branch", pathname\)/, "client navigation should recover missing staff branch context");

for (const path of protectedRouteFiles) {
    const source = fs.readFileSync(path, "utf8");
    assert.doesNotMatch(source, /requireOwnerPage|requireOperationalPage/, `${path} should not repeat the root identity guard`);
}

console.log("context reliability behavioral tests passed");
