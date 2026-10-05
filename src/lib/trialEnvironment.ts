import "server-only";

export const TRIAL_PREVIEW_BRANCH = "chore/trial-01-staging-readiness";
export const TRIAL_STAGING_URL = "https://qyospaplvrfpdoyiwpoy.supabase.co";
export const TRIAL_OWNER_EMAIL = "trial01-owner@example.com";
export const TRIAL_OWNER_USER_ID = "71000000-0000-4000-8000-000000000001";

export function isTrialPreviewEnvironment(): boolean {
    return (
        process.env.VERCEL_ENV === "preview" &&
        process.env.VERCEL_GIT_COMMIT_REF === TRIAL_PREVIEW_BRANCH &&
        process.env.NEXT_PUBLIC_SUPABASE_URL === TRIAL_STAGING_URL
    );
}
