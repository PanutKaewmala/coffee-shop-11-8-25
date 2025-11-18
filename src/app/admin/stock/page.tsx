"use client";

import { useEffect, useState, useMemo } from "react";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/Table";
import Modal from "@/components/admin/Modal";          // ⭐ เพิ่ม
import { StockRow, Ingredient } from "@/lib/types";

export default function StockHistoryPage() {
    const [logs, setLogs] = useState<StockRow[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [loading, setLoading] = useState(true);

    // FILTER STATES
    const [filterIngredient, setFilterIngredient] = useState<string>("");
    const [filterType, setFilterType] = useState<string>("");
    const [filterDate, setFilterDate] = useState<string>("");

    // --------------------------------------------------------------
    // Fetch stock logs
    // --------------------------------------------------------------
    async function fetchStock() {
        try {
            setLoading(true);
            const res = await fetch("/api/stock");
            const data = await res.json();
            setLogs(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("fetchStock error:", err);
        } finally {
            setLoading(false);
        }
    }

    // --------------------------------------------------------------
    // Fetch ingredients
    // --------------------------------------------------------------
    async function fetchIngredients() {
        try {
            const res = await fetch("/api/ingredients");
            const data = await res.json();
            setIngredients(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("fetchIngredients error:", err);
        }
    }

    useEffect(() => {
        fetchStock();
        fetchIngredients();
    }, []);

    // --------------------------------------------------------------
    // Filtering
    // --------------------------------------------------------------
    const filteredLogs = useMemo(() => {
        let result = logs;

        if (filterIngredient) {
            result = result.filter(
                (row) => row.ingredient_id === filterIngredient
            );
        }

        if (filterType) {
            result = result.filter((row) => row.type === filterType);
        }

        if (filterDate) {
            const now = new Date();

            result = result.filter((row) => {
                const created = new Date(row.created_at);

                if (filterDate === "today") {
                    return created.toDateString() === now.toDateString();
                }

                if (filterDate === "yesterday") {
                    const y = new Date();
                    y.setDate(now.getDate() - 1);
                    return created.toDateString() === y.toDateString();
                }

                if (filterDate === "7") {
                    const d = new Date();
                    d.setDate(now.getDate() - 7);
                    return created >= d;
                }

                if (filterDate === "30") {
                    const d = new Date();
                    d.setDate(now.getDate() - 30);
                    return created >= d;
                }

                return true;
            });
        }

        return result;
    }, [logs, filterIngredient, filterType, filterDate]);

    // --------------------------------------------------------------
    // Badge
    // --------------------------------------------------------------
    const renderTypeBadge = (t: string) => {
        let label = "";
        let classes =
            "px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ";

        switch (t) {
            case "increase":
                label = "เพิ่มสต๊อก";
                classes += "bg-green-500/15 text-green-700";
                break;

            case "decrease":
                label = "ลดสต๊อก";
                classes += "bg-red-500/15 text-red-700";
                break;

            case "set":
                label = "ตั้งค่าใหม่";
                classes += "bg-yellow-500/20 text-yellow-800";
                break;

            case "deduct":
                label = "ตัดตามออเดอร์";
                classes += "bg-blue-500/15 text-blue-700";
                break;

            default:
                label = t;
                classes += "bg-gray-500/10 text-gray-700";
        }

        return <span className={classes}>{label}</span>;
    };

    // --------------------------------------------------------------
    // Group Logs by Date
    // --------------------------------------------------------------
    const groupedLogs = useMemo(() => {
        const groups: Record<string, StockRow[]> = {};

        filteredLogs.forEach((log) => {
            const d = new Date(log.created_at);
            const key = d.toISOString().split("T")[0];

            if (!groups[key]) groups[key] = [];
            groups[key].push(log);
        });

        return Object.entries(groups)
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .map(([date, items]) => ({ date, items }));
    }, [filteredLogs]);

    const formatDateTH = (isoDate: string) => {
        const d = new Date(isoDate);
        return d.toLocaleDateString("th-TH", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    // --------------------------------------------------------------
    // Collapse State
    // --------------------------------------------------------------
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const toggleDay = (date: string) => {
        setCollapsed((prev) => ({
            ...prev,
            [date]: !prev[date],
        }));
    };

    // --------------------------------------------------------------
    // Modal State (⭐⭐ เพิ่ม)
    // --------------------------------------------------------------
    const [selectedLog, setSelectedLog] = useState<StockRow | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const openModal = (groupDate: string, rowIndex: number) => {
        const log = groupedLogs
            .find((g) => g.date === groupDate)
            ?.items[rowIndex];

        if (!log) return;

        setSelectedLog(log);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setSelectedLog(null);
        setIsModalOpen(false);
    };

    // --------------------------------------------------------------
    // RENDER UI
    // --------------------------------------------------------------
    const headers = [
        "วันที่",
        "วัตถุดิบ",
        "จำนวน",
        "ประเภท",
        "Order ID",
        "หมายเหตุ",
    ];

    return (
        <div className="p-6 space-y-6">
            <Card title="ประวัติสต๊อก (Stock History)">

                {/* FILTER BAR */}
                <div className="flex flex-wrap items-center gap-3 mb-4">

                    {/* FILTER INGREDIENT */}
                    <select
                        className="bg-background border border-[var(--text-muted)]/20 p-2 rounded-lg"
                        value={filterIngredient}
                        onChange={(e) => setFilterIngredient(e.target.value)}
                    >
                        <option value="">วัตถุดิบทั้งหมด</option>
                        {ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                                {ing.name}
                            </option>
                        ))}
                    </select>

                    {/* FILTER TYPE */}
                    <select
                        className="bg-background border border-[var(--text-muted)]/20 p-2 rounded-lg"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="">ประเภททั้งหมด</option>
                        <option value="increase">เพิ่มสต๊อก</option>
                        <option value="decrease">ลดสต๊อก</option>
                        <option value="set">ตั้งค่ายอดใหม่</option>
                        <option value="deduct">ตัดสต๊อกจากออเดอร์</option>
                    </select>

                    {/* FILTER DATE */}
                    <select
                        className="bg-background border border-[var(--text-muted)]/20 p-2 rounded-lg"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                    >
                        <option value="">ทุกช่วงเวลา</option>
                        <option value="today">วันนี้</option>
                        <option value="yesterday">เมื่อวาน</option>
                        <option value="7">7 วันล่าสุด</option>
                        <option value="30">30 วันล่าสุด</option>
                    </select>
                </div>

                {/* TABLE */}
                {loading ? (
                    <p>กำลังโหลด...</p>
                ) : groupedLogs.length === 0 ? (
                    <p className="text-[var(--text-muted)]">ไม่พบข้อมูล</p>
                ) : (
                    groupedLogs.map((group) => (
                        <div key={group.date} className="mb-8">

                            {/* Day Header */}
                            <div
                                className="text-lg font-semibold text-text-primary mb-2 flex items-center justify-between cursor-pointer select-none"
                                onClick={() => toggleDay(group.date)}
                            >
                                <span>{formatDateTH(group.date)}</span>
                                <span className="text-base text-text-secondary">
                                    {collapsed[group.date] ? "▸" : "▾"}
                                </span>
                            </div>

                            {/* Table For Each Group */}
                            {!collapsed[group.date] && (
                                <Table
                                    headers={headers}
                                    data={group.items.map((row) => [
                                        new Date(row.created_at).toLocaleString("th-TH"),
                                        row.ingredients?.name ?? "-",
                                        `${row.amount} ${row.ingredients?.unit ?? ""}`,
                                        renderTypeBadge(row.type),
                                        row.order_id ?? "-",
                                        row.note ?? "-",
                                    ])}
                                    onRowClick={(i) => openModal(group.date, i)}   // ⭐ NEW
                                />
                            )}
                        </div>
                    ))
                )}
            </Card>

            {/* Modal Detail */}
            {isModalOpen && selectedLog && (
                <Modal
                    isOpen={isModalOpen}
                    onClose={closeModal}
                    title="รายละเอียดสต๊อก"
                >
                    <div className="space-y-4">

                        {/* วันที่ */}
                        <div className="text-sm">
                            <strong>วันที่:</strong>{" "}
                            {new Date(selectedLog.created_at).toLocaleString("th-TH")}
                        </div>

                        {/* วัตถุดิบ */}
                        <div className="text-sm">
                            <strong>วัตถุดิบ:</strong>{" "}
                            {selectedLog.ingredients?.name ?? "-"}
                        </div>

                        {/* Before / After */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <strong>ก่อนปรับ:</strong>{" "}
                                {selectedLog.before_stock ?? "-"}{" "}
                                {selectedLog.ingredients?.unit ?? ""}
                            </div>
                            <div>
                                <strong>หลังปรับ:</strong>{" "}
                                {selectedLog.after_stock ?? "-"}{" "}
                                {selectedLog.ingredients?.unit ?? ""}
                            </div>
                        </div>

                        {/* จำนวนที่ปรับ */}
                        <div className="text-sm">
                            <strong>จำนวนที่ปรับ:</strong>{" "}
                            {selectedLog.amount ?? "-"}{" "}
                            {selectedLog.ingredients?.unit ?? ""}
                        </div>

                        {/* ประเภท */}
                        <div className="text-sm">
                            <strong>ประเภท:</strong>{" "}
                            {renderTypeBadge(selectedLog.type)}
                        </div>

                        {/* Order ID */}
                        <div className="text-sm">
                            <strong>Order ID:</strong>{" "}
                            {selectedLog.order_id ?? "-"}
                        </div>

                        {/* หมายเหตุ */}
                        <div className="text-sm">
                            <strong>หมายเหตุ:</strong>{" "}
                            {selectedLog.note || "-"}
                        </div>
                    </div>
                </Modal>
            )}

        </div>
    );
}
