"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignupClient() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (loading) return;

        setError("");

        if (password.length < 8) {
            setError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
            return;
        }

        if (password !== confirmPassword) {
            setError("รหัสผ่านสองช่องไม่ตรงกัน");
            return;
        }

        setLoading(true);

        try {
            const { data, error: signupError } = await supabase.auth.signUp({
                email: email.trim().toLowerCase(),
                password,
            });

            if (signupError) {
                setError(signupError.message);
                return;
            }

            if (data.session) {
                router.replace("/onboarding");
                router.refresh();
                return;
            }

            setSent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "สมัครบัญชีไม่สำเร็จ");
        } finally {
            setLoading(false);
        }
    };

    if (sent) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10 text-[var(--text-primary)]">
                <section className="w-full max-w-md rounded-2xl border border-[var(--text-muted)]/20 bg-[var(--surface)] p-6 text-center shadow-sm sm:p-8">
                    <div className="text-sm font-semibold text-[var(--accent)]">TALVO</div>
                    <h1 className="mt-2 text-2xl font-bold">เช็กอีเมลเพื่อยืนยันบัญชี</h1>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                        เราส่งลิงก์ยืนยันไปที่ <span className="font-medium text-[var(--text-primary)]">{email}</span> แล้ว
                        หลังยืนยันเรียบร้อย กลับมาเข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งไว้
                    </p>
                    <Link
                        href="/login?next=/onboarding"
                        className="mt-6 inline-flex rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-dark)]"
                    >
                        กลับไปหน้าเข้าสู่ระบบ
                    </Link>
                </section>
            </main>
        );
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10 text-[var(--text-primary)]">
            <section className="w-full max-w-md rounded-2xl border border-[var(--text-muted)]/20 bg-[var(--surface)] p-6 shadow-sm sm:p-8">
                <div className="text-center">
                    <div className="text-sm font-semibold text-[var(--accent)]">TALVO</div>
                    <h1 className="mt-2 text-2xl font-bold">สร้างบัญชีเจ้าของร้าน</h1>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        สมัครบัญชีก่อน แล้วค่อยตั้งค่าร้านและสาขาแรก
                    </p>
                </div>

                <form onSubmit={submit} className="mt-6 space-y-4">
                    <label className="block">
                        <span className="text-sm font-medium">อีเมล</span>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            required
                            disabled={loading}
                            className="mt-1.5 w-full rounded-xl border border-[var(--text-muted)]/25 bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--accent)] disabled:opacity-60"
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm font-medium">รหัสผ่าน</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                            placeholder="อย่างน้อย 8 ตัวอักษร"
                            required
                            disabled={loading}
                            className="mt-1.5 w-full rounded-xl border border-[var(--text-muted)]/25 bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--accent)] disabled:opacity-60"
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm font-medium">ยืนยันรหัสผ่าน</span>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            required
                            disabled={loading}
                            className="mt-1.5 w-full rounded-xl border border-[var(--text-muted)]/25 bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--accent)] disabled:opacity-60"
                        />
                    </label>

                    {error ? (
                        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-300">
                            {error}
                        </div>
                    ) : null}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {loading ? "กำลังสมัคร..." : "สมัครบัญชี"}
                    </button>
                </form>

                <p className="mt-5 text-center text-sm text-[var(--text-secondary)]">
                    มีบัญชีแล้ว?{" "}
                    <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
                        เข้าสู่ระบบ
                    </Link>
                </p>
            </section>
        </main>
    );
}
