import { notFound } from "next/navigation";
import ContactPage from "@/app/contact/page";
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

  return <ContactPage shopId={shopId} />;
}
