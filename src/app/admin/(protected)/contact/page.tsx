"use client";

import { useEffect, useState } from "react";

import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import Modal from "@/components/admin/Modal";
import Pagination from "@/components/admin/Pagination";
import { Button } from "@/components/ui/button";

import ContactFilter from "@/components/admin/ContactFilter";
import SearchBox from "@/components/admin/search/SearchBox";
import useContactSearch from "@/hooks/useContactSearch";

import type { ContactCategory } from "@/lib/types";

// UI-facing contact shape (returned by useContactSearch) — keep minimal and permissive
type ContactUI = {
    id: string;
    name: string;
    email?: string | null;
    message?: string | null;
    category?: unknown;
    created_at?: string | null;
};

// badge style (ครอบคลุม enum ทั้งหมด + fallback)
const categoryColor: Record<string, string> = {
    praise: "bg-emerald-600 text-white",
    issue: "bg-amber-600 text-white",
    question: "bg-blue-600 text-white",
    other: "bg-gray-600 text-white",
    business: "bg-purple-600 text-white",
    complaint: "bg-red-600 text-white",
    feedback: "bg-green-600 text-white",
};

function safeCategory(c: { category?: unknown } /* permissive: accepts UI/DB shapes */): ContactCategory | "other" {
    // schema: category ไม่ null แต่กันไว้ให้ชัวร์
    return (c.category ?? "other") as ContactCategory | "other";
}

export default function ContactAdminPage() {
    const {
        loading,
        contacts, // filtered + paginated
        totalPages,
        page,
        setPage,
        inputPage,
        setInputPage,

        filter,
        setFilter,

        reloadList,
    } = useContactSearch({ rowsPerPage: 10 });

    const [canManageContacts, setCanManageContacts] = useState(false);
    const [permissionLoading, setPermissionLoading] = useState(true);

    useEffect(() => {
        let alive = true;

        async function loadPermission() {
            try {
                const res = await fetch("/api/receipt-settings", { cache: "no-store" });
                const data: unknown = await res.json().catch(() => null);

                if (!alive) return;
                if (!res.ok || !data || typeof data !== "object" || !("canEditShopSettings" in data)) {
                    setCanManageContacts(false);
                    return;
                }

                setCanManageContacts((data as Record<string, unknown>).canEditShopSettings === true);
            } catch {
                if (!alive) return;
                setCanManageContacts(false);
            } finally {
                if (alive) setPermissionLoading(false);
            }
        }

        void loadPermission();
        return () => {
            alive = false;
        };
    }, []);

    /* -------------------------
       Modal State
    ------------------------- */
    const [showModal, setShowModal] = useState(false);
    const [selectedContact, setSelectedContact] = useState<ContactUI | null>(null);

    const handleView = (c: ContactUI) => {
        setSelectedContact(c);
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("ลบข้อความนี้?")) return;

        try {
            const res = await fetch(`/api/contact?id=${id}`, { method: "DELETE" });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j?.error || "ลบข้อความไม่สำเร็จ");
                return;
            }
            await reloadList();
        } catch (err) {
            console.error(err);
            alert("ลบข้อความไม่สำเร็จ");
        }
    };

    const headers = ["ชื่อ", "อีเมล", "ข้อความ", "หมวดหมู่", "วันที่", "จัดการ"];

    return (
        <div className="p-6 space-y-6">
            <Card title="ข้อความจากลูกค้า">
                {!permissionLoading && !canManageContacts ? (
                    <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                        คุณมีสิทธิ์ดูข้อมูลเท่านั้น เจ้าของร้านเท่านั้นที่ลบข้อความได้
                    </div>
                ) : null}

                {/* SEARCH */}
                <SearchBox
                    value={filter.search}
                    setValue={(v) => setFilter({ ...filter, search: v })}
                    placeholder="ค้นหา ชื่อ / อีเมล / ข้อความ"
                />

                {/* FILTER BAR */}
                <ContactFilter filter={filter} setFilter={setFilter} />

                {/* TABLE */}
                {loading ? (
                    <p>กำลังโหลด...</p>
                ) : contacts.length === 0 ? (
                    <p className="text-gray-400">ยังไม่มีข้อความ</p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <Table
                                headers={headers}
                                data={contacts.map((c) => {
                                    const email = c.email ?? "-";
                                    const message = c.message ?? "-";
                                    const cat = safeCategory(c);

                                    return [
                                        c.name,
                                        email,
                                        message.length > 50 ? message.slice(0, 50) + "..." : message,

                                        <span
                                            key={c.id + "-cat"}
                                            className={`px-2 py-1 text-xs rounded-lg ${categoryColor[cat] ?? categoryColor.other
                                                }`}
                                        >
                                            {cat}
                                        </span>,

                                        c.created_at ? new Date(c.created_at).toLocaleString() : "-",

                                        <div key={c.id + "-act"} className="flex flex-wrap gap-2">
                                            <Button variant="outline" size="sm" onClick={() => handleView(c)}>
                                                ดู
                                            </Button>

                                            {canManageContacts && !permissionLoading ? (
                                                <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => handleDelete(c.id)}
                                                >
                                                ลบ
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-[var(--text-secondary)] self-center">
                                                    ดูอย่างเดียว
                                                </span>
                                            )}
                                        </div>,
                                    ];
                                })}
                            />
                        </div>

                        {/* PAGINATION */}
                        <Pagination
                            page={page}
                            setPage={setPage}
                            totalPages={totalPages}
                            inputPage={inputPage}
                            setInputPage={setInputPage}
                        />
                    </>
                )}
            </Card>

            {/* MODAL */}
            {showModal && selectedContact && (
                <Modal
                    isOpen={showModal}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedContact(null);
                    }}
                    title={`ข้อความจาก ${selectedContact.name}`}
                >
                    <div className="space-y-4 text-[var(--text-primary)]">
                        <div>
                            <p className="font-semibold">ชื่อ:</p>
                            <p className="opacity-80">{selectedContact.name}</p>
                        </div>

                        <div>
                            <p className="font-semibold">อีเมล:</p>
                            <p className="opacity-80">{selectedContact.email ?? "-"}</p>
                        </div>

                        <div>
                            <p className="font-semibold">หมวดหมู่:</p>
                            {(() => {
                                const cat = safeCategory(selectedContact);
                                return (
                                    <span
                                        className={`px-2 py-1 text-xs rounded-lg ${categoryColor[cat] ?? categoryColor.other
                                            }`}
                                    >
                                        {cat}
                                    </span>
                                );
                            })()}
                        </div>

                        <div>
                            <p className="font-semibold">ข้อความ:</p>
                            <p className="whitespace-pre-line opacity-80">
                                {selectedContact.message ?? "-"}
                            </p>
                        </div>

                        {selectedContact.created_at && (
                            <div>
                                <p className="font-semibold">ได้รับเมื่อ:</p>
                                <p className="opacity-80">
                                    {new Date(selectedContact.created_at).toLocaleString()}
                                </p>
                            </div>
                        )}

                        <div className="flex justify-end pt-4">
                            <Button variant="outline" onClick={() => setShowModal(false)}>
                                ปิด
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
