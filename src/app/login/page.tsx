import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function Page() {
    return (
        <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading...</div>}>
            <LoginClient />
        </Suspense>
    );
}
