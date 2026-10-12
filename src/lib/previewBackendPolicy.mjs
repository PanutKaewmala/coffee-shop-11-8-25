const TRIAL_PREVIEW_BRANCH = "chore/trial-01-staging-readiness";
const TRIAL_STAGING_SUPABASE_URL = "https://qyospaplvrfpdoyiwpoy.supabase.co";

/**
 * Non-trial Vercel Preview deployments must never run app routes against the
 * project's shared production Supabase credentials. Only the explicitly
 * scoped TRIAL-01 branch may use a Preview backend, and only when its URL
 * matches the reviewed staging project.
 *
 * Local development and Production are deliberately unaffected.
 */
export function isPreviewBackendAllowed(env = process.env) {
    if (env.VERCEL_ENV !== "preview") return true;

    return env.VERCEL_GIT_COMMIT_REF === TRIAL_PREVIEW_BRANCH
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
