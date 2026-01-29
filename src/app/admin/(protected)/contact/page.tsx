"use client";

import { useState } from "react";

import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import Modal from "@/components/admin/Modal";
import Pagination from "@/components/admin/Pagination";
import { Button } from "@/components/ui/button";

import ContactFilter from "@/components/admin/ContactFilter";
import SearchBox from "@/components/admin/search/SearchBox";
import useContactSearch from "@/hooks/useContactSearch";

import type { ContactRow, ContactCategory } from "@/lib/types";

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

function safeCategory(c: ContactRow): ContactCategory | "other" {
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

    /* -------------------------
       Modal State
    ------------------------- */
    const [showModal, setShowModal] = useState(false);
    const [selectedContact, setSelectedContact] = useState<ContactRow | null>(null);

    const handleView = (c: ContactRow) => {
        setSelectedContact(c);
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this message?")) return;

        try {
            const res = await fetch(`/api/contact?id=${id}`, { method: "DELETE" });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j?.error || "Delete failed");
                return;
            }
            await reloadList();
        } catch (err) {
            console.error(err);
            alert("Failed to delete contact");
        }
    };

    const headers = ["Name", "Email", "Message", "Category", "Date", "Actions"];

    return (
        <div className="p-6 space-y-6">
            <Card title="Customer Contacts">
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
                    <p>Loading...</p>
                ) : contacts.length === 0 ? (
                    <p className="text-gray-400">No messages found.</p>
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
                                                View
                                            </Button>

                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => handleDelete(c.id)}
                                            >
                                                Delete
                                            </Button>
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
                    title={`Message from ${selectedContact.name}`}
                >
                    <div className="space-y-4 text-[var(--text-primary)]">
                        <div>
                            <p className="font-semibold">Name:</p>
                            <p className="opacity-80">{selectedContact.name}</p>
                        </div>

                        <div>
                            <p className="font-semibold">Email:</p>
                            <p className="opacity-80">{selectedContact.email ?? "-"}</p>
                        </div>

                        <div>
                            <p className="font-semibold">Category:</p>
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
                            <p className="font-semibold">Message:</p>
                            <p className="whitespace-pre-line opacity-80">
                                {selectedContact.message ?? "-"}
                            </p>
                        </div>

                        {selectedContact.created_at && (
                            <div>
                                <p className="font-semibold">Received:</p>
                                <p className="opacity-80">
                                    {new Date(selectedContact.created_at).toLocaleString()}
                                </p>
                            </div>
                        )}

                        <div className="flex justify-end pt-4">
                            <Button variant="outline" onClick={() => setShowModal(false)}>
                                Close
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
