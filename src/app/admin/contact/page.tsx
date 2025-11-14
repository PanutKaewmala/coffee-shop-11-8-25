"use client";

import { useState, useEffect } from "react";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/Table";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";
import { ContactMessage } from "@/lib/types";

export default function ContactAdminPage() {
    const [contacts, setContacts] = useState<ContactMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedContact, setSelectedContact] = useState<ContactMessage | null>(null);

    /* --------------------------
         Fetch Contacts
      ---------------------------*/
    const fetchContacts = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/contact");
            const json = await res.json();

            if (!Array.isArray(json)) {
                console.error("Unexpected response:", json);
                setContacts([]);
                return;
            }

            // ใช้ raw ตรง ๆ จาก DB
            setContacts(json as ContactMessage[]);
        } catch (err) {
            console.error("fetchContacts error →", err);
            setContacts([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContacts();
    }, []);

    /* --------------------------
         View Contact
      ---------------------------*/
    const handleView = (contact: ContactMessage) => {
        setSelectedContact(contact);
        setShowModal(true);
    };

    /* --------------------------
         Delete Contact
      ---------------------------*/
    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this contact?")) return;

        try {
            const res = await fetch(`/api/contact?id=${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Delete failed");
            await fetchContacts();
        } catch (err) {
            console.error("delete error →", err);
            alert("Failed to delete contact");
        }
    };

    const headers = ["Name", "Email", "Message", "Date", "Actions"];

    return (
        <div className="p-6 space-y-6">
            <Card title="Customer Contacts">
                {loading ? (
                    <p>Loading...</p>
                ) : contacts.length === 0 ? (
                    <p className="text-gray-400">No messages received yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <Table
                            headers={headers}
                            data={contacts.map((contact) => [
                                contact.name,
                                contact.email,
                                contact.message.length > 50
                                    ? contact.message.slice(0, 50) + "..."
                                    : contact.message,

                                contact.created_at
                                    ? new Date(contact.created_at).toLocaleString()
                                    : "-",

                                <div key={contact.id} className="flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleView(contact)}
                                    >
                                        View
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleDelete(contact.id)}
                                    >
                                        Delete
                                    </Button>
                                </div>,
                            ])}
                        />
                    </div>
                )}
            </Card>

            {/* View Modal */}
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
                            <p className="opacity-80">{selectedContact.email}</p>
                        </div>

                        <div>
                            <p className="font-semibold">Message:</p>
                            <p className="whitespace-pre-line opacity-80">
                                {selectedContact.message}
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
