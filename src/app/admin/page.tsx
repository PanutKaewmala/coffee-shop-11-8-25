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
                    fetch("/api/branch?all=true"),
                    fetch("/api/news"),
                    fetch("/api/contact"),
                ]);

                if (![menuRes, branchRes, newsRes, contactRes].every(r => r.ok)) {
                    throw new Error("Failed to fetch one or more resources");
                }

                const menuData = await menuRes.json();
                const branchData = await branchRes.json();
                const newsData = await newsRes.json();
                const contactData = await contactRes.json();

                // ⭐️ รองรับทุกรูปแบบของ response
                const menuCount = Array.isArray(menuData)
                    ? menuData.length
                    : Array.isArray(menuData.menu)
                        ? menuData.menu.length
                        : 0;

                const branchCount = Array.isArray(branchData)
                    ? branchData.length
                    : Array.isArray(branchData.branch)
                        ? branchData.branch.length
                        : Array.isArray(branchData.branches)
                            ? branchData.branches.length
                            : 0;

                const newsCount = Array.isArray(newsData)
                    ? newsData.length
                    : Array.isArray(newsData.news)
                        ? newsData.news.length
                        : 0;

                const contactCount = Array.isArray(contactData)
                    ? contactData.length
                    : Array.isArray(contactData.contact)
                        ? contactData.contact.length
                        : Array.isArray(contactData.contacts)
                            ? contactData.contacts.length
                            : 0;

                setCounts({
                    menu: menuCount,
                    branch: branchCount,
                    news: newsCount,
                    contact: contactCount,
                });

            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Something went wrong";
                console.error(message);
                setError(message);
            } finally {
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
                    <p className="text-3xl font-semibold text-center text-gray-300">
                        {counts.menu}
                    </p>
                </Card>
                <Card title="Branches">
                    <p className="text-3xl font-semibold text-center text-gray-300">
                        {counts.branch}
                    </p>
                </Card>
                <Card title="News">
                    <p className="text-3xl font-semibold text-center text-gray-300">
                        {counts.news}
                    </p>
                </Card>
                <Card title="Contacts">
                    <p className="text-3xl font-semibold text-center text-gray-300">
                        {counts.contact}
                    </p>
                </Card>
            </div>
        </div>
    );
}
