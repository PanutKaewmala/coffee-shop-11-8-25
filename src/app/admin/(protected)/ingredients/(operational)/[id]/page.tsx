import { requireOperationalPage } from "@/lib/adminAccess";
import IngredientDetailClient from "./IngredientDetailClient";

export default async function IngredientDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    await requireOperationalPage(`/admin/ingredients/${encodeURIComponent(id)}`);
    return <IngredientDetailClient />;
}
