"use client";

import { useRef, useState } from "react";

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
        <div>
            <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
                {loading ? "მიმდინარეობს..." : "გამოსვლა"}
            </button>

            {error && (
                <p role="alert" className="mt-2 text-xs text-red-500">
                    {error}
                </p>
            )}
        </div>
    );
}