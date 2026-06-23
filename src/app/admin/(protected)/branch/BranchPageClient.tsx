// src/app/admin/branch/BranchPageClient.tsx
"use client";

import Card from "@/components/admin/Card";
import Table from "@/components/admin/table/Table";
import Modal from "@/components/admin/Modal";
import Pagination from "@/components/admin/Pagination";
import { Button } from "@/components/ui/button";

import BranchFilter from "@/components/admin/BranchFilter";
import useBranchSearch from "@/hooks/useBranchSearch";

import { useEffect, useState } from "react";
import type { BranchRow, ReceiptSettings } from "@/lib/types";
import SearchBox from "@/components/admin/search/SearchBox";

type FormData = {
    name: string;
    address: string;
    phone: string;
    map_url: string;
    opening_hours: string;
};

type Errors = {
    name?: string;
    address?: string;
};

export default function BranchPageClient() {
    const {
        branches,
        loading,
        error,
        search,
        setSearch,
        primary,
        setPrimary,
        page,
        setPage,
        totalPages,
        inputPage,
        setInputPage,
        reloadList,
    } = useBranchSearch({ rowsPerPage: 10 });

    const [showModal, setShowModal] = useState(false);
    const [editingBranch, setEditingBranch] = useState<BranchRow | null>(null);

    const [formData, setFormData] = useState<FormData>({
        name: "",
        address: "",
        phone: "",
        map_url: "",
        opening_hours: "",
    });

    const [errors, setErrors] = useState<Errors>({});
    const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings | null>(null);
    const [receiptTaxId, setReceiptTaxId] = useState("");
    const [receiptFooter, setReceiptFooter] = useState("");
    const [receiptLoading, setReceiptLoading] = useState(true);
    const [receiptSaving, setReceiptSaving] = useState(false);
    const [receiptError, setReceiptError] = useState<string | null>(null);
    const [receiptSuccess, setReceiptSuccess] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;

        async function loadReceiptSettings() {
            setReceiptLoading(true);
            setReceiptError(null);

            try {
                const res = await fetch("/api/receipt-settings", { cache: "no-store" });
                const data = (await res.json().catch(() => null)) as
                    | ReceiptSettings
                    | { error?: string }
                    | null;

                if (!alive) return;
                if (!res.ok || !data || !("shopId" in data)) {
                    const message = data && "error" in data ? data.error : null;
                    throw new Error(message || "Failed to load receipt settings");
                }

                setReceiptSettings(data);
                setReceiptTaxId(data.taxId ?? "");
                setReceiptFooter(data.receiptFooter ?? "");
            } catch (error) {
                if (!alive) return;
                setReceiptError(
                    error instanceof Error ? error.message : "Failed to load receipt settings"
                );
            } finally {
                if (alive) setReceiptLoading(false);
            }
        }

        void loadReceiptSettings();
        return () => {
            alive = false;
        };
    }, []);

    const handleReceiptSave = async () => {
        if (!receiptSettings?.canEditShopSettings) {
            setReceiptError("Only the shop owner can edit shop-wide receipt settings.");
            return;
        }

        setReceiptSaving(true);
        setReceiptError(null);
        setReceiptSuccess(null);

        try {
            const res = await fetch("/api/receipt-settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    taxId: receiptTaxId,
                    receiptFooter,
                }),
            });
            const data = (await res.json().catch(() => null)) as
                | ReceiptSettings
                | { error?: string }
                | null;

            if (!res.ok || !data || !("shopId" in data)) {
                const apiMessage = data && "error" in data ? data.error : null;
                if (res.status === 403) {
                    throw new Error("Only the shop owner can edit shop-wide receipt settings.");
                }
                throw new Error(apiMessage || "Failed to save receipt settings");
            }

            setReceiptSettings(data);
            setReceiptTaxId(data.taxId ?? "");
            setReceiptFooter(data.receiptFooter ?? "");
            setReceiptSuccess("Receipt settings saved successfully.");
        } catch (error) {
            setReceiptError(
                error instanceof Error ? error.message : "Failed to save receipt settings"
            );
        } finally {
            setReceiptSaving(false);
        }
    };

    const resetForm = () => {
        setEditingBranch(null);
        setFormData({
            name: "",
            address: "",
            phone: "",
            map_url: "",
            opening_hours: "",
        });
        setErrors({});
    };

    const openModalNew = () => {
        resetForm();
        setShowModal(true);
    };

    const openModalEdit = (branch: BranchRow) => {
        setEditingBranch(branch);
        setFormData({
            name: branch.name ?? "",
            address: branch.address ?? "",
            phone: branch.phone ?? "",
            map_url: branch.map_url ?? "",
            opening_hours: branch.opening_hours ?? "",
        });
        setErrors({});
        setShowModal(true);
    };

    const validateBranch = (): boolean => {
        const newErrors: Errors = {};
        if (!formData.name.trim()) newErrors.name = "Branch name is required";
        if (!formData.address.trim()) newErrors.address = "Address is required";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSetPrimary = async (id: string) => {
        try {
            await fetch(`/api/branch/primary?id=${id}`, { method: "PUT" });
            await reloadList();
        } catch {
            alert("Failed to set primary");
        }
    };

    const handleSave = async () => {
        if (!validateBranch()) return;

        const body = {
            name: formData.name.trim(),
            address: formData.address.trim() || null,
            phone: formData.phone.trim() || null,
            map_url: formData.map_url.trim() || null,
            opening_hours: formData.opening_hours.trim() || null,
        };

        const method = editingBranch ? "PUT" : "POST";
        const payload = editingBranch ? { ...body, id: editingBranch.id } : body;

        try {
            const res = await fetch("/api/branch", {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j?.error || "Save failed");
                return;
            }

            await reloadList();
            setShowModal(false);
            resetForm();
        } catch {
            alert("Error saving branch");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this branch?")) return;

        try {
            const res = await fetch(`/api/branch?id=${id}`, { method: "DELETE" });

            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j?.error || "Delete failed");
                return;
            }

            await reloadList();
        } catch {
            alert("Error deleting branch");
        }
    };

    const headers = ["Branch", "Address", "Phone", "Hours", "Map", "Actions"];

    return (
        <div className="p-6 space-y-6">
            <Card title="Receipt Settings">
                <div className="max-w-2xl space-y-4">
                    <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                            Shop-wide receipt settings
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                            These values apply to every branch. Branch name, address, and phone remain managed in the branch editor below.
                        </p>
                    </div>

                    {receiptLoading ? (
                        <p className="text-sm text-[var(--text-muted)]">Loading receipt settings...</p>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-[var(--text-primary)]">
                                    Current shop name
                                </label>
                                <input
                                    type="text"
                                    value={receiptSettings?.shopName ?? "Coffee SaaS"}
                                    readOnly
                                    className="w-full rounded-md border border-[var(--text-muted)]/20 bg-[var(--background)]/50 p-2 text-[var(--text-muted)]"
                                />
                                <p className="text-xs text-[var(--text-muted)]">
                                    The shop name is managed separately from receipt settings.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="receipt-tax-id" className="text-sm font-medium text-[var(--text-primary)]">
                                    Tax ID / เลขผู้เสียภาษี
                                </label>
                                <input
                                    id="receipt-tax-id"
                                    type="text"
                                    value={receiptTaxId}
                                    maxLength={50}
                                    disabled={!receiptSettings?.canEditShopSettings || receiptSaving}
                                    onChange={(event) => {
                                        setReceiptTaxId(event.target.value);
                                        setReceiptError(null);
                                        setReceiptSuccess(null);
                                    }}
                                    placeholder="Optional"
                                    className="w-full rounded-md border border-[var(--text-muted)]/20 bg-[var(--surface)] p-2 disabled:cursor-not-allowed disabled:opacity-60"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="receipt-footer" className="text-sm font-medium text-[var(--text-primary)]">
                                    Receipt footer / ข้อความท้ายใบเสร็จ
                                </label>
                                <textarea
                                    id="receipt-footer"
                                    value={receiptFooter}
                                    maxLength={300}
                                    rows={4}
                                    disabled={!receiptSettings?.canEditShopSettings || receiptSaving}
                                    onChange={(event) => {
                                        setReceiptFooter(event.target.value);
                                        setReceiptError(null);
                                        setReceiptSuccess(null);
                                    }}
                                    placeholder="Optional message shown at the bottom of receipts in a later phase"
                                    className="w-full resize-y rounded-md border border-[var(--text-muted)]/20 bg-[var(--surface)] p-2 disabled:cursor-not-allowed disabled:opacity-60"
                                />
                                <div className="text-right text-xs text-[var(--text-muted)]">
                                    {receiptFooter.length}/300
                                </div>
                            </div>

                            {receiptSettings && !receiptSettings.canEditShopSettings ? (
                                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                                    Only the shop owner can edit shop-wide receipt settings.
                                </div>
                            ) : null}

                            {receiptError ? (
                                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                                    {receiptError}
                                </div>
                            ) : null}

                            {receiptSuccess ? (
                                <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-500">
                                    {receiptSuccess}
                                </div>
                            ) : null}

                            <div className="flex justify-end">
                                <Button
                                    onClick={() => void handleReceiptSave()}
                                    disabled={!receiptSettings?.canEditShopSettings || receiptSaving}
                                >
                                    {receiptSaving ? "Saving..." : "Save Receipt Settings"}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </Card>

            <Card title="Branch Management">
                <SearchBox value={search} setValue={setSearch} placeholder="ค้นหาชื่อสาขา / ที่อยู่" />

                <BranchFilter primary={primary} setPrimary={setPrimary} />

                <div className="flex justify-end mb-4">
                    <Button onClick={openModalNew}>+ Add Branch</Button>
                </div>

                {error ? (
                    <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <Table
                                headers={headers}
                                data={branches.map((branch) => [
                                    <div key={`name-${branch.id}`} className="flex items-center gap-2">
                                        <span className="font-medium">{branch.name}</span>

                                        {branch.is_primary && (
                                            <span className="px-2 py-0.5 text-xs rounded bg-green-600 text-white">
                                                Primary
                                            </span>
                                        )}
                                    </div>,

                                    branch.address ?? "-",
                                    branch.phone ?? "-",
                                    branch.opening_hours ?? "-",

                                    <div key={`map-${branch.id}`} className="shrink-0">
                                        {branch.map_url ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => window.open(branch.map_url!, "_blank")}
                                            >
                                                View
                                            </Button>
                                        ) : (
                                            "-"
                                        )}
                                    </div>,

                                    <div key={`actions-${branch.id}`} className="flex items-center gap-2 shrink-0">
                                        {!branch.is_primary && (
                                            <Button size="sm" variant="outline" onClick={() => handleSetPrimary(branch.id)}>
                                                Primary
                                            </Button>
                                        )}

                                        <Button size="sm" variant="outline" onClick={() => openModalEdit(branch)}>
                                            Edit
                                        </Button>

                                        {!branch.is_primary && (
                                            <Button size="sm" variant="destructive" onClick={() => handleDelete(branch.id)}>
                                                Delete
                                            </Button>
                                        )}
                                    </div>,
                                ])}
                            />
                        </div>

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

            {showModal && (
                <Modal
                    isOpen={showModal}
                    onClose={() => {
                        setShowModal(false);
                        resetForm();
                    }}
                    title={editingBranch ? "Edit Branch" : "Add Branch"}
                >
                    <div className="space-y-4 max-w-md">
                        <div>
                            <input
                                type="text"
                                placeholder="Branch Name"
                                value={formData.name}
                                onChange={(e) => {
                                    setFormData((prev) => ({ ...prev, name: e.target.value }));
                                    setErrors((prev) => ({ ...prev, name: undefined }));
                                }}
                                className={`w-full border rounded-md p-2 ${errors.name ? "border-red-500" : ""}`}
                            />
                            {errors.name && <p className="text-red-500 text-xs">{errors.name}</p>}
                        </div>

                        <div>
                            <input
                                type="text"
                                placeholder="Address"
                                value={formData.address}
                                onChange={(e) => {
                                    setFormData((prev) => ({ ...prev, address: e.target.value }));
                                    setErrors((prev) => ({ ...prev, address: undefined }));
                                }}
                                className={`w-full border rounded-md p-2 ${errors.address ? "border-red-500" : ""}`}
                            />
                            {errors.address && <p className="text-red-500 text-xs">{errors.address}</p>}
                        </div>

                        <input
                            type="text"
                            placeholder="Phone"
                            value={formData.phone}
                            onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                            className="w-full border rounded-md p-2"
                        />

                        <input
                            type="text"
                            placeholder="Google Maps URL"
                            value={formData.map_url}
                            onChange={(e) => setFormData((prev) => ({ ...prev, map_url: e.target.value }))}
                            className="w-full border rounded-md p-2"
                        />

                        <input
                            type="text"
                            placeholder="Opening Hours"
                            value={formData.opening_hours}
                            onChange={(e) => setFormData((prev) => ({ ...prev, opening_hours: e.target.value }))}
                            className="w-full border rounded-md p-2"
                        />

                        <div className="flex justify-end gap-2 pt-3">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setShowModal(false);
                                    resetForm();
                                }}
                            >
                                Cancel
                            </Button>

                            <Button onClick={handleSave}>{editingBranch ? "Save Changes" : "Add Branch"}</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
