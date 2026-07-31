import "server-only";

import { NextResponse } from "next/server";
import { getServerIdentity } from "@/lib/supabaseServer";
import { STAFF_HOME } from "@/lib/adminAccess";

export async function GET() {
    const identity = await getServerIdentity();
    if (!identity.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!identity.currentShopId || !identity.currentShopRole) {
        return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
    }

    return NextResponse.json({
        role: identity.currentShopRole,
        home: identity.currentShopRole === "owner" ? "/admin" : STAFF_HOME,
    });
}
