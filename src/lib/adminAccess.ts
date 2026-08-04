import "server-only";

import { redirect } from "next/navigation";
import { getServerIdentity } from "@/lib/supabaseServer";
import {
    NO_ACCESS,
    STAFF_HOME,
    decideOperationalPage,
    decideOwnerPage,
    decidePosPage,
} from "@/lib/accessPolicy.mjs";

export { STAFF_HOME };

type GuardOptions = { loginNext: string; selectShopNext?: string; selectBranchNext?: string };

function applyDecision(
    decision: { action: string },
    { loginNext, selectShopNext = loginNext, selectBranchNext = loginNext }: GuardOptions
) {
    if (decision.action === "allow") return;
    if (decision.action === "login") redirect(`/login?next=${encodeURIComponent(loginNext)}`);
    if (decision.action === "select-shop") redirect(`/admin/select-shop?next=${encodeURIComponent(selectShopNext)}`);
    if (decision.action === "select-branch") redirect(`/select-branch?next=${encodeURIComponent(selectBranchNext)}`);
    if (decision.action === "staff-home") redirect(STAFF_HOME);
    redirect(NO_ACCESS);
}

function decisionInput(identity: Awaited<ReturnType<typeof getServerIdentity>>) {
    return {
        authenticated: Boolean(identity.user),
        hasCurrentShop: Boolean(identity.currentShopId),
        hasAnyMembership: identity.hasAnyShopMembership,
        hasBranch: Boolean(identity.currentBranchId),
        role: identity.currentShopRole,
    };
}

export async function requireOwnerPage(pathname = "/admin") {
    const identity = await getServerIdentity();
    applyDecision(decideOwnerPage(decisionInput(identity)), { loginNext: pathname });
    return identity;
}

export async function requireOperationalPage(pathname: string) {
    const identity = await getServerIdentity();
    applyDecision(decideOperationalPage(decisionInput(identity)), {
        loginNext: pathname,
        selectShopNext: pathname,
        selectBranchNext: pathname,
    });
    return identity;
}

export async function requirePosPage() {
    const identity = await getServerIdentity();
    applyDecision(decidePosPage(decisionInput(identity)), {
        loginNext: "/pos",
        selectShopNext: "/pos",
        selectBranchNext: "/pos",
    });
    return identity;
}
