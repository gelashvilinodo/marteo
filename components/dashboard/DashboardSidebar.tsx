"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import Image from "next/image";

import LogoutButton from "@/components/auth/LogoutButton";

const navigationItems = [
    {
        label: "მთავარი",
        href: "/dashboard",
        icon: "solar:home-2-bold-duotone",
        locked: false,
    },
    {
        label: "შეკვეთები",
        href: "/dashboard/orders",
        icon: "solar:clipboard-list-bold-duotone",
        locked: false,
    },
    {
        label: "შესყიდვები",
        href: "/dashboard/purchases",
        icon: "solar:cart-large-2-bold-duotone",
        locked: false,
    },
    {
        label: "მომხმარებლები",
        href: "/dashboard/customers",
        icon: "solar:users-group-rounded-bold-duotone",
        locked: false,
    },
    {
        label: "მარაგები",
        href: "/dashboard/inventory",
        icon: "solar:box-bold-duotone",
        locked: false,
    },
    {
        label: "ანალიტიკა",
        href: "/dashboard/analytics",
        icon: "solar:chart-2-bold-duotone",
        locked: false,
    },
    {
        label: "სტატისტიკა",
        href: "/dashboard/statistics",
        icon: "solar:graph-up-bold-duotone",
        locked: false,
    },
    {
        label: "კონტენტ-კალენდარი",
        href: "/dashboard/calendar",
        icon: "solar:calendar-bold-duotone",
        locked: false,
    },

];

type DashboardSidebarProps = {
    mobile?: boolean;
    onSelect?: () => void;
};

export default function DashboardSidebar({
    mobile = false,
    onSelect,
}: DashboardSidebarProps) {
    const pathname = usePathname();

    return (
        <aside
            className={[
                "dashboard-sidebar w-[280px] shrink-0",
                "overflow-hidden bg-[#081F46] px-4 py-6",
                mobile
                    ? "flex h-full min-h-0 flex-col"
                    : "sticky top-0 hidden h-dvh self-start lg:flex lg:flex-col",
            ].join(" ")}
        >
            <style>{`
    .dashboard-sidebar .sidebar-navigation {
    direction: rtl;
    scrollbar-width: thin;
    scrollbar-color: rgba(255,255,255,.22) transparent;
}

.dashboard-sidebar .sidebar-navigation nav {
    direction: ltr;
}

    .dashboard-sidebar .sidebar-navigation::-webkit-scrollbar {
        width: 5px;
    }

    .dashboard-sidebar .sidebar-navigation::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,.22);
        border-radius: 999px;
    }

    @media (max-height: 760px) {
        .dashboard-sidebar {
            padding-top: 16px;
            padding-bottom: 16px;
        }

        .dashboard-sidebar .sidebar-navigation {
            margin-top: 20px;
        }

        .dashboard-sidebar .sidebar-navigation nav {
            gap: 4px;
        }

        .dashboard-sidebar .sidebar-navigation-link {
            height: 44px;
        }

        .dashboard-sidebar .sidebar-footer {
            margin-top: 12px;
            padding-top: 12px;
        }
    }
`}</style>
            <div className="shrink-0 px-3">
                <Link
                    href="/dashboard"
                    onClick={onSelect}
                    className="flex items-center gap-3"
                >
                    <Image
                        src="/images/logo.svg"
                        alt="MARTEO"
                        width={200}
                        height={60}
                        loading="eager"
                        className="h-16 w-auto"
                    />
                </Link>
            </div>

            <div
                className={
                    "sidebar-navigation mt-10 -mr-4 min-h-0 flex-1 " +
                    "overflow-x-hidden overflow-y-auto overscroll-contain"
                }
            >
                <nav className="flex flex-col gap-2">
                    {navigationItems.map((item) => {
                        const isActive =
                            item.href === "/dashboard"
                                ? pathname === "/dashboard"
                                : pathname.startsWith(item.href);

                        if (item.locked) {
                            return (
                                <div
                                    key={item.href}
                                    className="flex h-12 cursor-not-allowed items-center gap-3 rounded-2xl px-4 text-slate-500 opacity-60"
                                >
                                    <Icon
                                        icon={item.icon}
                                        className="h-5 w-5 shrink-0"
                                    />

                                    <span className="text-sm font-medium">
                                        {item.label}
                                    </span>

                                    <div className="ml-auto flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
                                        <Icon
                                            icon="solar:lock-keyhole-bold"
                                            className="h-3.5 w-3.5"
                                        />

                                        <span className="text-[10px] font-semibold uppercase">
                                            PRO
                                        </span>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onSelect}
                                className={[
                                    "sidebar-navigation-link relative flex h-[52px] shrink-0 items-center gap-3 px-4 text-sm font-medium transition-all duration-200",
                                    isActive
                                        ? "rounded-l-2xl bg-background text-accent"
                                        : "mr-4 rounded-2xl text-slate-300 hover:bg-white/10 hover:text-white",
                                ].join(" ")}
                            >
                                <Icon
                                    icon={item.icon}
                                    className="h-5 w-5 shrink-0"
                                />

                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="sidebar-footer mt-6 shrink-0 border-t border-white/10 pt-4">
                <button
                    type="button"
                    className={
                        "flex h-12 w-full items-center gap-3 rounded-2xl " +
                        "px-4 text-left text-sm font-medium text-slate-300 " +
                        "transition hover:bg-white/10 hover:text-white"
                    }
                >
                    <Icon
                        icon="solar:chat-round-dots-bold-duotone"
                        className="h-5 w-5 shrink-0"
                        aria-hidden="true"
                    />

                    <span>დახმარება</span>
                </button>

                <div className="mt-2">
                    <LogoutButton />
                </div>
            </div>
        </aside>
    );
}