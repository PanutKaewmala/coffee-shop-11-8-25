// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { isPreviewBackendAllowed, isPublicMarketingPreviewPath } from "@/lib/previewBackendPolicy.mjs";

export async function middleware(req: NextRequest) {
    const pathname = req.nextUrl.pathname;
    const previewBackendAllowed = isPreviewBackendAllowed({
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV,
        VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
    if (!previewBackendAllowed && !isPublicMarketingPreviewPath(pathname)) {
        return new NextResponse(
            "This preview is not configured for a safe staging backend.",
            {
                status: 503,
                headers: {
                    "Cache-Control": "no-store",
                    "Content-Type": "text/plain; charset=utf-8",
                },
            }
        );
    }

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-talvo-pathname", req.nextUrl.pathname);

    const res = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    if (!pathname.startsWith("/admin")) return res;

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
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
