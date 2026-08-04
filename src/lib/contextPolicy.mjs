import { contextSelectorPath, safeInternalPath } from "./accessPolicy.mjs";

export function resolveShopContext(memberships, currentShopId) {
    const ids = [...new Set(memberships.map((item) => item.shopId).filter(Boolean))];
    if (currentShopId && ids.includes(currentShopId)) return { action: "keep", shopId: currentShopId };
    if (ids.length === 0) return { action: "no-access", clearShop: Boolean(currentShopId), clearBranch: true };
    if (ids.length === 1) return { action: "select", shopId: ids[0], clearShop: Boolean(currentShopId), clearBranch: true };
    return { action: "select-shop", clearShop: Boolean(currentShopId), clearBranch: true };
}

export function resolveBranchContext(branches, currentBranchId, role) {
    const valid = currentBranchId ? branches.find((branch) => branch.id === currentBranchId) : null;
    if (valid) return { action: "keep", branchId: valid.id, clearBranch: false };
    const clearBranch = Boolean(currentBranchId);
    const primary = branches.find((branch) => branch.isPrimary);
    if (primary) return { action: "select", branchId: primary.id, clearBranch };
    if (branches.length === 1) return { action: "select", branchId: branches[0].id, clearBranch };
    if (branches.length > 1) return { action: "select-branch", clearBranch };
    return { action: "no-branch", role, clearBranch };
}

export function destinationAfterBranchResolution(decision, nextPath) {
    const next = safeInternalPath(nextPath, "/admin");
    return decision.action === "keep" || decision.action === "select"
        ? next
        : contextSelectorPath("branch", next);
}

export function shopSwitchPlan(branches, nextPath, role) {
    const branch = resolveBranchContext(branches, null, role);
    return {
        clearOldBranch: true,
        branch,
        href: destinationAfterBranchResolution(branch, nextPath),
        readyToReloadDestination: branch.action === "keep" || branch.action === "select",
    };
}

export const LOGOUT_DESTINATION = "/login";
export const CONTEXT_COOKIE_NAMES = ["current_shop_id", "current_branch_id"];
export function logoutPlan() {
    return { destination: LOGOUT_DESTINATION, clearCookies: [...CONTEXT_COOKIE_NAMES] };
}
