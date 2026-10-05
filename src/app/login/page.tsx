// src/app/login/page.tsx
import { Suspense } from "react";
import LoginClient from "./LoginClient";

const TRIAL_BRANCH = "chore/trial-01-staging-readiness";
const TRIAL_SUPABASE_URL = "https://qyospaplvrfpdoyiwpoy.supabase.co";

export const dynamic = "force-dynamic";

function isExactTrialPreview() {
    return (
        process.env.VERCEL_ENV === "preview" &&
        process.env.VERCEL_GIT_COMMIT_REF === TRIAL_BRANCH &&
        process.env.NEXT_PUBLIC_SUPABASE_URL === TRIAL_SUPABASE_URL
    );
}

export default function Page() {
    const trialMode = isExactTrialPreview();

    return (
        <Suspense fallback={<div className="p-6 text-sm opacity-70">Loading...</div>}>
            <LoginClient
                initialEmail={trialMode ? "owner@demo.com" : undefined}
                initialPassword={trialMode ? "Trial01!Coffee2026#" : undefined}
                demoLabel={
                    trialMode
                        ? "Trial staging: owner@demo.com / Trial01!Coffee2026#"
                        : undefined
                }
            />
        </Suspense>
    );
}
