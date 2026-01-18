"use client";

import React from "react";

interface TableProps {
    headers: string[];
    data: React.ReactNode[][];
    rowClassName?: (rowIndex: number) => string | undefined;
    cellClassName?: (rowIndex: number, colIndex: number) => string | undefined;
    onRowClick?: (rowIndex: number) => void;
}

function isReactElement(x: unknown): x is React.ReactElement {
    return React.isValidElement(x);
}

function safeStringify(value: unknown, max = 120) {
    try {
        const s = JSON.stringify(value);
        if (!s) return "-";
        return s.length > max ? s.slice(0, max) + "…" : s;
    } catch {
        return "[unserializable]";
    }
}

function renderCell(cell: React.ReactNode) {
    if (cell === null || cell === undefined || cell === false) return "-";

    // React element (e.g. <img/>, <div/>)
    if (isReactElement(cell)) return cell;

    // primitive
    if (typeof cell === "string" || typeof cell === "number") return cell;

    // array of nodes
    if (Array.isArray(cell)) {
        // if it's array of primitives/elements, render them
        return (
            <span className="inline-flex flex-wrap gap-1">
                {cell.map((c, i) => (
                    <span key={i}>{renderCell(c)}</span>
                ))}
            </span>
        );
    }

    // object / everything else -> stringify (prevents [object Object])
    if (typeof cell === "object") {
        return (
            <span className="font-mono text-xs text-[var(--text-muted)]">
                {safeStringify(cell)}
            </span>
        );
    }

    // fallback
    return String(cell);
}

const Table: React.FC<TableProps> = ({
    headers,
    data,
    rowClassName,
    cellClassName,
    onRowClick,
}) => {
    return (
        <div className="w-full">
            {/* Desktop */}
            <div className="hidden sm:block overflow-visible">
                <table
                    className="
            min-w-full
            border border-[var(--text-muted)]/20
            divide-y divide-[var(--text-muted)]/20
            rounded-xl
            overflow-visible
          "
                >
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
                                    onClick={() => onRowClick?.(rowIndex)}
                                    className={`
                    group relative
                    hover:bg-[var(--accent)]/10 transition-colors
                    ${onRowClick ? "cursor-pointer" : ""}
                    ${rowClassName ? rowClassName(rowIndex) : ""}
                  `}
                                >
                                    {row.map((cell, colIndex) => (
                                        <td
                                            key={colIndex}
                                            className={`
                        px-4 py-2.5 text-sm text-[var(--text-secondary)]
                        relative
                        ${cellClassName ? cellClassName(rowIndex, colIndex) : ""}
                      `}
                                        >
                                            {renderCell(cell)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile */}
            <div className="sm:hidden space-y-4">
                {data.length === 0 ? (
                    <div className="text-center text-[var(--text-muted)]">
                        No data available
                    </div>
                ) : (
                    data.map((row, rowIndex) => (
                        <div
                            key={rowIndex}
                            onClick={() => onRowClick?.(rowIndex)}
                            className={`
                border border-[var(--text-muted)]/20 rounded-xl p-4 bg-[var(--surface)] shadow-sm
                ${onRowClick ? "cursor-pointer" : ""}
                ${rowClassName ? rowClassName(rowIndex) : ""}
              `}
                        >
                            {row.map((cell, colIndex) => (
                                <div
                                    key={colIndex}
                                    className="flex justify-between gap-3 py-1 text-sm text-[var(--text-secondary)]"
                                >
                                    <span className="font-medium text-[var(--text-primary)]/80">
                                        {headers[colIndex]}
                                    </span>
                                    <span
                                        className={
                                            cellClassName ? cellClassName(rowIndex, colIndex) : ""
                                        }
                                    >
                                        {renderCell(cell)}
                                    </span>
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
