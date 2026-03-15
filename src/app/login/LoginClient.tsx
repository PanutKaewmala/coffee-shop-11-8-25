"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

/* =========================
   Helpers
========================= */
function safeNext(raw: string | null) {
    if (!raw) return "/admin";
    return raw.startsWith("/") ? raw : "/admin";
}

type EnsureResult =
    | { action: "go"; href: string }
    | { action: "select-shop"; href: "/admin/select-shop" }
    | { action: "select-branch"; href: "/select-branch" };

async function jsonFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
        },
        cache: "no-store",
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed: ${res.status}`);
    }

    return (await res.json()) as T;
}

/**
 * Day 1: Auto Context
 * - if have current shop+branch already => go next
 * - else try auto:
 *   - if 1 shop => set shop
 *       - if 1 branch => set branch => go next
 *       - else => select-branch
 *   - if many shops => select-shop
 */
async function ensureContext(nextHref: string): Promise<EnsureResult> {
    // 1) Do we already have shop?
    // expected response examples:
    // - { shop_id: "uuid" | null }
    const shopCtx = await jsonFetch<{ shop_id: string | null }>("/api/context/shop");

    if (!shopCtx.shop_id) {
        // try to auto-pick shop by asking server (it should know memberships)
        // expected:
        // - { mode: "single", shop_id: "uuid" }
        // - { mode: "multiple" }
        // - { mode: "none" }
        const pickShop = await jsonFetch<
            | { mode: "single"; shop_id: string }
            | { mode: "multiple" }
            | { mode: "none" }
        >("/api/context/shop?mode=pick");

        if (pickShop.mode === "none") {
            // user has no shop membership -> treat as must pick/create later
            return { action: "select-shop", href: "/admin/select-shop" };
        }

        if (pickShop.mode === "multiple") {
            return { action: "select-shop", href: "/admin/select-shop" };
        }

        // single
        await jsonFetch<{ ok: true }>("/api/context/shop", {
            method: "POST",
            body: JSON.stringify({ shop_id: pickShop.shop_id }),
        });
    }

    // 2) Now ensure branch
    // expected:
    // - { branch_id: "uuid" | null }
    const branchCtx = await jsonFetch<{ branch_id: string | null }>("/api/context/branch");

    if (!branchCtx.branch_id) {
        // try auto-pick branch within current shop
        // expected:
        // - { mode: "single", branch_id: "uuid" }
        // - { mode: "multiple" }
        // - { mode: "none" }
        const pickBranch = await jsonFetch<
            | { mode: "single"; branch_id: string }
            | { mode: "multiple" }
            | { mode: "none" }
        >("/api/context/branch?mode=pick");

        if (pickBranch.mode === "none" || pickBranch.mode === "multiple") {
            return { action: "select-branch", href: "/select-branch" };
        }

        await jsonFetch<{ ok: true }>("/api/context/branch", {
            method: "POST",
            body: JSON.stringify({ branch_id: pickBranch.branch_id }),
        });
    }

    // 3) All good
    return { action: "go", href: nextHref };
}

export default function LoginClient() {
    const router = useRouter();
    const sp = useSearchParams();
    const next = useMemo(() => safeNext(sp.get("next")), [sp]);

    const [email, setEmail] = useState("owner@demo.com");
    const [password, setPassword] = useState("123456");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Already signed in -> ensure context then go
    useEffect(() => {
        let alive = true;

        (async () => {
            const { data } = await supabase.auth.getSession();
            if (!alive) return;

            if (!data.session) return;

            try {
                setLoading(true);
                const result = await ensureContext(next);

                if (!alive) return;

                router.replace(result.href);
                router.refresh();
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Auto context failed";
                setError(msg);
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [router, next]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;

        setError("");
        setLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setError(error.message);
                return;
            }

            // settle session
            await supabase.auth.getSession();
            await new Promise((r) => setTimeout(r, 0));

            // Day 1: auto context
            const result = await ensureContext(next);

            router.replace(result.href);
            router.refresh();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Login failed";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
            <div className="bg-[var(--surface)] shadow-xl rounded-2xl w-full max-w-sm p-8 border border-[var(--text-muted)]/10">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">☕ Coffee Admin</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">Sign in to manage your café</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            className="w-full rounded-lg border border-[var(--text-muted)]/30 px-3 py-2 bg-[var(--background)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none transition"
                            placeholder="owner@demo.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                            autoComplete="email"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                            Password
                        </label>
                        <input
                            type="password"
                            className="w-full rounded-lg border border-[var(--text-muted)]/30 px-3 py-2 bg-[var(--background)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none transition"
                            placeholder="123456"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-red-100/70 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 bg-[var(--accent)] text-white font-medium rounded-lg py-2 hover:bg-[var(--accent-dark)] transition disabled:opacity-60"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {error ? "Retrying..." : "Signing in..."}
                            </>
                        ) : (
                            "Sign In"
                        )}
                    </button>

                    <div className="text-xs text-[var(--text-secondary)] opacity-80">
                        Demo: owner@demo.com / 123456 • staff@demo.com / 123456
                    </div>
                </form>
            </div>
        </div>
    );
}
