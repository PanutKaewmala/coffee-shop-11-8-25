"use client";

import React, { useEffect, useCallback } from "react";
import { X } from "lucide-react";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;

    /** content */
    children: React.ReactNode;

    /** optional sticky footer */
    footer?: React.ReactNode;

    /** size */
    maxWidthClassName?: string; // e.g. "max-w-lg", "max-w-xl"
}

const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    maxWidthClassName = "max-w-lg",
}) => {
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        },
        [onClose]
    );

    useEffect(() => {
        if (isOpen) document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" aria-modal="true" role="dialog">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal box */}
            <div
                className={[
                    "relative bg-[var(--surface)] border border-[var(--text-muted)]/20 rounded-2xl shadow-xl w-full mx-4",
                    maxWidthClassName,
                    "animate-in fade-in-0 zoom-in-95 duration-150",
                    "max-h-[85vh] flex flex-col overflow-hidden",
                ].join(" ")}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--text-muted)]/20 flex-none">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                        {title ?? "Modal"}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-lg"
                        aria-label="Close modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body (scrollable) */}
                <div className="p-5 overflow-auto grow">
                    {children}
                </div>

                {/* Footer (sticky) */}
                {footer && (
                    <div className="px-5 py-4 border-t border-[var(--text-muted)]/20 bg-[var(--surface)] flex-none">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
