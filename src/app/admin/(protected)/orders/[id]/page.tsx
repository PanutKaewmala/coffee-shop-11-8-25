import { requireOperationalPage } from "@/lib/adminAccess";
import OrderDetailClient from "./OrderDetailClient";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    await requireOperationalPage(`/admin/orders/${encodeURIComponent(id)}`);
    return <OrderDetailClient />;
}
