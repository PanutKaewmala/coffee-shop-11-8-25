const TRIAL_PREVIEW_BRANCH = "chore/trial-01-staging-readiness";
const EMPLOYEE_PREVIEW_BRANCH = "chore/trial-02-employee-preview";
const TRIAL_STAGING_SUPABASE_URL = "https://qyospaplvrfpdoyiwpoy.supabase.co";

/**
 * Only explicitly approved TALVO trial Vercel Preview branches may use the staging backend.
 * Production and local development remain available. Unknown Vercel runtime
 * identity fails closed instead of silently permitting a production backend.
 */
/** @param {{ VERCEL?: string, VERCEL_ENV?: string, VERCEL_GIT_COMMIT_REF?: string, NEXT_PUBLIC_SUPABASE_URL?: string }} [env] */
export function isPreviewBackendAllowed(env = process.env) {
    if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "development") {
        return true;
    }

    if (!env.VERCEL && !env.VERCEL_ENV) {
        return true;
    }

    const isApprovedStagingBranch = env.VERCEL_GIT_COMMIT_REF === TRIAL_PREVIEW_BRANCH
        || env.VERCEL_GIT_COMMIT_REF === EMPLOYEE_PREVIEW_BRANCH;
    return isApprovedStagingBranch
        && env.NEXT_PUBLIC_SUPABASE_URL === TRIAL_STAGING_SUPABASE_URL;
}

/**
 * Unsafe previews may still render public marketing content. Everything
 * else—including login, authenticated pages and APIs—fails closed.
 */
export function isPublicMarketingPreviewPath(pathname) {
    return pathname === "/"
        || pathname === "/demo-system"
        || pathname.startsWith("/demo-system/");
}
