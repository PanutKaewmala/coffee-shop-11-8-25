import AdminShell from "@/app/admin/AdminShell";
import { requirePosPage } from "@/lib/adminAccess";
import POSClient from "./POSClient";

export default async function POSPage() {
    const identity = await requirePosPage();

    return (
        <AdminShell
            currentShopId={identity.currentShopId!}
            currentBranchId={identity.currentBranchId!}
            currentShopRole={identity.currentShopRole}
            contentVariant="pos"
        >
            <POSClient />
        </AdminShell>
    );
}
