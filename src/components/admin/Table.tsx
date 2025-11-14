"use client";

import React from "react";

interface TableProps {
    headers: string[];
    data: React.ReactNode[][];
}

const Table: React.FC<TableProps> = ({ headers, data }) => {
    return (
        <div className="w-full">
            {/* ✅ Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full border border-[var(--text-muted)]/20 divide-y divide-[var(--text-muted)]/20 rounded-xl overflow-hidden">
                    <thead className="bg-[var(--surface)]/80 backdrop-blur-sm">
                        <tr>
                            {headers.map((header) => (
                                <th
                                    key={header}
                                    className="px-4 py-3 text-left text-sm font-semibold text-[var(--text-primary)] border-b border-[var(--text-muted)]/20"
                                >
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-[var(--background)] divide-y divide-[var(--text-muted)]/20">
                        {data.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={headers.length}
                                    className="px-4 py-6 text-center text-[var(--text-muted)]"
                                >
                                    No data available
                                </td>
                            </tr>
                        ) : (
                            data.map((row, rowIndex) => (
                                <tr
                                    key={rowIndex}
                                    className="hover:bg-[var(--accent)]/10 transition-colors"
                                >
                                    {row.map((cell, cellIndex) => (
                                        <td
                                            key={cellIndex}
                                            className="px-4 py-2.5 text-sm text-[var(--text-secondary)]"
                                        >
                                            {cell}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* ✅ Mobile Card-style view */}
            <div className="sm:hidden space-y-4">
                {data.length === 0 ? (
                    <div className="text-center text-[var(--text-muted)]">
                        No data available
                    </div>
                ) : (
                    data.map((row, rowIndex) => (
                        <div
                            key={rowIndex}
                            className="border border-[var(--text-muted)]/20 rounded-xl p-4 bg-[var(--surface)] shadow-sm"
                        >
                            {row.map((cell, cellIndex) => (
                                <div
                                    key={cellIndex}
                                    className="flex justify-between py-1 text-sm text-[var(--text-secondary)]"
                                >
                                    <span className="font-medium text-[var(--text-primary)]/80">
                                        {headers[cellIndex]}
                                    </span>
                                    <span>{cell}</span>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Table;
