"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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
    const [accountOpen, setAccountOpen] = useState(false);
    const router = useRouter();
    const accountRef = useRef<HTMLDivElement>(null);
    const accountButtonRef = useRef<HTMLButtonElement>(null);
    const accountPanelId = useId();

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
        {
            label: "ბიზნესის პარამეტრები",
            icon: "solar:settings-bold-duotone",
            href: "/dashboard/business-settings",
        },
        {
            label: "პაკეტი და გადახდები",
            icon: "solar:wallet-bold-duotone",
        },
    ];
    return (
        <header className="dashboard-safe-header sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-gradient-to-r from-[#0B2A55] via-[#0A244B] to-[#081F46] px-4 sm:px-6 lg:px-8">
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
                            "[--account-panel-height:216px]",
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
                            height: accountOpen
                                ? "var(--account-panel-height)"
                                : 48,
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

                            {accountItems.map((item, index) => (
                                <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => {
                                        setAccountOpen(false);

                                        if (item.href) {
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