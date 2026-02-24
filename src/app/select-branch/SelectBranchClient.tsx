"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Branch = {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    is_primary: boolean;
};

function safeNext(raw: string | undefined) {
    if (!raw) return "/admin";
    return raw.startsWith("/") ? raw : "/admin";
}

async function postJSON<T extends Record<string, unknown>>(
    url: string,
    body: T
): Promise<{ ok: boolean; error?: string }> {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            return { ok: false, error: text || `Request failed: ${res.status}` };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
}

export default function SelectBranchClient({
    branches,
    error,
    autoPick,
    next,
}: {
    branches: Branch[];
    error?: string;
    autoPick?: boolean;
    next?: string;
}) {
    const router = useRouter();

    const [q, setQ] = useState("");
    const [busy, setBusy] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(error ?? null);

    const nextHref = useMemo(() => safeNext(next), [next]);
    const hasBranches = branches.length > 0;
    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return branches;
        return branches.filter((b) => {
            const hay = `${b.name} ${b.address ?? ""}`.toLowerCase();
            return hay.includes(s);
        });
    }, [q, branches]);

    const picking = busy !== null;
    const autoPickedOnce = useRef(false);

    const pick = async (branchId: string) => {
        if (picking) return;

        setBusy(branchId);
        setErr(null);

        const r = await postJSON("/api/context/branch", { branch_id: branchId });

        if (!r.ok) {
            setErr(r.error ?? "Failed to select branch");
            setBusy(null);
            return;
        }

        router.replace(nextHref);
        router.refresh();
    };

    useEffect(() => {
        if (!autoPick) return;
        if (autoPickedOnce.current) return;
        if (err) return;
        if (!hasBranches) return;

        autoPickedOnce.current = true;

        const primary = branches.find((b) => b.is_primary);
        if (primary) {
            void pick(primary.id);
            return;
        }

        if (branches.length === 1) {
            void pick(branches[0]!.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoPick, branches, err, hasBranches]);

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex items-center justify-center p-6">
            <div className="w-full max-w-xl">
                <div className="bg-[var(--surface)] border border-[var(--text-muted)]/20 rounded-2xl shadow-sm p-6">
                    <div className="text-xl font-semibold">Select your branch</div>
                    <div className="text-sm text-[var(--text-secondary)] mt-1">
                        เลือกสาขาที่กำลังทำงานอยู่
                    </div>

                    {err ? (
                        <div className="mt-4 text-sm text-red-500 whitespace-pre-wrap">{err}</div>
                    ) : null}

                    {hasBranches ? (
                        <>
                            <div className="mt-5">
                                <input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Search branch..."
                                    className="w-full bg-[var(--background)] border border-[var(--text-muted)]/20 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                                    disabled={picking}
                                />
                            </div>

                            <div className="mt-4 space-y-2">
                                {filtered.length === 0 ? (
                                    <div className="text-sm text-[var(--text-secondary)] py-6 text-center">
                                        No branches found
                                    </div>
                                ) : (
                                    filtered.map((b) => (
                                        <button
                                            key={b.id}
                                            onClick={() => pick(b.id)}
                                            disabled={picking}
                                            className={`
                    w-full text-left rounded-xl border border-[var(--text-muted)]/20
                    bg-[var(--background)] hover:bg-[var(--accent)]/10 transition
                    px-4 py-3
                    ${busy === b.id ? "opacity-70" : ""}
                  `}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="font-semibold truncate">
                                                        {b.name}
                                                        {b.is_primary ? (
                                                            <span className="ml-2 text-xs text-[var(--accent)] align-middle">
                                                                • Primary
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <div className="text-xs text-[var(--text-muted)] truncate">
                                                        {b.address ?? b.id}
                                                    </div>
                                                </div>
                                                <div className="text-sm text-[var(--text-secondary)]">
                                                    {busy === b.id ? "Selecting..." : "Enter ->"}
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="mt-5 rounded-xl border border-[var(--text-muted)]/20 bg-[var(--background)] p-4">
                            <div className="text-sm font-medium">ยังไม่มีสาขาในร้านนี้</div>
                            <div className="mt-1 text-sm text-[var(--text-secondary)]">
                                ให้สร้างสาขาแรกก่อน แล้วค่อยกลับมาเลือกสาขา
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => router.push("/admin/branch")}
                                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-white hover:opacity-90"
                                >
                                    ไปหน้าจัดการสาขา
                                </button>
                                <button
                                    type="button"
                                    onClick={() => router.push("/admin")}
                                    className="rounded-lg border border-[var(--text-muted)]/25 px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--background)]"
                                >
                                    ไปหน้าแอดมิน
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="mt-6 text-xs text-[var(--text-muted)]">
                        ถ้ามีสาขาเดียวหรือมี Primary ระบบจะเลือกให้อัตโนมัติ
                    </div>
                </div>
            </div>
        </div>
    );
}
