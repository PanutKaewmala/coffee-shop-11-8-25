import { notFound } from "next/navigation";
import PublicContactSection from "@/components/public/PublicContactSection";
import { resolvePublicShopIdBySlug } from "@/lib/publicTenant";

export default async function ShopSlugContactPage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;
  const shopId = await resolvePublicShopIdBySlug(shopSlug);

  if (!shopId) {
    notFound();
  }

  return <PublicContactSection shopId={shopId} />;
}
