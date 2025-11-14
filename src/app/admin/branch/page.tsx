"use client";

import { useState, useEffect } from "react";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/Table";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";
import { Branch } from "@/lib/types";

export default function BranchPage() {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        address: "",
        phone: "",
        mapLink: "",
        openingHours: "",
    });

    /* --------------------------------
       Fetch all branches (Admin)
    -------------------------------- */
    const fetchBranches = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/branch?all=true");
            const data = await res.json();
            setBranches(data);
        } catch (err) {
            console.error("fetchBranches error →", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBranches();
    }, []);

    /* --------------------------------
       Set Primary Branch
    -------------------------------- */
    const handleSetPrimary = async (id: string) => {
        try {
            await fetch(`/api/branch/primary?id=${id}`, {
                method: "PUT",
            });

            fetchBranches();
        } catch (err) {
            console.error("setPrimary error →", err);
            alert("Failed to set primary branch");
        }
    };

    /* --------------------------------
       Save (create or update)
    -------------------------------- */
    const handleSave = async () => {
        try {
            const body = {
                name: formData.name,
                address: formData.address,
                phone: formData.phone,
                mapLink: formData.mapLink || null,
                openingHours: formData.openingHours || null,
            };

            if (editingBranch) {
                await fetch("/api/branch", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...body, id: editingBranch.id }),
                });
            } else {
                await fetch("/api/branch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
            }

            setShowModal(false);
            setEditingBranch(null);
            setFormData({
                name: "",
                address: "",
                phone: "",
                mapLink: "",
                openingHours: "",
            });

            fetchBranches();
        } catch (err) {
            console.error("Save branch error →", err);
            alert("Error saving branch");
        }
    };

    /* --------------------------------
       Edit Branch
    -------------------------------- */
    const handleEdit = (branch: Branch) => {
        setEditingBranch(branch);
        setFormData({
            name: branch.name,
            address: branch.address,
            phone: branch.phone || "",
            mapLink: branch.map_url || "",
            openingHours: branch.opening_hours || "",
        });
        setShowModal(true);
    };

    /* --------------------------------
       Delete Branch
    -------------------------------- */
    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this branch?")) return;

        await fetch(`/api/branch?id=${id}`, { method: "DELETE" });
        fetchBranches();
    };

    const headers = ["Branch Name", "Address", "Phone", "Primary?", "Actions"];

    return (
        <div className="p-6 space-y-6">
            <Card title="Branch Management">
                <div className="flex justify-end mb-4">
                    <Button
                        onClick={() => {
                            setEditingBranch(null);
                            setFormData({
                                name: "",
                                address: "",
                                phone: "",
                                mapLink: "",
                                openingHours: "",
                            });
                            setShowModal(true);
                        }}
                    >
                        + Add Branch
                    </Button>
                </div>

                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <Table
                            headers={headers}
                            data={branches.map((branch) => [
                                // Name
                                <span key="name" className="font-medium">
                                    {branch.name}
                                </span>,

                                // Address
                                branch.address,

                                // Phone
                                branch.phone || "-",

                                // Primary Display
                                branch.is_primary ? (
                                    <span
                                        key="primary"
                                        className="px-2 py-1 text-xs bg-green-600 text-white rounded"
                                    >
                                        Primary
                                    </span>
                                ) : (
                                    "-"
                                ),

                                // Actions
                                <div key="actions" className="flex gap-2">
                                    {!branch.is_primary && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleSetPrimary(branch.id)}
                                        >
                                            Set Primary
                                        </Button>
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleEdit(branch)}
                                    >
                                        Edit
                                    </Button>

                                    {!branch.is_primary && (
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => handleDelete(branch.id)}
                                        >
                                            Delete
                                        </Button>
                                    )}
                                </div>,
                            ])}
                        />
                    </div>
                )}
            </Card>

            {/* Modal */}
            {showModal && (
                <Modal
                    isOpen={showModal}
                    onClose={() => {
                        setShowModal(false);
                        setEditingBranch(null);
                    }}
                    title={editingBranch ? "Edit Branch" : "Add Branch"}
                >
                    <div className="space-y-4 max-w-md">
                        <input
                            type="text"
                            placeholder="Branch Name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full border rounded-md p-2"
                        />
                        <input
                            type="text"
                            placeholder="Address"
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            className="w-full border rounded-md p-2"
                        />
                        <input
                            type="text"
                            placeholder="Phone"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full border rounded-md p-2"
                        />
                        <input
                            type="text"
                            placeholder="Google Maps URL"
                            value={formData.mapLink}
                            onChange={(e) =>
                                setFormData({ ...formData, mapLink: e.target.value })
                            }
                            className="w-full border rounded-md p-2"
                        />
                        <input
                            type="text"
                            placeholder="Opening Hours"
                            value={formData.openingHours}
                            onChange={(e) =>
                                setFormData({ ...formData, openingHours: e.target.value })
                            }
                            className="w-full border rounded-md p-2"
                        />

                        <div className="flex justify-end gap-2 pt-3">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowModal(false);
                                    setEditingBranch(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button onClick={handleSave}>
                                {editingBranch ? "Save Changes" : "Add Branch"}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
