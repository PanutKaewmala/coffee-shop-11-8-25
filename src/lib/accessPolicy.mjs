export const OWNER_HOME = "/admin";
export const STAFF_HOME = "/pos";
export const NO_ACCESS = "/no-access";

export function parseAppRole(value) {
    return value === "owner" || value === "staff" ? value : null;
}

export function safeInternalPath(value, fallback = OWNER_HOME) {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
    try {
        const parsed = new URL(value, "https://internal.invalid");
        if (parsed.origin !== "https://internal.invalid") return fallback;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return fallback;
    }
}

export function roleHome(role) {
    if (role === "owner") return OWNER_HOME;
    if (role === "staff") return STAFF_HOME;
    return NO_ACCESS;
}

const OWNER_ONLY_PATHS = [
    "/admin", "/admin/reports", "/admin/menu", "/admin/recipes",
    "/admin/ingredients/archived", "/admin/news", "/admin/branch", "/admin/contact",
];

export function isOwnerOnlyPath(pathname) {
    return OWNER_ONLY_PATHS.some((path) => pathname === path || (path !== "/admin" && pathname.startsWith(`${path}/`)));
}

const OPERATIONAL_PATHS = [
    "/pos", "/admin/orders", "/admin/ingredients", "/admin/stock", "/admin/daily-close",
];

export function isOperationalPath(pathname) {
    if (isOwnerOnlyPath(pathname)) return false;
    return OPERATIONAL_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function contextSelectorPath(kind, nextPath) {
    const next = safeInternalPath(nextPath, OWNER_HOME);
    const selector = kind === "branch" ? "/select-branch" : "/admin/select-shop";
    return `${selector}?next=${encodeURIComponent(next)}`;
}

export function decideProtectedRoot({ authenticated, hasCurrentShop, hasAnyMembership, role }) {
    if (!authenticated) return { action: "login" };
    if (!hasCurrentShop) return { action: hasAnyMembership ? "select-shop" : "no-access" };
    return parseAppRole(role) ? { action: "allow" } : { action: "no-access" };
}

export function decideOwnerPage(input) {
    const root = decideProtectedRoot(input);
    if (root.action !== "allow") return root;
    return input.role === "owner" ? { action: "allow" } : { action: "staff-home" };
}

export function decideOperationalPage(input) {
    const root = decideProtectedRoot(input);
    if (root.action !== "allow") return root;
    if (input.role === "staff" && !input.hasBranch) return { action: "select-branch" };
    return { action: "allow" };
}

export function decidePosPage(input) {
    const root = decideProtectedRoot(input);
    if (root.action !== "allow") return root;
    return input.hasBranch ? { action: "allow" } : { action: "select-branch" };
}

export function ingredientActionVisibility(role) {
    return {
        canAdjust: role === "owner" || role === "staff",
        canCreate: role === "owner",
        canRename: role === "owner",
        canArchive: role === "owner",
    };
}
