import { notFound } from "next/navigation";
import PublicMenuSection from "@/components/public/PublicMenuSection";
import { resolvePublicShopIdBySlug } from "@/lib/publicTenant";

export default async function ShopSlugMenuPage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;
  const shopId = await resolvePublicShopIdBySlug(shopSlug);

  if (!shopId) {
    notFound();
  }

  return <PublicMenuSection shopId={shopId} />;
}
