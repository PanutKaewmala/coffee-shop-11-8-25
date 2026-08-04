import { requireOperationalPage } from "@/lib/adminAccess";
import IngredientsClient from "./IngredientsClient";

export default async function IngredientsPage() {
    await requireOperationalPage("/admin/ingredients");
    return <IngredientsClient />;
}
