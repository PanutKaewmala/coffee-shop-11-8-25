"use client";

import { useEffect, useState } from "react";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { Branch } from "@/lib/types";

export default function ContactInfo() {
    const [branch, setBranch] = useState<Branch | null>(null);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadBranches = async () => {
            try {
                // โหลด primary branch
                const res = await fetch("/api/branch/primary");
                const primary = await res.json();

                // โหลดสาขาทั้งหมด
                const allRes = await fetch("/api/branch?all=true");
                const all = await allRes.json();

                setBranches(all);
                setBranch(primary?.id ? primary : all[0] || null);
            } catch (err) {
                console.error("Failed to load branches →", err);
            } finally {
                setLoading(false);
            }
        };

        loadBranches();
    }, []);

    if (loading) return <p className="text-text-muted p-6">Loading branch info...</p>;
    if (!branch) return <p className="text-text-muted p-6">No branch information available.</p>;

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
                        <p className="text-sm text-text-secondary">{branch.address}</p>
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
