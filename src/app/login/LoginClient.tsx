
// src/app/login/LoginClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

export default function LoginClient() {
    const router = useRouter();
    const sp = useSearchParams();

    const next = useMemo(() => {
        const raw = sp.get("next");
        return raw && raw.startsWith("/") ? raw : "/admin";
    }, [sp]);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        supabase.auth.getSession().then(({ data }) => {
            if (!alive) return;
            if (data.session) router.replace(next);
        });
        return () => {
            alive = false;
        };
    }, [router, next]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        router.replace(next);
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
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Email</label>
                        <input
                            type="email"
                            className="w-full rounded-lg border border-[var(--text-muted)]/30 px-3 py-2 bg-[var(--background)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none transition"
                            placeholder="owner@demo.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Password</label>
                        <input
                            type="password"
                            className="w-full rounded-lg border border-[var(--text-muted)]/30 px-3 py-2 bg-[var(--background)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none transition"
                            placeholder="123456"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
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
                                Signing in...
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
