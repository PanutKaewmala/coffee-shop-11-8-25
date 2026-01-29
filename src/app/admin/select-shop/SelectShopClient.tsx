"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Shop = { id: string; name: string };

function safeNext(raw: string | null) {
    if (!raw) return "/admin";
    return raw.startsWith("/") ? raw : "/admin";
}

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

async function setShop(shopId: string) {
    await jsonFetch<{ ok: true }>("/api/context/shop", {
        method: "POST",
        body: JSON.stringify({ shop_id: shopId }),
    });
}

/**
 * After shop selected:
 * - try auto pick branch (primary / single)
 * - if single -> set branch and go next
 * - else -> go select-branch
 */
async function resolveBranchOrGo(nextHref: string): Promise<string> {
    // do we already have branch?
    const ctx = await jsonFetch<{ branch_id: string | null }>("/api/context/branch");
    if (ctx.branch_id) return nextHref;

    const pick = await jsonFetch<
        | { mode: "single"; branch_id: string }
        | { mode: "multiple" }
        | { mode: "none" }
    >("/api/context/branch?mode=pick");

    if (pick.mode === "single") {
        await jsonFetch<{ ok: true }>("/api/context/branch", {
            method: "POST",
            body: JSON.stringify({ branch_id: pick.branch_id }),
        });
        return nextHref;
    }

    // must choose
    return `/select-branch?next=${encodeURIComponent(nextHref)}`;
}

export default function SelectShopClient({
    shops,
    error,
    autoPickSingle,
}: {
    shops: Shop[];
    error?: string;
    autoPickSingle?: boolean;
}) {
    const router = useRouter();
    const sp = useSearchParams();
    const next = useMemo(() => safeNext(sp.get("next")), [sp]);

    const [q, setQ] = useState("");
    const [busy, setBusy] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(error ?? null);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return shops;
        return shops.filter((x) => x.name.toLowerCase().includes(s));
    }, [q, shops]);

    const pick = async (shopId: string) => {
        setBusy(shopId);
        setErr(null);

        try {
            await setShop(shopId);

            // after setting shop, branch cookie was cleared -> resolve branch next
            const href = await resolveBranchOrGo(next);

            router.replace(href);
            router.refresh();
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to select shop";
            setErr(msg);
            setBusy(null);
        }
    };

    useEffect(() => {
        if (autoPickSingle && shops.length === 1) {
            void pick(shops[0]!.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoPickSingle, shops.length]);

    return (
        <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex items-center justify-center p-6">
            <div className="w-full max-w-xl">
                <div className="bg-[var(--surface)] border border-[var(--text-muted)]/20 rounded-2xl shadow-sm p-6">
                    <div className="text-xl font-semibold">Select your shop</div>
                    <div className="text-sm text-[var(--text-secondary)] mt-1">
                        เลือกร้านก่อน แล้วระบบจะพาไปเลือกสาขาแบบอัตโนมัติ
                    </div>

                    {err ? (
                        <div className="mt-4 text-sm text-red-500 whitespace-pre-wrap">{err}</div>
                    ) : null}

                    <div className="mt-5">
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search shop…"
                            className="w-full bg-[var(--background)] border border-[var(--text-muted)]/20 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                            disabled={busy !== null}
                        />
                    </div>

                    <div className="mt-4 space-y-2">
                        {filtered.length === 0 ? (
                            <div className="text-sm text-[var(--text-secondary)] py-6 text-center">
                                No shops found
                            </div>
                        ) : (
                            filtered.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => pick(s.id)}
                                    disabled={busy !== null}
                                    className={`
                    w-full text-left rounded-xl border border-[var(--text-muted)]/20
                    bg-[var(--background)] hover:bg-[var(--accent)]/10 transition
                    px-4 py-3
                    ${busy === s.id ? "opacity-70" : ""}
                  `}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-semibold truncate">{s.name}</div>
                                            <div className="text-xs text-[var(--text-muted)] truncate">{s.id}</div>
                                        </div>
                                        <div className="text-sm text-[var(--text-secondary)]">
                                            {busy === s.id ? "Selecting…" : "Enter →"}
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    <div className="mt-6 text-xs text-[var(--text-muted)]">
                        ระบบจะ auto เลือกสาขาให้ถ้ามีแค่สาขาเดียว/มี primary
                    </div>
                </div>
            </div>
        </div>
    );
}
