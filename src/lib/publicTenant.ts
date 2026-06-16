import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { RESERVED_PUBLIC_SLUGS } from "@/lib/publicTenantPath";

type PublicTenant = {
  id: string;
  name: string;
  slug?: string | null;
};

function normalizePublicSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export async function resolvePublicTenantBySlug(slug: string): Promise<PublicTenant | null> {
  const normalized = normalizePublicSlug(slug);

  if (!normalized || RESERVED_PUBLIC_SLUGS.has(normalized)) {
    return null;
  }

  const admin = getSupabaseAdmin();

  const { data, error } = await admin.from("shops").select("*");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as PublicTenant[];

  return rows.find((row) => normalizePublicSlug(row.slug ?? "") === normalized) ?? null;
}

export async function resolvePublicShopIdBySlug(slug: string): Promise<string | null> {
  const tenant = await resolvePublicTenantBySlug(slug);
  return tenant?.id ?? null;
}
