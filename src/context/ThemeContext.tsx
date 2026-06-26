"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

function isTheme(value: string | null): value is Theme {
    return value === "light" || value === "dark";
}

function applyThemeToDocument(theme: Theme) {
    if (typeof document === "undefined") return;

    try {
        document.documentElement.classList.toggle("dark", theme === "dark");
    } catch {
        // Keep the React theme state usable when DOM access is unavailable.
    }
}

interface ThemeContextProps {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextProps>({
    theme: "light",
    toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        let savedTheme: Theme | null = null;

        if (typeof window !== "undefined") {
            try {
                const saved = window.localStorage.getItem("theme");
                if (isTheme(saved)) savedTheme = saved;
            } catch {
                // Fall back to the class applied by the pre-hydration script.
            }
        }

        const initialTheme: Theme =
            savedTheme ??
            (typeof document !== "undefined" && document.documentElement.classList.contains("dark")
                ? "dark"
                : "light");

        applyThemeToDocument(initialTheme);
        return initialTheme;
    });

    useEffect(() => {
        applyThemeToDocument(theme);
    }, [theme]);

    const toggleTheme = () => {
        const newTheme: Theme = theme === "light" ? "dark" : "light";
        setTheme(newTheme);
        applyThemeToDocument(newTheme);

        if (typeof window !== "undefined") {
            try {
                window.localStorage.setItem("theme", newTheme);
            } catch {
                // The visual theme still works when storage is unavailable.
            }
        }
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
