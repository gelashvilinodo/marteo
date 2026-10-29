"use client";

import { useEffect, useState } from "react";

import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";

type AdminShellProps = {
    children: React.ReactNode;
    adminName: string;
    adminEmail: string;
};

export default function AdminShell({ children, adminName, adminEmail }: AdminShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!sidebarOpen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") setSidebarOpen(false);
        }
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleEscape);
        };
    }, [sidebarOpen]);

    return (
        <div className="min-h-screen bg-background lg:flex">
            <AdminSidebar />

            <div
                id="mobile-admin-sidebar"
                inert={!sidebarOpen}
                className={[
                    "dashboard-safe-mobile-menu fixed inset-x-0 bottom-0 top-16 z-40 lg:hidden",
                    sidebarOpen ? "pointer-events-auto" : "pointer-events-none",
                ].join(" ")}
            >
                <button
                    type="button"
                    aria-label="მენიუს დახურვა"
                    onClick={() => setSidebarOpen(false)}
                    className={[
                        "absolute inset-0 bg-black/50 transition-opacity duration-300 ease-out",
                        sidebarOpen ? "opacity-100" : "opacity-0",
                    ].join(" ")}
                />
                <div
                    className={[
                        "relative z-50 h-full w-[280px] transform transition-transform duration-300 ease-out",
                        sidebarOpen ? "translate-x-0" : "-translate-x-full",
                    ].join(" ")}
                >
                    <AdminSidebar mobile onSelect={() => setSidebarOpen(false)} />
                </div>
            </div>

            <div className="min-w-0 flex-1">
                <AdminHeader
                    menuOpen={sidebarOpen}
                    onMenuClick={() => setSidebarOpen((current) => !current)}
                    onNavigate={() => setSidebarOpen(false)}
                    adminName={adminName}
                    adminEmail={adminEmail}
                />
                <main className="p-4 sm:p-6 lg:p-8">{children}</main>
            </div>
        </div>
    );
}
