"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSupportUnread } from "@/components/support/useSupportUnread";
import { BusinessModeContext } from "./business/BusinessModeContext";
import { BusinessAccessContext } from "./business/BusinessAccessContext";
import type { BusinessAccess } from "@/lib/business/permissions";
import type { BusinessMode } from "@/lib/business/business-mode";
import type { BusinessOption } from "@/components/dashboard/DashboardHeader";

import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { NewOrderProvider } from "@/components/dashboard/orders/NewOrderProvider";
import DeferredNewOrderDrawer from "@/components/dashboard/orders/DeferredNewOrderDrawer";
import PullToRefresh from "@/components/dashboard/PullToRefresh";
import { AiAssistantInset, AiAssistantProvider } from "@/components/dashboard/ai/AiAssistantProvider";
import AiAssistantPanel from "@/components/dashboard/ai/AiAssistantPanel";
import { PlanProvider } from "@/components/dashboard/plan/PlanContext";
import PlanLockBanner from "@/components/dashboard/plan/PlanLockBanner";
import type { PlanState } from "@/lib/subscription/plan-state";

type DashboardShellProps = {
    children: React.ReactNode;
    businessMode: BusinessMode;
    businessName: string;
    businessLogoUrl: string | null;
    businessId: string;
    businesses: BusinessOption[];
    userName: string;
    userEmail: string;
    isPlatformAdmin?: boolean;
    isOwner?: boolean;
    access: BusinessAccess;
    plan: PlanState;
};

export default function DashboardShell({
    children,
    businessMode,
    businessName,
    businessLogoUrl,
    businessId,
    businesses,
    userName,
    userEmail,
    isPlatformAdmin = false,
    isOwner = true,
    access,
    plan,
}: DashboardShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const supportUnread = useSupportUnread("/api/support/unread", usePathname());

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
        <BusinessModeContext value={businessMode}><BusinessAccessContext value={access}><PlanProvider plan={plan} isOwner={isOwner} businessId={businessId}><AiAssistantProvider enabled={isOwner}><div className="min-h-screen bg-background lg:flex">
            <DashboardSidebar mode={businessMode} supportUnread={supportUnread} />

            <div
                id="mobile-dashboard-sidebar"
                inert={!sidebarOpen}
                className={[
                    "dashboard-safe-mobile-menu fixed inset-x-0 bottom-0 top-16 z-40 lg:hidden",
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
                    <DashboardSidebar
                        mode={businessMode}
                        supportUnread={supportUnread}
                        mobile
                        onSelect={() => setSidebarOpen(false)}
                    />
                </div>
            </div>

            {/* AI პანელის შეკვეთის ბარათებიდანაც იხსნება რედაქტირება, ამიტომ პროვაიდერი პანელსაც მოიცავს. */}
            <NewOrderProvider>
                <AiAssistantInset>
                    <DashboardHeader
                        menuOpen={sidebarOpen}
                        onMenuClick={() => setSidebarOpen((current) => !current)}
                        businessName={businessName}
                        businessLogoUrl={businessLogoUrl}
                        businessId={businessId}
                        businesses={businesses}
                        userName={userName}
                        userEmail={userEmail}
                        isPlatformAdmin={isPlatformAdmin}
                        isOwner={isOwner}
                    />

                    <PlanLockBanner />
                    <PullToRefresh>{children}</PullToRefresh>

                    <DeferredNewOrderDrawer />
                </AiAssistantInset>

                {isOwner && <AiAssistantPanel userName={userName} />}
            </NewOrderProvider>
        </div></AiAssistantProvider></PlanProvider></BusinessAccessContext></BusinessModeContext>
    );
}