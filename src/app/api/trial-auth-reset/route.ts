import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const STAGING_URL = "https://qyospaplvrfpdoyiwpoy.supabase.co";
const BRANCH = "chore/trial-01-staging-readiness";
const USER_ID = "71000000-0000-4000-8000-000000000001";
const USER_EMAIL = "trial01-owner@example.com";

function allowed() {
    return (
        process.env.VERCEL_ENV === "preview" &&
        process.env.VERCEL_GIT_COMMIT_REF === BRANCH &&
        process.env.NEXT_PUBLIC_SUPABASE_URL === STAGING_URL
    );
}

export async function POST() {
    if (!allowed()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const password = process.env.TRIAL_OWNER_PASSWORD;
    if (!password || password.length < 12) {
        return NextResponse.json({ error: "Trial password unavailable" }, { status: 500 });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.updateUserById(USER_ID, {
        password,
        email_confirm: true,
    });

    if (error || data.user?.id !== USER_ID || data.user.email !== USER_EMAIL) {
        console.error("[trial-auth-reset] failed", error);
        return NextResponse.json({ error: "Unable to reset trial user" }, { status: 500 });
    }

    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}
