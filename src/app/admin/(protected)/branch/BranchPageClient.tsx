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
    const canManageBranches = receiptSettings?.canEditShopSettings ?? false;

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
                    throw new Error(message || "โหลดการตั้งค่าใบเสร็จไม่สำเร็จ");
                }

                setReceiptSettings(data);
                setReceiptTaxId(data.taxId ?? "");
                setReceiptFooter(data.receiptFooter ?? "");
            } catch (error) {
                if (!alive) return;
                setReceiptError(
                    error instanceof Error ? error.message : "โหลดการตั้งค่าใบเสร็จไม่สำเร็จ"
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
            setReceiptError("เฉพาะเจ้าของร้านเท่านั้นที่แก้ไขการตั้งค่าใบเสร็จได้");
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
                    throw new Error("เฉพาะเจ้าของร้านเท่านั้นที่แก้ไขการตั้งค่าใบเสร็จได้");
                }
                throw new Error(apiMessage || "บันทึกการตั้งค่าใบเสร็จไม่สำเร็จ");
            }

            setReceiptSettings(data);
            setReceiptTaxId(data.taxId ?? "");
            setReceiptFooter(data.receiptFooter ?? "");
            setReceiptSuccess("บันทึกการตั้งค่าใบเสร็จแล้ว");
        } catch (error) {
            setReceiptError(
                error instanceof Error ? error.message : "บันทึกการตั้งค่าใบเสร็จไม่สำเร็จ"
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
        if (!formData.name.trim()) newErrors.name = "กรุณากรอกชื่อสาขา";
        if (!formData.address.trim()) newErrors.address = "กรุณากรอกที่อยู่";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSetPrimary = async (id: string) => {
        try {
            await fetch(`/api/branch/primary?id=${id}`, { method: "PUT" });
            await reloadList();
        } catch {
            alert("ตั้งเป็นสาขาหลักไม่สำเร็จ");
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
                alert(j?.error || "บันทึกสาขาไม่สำเร็จ");
                return;
            }

            await reloadList();
            setShowModal(false);
            resetForm();
        } catch {
            alert("บันทึกสาขาไม่สำเร็จ");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("ลบสาขานี้?")) return;

        try {
            const res = await fetch(`/api/branch?id=${id}`, { method: "DELETE" });

            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j?.error || "ลบสาขาไม่สำเร็จ");
                return;
            }

            await reloadList();
        } catch {
            alert("ลบสาขาไม่สำเร็จ");
        }
    };

    const headers = ["สาขา", "ที่อยู่", "โทรศัพท์", "เวลาทำการ", "แผนที่", "จัดการ"];

    return (
        <div className="p-6 space-y-6">
            <Card title="ตั้งค่าใบเสร็จ">
                <div className="max-w-2xl space-y-4">
                    <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                            ตั้งค่าใบเสร็จของร้าน
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                            ข้อมูลนี้ใช้กับทุกสาขา ส่วนชื่อสาขา ที่อยู่ และเบอร์โทร จัดการได้จากตารางสาขาด้านล่าง
                        </p>
                    </div>

                    {receiptLoading ? (
                        <p className="text-sm text-[var(--text-muted)]">กำลังโหลดการตั้งค่าใบเสร็จ...</p>
                    ) : (
                        <>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-[var(--text-primary)]">
                                    ชื่อร้านปัจจุบัน
                                </label>
                                <input
                                    type="text"
                                    value={receiptSettings?.shopName ?? "ยังไม่ได้ตั้งชื่อร้าน"}
                                    readOnly
                                    className="w-full rounded-md border border-[var(--text-muted)]/20 bg-[var(--background)]/50 p-2 text-[var(--text-muted)]"
                                />
                                <p className="text-xs text-[var(--text-muted)]">
                                    ชื่อร้านจัดการแยกจากการตั้งค่าใบเสร็จ
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="receipt-tax-id" className="text-sm font-medium text-[var(--text-primary)]">
                                    เลขผู้เสียภาษี
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
                                    placeholder="ไม่บังคับ"
                                    className="w-full rounded-md border border-[var(--text-muted)]/20 bg-[var(--surface)] p-2 disabled:cursor-not-allowed disabled:opacity-60"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="receipt-footer" className="text-sm font-medium text-[var(--text-primary)]">
                                    ข้อความท้ายใบเสร็จ
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
                                    placeholder="ข้อความท้ายใบเสร็จ (ไม่บังคับ)"
                                    className="w-full resize-y rounded-md border border-[var(--text-muted)]/20 bg-[var(--surface)] p-2 disabled:cursor-not-allowed disabled:opacity-60"
                                />
                                <div className="text-right text-xs text-[var(--text-muted)]">
                                    {receiptFooter.length}/300
                                </div>
                            </div>

                            {receiptSettings && !receiptSettings.canEditShopSettings ? (
                                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                                    เฉพาะเจ้าของร้านเท่านั้นที่แก้ไขการตั้งค่าใบเสร็จได้
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
                                    {receiptSaving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าใบเสร็จ"}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </Card>

            <Card title="จัดการสาขา">
                <SearchBox value={search} setValue={setSearch} placeholder="ค้นหาชื่อสาขา / ที่อยู่" />

                <BranchFilter primary={primary} setPrimary={setPrimary} />

                {!canManageBranches ? (
                    <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                        คุณมีสิทธิ์ดูข้อมูลเท่านั้น เจ้าของร้านเท่านั้นที่จัดการสาขาได้
                    </div>
                ) : null}

                <div className="flex justify-end mb-4">
                    <Button onClick={openModalNew} disabled={!canManageBranches}>
                        + เพิ่มสาขา
                    </Button>
                </div>

                {error ? (
                    <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <p>กำลังโหลด...</p>
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
                                                สาขาหลัก
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
                                                เปิดแผนที่
                                            </Button>
                                        ) : (
                                            "-"
                                        )}
                                    </div>,

                                    <div key={`actions-${branch.id}`} className="flex items-center gap-2 shrink-0">
                                        {canManageBranches ? (
                                            <>
                                                {!branch.is_primary && (
                                                    <Button size="sm" variant="outline" onClick={() => handleSetPrimary(branch.id)}>
                                                        ตั้งเป็นสาขาหลัก
                                                    </Button>
                                                )}

                                                <Button size="sm" variant="outline" onClick={() => openModalEdit(branch)}>
                                                    แก้ไข
                                                </Button>

                                                {!branch.is_primary && (
                                                    <Button size="sm" variant="destructive" onClick={() => handleDelete(branch.id)}>
                                                        ลบ
                                                    </Button>
                                                )}
                                            </>
                                        ) : (
                                            <span className="text-xs text-[var(--text-secondary)]">ดูอย่างเดียว</span>
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
                    title={editingBranch ? "แก้ไขสาขา" : "เพิ่มสาขา"}
                >
                    <div className="space-y-4 max-w-md">
                        <div>
                            <input
                                type="text"
                                placeholder="ชื่อสาขา"
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
                                placeholder="ที่อยู่"
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
                            placeholder="เบอร์โทร"
                            value={formData.phone}
                            onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                            className="w-full border rounded-md p-2"
                        />

                        <input
                            type="text"
                            placeholder="ลิงก์ Google Maps"
                            value={formData.map_url}
                            onChange={(e) => setFormData((prev) => ({ ...prev, map_url: e.target.value }))}
                            className="w-full border rounded-md p-2"
                        />

                        <input
                            type="text"
                            placeholder="เวลาทำการ"
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
                                ยกเลิก
                            </Button>

                            <Button onClick={handleSave}>{editingBranch ? "บันทึกการแก้ไข" : "เพิ่มสาขา"}</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
