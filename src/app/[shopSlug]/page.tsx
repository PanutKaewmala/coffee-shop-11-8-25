import { notFound } from "next/navigation";
import HomePage from "@/app/page";
import { resolvePublicShopIdBySlug } from "@/lib/publicTenant";

export default async function ShopSlugHomePage({
  params,
}: {
  params: Promise<{ shopSlug: string }>;
}) {
  const { shopSlug } = await params;
  const shopId = await resolvePublicShopIdBySlug(shopSlug);

  if (!shopId) {
    notFound();
  }

  return <HomePage shopId={shopId} />;
}
