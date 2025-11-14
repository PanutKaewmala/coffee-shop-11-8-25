"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

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

        router.push("/admin");
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
            <div className="bg-[var(--surface)] shadow-xl rounded-2xl w-full max-w-sm p-8 border border-[var(--text-muted)]/10">
                {/* Header */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">☕ Coffee Admin</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Sign in to manage your café
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            className="w-full rounded-lg border border-[var(--text-muted)]/30 px-3 py-2 bg-[var(--background)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none transition"
                            placeholder="Your@examp.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
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
                            placeholder="Your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading}
                            required
                        />
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="bg-red-100/70 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2">
                            {error}
                        </div>
                    )}

                    {/* Submit */}
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
                </form>
            </div>
        </div>
    );
}
