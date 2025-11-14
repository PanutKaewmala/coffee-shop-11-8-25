"use client";

import { useState } from "react";

interface ApiError {
    error?: string;
}

export default function ContactForm() {
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        message: "",
    });

    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            // response error type-safe
            const data = (await res.json()) as ApiError;

            if (!res.ok) {
                throw new Error(data.error ?? "Unknown error occurred");
            }

            setSuccess("Message sent successfully!");
            setFormData({ name: "", email: "", message: "" });
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unexpected error occurred");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <form className="space-y-4" onSubmit={handleSubmit}>
            <input
                type="text"
                name="name"
                placeholder="Your Name"
                value={formData.name}
                onChange={handleChange}
                className="
                    w-full p-3 rounded-xl border border-text-muted/40
                    bg-surface text-text-primary
                    placeholder:text-text-muted
                    transition-colors duration-300
                    focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                "
                required
            />

            <input
                type="email"
                name="email"
                placeholder="Your Email"
                value={formData.email}
                onChange={handleChange}
                className="
                    w-full p-3 rounded-xl border border-text-muted/40
                    bg-surface text-text-primary
                    placeholder:text-text-muted
                    transition-colors duration-300
                    focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                "
                required
            />

            <textarea
                name="message"
                placeholder="Your Message"
                value={formData.message}
                onChange={handleChange}
                className="
                    w-full p-3 rounded-xl border border-text-muted/40
                    bg-surface text-text-primary
                    placeholder:text-text-muted
                    h-32 resize-none
                    transition-colors duration-300
                    focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                "
                required
            />

            {/* status message */}
            {success && <p className="text-green-400 text-sm">{success}</p>}
            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
                type="submit"
                disabled={loading}
                className="
                    px-6 py-2 rounded-full font-semibold text-white
                    bg-gradient-to-r from-accent to-accent-dark
                    text-surface shadow-sm transition-all duration-300
                    hover:brightness-110 disabled:opacity-50
                "
            >
                {loading ? "Sending..." : "Send Message"}
            </button>
        </form>
    );
}
