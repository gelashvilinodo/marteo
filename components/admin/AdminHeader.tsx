"use client";

import Link from "next/link";
import { Icon } from "@iconify/react";

type AdminHeaderProps = {
    onMenuClick: () => void;
    onNavigate: () => void;
    menuOpen: boolean;
    adminName: string;
    adminEmail: string;
};

export default function AdminHeader({ onMenuClick, onNavigate, menuOpen, adminName, adminEmail }: AdminHeaderProps) {
    return (
        <header className="dashboard-safe-header sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-[#0A244B] px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={onMenuClick}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white lg:hidden"
                    aria-label={menuOpen ? "მენიუს დახურვა" : "მენიუს გახსნა"}
                    aria-expanded={menuOpen}
                    aria-controls="mobile-admin-sidebar"
                >
                    <Icon icon={menuOpen ? "solar:close-circle-linear" : "solar:hamburger-menu-linear"} className="h-6 w-6" />
                </button>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">ადმინი</span>
            </div>

            <div className="flex items-center gap-2">
                <Link
                    href="/admin/notifications"
                    prefetch={false}
                    onClick={onNavigate}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white"
                    aria-label="შეტყობინებები"
                >
                    <Icon icon="solar:bell-bold-duotone" className="h-5 w-5" />
                </Link>

                <div className="flex h-12 items-center gap-3 rounded-2xl px-2.5 ring-1 ring-inset ring-white/10">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                        <Icon icon="solar:shield-user-bold-duotone" className="h-5 w-5 text-accent" />
                    </div>
                    <div className="hidden min-w-0 sm:block">
                        <p className="max-w-[180px] truncate text-sm font-semibold text-white">{adminName || adminEmail}</p>
                        <p className="mt-0.5 max-w-[180px] truncate text-xs text-slate-400">{adminEmail}</p>
                    </div>
                </div>
            </div>
        </header>
    );
}
