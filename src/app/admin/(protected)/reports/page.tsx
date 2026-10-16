"use client";

import dynamic from "next/dynamic";

// This workspace loads its data through authenticated client-side APIs.
// Avoid stalling the protected server-stream during a cold direct navigation.
const Workspace = dynamic(() => import("@/components/admin/reports/ReportsSalesDashboard"), {
    ssr: false,
    loading: () => (
        <div className="p-4 text-text-primary md:p-6" role="status" aria-live="polite">
            กำลังเปิดหน้ารายงานยอดขาย…
        </div>
    ),
});

export default function Page() {
    return <Workspace />;
}
