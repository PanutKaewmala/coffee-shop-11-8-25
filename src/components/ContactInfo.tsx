"use client";

import { useEffect, useState } from "react";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { Branch } from "@/lib/types";
import { withPublicShopId } from "@/lib/publicShop";
import { fetchJsonWithTimeout } from "@/lib/publicFetch";

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function pickBranchFromResponse(v: unknown): Branch | null {
    if (!v) return null;
    if (isRecord(v) && "data" in v) {
        const data = (v as { data?: unknown }).data;
        return (data && isRecord(data)) ? (data as Branch) : null;
    }
    return isRecord(v) ? (v as Branch) : null;
}

export default function ContactInfo({ shopId }: { shopId?: string | null }) {
    const [branch, setBranch] = useState<Branch | null>(null);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;

        const loadBranches = async () => {
            try {
                setLoading(true);
                setLoadError(null);

                const [primaryRaw, allRaw] = await Promise.all([
                    fetchJsonWithTimeout(withPublicShopId("/api/branch/primary", shopId), {
                        cache: "no-store",
                    }),
                    fetchJsonWithTimeout(withPublicShopId("/api/branch?all=true", shopId), {
                        cache: "no-store",
                    }),
                ]);

                if (!alive) return;
                const all = Array.isArray(allRaw) ? (allRaw as Branch[]) : [];
                setBranches(all);
                const primary = pickBranchFromResponse(primaryRaw);
                setBranch(primary?.id ? primary : all[0] || null);
            } catch (err) {
                console.error("Failed to load branches →", err);
                if (!alive) return;
                setLoadError("โหลดข้อมูลสาขาไม่สำเร็จ กรุณาลองเปิดหน้านี้ใหม่อีกครั้ง");
                setBranches([]);
                setBranch(null);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        };

        loadBranches();

        return () => {
            alive = false;
        };
    }, [shopId]);

    if (loading) return <p className="text-text-muted p-6">กำลังโหลดข้อมูลสาขา...</p>;
    if (loadError) return <p className="text-text-muted p-6">{loadError}</p>;
    if (!branch) return <p className="text-text-muted p-6">ยังไม่มีข้อมูลสาขาให้แสดงในตอนนี้</p>;

    return (
        <div className="space-y-10">
            {/* ===============================
                PRIMARY / SELECTED BRANCH
            ================================ */}
            <div
                className="space-y-6 p-6 rounded-2xl shadow-sm transition-all"
                style={{
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text-primary)",
                }}
            >
                <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 mt-1" style={{ color: "var(--color-accent)" }} />
                    <div>
                        <h3 className="font-semibold text-lg">{branch.name}</h3>
                        <p className="text-sm text-text-secondary">{branch.address || "ยังไม่มีข้อมูลที่อยู่"}</p>
                    </div>
                </div>

                {branch.phone && (
                    <div className="flex items-start gap-3">
                        <Phone className="w-5 h-5 mt-1" style={{ color: "var(--color-accent)" }} />
                        <div>
                            <h3 className="font-semibold">Phone</h3>
                            <p className="text-sm text-text-secondary">{branch.phone}</p>
                        </div>
                    </div>
                )}

                {branch.opening_hours && (
                    <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 mt-1" style={{ color: "var(--color-accent)" }} />
                        <div>
                            <h3 className="font-semibold">Opening Hours</h3>
                            <p className="text-sm text-text-secondary">{branch.opening_hours}</p>
                        </div>
                    </div>
                )}

                <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 mt-1" style={{ color: "var(--color-accent)" }} />
                    <div>
                        <h3 className="font-semibold">Email</h3>
                        <p className="text-sm text-text-secondary">info@coffeeshop.com</p>
                    </div>
                </div>

                {/* Map */}
                <div className="rounded-xl overflow-hidden border border-text-muted/40">
                    {branch.map_url ? (
                        <iframe
                            src={branch.map_url}
                            className="w-full aspect-video border-0"
                            loading="lazy"
                        ></iframe>
                    ) : (
                        <div
                            className="aspect-video flex items-center justify-center text-sm"
                            style={{ color: "var(--color-text-muted)" }}
                        >
                            🗺️ No map available
                        </div>
                    )}
                </div>
            </div>

            {/* ===============================
                OTHER BRANCHES LIST
            ================================ */}
            {branches.length > 1 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Other Branches</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {branches
                            .filter((b) => b.id !== branch.id)
                            .map((b) => (
                                <div
                                    key={b.id}
                                    className="p-4 rounded-xl transition cursor-pointer border hover:border-accent hover:bg-accent/10"
                                    style={{
                                        borderColor: "var(--color-border)",
                                    }}
                                    onClick={() => setBranch(b)}
                                >
                                    <h4 className="font-semibold">{b.name}</h4>
                                    <p className="text-sm text-text-secondary">{b.address}</p>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
}
