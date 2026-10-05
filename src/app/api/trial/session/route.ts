import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupabaseServer } from "@/lib/supabaseServer";
import {
    isTrialPreviewEnvironment,
    TRIAL_OWNER_EMAIL,
    TRIAL_OWNER_USER_ID,
} from "@/lib/trialEnvironment";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200) {
    const response = NextResponse.json(body, { status });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
}

export async function POST() {
    if (!isTrialPreviewEnvironment()) {
        return noStoreJson({ error: "Not found" }, 404);
    }

    const admin = getSupabaseAdmin();
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: TRIAL_OWNER_EMAIL,
    });

    if (
        linkError ||
        !link?.properties?.hashed_token ||
        link.user.id !== TRIAL_OWNER_USER_ID
    ) {
        console.error("[trial-session] generate_link_failed", linkError);
        return noStoreJson({ error: "Unable to start trial session" }, 500);
    }

    const supabase = await getSupabaseServer();
    const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: "magiclink",
    });

    if (verifyError || verified.user?.id !== TRIAL_OWNER_USER_ID) {
        console.error("[trial-session] verify_otp_failed", verifyError);
        return noStoreJson({ error: "Unable to start trial session" }, 500);
    }

    return noStoreJson({ ok: true });
}
