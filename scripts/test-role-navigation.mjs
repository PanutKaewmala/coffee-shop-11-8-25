import assert from "node:assert/strict";
import {
    decideOperationalPage,
    decideOwnerPage,
    decidePosPage,
    decideProtectedRoot,
    contextSelectorPath,
    ingredientActionVisibility,
    isOwnerOnlyPath,
    isOperationalPath,
    parseAppRole,
    roleHome,
    safeInternalPath,
} from "../src/lib/accessPolicy.mjs";
import { isNavigationPathActive, navigationForRole } from "../src/lib/navigationPolicy.mjs";

const base = { authenticated: true, hasCurrentShop: true, hasAnyMembership: true, hasBranch: true };
const owner = { ...base, role: "owner" };
const staff = { ...base, role: "staff" };

assert.equal(parseAppRole("owner"), "owner");
assert.equal(parseAppRole("staff"), "staff");
assert.equal(parseAppRole("manager"), null);
assert.equal(parseAppRole(null), null);
assert.equal(roleHome("owner"), "/admin");
assert.equal(roleHome("staff"), "/pos");
assert.equal(roleHome("manager"), "/no-access");
assert.deepEqual(decideProtectedRoot({ ...base, role: "manager" }), { action: "no-access" });
assert.deepEqual(decideProtectedRoot({ ...base, hasCurrentShop: false, hasAnyMembership: false, role: null }), { action: "no-access" });

const ownerOnlyRoutes = ["/admin", "/admin/reports", "/admin/menu", "/admin/recipes", "/admin/branch", "/admin/news", "/admin/contact", "/admin/ingredients/archived"];
for (const route of ownerOnlyRoutes) {
    assert.equal(isOwnerOnlyPath(route), true, `owner policy includes ${route}`);
    assert.deepEqual(decideOwnerPage(staff), { action: "staff-home" }, `staff denied ${route}`);
}
const sharedRoutes = ["/admin/orders", "/admin/orders/id", "/admin/ingredients", "/admin/ingredients/id", "/admin/stock", "/admin/daily-close"];
for (const route of sharedRoutes) {
    assert.equal(isOperationalPath(route), true, `operational policy includes ${route}`);
    assert.deepEqual(decideOperationalPage(staff), { action: "allow" }, `staff allowed ${route}`);
    assert.deepEqual(decideOperationalPage(owner), { action: "allow" }, `owner allowed ${route}`);
}
assert.deepEqual(decideOwnerPage({ ...staff, hasBranch: false }), { action: "staff-home" }, "archived denial wins before branch selection");
assert.equal(isOwnerOnlyPath("/admin/ingredients/archived"), true);
assert.equal(isOperationalPath("/admin/ingredients/archived"), false);
assert.equal(isOwnerOnlyPath("/admin/ingredients/123"), false);
assert.deepEqual(decidePosPage({ ...owner, hasBranch: false }), { action: "select-branch" });
assert.deepEqual(decidePosPage({ ...staff, hasBranch: false }), { action: "select-branch" });
assert.deepEqual(decidePosPage({ ...base, authenticated: false, role: null }), { action: "login" });

const flatten = (sections) => sections.flatMap((section) => section.items.flatMap((item) => [item, ...(item.children ?? [])]));
const ownerItems = flatten(navigationForRole("owner"));
const staffItems = flatten(navigationForRole("staff"));
assert.equal(ownerItems.length, 13);
assert.deepEqual(staffItems.map((item) => item.path), ["/pos", "/admin/orders", "/admin/ingredients", "/admin/stock", "/admin/daily-close"]);
assert.equal(navigationForRole("manager").length, 0);
assert.equal(isNavigationPathActive("/pos", "/pos"), true);
assert.equal(isNavigationPathActive("/admin/orders/123", "/admin/orders"), true);
assert.equal(isNavigationPathActive("/admin/ingredients/archived", "/admin/ingredients"), true);
assert.equal(isNavigationPathActive("/admin/ingredients/archived", "/admin/ingredients/archived"), true);

assert.deepEqual(ingredientActionVisibility("staff"), {
    canAdjust: true,
    canCreate: false,
    canRename: false,
    canArchive: false,
});
assert.equal(safeInternalPath("//external.example", "/admin"), "/admin");
assert.equal(safeInternalPath("/admin/orders?range=today", "/admin"), "/admin/orders?range=today");
assert.equal(contextSelectorPath("shop", "/admin/orders?range=today"), "/admin/select-shop?next=%2Fadmin%2Forders%3Frange%3Dtoday");
assert.equal(contextSelectorPath("branch", "/pos"), "/select-branch?next=%2Fpos");
assert.equal(contextSelectorPath("branch", "//external.example"), "/select-branch?next=%2Fadmin");

console.log("role navigation behavioral assertions passed");
