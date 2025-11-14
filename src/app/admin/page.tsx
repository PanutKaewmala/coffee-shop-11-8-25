"use client";

import { useEffect, useState } from "react";
import Card from "@/components/admin/Card";

type CountData = {
    menu: number;
    branch: number;
    news: number;
    contact: number;
};

export default function AdminDashboard() {
    const [counts, setCounts] = useState<CountData>({
        menu: 0,
        branch: 0,
        news: 0,
        contact: 0,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                setLoading(true);
                setError(null);

                const [menuRes, branchRes, newsRes, contactRes] = await Promise.all([
                    fetch("/api/menu"),
                    fetch("/api/branch?all=true"), // ✅ FIX ตรงนี้
                    fetch("/api/news"),
                    fetch("/api/contact"),
                ]);

                if (![menuRes, branchRes, newsRes, contactRes].every(r => r.ok)) {
                    throw new Error("Failed to fetch one or more resources");
                }

                const [menu, branch, news, contact] = await Promise.all([
                    menuRes.json(),
                    branchRes.json(),
                    newsRes.json(),
                    contactRes.json(),
                ]);

                setCounts({
                    menu: menu.length,
                    branch: branch.length,
                    news: news.length,
                    contact: contact.length,
                });
            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : "Something went wrong";
                console.error(message);
                setError(message);
            }
            finally {
                setLoading(false);
            }
        };

        fetchCounts();
    }, []);

    if (loading) return <p className="p-6 text-gray-500">Loading dashboard...</p>;
    if (error) return <p className="p-6 text-red-500">Error: {error}</p>;

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-bold mb-4 text-white">Admin Dashboard</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card title="Menu Items">
                    <p className="text-3xl font-semibold text-center text-gray-600">{counts.menu}</p>
                </Card>
                <Card title="Branches">
                    <p className="text-3xl font-semibold text-center text-gray-600">{counts.branch}</p>
                </Card>
                <Card title="News">
                    <p className="text-3xl font-semibold text-center text-gray-600">{counts.news}</p>
                </Card>
                <Card title="Contacts">
                    <p className="text-3xl font-semibold text-center text-gray-600">{counts.contact}</p>
                </Card>
            </div>
        </div>
    );
}
