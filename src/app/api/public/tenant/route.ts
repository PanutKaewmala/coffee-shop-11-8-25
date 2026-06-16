import { NextRequest, NextResponse } from "next/server";
import { resolvePublicTenantBySlug } from "@/lib/publicTenant";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const slug = req.nextUrl.searchParams.get("slug")?.trim();

    if (!slug) {
        return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const shop = await resolvePublicTenantBySlug(slug);

    if (!shop) {
        return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    return NextResponse.json({
        shop: {
            id: shop.id,
            name: shop.name,
            slug: shop.slug ?? slug,
        },
    });
}
