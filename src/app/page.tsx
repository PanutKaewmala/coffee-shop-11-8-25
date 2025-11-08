"use client";

import { useTheme } from "@/context/ThemeContext";
import Hero from "@/components/Hero";
import ContactSection from "@/app/contact/page";
import NewsSection from "@/app/news/page";
import MenuSection from "@/app/menu/page";

export default function HomePage() {
  const { theme } = useTheme();

  return (
    <div
      className="flex flex-col min-h-screen font-sans overflow-x-hidden bg-background text-foreground transition-colors duration-300"
    >
      <main className="flex-1 px-4 sm:px-6 lg:px-auto max-w-7xl mx-auto">
        <Hero />
        <MenuSection />
        <NewsSection />
        <ContactSection />
      </main>
    </div>
  );
}
