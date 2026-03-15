export function getPublicShopIdFromEnv(): string | null {
    const raw = process.env.NEXT_PUBLIC_PUBLIC_SHOP_ID;
    const v = typeof raw === "string" ? raw.trim() : "";
    return v ? v : null;
}

export function getPublicShopIdFromQuery(params: URLSearchParams): string | null {
    const v = params.get("shop_id");
    if (!v) return null;
    const s = v.trim();
    return s ? s : null;
}

export function resolvePublicShopId(
    params: URLSearchParams,
    bodyShopId?: string | null
): { shopId: string | null; mismatch: boolean } {
    const envId = getPublicShopIdFromEnv();
    const requested = bodyShopId && bodyShopId.trim()
        ? bodyShopId.trim()
        : getPublicShopIdFromQuery(params);

    if (envId && requested && envId !== requested) {
        return { shopId: envId, mismatch: true };
    }

    return { shopId: envId ?? requested ?? null, mismatch: false };
}

export function withPublicShopId(path: string, shopId?: string | null): string {
    const id = (shopId ?? getPublicShopIdFromEnv())?.trim();
    if (!id) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}shop_id=${encodeURIComponent(id)}`;
}
