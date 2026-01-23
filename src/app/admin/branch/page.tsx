// src/app/admin/branch/page.tsx
import React, { Suspense } from "react";
import BranchPageClient from "./BranchPageClient";

export default function Page() {
    return (
        <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading Branch…</div>}>
            <BranchPageClient />
        </Suspense>
    );
}
