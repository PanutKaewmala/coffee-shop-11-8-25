// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

export async function middleware(req: NextRequest) {
    const res = NextResponse.next();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return req.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        res.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    let user: User | null = null;

    try {
        const {
            data: { session },
        } = await supabase.auth.getSession();

        user = session?.user ?? null;
    } catch {
        // refresh token เพี้ยน/หาย -> ถือว่าไม่ได้ login
        user = null;
    }

    if (req.nextUrl.pathname.startsWith("/admin") && !user) {
        const url = req.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
        return NextResponse.redirect(url);
    }

    return res;
}

export const config = {
    matcher: ["/admin/:path*"],
};
