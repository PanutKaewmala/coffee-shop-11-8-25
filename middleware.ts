// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req: NextRequest) {
    const res = NextResponse.next();

    // create supabase client ที่อ่าน session จาก cookies
    const supabase = createMiddlewareClient({ req, res });

    // get active session
    const {
        data: { session },
    } = await supabase.auth.getSession();

    // protect admin route
    if (req.nextUrl.pathname.startsWith("/admin") && !session) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    return res;
}

export const config = {
    matcher: ["/admin/:path*"],
};
