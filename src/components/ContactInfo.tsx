"use client";
import { MapPin, Phone, Mail } from "lucide-react";

export default function ContactInfo() {
    return (
        <div
            className="space-y-6 p-6 rounded-2xl shadow-sm transition-all duration-300"
            style={{ backgroundColor: "var(--color-surface)", color: "var(--color-text-primary)" }}
        >
            {/* Store Info */}
            <div className="space-y-4">
                <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 mt-1" style={{ color: "var(--color-accent)" }} />
                    <div>
                        <h3 className="font-semibold text-text-primary">Address</h3>
                        <p className="text-sm text-text-secondary">
                            123 Coffee Street, Bangkok, Thailand
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-3">
                    <Phone className="w-5 h-5 mt-1" style={{ color: "var(--color-accent)" }} />
                    <div>
                        <h3 className="font-semibold text-text-primary">Phone</h3>
                        <p className="text-sm text-text-secondary">+66 123 456 789</p>
                    </div>
                </div>

                <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 mt-1" style={{ color: "var(--color-accent)" }} />
                    <div>
                        <h3 className="font-semibold text-text-primary">Email</h3>
                        <p className="text-sm text-text-secondary">info@coffeeshop.com</p>
                    </div>
                </div>
            </div>

            {/* 🗺️ Location Mockup */}
            <div
                className="rounded-xl overflow-hidden border border-text-muted/40 transition-colors duration-300"
                style={{ backgroundColor: "var(--color-background)" }}
            >
                <div
                    className="aspect-video flex items-center justify-center text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                >
                    <span className="text-center">
                        🗺️ Store Location Map <br />
                        (Mockup Placeholder)
                    </span>
                </div>
            </div>
        </div>
    );
}
