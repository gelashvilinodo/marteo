"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSupportUnread } from "@/components/support/useSupportUnread";
import { Icon } from "@iconify/react";

import LogoutButton from "@/components/auth/LogoutButton";

const navigationItems = [
    { label: "მიმოხილვა", href: "/admin", icon: "solar:home-2-bold-duotone" },
    { label: "ბიზნესები", href: "/admin/businesses", icon: "solar:buildings-2-bold-duotone" },
    { label: "მომხმარებლები", href: "/admin/users", icon: "solar:users-group-rounded-bold-duotone" },
    { label: "შეტყობინებები", href: "/admin/notifications", icon: "solar:bell-bold-duotone" },
    { label: "დახმარება", href: "/admin/support", icon: "solar:chat-round-dots-bold-duotone" },
];



type AdminSidebarProps = {
    mobile?: boolean;
    onSelect?: () => void;
};

export default function AdminSidebar({ mobile = false, onSelect }: AdminSidebarProps) {
    const pathname = usePathname();
    const unread = useSupportUnread("/api/admin/support/unread", pathname, 8000);

    useEffect(() => {
        // The Home Screen app icon shows the count where supported.
        const badge = navigator as Navigator & { setAppBadge?: (count: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
        if (unread) badge.setAppBadge?.(unread).catch(() => undefined);
        else badge.clearAppBadge?.().catch(() => undefined);
    }, [unread]);

    return (
        <aside
            className={[
                "w-[280px] shrink-0 overflow-hidden bg-[#081F46] px-4 py-6",
                mobile
                    ? "flex h-full min-h-0 flex-col pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
                    : "sticky top-0 hidden h-dvh self-start lg:flex lg:flex-col",
            ].join(" ")}
        >
            <div className="shrink-0 px-3">
                <Link href="/admin" prefetch={false} onClick={onSelect} className="flex items-center gap-3">
                    <Image src="/images/logo.svg" alt="MARTEO" width={200} height={60} loading="eager" className="h-16 w-auto" />
                </Link>
                <p className="mt-1 text-xs text-slate-400">ადმინ პანელი</p>
            </div>

            <div className="mt-10 -mr-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
                <nav aria-label="ადმინ პანელი" className="flex flex-col gap-2">
                    {navigationItems.map((item) => {
                        const isActive = item.href === "/admin"
                            ? pathname === "/admin"
                            : pathname === item.href || pathname.startsWith(item.href + "/");

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                prefetch={false}
                                onClick={onSelect}
                                aria-current={isActive ? "page" : undefined}
                                className={[
                                    "relative flex h-[52px] shrink-0 items-center gap-3 px-4 text-sm font-medium transition-colors",
                                    isActive
                                        ? "rounded-l-2xl bg-background text-accent"
                                        : "mr-4 rounded-2xl text-slate-300 hover:bg-white/10 hover:text-white",
                                ].join(" ")}
                            >
                                <Icon icon={item.icon} className="h-5 w-5 shrink-0" />
                                <span>{item.label}</span>
                                {item.href === "/admin/support" && unread > 0 && <span key={unread} className="support-badge-pop ml-auto min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] font-semibold leading-5 text-white" aria-label={`${unread} წაუკითხავი`}>
                                    {unread > 99 ? "99+" : unread}
                                </span>}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="mt-6 shrink-0 border-t border-white/10 pt-4">
                <Link
                    href="/dashboard"
                    prefetch={false}
                    onClick={onSelect}
                    className="flex h-12 w-full items-center gap-3 rounded-2xl px-4 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                    <Icon icon="solar:arrow-left-linear" className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>ბიზნესში დაბრუნება</span>
                </Link>
                <div className="mt-2">
                    <LogoutButton />
                </div>
            </div>
        </aside>
    );
}
