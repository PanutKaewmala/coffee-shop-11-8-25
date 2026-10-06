import IngredientDetailClient from "./IngredientDetailClient";

export default async function IngredientDetailPage({ params }: { params: Promise<{ id: string }> }) {
    await params;
    return <IngredientDetailClient />;
}
