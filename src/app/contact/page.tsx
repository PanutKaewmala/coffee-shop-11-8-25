"use client";

import ContactForm from "@/components/ContactForm";
import ContactInfo from "@/components/ContactInfo";

export default function ContactPage() {
    return (
        <main
            id="contact"
            className="py-12 transition-colors duration-300 bg-[var(--color-background)] text-[var(--color-text-primary)]"
        >
            <div>
                {/* Title */}
                <h2
                    className="text-2xl font-bold mb-4 text-left text-[var(--color-foreground)]"
                >
                    Contact Us
                </h2>

                {/* Subtitle */}
                <p
                    className="text-left mb-10 max-w-xl text-[var(--color-text-secondary)]"
                >
                    Have questions? Send us a message and we&apos;ll get back to you.
                </p>

                {/* Layout */}
                <div className="grid md:grid-cols-2 gap-8">
                    <ContactInfo />
                    <ContactForm />
                </div>
            </div>
        </main>
    );
}
