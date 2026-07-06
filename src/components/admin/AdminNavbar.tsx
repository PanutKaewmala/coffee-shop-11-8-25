// components/admin/AdminNavbar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "@/context/ThemeContext";
import { Menu, LogOut, Moon, Sun, Store, GitBranch } from "lucide-react";

export interface AdminNavbarProps {
    onToggleSidebar?: () => void;

    currentShopId?: string;
    currentBranchId?: string | null;

    currentShopName?: string | null;
    currentBranchName?: string | null;
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
): Promise<{ ok: boolean; error?: string }> {
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
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
    }
}

export default function AdminNavbar({
    onToggleSidebar,
    currentShopId,
    currentBranchId,
    currentShopName,
    currentBranchName,
}: AdminNavbarProps) {
    const router = useRouter();
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
        await supabase.auth.signOut();
        router.push("/login");
    };

    const shopLabel = useMemo(() => {
        if (currentShopName) return currentShopName;
        const found = currentShopId ? shops.find((s) => s.id === currentShopId) : null;
        if (found?.name) return found.name;
        if (currentShopId) return `ร้าน: ${currentShopId.slice(0, 8)}…`;
        return "ยังไม่ได้เลือกร้าน";
    }, [currentShopId, currentShopName, shops]);

    const branchLabel = useMemo(() => {
        if (currentBranchName) return currentBranchName;
        const found = currentBranchId ? branches.find((b) => b.id === currentBranchId) : null;
        if (found?.name) return found.name;
        if (currentBranchId) return `สาขา: ${currentBranchId.slice(0, 8)}…`;
        return "ยังไม่ได้เลือกสาขา";
    }, [currentBranchId, currentBranchName, branches]);

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
                setShops(Array.isArray(data.shops) ? data.shops : []);
                setBranches(Array.isArray(data.branches) ? data.branches : []);
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
    }, [currentShopId]);

    const onChangeShop = async (shopId: string) => {
        if (!shopId) return;
        setSwitching(true);
        setErr(null);

        const r1 = await postJSON("/api/context/shop", { shop_id: shopId });
        if (!r1.ok) {
            setErr(r1.error ?? "เปลี่ยนร้านไม่สำเร็จ");
            setSwitching(false);
            return;
        }

        // เปลี่ยน shop -> เคลียร์ branch
        await postJSON("/api/context/branch", { branch_id: null });

        setSwitching(false);
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
                        <select
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
                                    {`${s.name} (${s.id.slice(0, 8)})`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <GitBranch size={16} className="text-[var(--text-secondary)]" />
                        <select
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
                                    {`${b.name} (${b.id.slice(0, 8)})`}
                                </option>
                            ))}
                        </select>
                        {noBranchInCurrentShop ? (
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
                    <select
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
                                {`${s.name} (${s.id.slice(0, 8)})`}
                            </option>
                        ))}
                    </select>

                    <select
                        className="bg-[var(--background)] border border-[var(--text-muted)]/20 rounded-lg px-3 py-2 text-sm w-full min-w-0"
                        value={currentBranchId ?? ""}
                        disabled={loadingSwitchers || switching || !currentShopId}
                        onChange={(e) => onChangeBranch(e.target.value)}
                    >
                        <option value="" disabled>
                            {branches.length ? "เลือกสาขา…" : "ยังไม่มีสาขา"}
                        </option>
                        {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                                {`${b.name} (${b.id.slice(0, 8)})`}
                            </option>
                        ))}
                    </select>
                </div>

                {noBranchInCurrentShop ? (
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
