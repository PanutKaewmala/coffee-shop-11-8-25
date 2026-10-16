"use client";

import dynamic from "next/dynamic";

// Daily Close already loads its business data on the client. Avoid server
// rendering the full interactive workspace on a cold direct navigation.
const DailyCloseClient = dynamic(() => import("./DailyCloseClient"), {
    ssr: false,
    loading: () => (
        <div className="p-4 text-text-primary md:p-6" role="status" aria-live="polite">
            กำลังเปิดหน้าปิดยอดรายวัน…
        </div>
    ),
});

export default function DailyClosePage() {
    return <DailyCloseClient />;
}
