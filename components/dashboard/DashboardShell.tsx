"use client";

import { useEffect, useState } from "react";

import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { NewOrderProvider } from "@/components/dashboard/orders/NewOrderProvider";
import NewOrderDrawer from "@/components/dashboard/orders/NewOrderDrawer";

type DashboardShellProps = {
    children: React.ReactNode;
    businessName: string;
    businessLogoUrl: string | null;
    userName: string;
    userEmail: string;
};

export default function DashboardShell({
    children,
    businessName,
    businessLogoUrl,
    userName,
    userEmail,
}: DashboardShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!sidebarOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [sidebarOpen]);

    return (
        <div className="min-h-screen bg-background lg:flex">
            <DashboardSidebar />

            <div
                className={[
                    "fixed inset-0 z-40 lg:hidden",
                    sidebarOpen
                        ? "pointer-events-auto"
                        : "pointer-events-none",
                ].join(" ")}
            >
                <button
                    type="button"
                    aria-label="მენიუს დახურვა"
                    onClick={() => setSidebarOpen(false)}
                    className={[
                        "absolute inset-0 bg-black/50 transition-opacity duration-300 ease-out",
                        sidebarOpen
                            ? "opacity-100"
                            : "opacity-0",
                    ].join(" ")}
                />

                <div
                    className={[
                        "relative z-50 h-full w-[280px] transform transition-transform duration-300 ease-out",
                        sidebarOpen
                            ? "translate-x-0"
                            : "-translate-x-full",
                    ].join(" ")}
                >
                    <DashboardSidebar mobile />
                </div>
            </div>

            <div className="min-w-0 flex-1">
                <DashboardHeader
                    onMenuClick={() => setSidebarOpen(true)}
                    businessName={businessName}
                    businessLogoUrl={businessLogoUrl}
                    userName={userName}
                    userEmail={userEmail}
                />

                <NewOrderProvider>
                    {children}

                    <NewOrderDrawer />
                </NewOrderProvider>
            </div>
        </div>
    );
}