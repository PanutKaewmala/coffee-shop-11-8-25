"use client";

import Image from "next/image";
import type { MenuItem, ServeTypeWithDefault } from "@/lib/types";

interface MenuCardProps {
  item: MenuItem;
}

function getServeNames(item: MenuItem): string[] {
  const raw = (item as unknown as { serveTypes?: unknown }).serveTypes;

  // legacy: serveTypes: string[]
  if (Array.isArray(raw) && (raw.length === 0 || typeof raw[0] === "string")) {
    return raw as string[];
  }

  // current: serve_types: string[] | ServeTypeWithDefault[]
  const st = item.serve_types;
  if (!Array.isArray(st) || st.length === 0) return [];

  if (typeof st[0] === "string") return st as string[];

  return (st as ServeTypeWithDefault[])
    .map((s) => s?.name)
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function getImageUrl(item: MenuItem): string | null {
  const legacy = (item as unknown as { image?: unknown }).image;
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  return typeof item.image_url === "string" && item.image_url.trim()
    ? item.image_url.trim()
    : null;
}

function getCategoryLabel(item: MenuItem): string {
  // menu list/admin feed: category is string | null
  if (typeof item.category === "string" && item.category.trim()) return item.category.trim();

  // legacy/other page: category might be object {name}
  const obj = item.category as unknown;
  if (obj && typeof obj === "object" && "name" in (obj as Record<string, unknown>)) {
    const n = (obj as Record<string, unknown>).name;
    if (typeof n === "string" && n.trim()) return n.trim();
  }

  return "อื่นๆ";
}

export default function MenuCard({ item }: MenuCardProps) {
  const serveNames = getServeNames(item);
  const serveText = serveNames.length ? serveNames.join(" · ") : "No serve options";

  const img = getImageUrl(item);
  const categoryLabel = getCategoryLabel(item);

  return (
    <div
      className="
        card menu-item flex gap-3 items-center p-4 rounded-xl shadow-md
        transition-colors duration-300
        bg-[var(--color-surface)] text-[var(--color-text-primary)]
      "
    >
      {/* Thumbnail */}
      <div className="menu-thumb w-18 h-18 flex-shrink-0 rounded-lg overflow-hidden">
        {img ? (
          <Image
            src={img}
            alt={item.name}
            width={72}
            height={72}
            className="object-cover w-full h-full"
          />
        ) : (
          <div className="w-full h-full bg-zinc-700/30 flex items-center justify-center text-sm text-zinc-400">
            No Image
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Name + Price */}
        <div className="flex justify-between items-center gap-3">
          <div className="font-semibold truncate">{item.name}</div>

          <div className="text-sm text-[var(--color-text-secondary)] shrink-0">
            ฿{Number(item.price ?? 0)}
          </div>
        </div>

        {/* Serve Types */}
        <div className="text-sm text-[var(--color-text-muted)] truncate">
          {serveText}
        </div>

        {/* Category */}
        <div className="text-sm text-[var(--color-text-muted)] mt-0.5 truncate">
          {categoryLabel}
        </div>
      </div>
    </div>
  );
}
