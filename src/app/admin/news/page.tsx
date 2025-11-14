"use client";

import { useState, useEffect } from "react";
import Card from "@/components/admin/Card";
import Table from "@/components/admin/Table";
import Modal from "@/components/admin/Modal";
import { Button } from "@/components/ui/button";

type NewsItem = {
    id: string;
    category: string;
    title: string;
    content: string;
    image_url?: string;
    created_at: string;
};


export default function NewsAdminPage() {
    const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingNews, setEditingNews] = useState<NewsItem | null>(null);
    const [formData, setFormData] = useState({
        title: "",
        content: "",
        date: "",
        image: null as File | null,
    });

    // 🔹 Fetch news from API
    const fetchNews = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/news");
            const data = await res.json();
            setNewsItems(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNews();
    }, []);

    // 🔹 Save or update news
    const handleSave = async () => {
        try {
            let imageUrl = editingNews?.image_url || "";

            // Upload image if selected
            if (formData.image) {
                const uploadForm = new FormData();
                uploadForm.append("files", formData.image);
                const uploadRes = await fetch("/api/upload", { method: "POST", body: uploadForm });
                const uploadData = await uploadRes.json();
                if (uploadRes.ok && uploadData.urls?.[0]) imageUrl = uploadData.urls[0];
            }

            const body = {
                title: formData.title,
                content: formData.content,
                image: imageUrl,
                date: formData.date || new Date().toISOString(),
            };

            if (editingNews) {
                await fetch("/api/news", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...body, id: editingNews.id }),
                });
            } else {
                await fetch("/api/news", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
            }

            setShowModal(false);
            setFormData({ title: "", content: "", date: "", image: null });
            setEditingNews(null);
            fetchNews();
        } catch (err) {
            console.error(err);
            alert("Something went wrong while saving news");
        }
    };

    // 🔹 Edit news
    const handleEdit = (item: NewsItem) => {
        setEditingNews(item);
        setFormData({
            title: item.title,
            content: item.content,
            date: item.created_at.split("T")[0],
            image: null,
        });
        setShowModal(true);
    };

    // 🔹 Delete news
    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this news item?")) return;
        await fetch(`/api/news?id=${id}`, { method: "DELETE" });
        fetchNews();
    };

    const headers = ["Title", "Content", "Date", "Image", "Actions"];

    return (
        <div className="p-6 space-y-6">
            <Card title="Manage News">
                <div className="flex justify-end mb-4">
                    <Button onClick={() => setShowModal(true)}>+ Add News</Button>
                </div>

                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <Table
                            headers={headers}
                            data={newsItems.map(item => [
                                item.title,
                                item.content,
                                item.created_at.split("T")[0],
                                item.image_url ? (
                                    <img
                                        key={item.id}
                                        src={item.image_url}
                                        alt={item.title}
                                        className="w-16 h-16 object-cover rounded"
                                    />
                                ) : (
                                    "-"
                                ),
                                <div key={item.id} className="flex flex-wrap gap-2">
                                    <Button variant="outline" size="sm" onClick={() => handleEdit(item)}>
                                        Edit
                                    </Button>
                                    <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                                        Delete
                                    </Button>
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
                    onClose={() => setShowModal(false)}
                    title={editingNews ? "Edit News" : "Add News"}
                >
                    <div className="space-y-4 max-w-md">
                        <input
                            type="text"
                            placeholder="Title"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            className="w-full border rounded-md p-2"
                        />
                        <textarea
                            placeholder="Content"
                            value={formData.content}
                            onChange={e => setFormData({ ...formData, content: e.target.value })}
                            className="w-full border rounded-md p-2"
                        />
                        <input
                            type="date"
                            value={formData.date}
                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                            className="w-full border rounded-md p-2"
                        />
                        <input
                            type="file"
                            onChange={e => setFormData({ ...formData, image: e.target.files?.[0] || null })}
                        />
                        {formData.image && (
                            <img
                                src={URL.createObjectURL(formData.image)}
                                alt="Preview"
                                className="w-32 h-32 object-cover rounded"
                            />
                        )}
                        <div className="flex justify-end flex-wrap gap-2 pt-2">
                            <Button variant="outline" onClick={() => setShowModal(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave}>{editingNews ? "Save Changes" : "Add"}</Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
