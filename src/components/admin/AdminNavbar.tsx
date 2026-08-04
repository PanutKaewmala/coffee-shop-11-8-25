// components/admin/AdminNavbar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { Menu, LogOut, Moon, Sun, Store, GitBranch } from "lucide-react";

export interface AdminNavbarProps {
    onToggleSidebar?: () => void;

    currentShopId?: string;
    currentBranchId?: string | null;
    currentShopRole?: string | null;

    currentShopName?: string | null;
    currentBranchName?: string | null;
    onContextLoaded?: (context: { shopName: string | null; branchName: string | null }) => void;
}

type ShopOption = { id: string; name: string };
type BranchOption = { id: string; name: string };
type NavbarResponse = {
    me?: { id: string; email: string | null } | null;
    shops?: ShopOption[];
    branches?: BranchOption[];
};

async function postJSON<T extends Record<string, unknown>>(
    url: string,
    body: T
): Promise<{ ok: boolean; error?: string; href?: string; context_ready?: boolean }> {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            return { ok: false, error: text || "เชื่อมต่อระบบไม่สำเร็จ" };
        }
        return await res.json();
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

export default function AdminNavbar({
    onToggleSidebar,
    currentShopId,
    currentBranchId,
    currentShopRole,
    currentShopName,
    currentBranchName,
    onContextLoaded,
}: AdminNavbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { toggleTheme } = useTheme();

    const [meLabel, setMeLabel] = useState<string>("");

    const [shops, setShops] = useState<ShopOption[]>([]);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [loadingSwitchers, setLoadingSwitchers] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const reloadAfterContextChange = () => {
        if (typeof window !== "undefined") {
            window.location.reload();
            return;
        }
        router.refresh();
    };

    const handleLogout = async () => {
        setSwitching(true);
        setErr(null);
        try {
            const response = await fetch("/api/auth/logout", { method: "POST" });
            const result = await response.json().catch(() => ({})) as { destination?: string; error?: string };
            if (!response.ok || !result.destination) {
                setErr(result.error ?? "ออกจากระบบไม่สำเร็จ");
                return;
            }
            router.replace(result.destination);
            router.refresh();
        } catch {
            setErr("ออกจากระบบไม่สำเร็จ");
        } finally {
            setSwitching(false);
        }
    };

    const shopLabel = useMemo(() => {
        if (currentShopName) return currentShopName;
        const found = currentShopId ? shops.find((s) => s.id === currentShopId) : null;
        if (found?.name) return found.name;
        if (currentShopId) return loadingSwitchers ? "กำลังโหลดชื่อร้าน…" : "ร้านปัจจุบัน";
        return "ยังไม่ได้เลือกร้าน";
    }, [currentShopId, currentShopName, loadingSwitchers, shops]);

    const branchLabel = useMemo(() => {
        if (currentBranchName) return currentBranchName;
        const found = currentBranchId ? branches.find((b) => b.id === currentBranchId) : null;
        if (found?.name) return found.name;
        if (currentBranchId) return loadingSwitchers ? "กำลังโหลดชื่อสาขา…" : "สาขาปัจจุบัน";
        return "ยังไม่ได้เลือกสาขา";
    }, [branches, currentBranchId, currentBranchName, loadingSwitchers]);

    const noBranchInCurrentShop = useMemo(() => {
        return Boolean(currentShopId) && !loadingSwitchers && branches.length === 0;
    }, [currentShopId, loadingSwitchers, branches.length]);

    useEffect(() => {
        let alive = true;

        async function load() {
            setLoadingSwitchers(true);
            setErr(null);

            try {
                const res = await fetch("/api/admin/navbar", { cache: "no-store" });
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(text || "โหลดข้อมูลแถบเมนูไม่สำเร็จ");
                }

                const data = (await res.json()) as NavbarResponse;
                if (!alive) return;

                const email = data.me?.email ?? null;
                setMeLabel(email ? email : "ผู้ดูแลร้าน");
                const nextShops = Array.isArray(data.shops) ? data.shops : [];
                const nextBranches = Array.isArray(data.branches) ? data.branches : [];
                setShops(nextShops);
                setBranches(nextBranches);
                onContextLoaded?.({
                    shopName: nextShops.find((shop) => shop.id === currentShopId)?.name ?? null,
                    branchName: nextBranches.find((branch) => branch.id === currentBranchId)?.name ?? null,
                });
            } catch (e) {
                if (!alive) return;
                const msg = e instanceof Error ? e.message : "โหลดข้อมูลแถบเมนูไม่สำเร็จ";
                setErr(msg);
                setShops([]);
                setBranches([]);
            } finally {
                if (!alive) return;
                setLoadingSwitchers(false);
            }
        }

        load();
        return () => {
            alive = false;
        };
    }, [currentShopId, currentBranchId, onContextLoaded]);

    const onChangeShop = async (shopId: string) => {
        if (!shopId) return;
        setSwitching(true);
        setErr(null);

        const query = searchParams.toString();
        const next = `${pathname}${query ? `?${query}` : ""}`;
        const r1 = await postJSON("/api/context/shop", { shop_id: shopId, next });
        if (!r1.ok) {
            setErr(r1.error ?? "เปลี่ยนร้านไม่สำเร็จ");
            setSwitching(false);
            return;
        }

        setSwitching(false);
        if (r1.href) {
            router.replace(r1.href);
            router.refresh();
            return;
        }
        reloadAfterContextChange();
    };

    const onChangeBranch = async (branchId: string) => {
        if (!branchId) return;
        setSwitching(true);
        setErr(null);

        const r = await postJSON("/api/context/branch", { branch_id: branchId });
        if (!r.ok) {
            setErr(r.error ?? "เปลี่ยนสาขาไม่สำเร็จ");
            setSwitching(false);
            return;
        }

        setSwitching(false);
        reloadAfterContextChange();
    };

    return (
        <header className="sticky top-0 z-50 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--text-muted)]/20 text-[var(--text-primary)] shadow-sm transition-colors duration-300">
            <div className="flex min-w-0 items-center justify-between px-4 py-3 md:px-6 gap-4">
                {/* Left */}
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        className="md:hidden p-2 rounded-lg hover:bg-[var(--accent)]/10 transition"
                        onClick={onToggleSidebar}
                        aria-label="เปิดเมนูด้านข้าง"
                    >
                        <Menu size={20} />
                    </button>

                    <div className="min-w-0">
                        <div className="font-semibold text-base md:text-lg tracking-wide select-none truncate">
                            ☕ แผงจัดการร้าน
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] truncate">
                            {shopLabel} • {branchLabel}
                        </div>
                    </div>
                </div>

                {/* Middle (desktop) */}
                <div className="hidden lg:flex items-center gap-3 min-w-[520px] justify-center">
                    <div className="flex items-center gap-2">
                        <Store size={16} className="text-[var(--text-secondary)]" />
                        {shops.length > 1 ? <select
                            className="bg-[var(--background)] border border-[var(--text-muted)]/20 rounded-lg px-3 py-2 text-sm min-w-[240px]"
                            value={currentShopId ?? ""}
                            disabled={loadingSwitchers || switching || shops.length === 0}
                            onChange={(e) => onChangeShop(e.target.value)}
                        >
                            <option value="" disabled>
                                เลือกร้าน…
                            </option>
                            {shops.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select> : <span className="max-w-60 truncate text-sm font-medium">{shopLabel}</span>}
                    </div>

                    <div className="flex items-center gap-2">
                        <GitBranch size={16} className="text-[var(--text-secondary)]" />
                        {branches.length > 1 ? <select
                            className="bg-[var(--background)] border border-[var(--text-muted)]/20 rounded-lg px-3 py-2 text-sm min-w-[240px]"
                            value={currentBranchId ?? ""}
                            disabled={loadingSwitchers || switching || !currentShopId}
                            onChange={(e) => onChangeBranch(e.target.value)}
                        >
                            <option value="" disabled>
                                {branches.length ? "เลือกสาขา…" : "ยังไม่มีสาขา"}
                            </option>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select> : branches.length === 1 ? <span className="max-w-60 truncate text-sm font-medium">{branchLabel}</span> : null}
                        {noBranchInCurrentShop && currentShopRole === "owner" ? (
                            <button
                                type="button"
                                onClick={() => router.push("/admin/branch")}
                                className="text-xs text-[var(--accent)] hover:underline"
                            >
                                เพิ่มสาขา
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* Right */}
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition-colors"
                        aria-label="สลับธีมสี"
                    >
                        <span className="inline-flex h-[18px] w-[18px] items-center justify-center">
                            <Sun size={18} className="hidden dark:block text-[var(--text-secondary)]" />
                            <Moon size={18} className="block dark:hidden text-[var(--text-secondary)]" />
                        </span>
                    </button>

                    <span className="text-[var(--text-secondary)] text-sm hidden sm:inline truncate max-w-[220px]">
                        สวัสดี, <strong>{meLabel || "ผู้ดูแลร้าน"}</strong>
                    </span>

                    <button
                        onClick={handleLogout}
                        disabled={switching}
                        className="flex items-center gap-2 bg-[var(--accent)] text-white px-3 py-1.5 rounded-lg hover:bg-[var(--accent-dark)] transition-colors shadow-sm"
                    >
                        <LogOut size={16} />
                        <span className="text-sm font-medium hidden sm:inline">ออกจากระบบ</span>
                    </button>
                </div>
            </div>

            {/* Mobile switchers */}
            <div className="lg:hidden px-4 pb-3 md:px-6">
                {err ? <div className="mb-2 text-xs text-red-500">{err}</div> : null}

                <div className="flex min-w-0 flex-col sm:flex-row gap-2">
                    {shops.length > 1 ? <select
                        className="bg-[var(--background)] border border-[var(--text-muted)]/20 rounded-lg px-3 py-2 text-sm w-full min-w-0"
                        value={currentShopId ?? ""}
                        disabled={loadingSwitchers || switching || shops.length === 0}
                        onChange={(e) => onChangeShop(e.target.value)}
                    >
                        <option value="" disabled>
                            เลือกร้าน…
                        </option>
                        {shops.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select> : <div className="min-w-0 truncate rounded-lg border border-[var(--text-muted)]/20 bg-[var(--background)] px-3 py-2 text-sm">{shopLabel}</div>}

                    {branches.length > 1 ? <select
                        className="block bg-[var(--background)] border border-[var(--text-muted)]/20 rounded-lg px-3 py-2 text-sm w-full min-w-0"
                        value={currentBranchId ?? ""}
                        disabled={loadingSwitchers || switching || !currentShopId}
                        onChange={(e) => onChangeBranch(e.target.value)}
                    >
                        <option value="" disabled>
                            {branches.length ? "เลือกสาขา…" : "ยังไม่มีสาขา"}
                        </option>
                        {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.name}
                            </option>
                        ))}
                    </select> : branches.length === 1 ? <div className="min-w-0 truncate rounded-lg border border-[var(--text-muted)]/20 bg-[var(--background)] px-3 py-2 text-sm">{branchLabel}</div> : null}
                </div>

                {noBranchInCurrentShop && currentShopRole === "owner" ? (
                    <button
                        type="button"
                        onClick={() => router.push("/admin/branch")}
                        className="mt-2 text-xs text-[var(--accent)] hover:underline"
                    >
                        ร้านนี้ยังไม่มีสาขา เพิ่มสาขา
                    </button>
                ) : null}
            </div>

            {err ? <div className="hidden lg:block px-6 pb-3 text-xs text-red-500">{err}</div> : null}
        </header>
    );
}
