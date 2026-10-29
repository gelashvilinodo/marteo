export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "marteo-theme";

export function normalizeTheme(value: string | null): ThemePreference {
    return value === "light" || value === "dark"
        ? value
        : "system";
}

export function applyTheme(theme: ThemePreference) {
    if (theme === "system") {
        document.documentElement.removeAttribute("data-theme");
    } else {
        document.documentElement.setAttribute("data-theme", theme);
    }
}

// აბრუნებს false-ს, თუ ბრაუზერმა არჩევანის დამახსოვრება ვერ შეძლო.
export function saveTheme(theme: ThemePreference) {
    try {
        if (theme === "system") {
            localStorage.removeItem(THEME_STORAGE_KEY);
        } else {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        }

        return true;
    } catch {
        return false;
    }
}
