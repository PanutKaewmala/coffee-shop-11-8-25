import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { RESERVED_PUBLIC_SLUGS } from "@/lib/publicTenantPath";

export async function resolvePublicShopIdBySlug(slug: string): Promise<string | null> {
  const normalized = slug.trim().toLowerCase();

  if (!normalized || RESERVED_PUBLIC_SLUGS.has(normalized)) {
    return null;
  }

  const admin = getSupabaseAdmin();

  const { data, error } = await admin.from("shops").select("*");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    slug?: string | null;
  }>;

  return rows.find((row) => row.slug?.trim().toLowerCase() === normalized)?.id ?? null;
}
