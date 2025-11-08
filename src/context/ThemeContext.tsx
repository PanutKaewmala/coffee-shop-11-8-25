"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextProps {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextProps>({
    theme: "light",
    toggleTheme: () => { },
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>("light");

    // โหลด theme จาก localStorage แบบปลอดภัย
    useEffect(() => {
        const saved = localStorage.getItem("theme") as Theme | null;
        if (saved) {
            // อัปเดต DOM ก่อน แล้วค่อยอัปเดต state แบบ asynchronous
            document.documentElement.classList.toggle("dark", saved === "dark");
            setTimeout(() => setTheme(saved), 0);
        }
    }, []);

    const toggleTheme = () => {
        const newTheme: Theme = theme === "light" ? "dark" : "light";
        setTheme(newTheme);
        localStorage.setItem("theme", newTheme);
        document.documentElement.classList.toggle("dark", newTheme === "dark");
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
