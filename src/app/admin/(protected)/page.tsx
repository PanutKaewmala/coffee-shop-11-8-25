import TodayOverview from "@/components/admin/dashboard/TodayOverview";
import { requireOwnerPage } from "@/lib/adminAccess";

export default async function AdminTodayPage() {
    await requireOwnerPage();
    return <TodayOverview />;
}
