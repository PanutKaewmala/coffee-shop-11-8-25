import { notFound } from "next/navigation";
import PublicNewsSection from "@/components/public/PublicNewsSection";
import { resolvePublicShopIdBySlug } from "@/lib/publicTenant";

export default async function ShopSlugNewsPage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;
  const shopId = await resolvePublicShopIdBySlug(shopSlug);

  if (!shopId) {
    notFound();
  }

  return <PublicNewsSection shopId={shopId} />;
}
