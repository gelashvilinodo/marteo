"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import AdminInviteDialog from "./AdminInviteDialog";

type MenuItem = { label: string; icon: string; href?: string; onSelect?: () => void; danger?: boolean };

// ადმინის პროფილის ჩამოსაშლელი: ადმინის დამატება (მხოლოდ მფლობელს), ადმინები, უსაფრთხოება, გამოსვლა.
export default function AdminProfileMenu({ adminName, adminEmail, isOwner, onNavigate }: {
    adminName: string; adminEmail: string; isOwner: boolean; onNavigate: () => void;
}) {
    const router = useRouter();
    const panelId = useId();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            setOpen(false);
            buttonRef.current?.focus();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);

    const logout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
            if (!response.ok) throw new Error();
            window.location.replace("/login");
        } catch { setLoggingOut(false); }
    };

    const items: MenuItem[] = [
        ...(isOwner ? [{ label: "ადმინის დამატება", icon: "solar:user-plus-bold-duotone", onSelect: () => setInviteOpen(true) }] : []),
        { label: "ადმინები", icon: "solar:users-group-two-rounded-bold-duotone", href: "/admin/admins" },
        { label: "უსაფრთხოება", icon: "solar:shield-keyhole-bold-duotone", href: "/admin/security" },
        { label: "ბიზნეს პანელი", icon: "solar:buildings-2-bold-duotone", href: "/dashboard" },
        { label: loggingOut ? "გამოსვლა…" : "გამოსვლა", icon: "solar:logout-2-bold-duotone", onSelect: () => void logout(), danger: true },
    ];

    return <>
        <div className="relative"
            onBlur={event => {
                const next = event.relatedTarget;
                if (!(next instanceof Node) || !event.currentTarget.contains(next)) setOpen(false);
            }}>
            <button ref={buttonRef} type="button" onClick={() => setOpen(current => !current)}
                aria-label="ანგარიშის მენიუ" aria-expanded={open} aria-controls={panelId}
                className="flex h-12 items-center gap-3 rounded-2xl px-2.5 text-left ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-accent">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                    <Icon icon="solar:shield-user-bold-duotone" className="h-5 w-5 text-accent" />
                </span>
                <span className="hidden min-w-0 sm:block">
                    <span className="block max-w-[180px] truncate text-sm font-semibold text-white">{adminName || adminEmail}</span>
                    <span className="mt-0.5 block max-w-[180px] truncate text-xs text-slate-400">{adminEmail}</span>
                </span>
                <Icon icon="solar:alt-arrow-down-linear" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
            </button>

            <div id={panelId} inert={!open} aria-hidden={!open}
                className={[
                    "absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(280px,calc(100vw-2rem))] origin-top-right rounded-2xl bg-[#0A244B] p-2 shadow-2xl ring-1 ring-inset ring-white/10",
                    "transition duration-200 ease-out motion-reduce:transition-none",
                    open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
                ].join(" ")}>
                <div className="border-b border-white/10 px-2.5 pb-2 pt-1 sm:hidden">
                    <p className="truncate text-sm font-semibold text-white">{adminName || adminEmail}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">{adminEmail}</p>
                </div>
                {items.map((item, index) => <button key={item.href ?? item.icon} type="button"
                    onClick={() => {
                        setOpen(false);
                        if (item.onSelect) item.onSelect();
                        else if (item.href) { onNavigate(); router.push(item.href); }
                    }}
                    className={[
                        "relative flex h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm font-medium transition-colors",
                        "hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent",
                        item.danger ? "text-red-300 hover:text-red-200" : "text-slate-200 hover:text-white",
                        index < items.length - 1 ? "after:pointer-events-none after:absolute after:bottom-0 after:left-11 after:right-3 after:h-px after:bg-white/10 after:content-['']" : "",
                    ].join(" ")}>
                    <Icon icon={item.icon} className={`h-5 w-5 shrink-0 ${item.danger ? "text-red-300" : "text-accent"}`} aria-hidden="true" />
                    {item.label}
                </button>)}
            </div>
        </div>
        {isOwner && <AdminInviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />}
    </>;
}
