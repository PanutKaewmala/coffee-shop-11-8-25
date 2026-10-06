"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function FirstShopOnboardingClient({ email }: { email: string }) {
    const router = useRouter();
    const [shopName, setShopName] = useState("");
    const [branchName, setBranchName] = useState("");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (saving) return;

        setSaving(true);
        setError("");

        try {
            const response = await fetch("/api/onboarding/first-shop", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    shop_name: shopName,
                    branch_name: branchName,
                    address,
                    phone,
                }),
            });

            const data = await response.json().catch(() => ({})) as {
                error?: string;
                href?: string;
            };

            if (!response.ok) {
                throw new Error(data.error ?? "สร้างร้านไม่สำเร็จ");
            }

            router.replace(data.href ?? "/admin");
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "สร้างร้านไม่สำเร็จ");
        } finally {
            setSaving(false);
        }
    };

    return (
        <main className="min-h-screen bg-[var(--background)] px-4 py-10 text-[var(--text-primary)]">
            <div className="mx-auto max-w-xl">
                <div className="mb-6">
                    <div className="text-sm font-semibold text-[var(--accent)]">TALVO</div>
                    <h1 className="mt-2 text-3xl font-bold">ตั้งค่าร้านแรก</h1>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        ใส่ข้อมูลพื้นฐานของร้านก่อน เมนู สูตร และสต็อกค่อยเพิ่มทีหลังได้
                    </p>
                    {email ? (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">บัญชี: {email}</p>
                    ) : null}
                </div>

                <form
                    onSubmit={submit}
                    className="space-y-5 rounded-2xl border border-[var(--text-muted)]/20 bg-[var(--surface)] p-5 shadow-sm sm:p-6"
                >
                    <label className="block">
                        <span className="text-sm font-medium">ชื่อร้าน</span>
                        <input
                            value={shopName}
                            onChange={(event) => setShopName(event.target.value)}
                            placeholder="เช่น ชงกะชา"
                            autoComplete="organization"
                            required
                            disabled={saving}
                            className="mt-1.5 w-full rounded-xl border border-[var(--text-muted)]/25 bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--accent)] disabled:opacity-60"
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm font-medium">ชื่อสาขา</span>
                        <input
                            value={branchName}
                            onChange={(event) => setBranchName(event.target.value)}
                            placeholder="เช่น ธกส. ปาย"
                            required
                            disabled={saving}
                            className="mt-1.5 w-full rounded-xl border border-[var(--text-muted)]/25 bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--accent)] disabled:opacity-60"
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm font-medium">ที่อยู่ร้าน</span>
                        <textarea
                            value={address}
                            onChange={(event) => setAddress(event.target.value)}
                            placeholder="ใส่แบบสั้น ๆ ที่ใช้บอกลูกค้าได้"
                            rows={3}
                            required
                            disabled={saving}
                            className="mt-1.5 w-full rounded-xl border border-[var(--text-muted)]/25 bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--accent)] disabled:opacity-60"
                        />
                    </label>

                    <label className="block">
                        <span className="text-sm font-medium">เบอร์โทรร้าน <span className="font-normal text-[var(--text-muted)]">(ไม่บังคับ)</span></span>
                        <input
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            placeholder="0812345678"
                            autoComplete="tel"
                            disabled={saving}
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
                        disabled={saving}
                        className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {saving ? "กำลังสร้างร้าน..." : "สร้างร้านและเริ่มตั้งค่า"}
                    </button>
                </form>
            </div>
        </main>
    );
}
