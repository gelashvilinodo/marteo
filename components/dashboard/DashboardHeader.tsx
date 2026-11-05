"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { NOTIFICATIONS_SEEN } from "@/lib/notifications/events";
import AiHeaderButton from "@/components/dashboard/ai/AiHeaderButton";

export type BusinessOption = {
    id: string;
    name: string;
    logoUrl: string | null;
    role: string;
    frozen?: boolean;
};

// Rows of the business switcher shown before it scrolls.
const VISIBLE_BUSINESS_ROWS = 4;

type DashboardHeaderProps = {
    onMenuClick: () => void;
    menuOpen: boolean;
    businessName: string;
    businessLogoUrl: string | null;
    businessId: string;
    businesses: BusinessOption[];
    userName: string;
    userEmail: string;
    isPlatformAdmin?: boolean;
    isOwner?: boolean;
};

export default function DashboardHeader({
    onMenuClick,
    menuOpen,
    businessName,
    businessLogoUrl,
    businessId,
    businesses,
    userName,
    userEmail,
    isPlatformAdmin = false,
    isOwner = true,
}: DashboardHeaderProps) {
    const [accountOpen, setAccountOpen] = useState(false);
    const router = useRouter();
    const accountRef = useRef<HTMLDivElement>(null);
    const accountButtonRef = useRef<HTMLButtonElement>(null);
    const accountPanelId = useId();
    const pathname = usePathname();
    const [hasUnread, setHasUnread] = useState(false);
    const [switchingId, setSwitchingId] = useState<string | null>(null);
    const [failedSwitchId, setFailedSwitchId] = useState<string | null>(null);
    const canSwitchBusiness = businesses.length > 1;

    async function switchBusiness(id: string) {
        if (id === businessId || switchingId) return;
        setSwitchingId(id);
        setFailedSwitchId(null);
        try {
            const response = await fetch("/api/business/switch", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ businessId: id }),
            });
            if (!response.ok) throw new Error("Business switch failed");
            // A full load drops every client cache of the previous business.
            window.location.assign("/dashboard");
        } catch {
            setSwitchingId(null);
            setFailedSwitchId(id);
        }
    }

    async function leaveBusiness() {
        if (!window.confirm(`ნამდვილად ტოვებთ ბიზნესს „${businessName}“? დაბრუნება მხოლოდ ახალი მოწვევით შეიძლება.`)) return;
        const response = await fetch("/api/business/members/leave", { method: "POST", credentials: "same-origin" }).catch(() => null);
        const data = response ? await response.json().catch(() => ({})) as { message?: string } : {};
        if (!response?.ok) {
            window.alert(data.message || "ბიზნესის დატოვება ვერ მოხერხდა. სცადეთ ხელახლა.");
            return;
        }
        window.location.assign("/dashboard");
    }

    // Checked on page change and when the tab becomes visible again: no polling interval.
    useEffect(() => {
        const controller = new AbortController();
        const check = () => {
            if (document.visibilityState !== "visible") return;
            fetch("/api/notifications/unread", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
                .then(response => response.ok ? response.json() as Promise<{ unread?: number }> : null)
                .then((data: { unread?: number } | null) => { if (data) setHasUnread((data.unread ?? 0) > 0); })
                .catch(() => {});
        };
        const seen = () => setHasUnread(false);
        check();
        document.addEventListener("visibilitychange", check);
        window.addEventListener(NOTIFICATIONS_SEEN, seen);
        return () => {
            controller.abort();
            document.removeEventListener("visibilitychange", check);
            window.removeEventListener(NOTIFICATIONS_SEEN, seen);
        };
    }, [pathname]);

    useEffect(() => {
        if (!accountOpen) return;

        function handlePointer(event: PointerEvent) {
            if (
                event.target instanceof Node &&
                !accountRef.current?.contains(event.target)
            ) {
                setAccountOpen(false);
            }
        }

        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setAccountOpen(false);
                accountButtonRef.current?.focus();
            }
        }

        document.addEventListener("pointerdown", handlePointer);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("pointerdown", handlePointer);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [accountOpen]);

    const accountItems = [
        {
            label: "ჩემი პროფილი",
            icon: "solar:user-circle-bold-duotone",
            href: "/dashboard/profile",
        },
        // პარამეტრები და გადახდა მფლობელის საქმეა; თანამშრომელი სხვის გეგმას არ იხდის.
        ...(isOwner ? [
            {
                label: "ბიზნესის პარამეტრები",
                icon: "solar:settings-bold-duotone",
                href: "/dashboard/business-settings",
            },
            {
                label: "პაკეტი და გადახდები",
                icon: "solar:wallet-bold-duotone",
                href: "/dashboard/billing",
            },
        ] : [
            {
                label: "საკუთარი ბიზნესის შექმნა",
                icon: "solar:buildings-2-bold-duotone",
                href: "/business/new",
            },
            {
                label: "ბიზნესის დატოვება",
                icon: "solar:logout-3-bold-duotone",
                onSelect: leaveBusiness,
            },
        ]),
        ...(isPlatformAdmin ? [{ label: "ადმინ პანელი", icon: "solar:shield-user-bold-duotone", href: "/admin" }] : []),
    ];
    const panelHeight =
        (isOwner ? 216 : 216) +
        (isPlatformAdmin ? 48 : 0) +
        (canSwitchBusiness ? 41 + Math.min(businesses.length, VISIBLE_BUSINESS_ROWS) * 48 : 0);

    return (
        <header className="dashboard-safe-header sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-[#0A244B] px-4 sm:px-6 lg:px-8">
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
                {isOwner && <AiHeaderButton />}

                <Link
                    href="/dashboard/notifications"
                    prefetch={false}
                    className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white"
                    aria-label={hasUnread ? "შეტყობინებები (ახალი)" : "შეტყობინებები"}
                >
                    <Icon
                        icon="solar:bell-bold-duotone"
                        className="h-5 w-5"
                    />
                    {hasUnread && <span aria-hidden="true" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-[#0A244B]" />}
                </Link>

                <div
                    ref={accountRef}
                    className="relative isolate h-12"
                    onBlur={(event) => {
                        const nextTarget = event.relatedTarget;

                        if (
                            !(nextTarget instanceof Node) ||
                            !event.currentTarget.contains(nextTarget)
                        ) {
                            setAccountOpen(false);
                        }
                    }}
                >
                    {/* იზრდება მხოლოდ ფონი და კონტეინერი */}
                    <div
                        className={[
                            "absolute right-0 top-0 z-0 overflow-hidden rounded-2xl ring-1 ring-inset ring-white/10",
                            "transition-[width,height,background-color,box-shadow]",
                            "duration-[550ms] ease-in-out",
                            "motion-reduce:transition-none",
                            accountOpen ? "shadow-2xl" : "",
                        ].join(" ")}
                        style={{
                            backgroundColor: "#0A244B",
                            width: accountOpen
                                ? "max(100%, min(320px, calc(100vw - 2rem)))"
                                : "100%",
                            height: accountOpen ? panelHeight : 48,
                        }}
                    >
                        <div
                            aria-hidden={!accountOpen}
                            className={[
                                "pointer-events-none absolute right-24 top-0",
                                "flex h-12 w-[max(0px,min(208px,calc(100vw-9rem)))]",
                                "flex-col justify-center sm:hidden",
                            ].join(" ")}
                        >
                            <p
                                title={businessName}
                                className="truncate text-sm font-semibold text-white"
                            >
                                {businessName}
                            </p>

                            <p
                                title={userName || userEmail}
                                className="mt-0.5 truncate text-xs text-slate-300"
                            >
                                {userName || userEmail}
                            </p>
                        </div>
                        <div
                            id={accountPanelId}
                            inert={!accountOpen}
                            aria-hidden={!accountOpen}
                            className={[
                                "absolute right-0 top-[calc(3.5rem_-_0.5px)]",
                                "w-[min(320px,calc(100vw-2rem))]",
                                "border-t border-white/15 px-2 pb-2",
                                accountOpen ? "" : "pointer-events-none",
                            ].join(" ")}
                        >
                            {canSwitchBusiness && (
                                <div className="border-b border-white/15 pb-2">
                                    <p className="flex h-8 items-end px-2.5 pb-1 text-xs font-medium text-slate-400">
                                        ბიზნესის შეცვლა
                                    </p>

                                    <div
                                        className="overflow-y-auto overscroll-contain"
                                        style={{ maxHeight: VISIBLE_BUSINESS_ROWS * 48 }}
                                    >
                                        {businesses.map((business) => {
                                            const active = business.id === businessId;
                                            const switching = business.id === switchingId;
                                            const failed = business.id === failedSwitchId;

                                            return (
                                                <button
                                                    key={business.id}
                                                    type="button"
                                                    disabled={active || business.frozen || switchingId !== null}
                                                    aria-current={active ? "true" : undefined}
                                                    onClick={() => switchBusiness(business.id)}
                                                    className={[
                                                        "flex h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-medium transition-colors",
                                                        "focus-visible:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent",
                                                        active
                                                            ? "cursor-default text-white"
                                                            : "text-slate-200 hover:bg-white/10 hover:text-white disabled:cursor-wait",
                                                    ].join(" ")}
                                                >
                                                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg ${business.logoUrl ? "bg-white" : "bg-white/10"}`}>
                                                        {business.logoUrl ? (
                                                            <Image
                                                                src={business.logoUrl}
                                                                alt=""
                                                                width={28}
                                                                height={28}
                                                                className="h-full w-full object-cover"
                                                            />
                                                        ) : (
                                                            <Icon
                                                                icon="solar:buildings-2-bold-duotone"
                                                                className="h-4 w-4 text-slate-300"
                                                                aria-hidden="true"
                                                            />
                                                        )}
                                                    </span>

                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate">{business.name}</span>
                                                        <span className="block truncate text-xs font-normal text-slate-400">
                                                            {business.frozen ? "გაყინულია: გეგმის ლიმიტი" : business.role === "MEMBER" ? "თანამშრომელი" : "მფლობელი"}
                                                        </span>
                                                    </span>

                                                    {active && (
                                                        <Icon icon="solar:check-circle-bold" className="h-5 w-5 shrink-0 text-accent" aria-label="მიმდინარე ბიზნესი" />
                                                    )}
                                                    {switching && (
                                                        <Icon icon="solar:refresh-circle-bold" className="h-5 w-5 shrink-0 animate-spin text-slate-300" aria-label="გადართვა..." />
                                                    )}
                                                    {failed && (
                                                        <Icon icon="solar:danger-circle-bold" className="h-5 w-5 shrink-0 text-danger" aria-label="გადართვა ვერ მოხერხდა, სცადეთ ხელახლა" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {accountItems.map((item, index) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => {
                                        setAccountOpen(false);

                                        if ("onSelect" in item && item.onSelect) {
                                            void item.onSelect();
                                        } else if (item.href) {
                                            router.push(item.href);
                                        } else {
                                            accountButtonRef.current?.focus();
                                        }
                                    }}
                                    className={[
                                        "relative flex h-12 w-full items-center justify-start gap-3",
                                        "rounded-xl px-2.5 text-left text-sm",
                                        "font-medium text-slate-200 transition-colors",
                                        "hover:bg-white/10 hover:text-white",
                                        "focus-visible:bg-white/10",
                                        "focus-visible:outline-2 focus-visible:outline-accent",
                                        index < accountItems.length - 1
                                            ? "after:pointer-events-none after:absolute after:bottom-0 after:left-11 after:right-3 after:h-px after:bg-white/10 after:content-['']"
                                            : "",
                                    ].join(" ")}
                                >
                                    <Icon
                                        icon={item.icon}
                                        className="h-5 w-5 shrink-0 text-accent"
                                        aria-hidden="true"
                                    />

                                    <span className="text-left">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ლოგო და სახელები ინარჩუნებს ზომასა და პოზიციას */}
                    <button
                        ref={accountButtonRef}
                        type="button"
                        onClick={() => setAccountOpen((current) => !current)}
                        aria-label="ანგარიშის მენიუ"
                        aria-expanded={accountOpen}
                        aria-controls={accountPanelId}
                        className={[
                            "relative z-10 flex h-12 items-center gap-3",
                            "rounded-2xl px-2.5 text-left transition-colors",
                            "focus-visible:outline-2 focus-visible:outline-accent",
                            "bg-transparent",
                        ].join(" ")}
                    >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl ${businessLogoUrl ? "bg-white" : "bg-white/10"}`}>
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
                            className={[
                                "h-4 w-4 shrink-0 text-slate-400",
                                "transition-transform duration-300",
                                "motion-reduce:transition-none",
                                accountOpen ? "rotate-180" : "",
                            ].join(" ")}
                        />
                    </button>
                </div>
            </div>
        </header>
    );
}