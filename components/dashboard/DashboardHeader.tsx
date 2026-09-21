"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon } from "@iconify/react";

type DashboardHeaderProps = {
    onMenuClick: () => void;
    menuOpen: boolean;
    businessName: string;
    businessLogoUrl: string | null;
    userName: string;
    userEmail: string;
};

export default function DashboardHeader({
    onMenuClick,
    menuOpen,
    businessName,
    businessLogoUrl,
    userName,
    userEmail,
}: DashboardHeaderProps) {
    return (
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-gradient-to-r from-[#0B2A55] via-[#0A244B] to-[#081F46] px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={onMenuClick}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
                    aria-label={menuOpen ? "მენიუს დახურვა" : "მენიუს გახსნა"}
                    aria-expanded={menuOpen}
                    aria-controls="mobile-dashboard-sidebar"
                >
                    <Icon
                        icon={
                            menuOpen
                                ? "solar:close-circle-linear"
                                : "solar:hamburger-menu-linear"
                        }
                        className="h-6 w-6"
                    />
                </button>
            </div>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white"
                    aria-label="შეტყობინებები"
                >
                    <Icon
                        icon="solar:bell-bold-duotone"
                        className="h-5 w-5"
                    />
                </button>

                <Link
                    href="/dashboard/profile"
                    className="flex h-12 items-center gap-3 rounded-2xl px-2.5 transition hover:bg-white/10"
                >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                        {businessLogoUrl ? (
                            <Image
                                src={businessLogoUrl}
                                alt={businessName}
                                width={40}
                                height={40}
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <Icon
                                icon="solar:buildings-2-bold-duotone"
                                className="h-5 w-5 text-slate-300"
                            />
                        )}
                    </div>

                    <div className="hidden min-w-0 sm:block">
                        <p className="max-w-[180px] truncate text-sm font-semibold text-white">
                            {businessName}
                        </p>

                        <p className="mt-0.5 max-w-[180px] truncate text-xs text-slate-400">
                            {userName || userEmail}
                        </p>
                    </div>

                    <Icon
                        icon="solar:alt-arrow-down-linear"
                        className="h-4 w-4 shrink-0 text-slate-400"
                    />
                </Link>
            </div>
        </header>
    );
}