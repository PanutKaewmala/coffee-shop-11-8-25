import { requireOperationalPage } from "@/lib/adminAccess";
import OrdersClient from "./OrdersClient";

export default async function OrdersPage() {
    await requireOperationalPage("/admin/orders");
    return <OrdersClient />;
}
