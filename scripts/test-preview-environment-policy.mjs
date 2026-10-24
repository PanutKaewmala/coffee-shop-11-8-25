import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    isPreviewBackendAllowed,
    isPublicMarketingPreviewPath,
} from "../src/lib/previewBackendPolicy.mjs";

const production = {
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    NEXT_PUBLIC_SUPABASE_URL: "https://udgxrvtbhytqncmyhmiv.supabase.co",
};
const localDevelopment = {
    NEXT_PUBLIC_SUPABASE_URL: "https://udgxrvtbhytqncmyhmiv.supabase.co",
};
const trialPreview = {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "chore/trial-01-staging-readiness",
    NEXT_PUBLIC_SUPABASE_URL: "https://qyospaplvrfpdoyiwpoy.supabase.co",
};
const employeePreview = {
    ...trialPreview,
    VERCEL_GIT_COMMIT_REF: "chore/trial-02-employee-preview",
};

assert.equal(isPreviewBackendAllowed(production), true, "Production must remain enabled");
assert.equal(isPreviewBackendAllowed(localDevelopment), true, "Local development must remain enabled");
assert.equal(isPreviewBackendAllowed(trialPreview), true, "The exact TRIAL-01 staging preview must remain enabled");
assert.equal(isPreviewBackendAllowed(employeePreview), true, "Employee Preview must be enabled only against staging");

assert.equal(
    isPreviewBackendAllowed({
        ...production,
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "feat/landing-01-product-story",
    }),
    false,
    "A feature preview must not inherit the production backend",
);
assert.equal(
    isPreviewBackendAllowed({
        ...trialPreview,
        NEXT_PUBLIC_SUPABASE_URL: production.NEXT_PUBLIC_SUPABASE_URL,
    }),
    false,
    "TRIAL-01 must fail closed when its backend is not staging",
);
assert.equal(
    isPreviewBackendAllowed({
        ...employeePreview,
        NEXT_PUBLIC_SUPABASE_URL: production.NEXT_PUBLIC_SUPABASE_URL,
    }),
    false,
    "Employee Preview must fail closed when its backend is not staging",
);
assert.equal(
    isPreviewBackendAllowed({
        ...trialPreview,
        VERCEL_GIT_COMMIT_REF: "chore/another-branch",
    }),
    false,
    "A different branch must not inherit TRIAL-01's backend access",
);
assert.equal(
    isPreviewBackendAllowed({ VERCEL_ENV: "preview" }),
    false,
    "A Preview with missing backend identity must fail closed",
);
assert.equal(
    isPreviewBackendAllowed({ VERCEL: "1" }),
    false,
    "An unknown Vercel runtime must fail closed when VERCEL_ENV is unavailable",
);
assert.equal(
    isPreviewBackendAllowed({
        VERCEL: "1",
        VERCEL_GIT_COMMIT_REF: "chore/trial-01-staging-readiness",
        NEXT_PUBLIC_SUPABASE_URL: trialPreview.NEXT_PUBLIC_SUPABASE_URL,
    }),
    true,
    "The exact staging trial may still run if VERCEL_ENV is unavailable at runtime",
);

for (const pathname of ["/", "/demo-system", "/demo-system/recipes"]) {
    assert.equal(isPublicMarketingPreviewPath(pathname), true, `${pathname} should remain public in a backendless preview`);
}
for (const pathname of ["/login", "/admin", "/api/stock/usable", "/signup", "/onboarding"]) {
    assert.equal(isPublicMarketingPreviewPath(pathname), false, `${pathname} must not bypass the preview guard`);
}

const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
assert.ok(
    middleware.indexOf("isPreviewBackendAllowed({")
        >= 0
        && middleware.indexOf("isPreviewBackendAllowed({")
            < middleware.indexOf("const supabase = createServerClient("),
    "The explicit environment guard must run before the middleware creates a Supabase client",
);
for (const marker of [
    "VERCEL: process.env.VERCEL",
    "VERCEL_ENV: process.env.VERCEL_ENV",
    "VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF",
    "NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL",
]) {
    assert.ok(middleware.includes(marker), `Middleware must explicitly pass ${marker}`);
}
assert.match(middleware, /status:\s*503/, "Unsafe previews must fail closed with HTTP 503");
assert.ok(
    middleware.includes(String.raw`matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"]`),
    "The middleware must guard application routes while excluding static files",
);

const loginPage = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
const loginClient = readFileSync(new URL("../src/app/login/LoginClient.tsx", import.meta.url), "utf8");
assert.ok(!loginPage.includes("initialPassword="), "Preview login must not embed trial passwords in rendered props");
assert.match(loginClient, /initialPassword\s*=\s*""/, "Login must not prefill a password");
assert.match(loginClient, /demoLabel\s*=\s*""/, "Login must not display default trial credentials");

console.log("PASS preview backend isolation: production/local remain enabled; only approved staging trial branches are enabled; unsafe preview routes fail closed");
