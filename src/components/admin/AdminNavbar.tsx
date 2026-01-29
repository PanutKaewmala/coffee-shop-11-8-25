// components/admin/AdminNavbar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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

export default function AdminNavbar({
    onToggleSidebar,
    currentShopId,
    currentBranchId,
    currentShopName,
    currentBranchName,
}: AdminNavbarProps) {
    const router = useRouter();

    const [isDark, setIsDark] = useState(() => {
        if (typeof document !== "undefined") {
            return document.documentElement.classList.contains("dark");
        }
        return false;
    });

    const [meLabel, setMeLabel] = useState<string>("");

    const [shops, setShops] = useState<ShopOption[]>([]);
    const [branches, setBranches] = useState<BranchOption[]>([]);
    const [loadingSwitchers, setLoadingSwitchers] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const toggleTheme = () => {
        const root = document.documentElement;
        if (root.classList.contains("dark")) {
            root.classList.remove("dark");
            setIsDark(false);
        } else {
            root.classList.add("dark");
            setIsDark(true);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/login");
    };

    const shopLabel = useMemo(() => {
        if (currentShopName) return currentShopName;
        if (currentShopId) return `Shop: ${currentShopId.slice(0, 8)}…`;
        return "No shop";
    }, [currentShopId, currentShopName]);

    const branchLabel = useMemo(() => {
        if (currentBranchName) return currentBranchName;
        if (currentBranchId) return `Branch: ${currentBranchId.slice(0, 8)}…`;
        return "Branch: -";
    }, [currentBranchId, currentBranchName]);

    useEffect(() => {
        let alive = true;

        async function load() {
            setLoadingSwitchers(true);
            setErr(null);

            // 1) who am I
            const { data: u, error: uErr } = await supabase.auth.getUser();
            if (!alive) return;

            if (uErr) {
                setErr(uErr.message);
                setLoadingSwitchers(false);
                return;
            }

            const userId = u.user?.id ?? "";
            const email = u.user?.email ?? "";
            setMeLabel(email ? email : "Admin");

            if (!userId) {
                setErr("No user session");
                setLoadingSwitchers(false);
                return;
            }

            // 2) my shops (filter by user_id ✅)
            const { data: sm, error: smErr } = await supabase
                .from("shop_members")
                .select("shop_id, shops(id,name), created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: true });

            if (!alive) return;

            if (smErr) {
                setErr(smErr.message);
                setLoadingSwitchers(false);
                return;
            }

            const shopOptions: ShopOption[] = (sm ?? [])
                .map((row) => {
                    const shopsObj = (row as { shops: { id: string; name: string } | null }).shops;
                    if (!shopsObj?.id) return null;
                    return { id: shopsObj.id, name: shopsObj.name ?? shopsObj.id };
                })
                .filter((x): x is ShopOption => x !== null);

            setShops(shopOptions);

            // 3) branches in current shop
            if (currentShopId) {
                const { data: br, error: brErr } = await supabase
                    .from("branch")
                    .select("id,name,is_primary")
                    .eq("shop_id", currentShopId)
                    .order("is_primary", { ascending: false })
                    .order("name", { ascending: true });

                if (brErr) {
                    setErr(brErr.message);
                    setBranches([]);
                    setLoadingSwitchers(false);
                    return;
                }

                setBranches((br ?? []).map((b) => ({ id: b.id, name: b.name })));
            } else {
                setBranches([]);
            }

            setLoadingSwitchers(false);
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
            setErr(r1.error ?? "Failed to switch shop");
            setSwitching(false);
            return;
        }

        // เปลี่ยน shop -> เคลียร์ branch
        await postJSON("/api/context/branch", { branch_id: null });

        router.refresh();
        setSwitching(false);
    };

    const onChangeBranch = async (branchId: string) => {
        if (!branchId) return;
        setSwitching(true);
        setErr(null);

        const r = await postJSON("/api/context/branch", { branch_id: branchId });
        if (!r.ok) {
            setErr(r.error ?? "Failed to switch branch");
            setSwitching(false);
            return;
        }

        router.refresh();
        setSwitching(false);
    };

    return (
        <header className="sticky top-0 z-50 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--text-muted)]/20 text-[var(--text-primary)] shadow-sm transition-colors duration-300">
            <div className="flex items-center justify-between px-4 py-3 md:px-6 gap-4">
                {/* Left */}
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        className="md:hidden p-2 rounded-lg hover:bg-[var(--accent)]/10 transition"
                        onClick={onToggleSidebar}
                        aria-label="Toggle sidebar"
                    >
                        <Menu size={20} />
                    </button>

                    <div className="min-w-0">
                        <div className="font-semibold text-lg tracking-wide select-none truncate">
                            ☕ Admin Dashboard
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
                            disabled={loadingSwitchers || switching || shops.length <= 1}
                            onChange={(e) => onChangeShop(e.target.value)}
                        >
                            <option value="" disabled>
                                Select shop…
                            </option>
                            {shops.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <GitBranch size={16} className="text-[var(--text-secondary)]" />
                        <select
                            className="bg-[var(--background)] border border-[var(--text-muted)]/20 rounded-lg px-3 py-2 text-sm min-w-[240px]"
                            value={currentBranchId ?? ""}
                            disabled={loadingSwitchers || switching || !currentShopId || branches.length === 0}
                            onChange={(e) => onChangeBranch(e.target.value)}
                        >
                            <option value="" disabled>
                                {branches.length ? "Select branch…" : "No branches"}
                            </option>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Right */}
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition-colors"
                        aria-label="Toggle theme"
                    >
                        {isDark ? (
                            <Sun size={18} className="text-[var(--text-secondary)]" />
                        ) : (
                            <Moon size={18} className="text-[var(--text-secondary)]" />
                        )}
                    </button>

                    <span className="text-[var(--text-secondary)] text-sm hidden sm:inline truncate max-w-[220px]">
                        Welcome, <strong>{meLabel || "Admin"}</strong>
                    </span>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 bg-[var(--accent)] text-white px-3 py-1.5 rounded-lg hover:bg-[var(--accent-dark)] transition-colors shadow-sm"
                    >
                        <LogOut size={16} />
                        <span className="text-sm font-medium">Logout</span>
                    </button>
                </div>
            </div>

            {/* Mobile switchers */}
            <div className="lg:hidden px-4 pb-3 md:px-6">
                {err ? <div className="mb-2 text-xs text-red-500">{err}</div> : null}

                <div className="flex flex-col sm:flex-row gap-2">
                    <select
                        className="bg-[var(--background)] border border-[var(--text-muted)]/20 rounded-lg px-3 py-2 text-sm w-full"
                        value={currentShopId ?? ""}
                        disabled={loadingSwitchers || switching || shops.length <= 1}
                        onChange={(e) => onChangeShop(e.target.value)}
                    >
                        <option value="" disabled>
                            Select shop…
                        </option>
                        {shops.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>

                    <select
                        className="bg-[var(--background)] border border-[var(--text-muted)]/20 rounded-lg px-3 py-2 text-sm w-full"
                        value={currentBranchId ?? ""}
                        disabled={loadingSwitchers || switching || !currentShopId || branches.length === 0}
                        onChange={(e) => onChangeBranch(e.target.value)}
                    >
                        <option value="" disabled>
                            {branches.length ? "Select branch…" : "No branches"}
                        </option>
                        {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                                {b.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {err ? <div className="hidden lg:block px-6 pb-3 text-xs text-red-500">{err}</div> : null}
        </header>
    );
}
