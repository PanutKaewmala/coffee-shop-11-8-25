// app/api/ingredients/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

type UUID = string;

function isUUID(s: string | null): s is UUID {
    return !!s && s.length >= 16; // กันหลุดหยาบๆพอ (เหมือนที่มึงใช้ในไฟล์อื่น)
}

export async function GET(_req: NextRequest, ctx: { params: { id?: string } }) {
    const supabase = getSupabaseServer();

    const id = ctx.params?.id ?? null;
    if (!isUUID(id)) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { data, error } = await supabase
        .from("ingredients")
        .select("id,name,stock,min_stock,base_unit,unit,updated_at,created_at,category,is_archived")
        .eq("id", id)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ingredient: data });
}
