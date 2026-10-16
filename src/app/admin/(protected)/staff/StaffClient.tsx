"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type StaffMember = {
    user_id: string;
    email: string | null;
    name: string | null;
    created_at: string;
};

function formatDate(value: string) {
    try {
        return new Intl.DateTimeFormat("th-TH", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "Asia/Bangkok",
        }).format(new Date(value));
    } catch {
        return value;
    }
}

export default function StaffPage() {
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const loadStaff = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/staff", { cache: "no-store" });
            const data = await response.json().catch(() => ({})) as { staff?: StaffMember[]; error?: string };
            if (!response.ok) throw new Error(data.error ?? "โหลดรายชื่อพนักงานไม่สำเร็จ");
            setStaff(data.staff ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "โหลดรายชื่อพนักงานไม่สำเร็จ");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadStaff();
    }, [loadStaff]);

    const addStaff = async (event: FormEvent) => {
        event.preventDefault();
        if (saving) return;

        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const response = await fetch("/api/staff", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });
            const data = await response.json().catch(() => ({})) as { staff?: StaffMember; error?: string };
            if (!response.ok || !data.staff) throw new Error(data.error ?? "เพิ่มพนักงานไม่สำเร็จ");

            setStaff((current) => [...current, data.staff!]);
            setName("");
            setEmail("");
            setPassword("");
            setSuccess(`เพิ่ม ${data.staff.name ?? data.staff.email ?? "พนักงาน"} แล้ว สามารถเข้าสู่ระบบและเริ่มขายได้เลย`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "เพิ่มพนักงานไม่สำเร็จ");
        } finally {
            setSaving(false);
        }
    };

    const removeStaff = async (member: StaffMember) => {
        const label = member.name ?? member.email ?? "พนักงานคนนี้";
        if (!window.confirm(`นำ ${label} ออกจากร้านใช่ไหม? หลังจากนี้บัญชีนี้จะเข้าใช้ร้านนี้ไม่ได้`)) return;

        setRemovingId(member.user_id);
        setError("");
        setSuccess("");
        try {
            const response = await fetch("/api/staff", {
                method: "DELETE",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ user_id: member.user_id }),
            });
            const data = await response.json().catch(() => ({})) as { error?: string };
            if (!response.ok) throw new Error(data.error ?? "นำพนักงานออกไม่สำเร็จ");
            setStaff((current) => current.filter((item) => item.user_id !== member.user_id));
            setSuccess(`นำ ${label} ออกจากร้านแล้ว`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "นำพนักงานออกไม่สำเร็จ");
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">พนักงาน</h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    เพิ่มบัญชีให้คนที่ทำงานหน้าร้าน พนักงานจะเข้าไปที่หน้าขายโดยอัตโนมัติ
                </p>
            </div>

            <div className="rounded-2xl border border-[var(--text-muted)]/20 bg-[var(--surface)] p-5">
                <h2 className="text-lg font-semibold">เพิ่มพนักงาน</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    ตั้งรหัสผ่านสำหรับพนักงานแล้วส่งให้เจ้าตัวโดยตรง ควรเก็บรหัสผ่านไว้เป็นความลับ
                </p>

                <form onSubmit={addStaff} className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                        <span className="font-medium">ชื่อพนักงาน</span>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="เช่น นิ้ง"
                            autoComplete="off"
                            className="w-full rounded-xl border border-[var(--text-muted)]/25 bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
                        />
                    </label>
                    <label className="space-y-1 text-sm">
                        <span className="font-medium">อีเมลสำหรับเข้าสู่ระบบ</span>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            autoComplete="off"
                            className="w-full rounded-xl border border-[var(--text-muted)]/25 bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--accent)]"
                        />
                    </label>
                    <label className="space-y-1 text-sm md:col-span-2">
                        <span className="font-medium">รหัสผ่านสำหรับเข้าสู่ระบบ</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="อย่างน้อย 8 ตัวอักษร"
                            autoComplete="new-password"
                            className="w-full rounded-xl border border-[var(--text-muted)]/25 bg-[var(--background)] px-3 py-2.5 outline-none focus:border-[var(--accent)] md:max-w-md"
                        />
                    </label>

                    <div className="md:col-span-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {saving ? "กำลังเพิ่ม..." : "เพิ่มพนักงาน"}
                        </button>
                    </div>
                </form>

                {error ? <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{error}</div> : null}
                {success ? <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{success}</div> : null}
            </div>

            <div className="rounded-2xl border border-[var(--text-muted)]/20 bg-[var(--surface)] p-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold">พนักงานที่เข้าใช้ร้านนี้ได้</h2>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            พนักงานจะเห็นงานหน้าร้านหลัก ๆ คือ ขายหน้าร้าน รายการขาย และนับเงินปลายวัน
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadStaff()}
                        disabled={loading}
                        className="shrink-0 rounded-lg border border-[var(--text-muted)]/25 px-3 py-2 text-sm hover:bg-[var(--accent)]/10 disabled:opacity-60"
                    >
                        {loading ? "กำลังโหลด..." : "อัปเดต"}
                    </button>
                </div>

                <div className="mt-4 divide-y divide-[var(--text-muted)]/15">
                    {!loading && staff.length === 0 ? (
                        <div className="py-8 text-center text-sm text-[var(--text-secondary)]">ยังไม่มีพนักงานในร้านนี้</div>
                    ) : null}

                    {staff.map((member) => (
                        <div key={member.user_id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="font-medium">{member.name ?? "พนักงาน"}</div>
                                <div className="truncate text-sm text-[var(--text-secondary)]">{member.email ?? "ไม่พบอีเมล"}</div>
                                <div className="mt-1 text-xs text-[var(--text-muted)]">เพิ่มเมื่อ {formatDate(member.created_at)}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => void removeStaff(member)}
                                disabled={removingId === member.user_id}
                                className="self-start rounded-lg border border-red-500/25 px-3 py-2 text-sm text-red-600 hover:bg-red-500/10 disabled:opacity-60 sm:self-auto"
                            >
                                {removingId === member.user_id ? "กำลังนำออก..." : "นำออกจากร้าน"}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
