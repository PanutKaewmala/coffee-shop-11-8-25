"use client";

import dynamic from "next/dynamic";

// Owner workspace data loads via authenticated client-side APIs.
// Keep initial server navigation independent of heavy workspace rendering.
const Workspace = dynamic(() => import("@/components/admin/recipes/RecipesShell"), {
    ssr: false,
    loading: () => (
        <div className="p-4 text-text-primary md:p-6" role="status" aria-live="polite">
            กำลังเปิดหน้าสูตรเมนู…
        </div>
    ),
});

export default function Page() {
    return <Workspace />;
}
