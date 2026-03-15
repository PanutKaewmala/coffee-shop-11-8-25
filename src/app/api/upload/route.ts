import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        if (authErr) {
            return NextResponse.json({ error: authErr.message }, { status: 500 });
        }
        if (!auth.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const files = formData.getAll("files") as File[];

        if (!files?.length) {
            return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
        }
        const admin = getSupabaseAdmin();

        const uploadTasks = files.map(async (file) => {
            if (!ALLOWED_TYPES.includes(file.type)) {
                throw new Error(`File type not allowed: ${file.name}`);
            }

            const ext = file.name.split(".").pop() || "bin";
            const newFileName = `${uuidv4()}.${ext}`;
            const buffer = Buffer.from(await file.arrayBuffer());

            const { error } = await admin.storage
                .from("uploads")
                .upload(newFileName, buffer, { contentType: file.type, upsert: false });

            if (error) throw new Error(error.message);

            const { data } = admin.storage.from("uploads").getPublicUrl(newFileName);
            return data.publicUrl;
        });

        const urls = await Promise.all(uploadTasks);
        return NextResponse.json({ urls }, { status: 201 });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "Unexpected server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
