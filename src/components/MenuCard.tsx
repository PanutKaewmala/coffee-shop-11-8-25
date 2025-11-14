"use client";

import Image from "next/image";
import { MenuItem } from "@/lib/types";

interface MenuCardProps {
  item: MenuItem;
}

export default function MenuCard({ item }: MenuCardProps) {
  const serveText = item.serveTypes?.length
    ? item.serveTypes.join(" · ")
    : "No serve options";

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
        {item.image ? (
          <Image
            src={item.image}
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
      <div className="flex-1">
        {/* Name + Price */}
        <div className="flex justify-between items-center">
          <div className="font-semibold">{item.name}</div>

          <div className="text-sm text-[var(--color-text-secondary)]">
            ฿{item.price}
          </div>
        </div>

        {/* Serve Types */}
        <div className="text-sm text-[var(--color-text-muted)]">
          {serveText}
        </div>

        {/* Category (separate line) */}
        <div className="text-sm text-[var(--color-text-muted)] mt-0.5">
          {item.category}
        </div>
      </div>
    </div>
  );
}
