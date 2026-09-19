"use client";

import { useRef, useState } from "react";
import { Icon } from "@iconify/react";

export default function LogoutButton() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const requestLocked = useRef(false);

    const handleLogout = async () => {
        if (requestLocked.current) return;

        requestLocked.current = true;
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin",
            });

            if (!response.ok) {
                throw new Error("ანგარიშიდან გამოსვლა ვერ მოხერხდა.");
            }

            window.location.replace("/login");
            return;
        } catch {
            setError("ანგარიშიდან გამოსვლა ვერ მოხერხდა. სცადეთ ხელახლა.");
        }

        requestLocked.current = false;
        setLoading(false);
    };

    return (
        <div className="w-full">
            <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="flex h-12 w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
                <Icon
                    icon="solar:logout-2-bold-duotone"
                    className="h-5 w-5 shrink-0"
                    aria-hidden="true"
                />
                <span>{loading ? "მიმდინარეობს..." : "გამოსვლა"}</span>
            </button>

            {error && (
                <p role="alert" className="mt-2 text-xs text-red-500">
                    {error}
                </p>
            )}
        </div>
    );
}