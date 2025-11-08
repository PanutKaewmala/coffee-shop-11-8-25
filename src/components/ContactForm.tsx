"use client";
import { useState } from "react";

export default function ContactForm() {
    const [formData, setFormData] = useState({ name: "", email: "", message: "" });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Form submitted:", formData);
        alert("Thanks for your message!");
        setFormData({ name: "", email: "", message: "" });
    };

    return (
        <form className="space-y-4">
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

            <button
                type="submit"
                onClick={handleSubmit}
                className="
          px-6 py-2 rounded-full font-semibold text-white
          bg-gradient-to-r from-accent to-accent-dark
          text-surface
          shadow-sm
          transition-all duration-300
          hover:brightness-110
        "
            >
                Send Message
            </button>
        </form>
    );
}
