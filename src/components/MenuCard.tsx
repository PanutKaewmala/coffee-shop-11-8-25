"use client";
import Image from "next/image";

// ประกาศ type ภายในไฟล์เลย
export interface MenuItem {
  id: number;
  name: string;
  price: number;
  type: string;
  cat: string;
  img: string;
}

interface MenuCardProps {
  item: MenuItem;
}

export default function MenuCard({ item }: MenuCardProps) {
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
        <Image
          src={item.img}
          alt={item.name}
          width={72}
          height={72}
          className="object-cover w-full h-full"
        />
      </div>

      {/* Info */}
      <div className="flex-1">
        <div className="flex justify-between items-center">
          <div className="font-semibold">{item.name}</div>
          <div className="text-sm text-[var(--color-text-secondary)]">
            ฿{item.price}
          </div>
        </div>
        <div className="text-sm text-[var(--color-text-muted)]">
          {item.type} · {item.cat}
        </div>
      </div>
    </div>
  );
}
