export const RESERVED_PUBLIC_SLUGS = new Set([
  "admin",
  "pos",
  "api",
  "login",
  "menu",
  "news",
  "contact",
]);

export function isPublicTenantPath(pathname: string): boolean {
  const tenantSlug = pathname.split("/")[1]?.trim().toLowerCase();

  if (!tenantSlug || RESERVED_PUBLIC_SLUGS.has(tenantSlug)) {
    return false;
  }

  return pathname === `/${tenantSlug}` || pathname.startsWith(`/${tenantSlug}/`);
}
