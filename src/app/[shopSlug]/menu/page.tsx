import { notFound } from "next/navigation";
import MenuSection from "@/app/menu/page";
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

  return <MenuSection shopId={shopId} />;
}
