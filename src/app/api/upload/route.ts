import { NextRequest, NextResponse } from "next/server";
import { getCurrentContextFromCookies, getSupabaseServer } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MiB

const MAGIC_BYTES: Record<string, { bytes: number[]; length: number }> = {
    "image/png": { bytes: [0x89, 0x50, 0x4e, 0x47], length: 4 },
    "image/jpeg": { bytes: [0xff, 0xd8, 0xff], length: 3 },
    "image/gif": { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], length: 6 }, // GIF87a / GIF89a checked in validator
    "image/webp": { bytes: [0x52, 0x49, 0x46, 0x46], length: 4 }, // RIFF (check WEBP at offset 12)
};

function isWebP(buffer: Uint8Array): boolean {
    if (buffer.length < 12) return false;
    return (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
    );
}

function validateMagicBytes(buffer: Uint8Array, mimeType: string): boolean {
    if (mimeType === "image/webp") return isWebP(buffer);
    if (mimeType === "image/gif") {
        if (buffer.length < 6) return false;
        return (
            buffer[0] === 0x47 &&
            buffer[1] === 0x49 &&
            buffer[2] === 0x46 &&
            buffer[3] === 0x38 &&
            (buffer[4] === 0x37 || buffer[4] === 0x39) && // 37 = GIF87a, 39 = GIF89a
            buffer[5] === 0x61
        );
    }
    const magic = MAGIC_BYTES[mimeType];
    if (!magic) return false;
    if (buffer.length < magic.length) return false;
    return magic.bytes.every((byte, index) => buffer[index] === byte);
}

function getExtensionFromMime(mimeType: string): string {
    switch (mimeType) {
        case "image/png":
            return "png";
        case "image/jpeg":
            return "jpg";
        case "image/webp":
            return "webp";
        case "image/gif":
            return "gif";
        default:
            return "bin";
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await getSupabaseServer();
        const { data: auth, error: authErr } = await supabase.auth.getUser();
        const user = auth.user;
        if (authErr || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { currentShopId } = await getCurrentContextFromCookies();
        if (!currentShopId) {
            return NextResponse.json({ error: "No current shop selected" }, { status: 409 });
        }

        const admin = getSupabaseAdmin();
        const { data: member, error: mErr } = await admin
            .from("shop_members")
            .select("role")
            .eq("user_id", user.id)
            .eq("shop_id", currentShopId)
            .maybeSingle();

        if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
        if (!member || member.role !== "owner") {
            return NextResponse.json({ error: "Owner only" }, { status: 403 });
        }

        const formData = await req.formData();
        const rawFiles = formData.getAll("files");

        if (!rawFiles.length) {
            return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
        }

        const files: File[] = [];
        for (const item of rawFiles) {
            if (!(item instanceof File)) {
                return NextResponse.json({ error: "Invalid file upload" }, { status: 400 });
            }
            files.push(item);
        }

        if (files.length > 1) {
            return NextResponse.json({ error: "Only one file per request is allowed" }, { status: 400 });
        }

        const file = files[0];

        if (file.size === 0) {
            return NextResponse.json({ error: "Empty file" }, { status: 400 });
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: "File too large" }, { status: 413 });
        }

        const headerBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        if (!validateMagicBytes(headerBytes, file.type)) {
            return NextResponse.json({ error: "Invalid file signature" }, { status: 415 });
        }

        const extension = getExtensionFromMime(file.type);
        const newFileName = `${currentShopId}/${crypto.randomUUID()}.${extension}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        const { error } = await admin.storage
            .from("uploads")
            .upload(newFileName, buffer, { contentType: file.type, upsert: false });

        if (error) throw new Error(error.message);

        const { data } = admin.storage.from("uploads").getPublicUrl(newFileName);
        return NextResponse.json({ urls: [data.publicUrl] }, { status: 201 });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "Unexpected server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
