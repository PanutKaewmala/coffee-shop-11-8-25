"use client";

import React from "react";

interface CardProps extends React.PropsWithChildren {
    title?: string;
    className?: string;
}

const Card: React.FC<CardProps> = ({ title, children, className = "" }) => {
    return (
        <div
            className={`bg-[var(--surface)] border border-[var(--text-muted)]/20 rounded-2xl shadow-sm p-5 transition-colors duration-300 ${className}`}
        >
            {title && (
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3 relative pb-1">
                    {title}
                    <span className="absolute left-0 bottom-0 w-10 h-[2px] bg-[var(--accent)] rounded-full"></span>
                </h3>
            )}
            <div className="text-[var(--text-secondary)]">{children}</div>
        </div>
    );
};

export default Card;
