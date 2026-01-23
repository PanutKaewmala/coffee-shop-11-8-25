import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type UUID = string;

function isUUID(s: string | null): s is UUID {
    return !!s && s.length >= 16;
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id?: string }> }
) {
    const supabase = getSupabaseServer();

    const { id } = await params;
    const rawId = (id ?? "").trim();

    if (!isUUID(rawId)) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("ingredients")
        .select("id,name,stock,min_stock,base_unit,unit,updated_at,category,is_active,archived_at")
        .eq("id", rawId)
        .single();

    if (error || !data) {
        return NextResponse.json(
            { error: error?.message ?? "Not found" },
            { status: 404 }
        );
    }

    return NextResponse.json({ ingredient: data });
}
