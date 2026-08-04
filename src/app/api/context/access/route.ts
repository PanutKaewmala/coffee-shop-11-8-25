import "server-only";

import { NextResponse } from "next/server";
import { getServerIdentity } from "@/lib/supabaseServer";
import { roleHome } from "@/lib/accessPolicy.mjs";

export async function GET() {
    const identity = await getServerIdentity();
    if (!identity.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!identity.currentShopId) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }
    if (!identity.currentShopRole) return NextResponse.json({ role: null, home: roleHome(null) });

    return NextResponse.json({
        role: identity.currentShopRole,
        home: roleHome(identity.currentShopRole),
    });
}
