import Image from "next/image";
import { Icon } from "@/components/shared/Icon";
// შელი ორივე დემოში გამოიყენება: მას მხოლოდ ეს ველები სჭირდება.
export type ShellFrame = {
    page: string;
    pressed: (target: string) => boolean;
    near: (target: string) => boolean;
    menuOpen: boolean;
};

type Frame = ShellFrame;

type NavId = "home" | "orders" | "purchases" | "production" | "customers" | "inventory" | "analytics" | "statistics" | "calendar";

const nav: { id: NavId; label: string; icon: string; group?: boolean }[] = [
    { id: "home", label: "მთავარი", icon: "solar:home-2-bold-duotone" },
    { id: "orders", label: "შეკვეთები", icon: "solar:clipboard-list-bold-duotone" },
    { id: "purchases", label: "შესყიდვები", icon: "solar:cart-large-2-bold-duotone", group: true },
    { id: "production", label: "წარმოება", icon: "solar:structure-bold-duotone" },
    { id: "customers", label: "მომხმარებლები", icon: "solar:users-group-rounded-bold-duotone" },
    { id: "inventory", label: "მარაგები", icon: "solar:box-bold-duotone" },
    { id: "analytics", label: "ანალიტიკა", icon: "solar:chart-2-bold-duotone" },
    { id: "statistics", label: "სტატისტიკა", icon: "solar:graph-up-bold-duotone" },
    { id: "calendar", label: "კონტენტ-კალენდარი", icon: "solar:calendar-bold-duotone" },
];

export const business = { name: "თიხა და ცვილი", owner: "ნიკა" };

// რეალური DashboardSidebar-ის ასლი (280px, #081F46).
export function Sidebar({ frame, mobile = false }: { frame: Frame; mobile?: boolean }) {
    const active = frame.page as NavId;

    return (
        <aside className={`flex w-[280px] shrink-0 flex-col overflow-hidden bg-[#081F46] px-4 py-6 ${mobile ? "h-full" : ""}`}>
            <div className="shrink-0 px-3">
                <Image src="/images/logo.svg" alt="" width={200} height={60} className="h-16 w-auto" />
            </div>

            <nav className="-mr-4 mt-5 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                {nav.map(item => {
                    const isActive = item.id === active;
                    const demo = item.id === "inventory" ? "nav-inventory" : item.id === "analytics" ? "nav-analytics" : undefined;
                    const pressed = demo ? frame.pressed(demo) : false;
                    const hover = demo ? frame.near(demo) && !isActive : false;

                    return (
                        <span
                            key={item.id}
                            data-demo={demo}
                            className={`relative flex h-[52px] shrink-0 items-center gap-3 px-4 text-sm font-medium transition-all duration-200 ${
                                isActive ? "rounded-l-2xl bg-background text-accent" : `mr-4 rounded-2xl ${hover ? "bg-white/10 text-white" : "text-slate-300"}`
                            } ${pressed ? "scale-[0.97]" : ""}`}
                        >
                            <Icon icon={item.icon} className="h-5 w-5 shrink-0" />
                            <span>{item.label}</span>
                            {item.group && <Icon icon="solar:alt-arrow-down-linear" className="mr-4 ml-auto h-4 w-4" />}
                        </span>
                    );
                })}
            </nav>

            {!mobile && <div className="mt-6 shrink-0 border-t border-white/10 pt-4">
                <span className="flex h-12 items-center gap-3 rounded-2xl px-4 text-sm font-medium text-slate-300">
                    <Icon icon="solar:chat-round-dots-bold-duotone" className="h-5 w-5" />
                    დახმარება
                </span>
                <span className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-slate-200">
                    <Icon icon="solar:logout-2-bold-duotone" className="h-5 w-5" />
                    გამოსვლა
                </span>
            </div>}
        </aside>
    );
}

function BusinessSwitcher({ compact }: { compact?: boolean }) {
    return (
        <span className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-1.5 pr-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-slate-200">
                <Icon icon="solar:buildings-2-bold-duotone" className="h-6 w-6" />
            </span>
            {!compact && (
                <span className="leading-tight">
                    <span className="block text-sm font-semibold text-white">{business.name}</span>
                    <span className="block text-xs text-slate-400">{business.owner}</span>
                </span>
            )}
            <Icon icon="solar:alt-arrow-down-linear" className="ml-1 h-4 w-4 text-slate-400" />
        </span>
    );
}

function Bell() {
    return (
        <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-300">
            <Icon icon="solar:bell-bold-duotone" className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-[#0A244B]" />
        </span>
    );
}

export function Header({ frame, m }: { frame: Frame; m: boolean }) {
    if (m) {
        const pressed = frame.pressed("menu");
        return (
            <header className="relative z-20 flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#0A244B] px-4">
                <span
                    data-demo="menu"
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 transition-transform ${pressed ? "scale-90 bg-white/10" : ""}`}
                >
                    <Icon icon="solar:hamburger-menu-linear" className="h-6 w-6" />
                </span>
                <span className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[11px] font-black text-[#0A244B]">
                        <Icon icon="solar:magic-stick-3-bold-duotone" className="h-5 w-5 text-accent" />
                    </span>
                    <Bell />
                    <BusinessSwitcher compact />
                </span>
            </header>
        );
    }

    return (
        <header className="relative z-20 flex h-16 shrink-0 items-center justify-end gap-2 border-b border-white/10 bg-[#0A244B] px-8">
            <Bell />
            <BusinessSwitcher />
        </header>
    );
}

// ტელეფონის მენიუ: მარცხნიდან გამოსული იგივე გვერდითი პანელი.
export function MobileMenu({ frame }: { frame: Frame }) {
    const open = frame.menuOpen;
    return (
        <div className={`absolute inset-0 top-16 z-40 transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <div className="absolute inset-0 bg-[rgb(2_8_23/0.55)]" />
            <div className={`absolute inset-y-0 left-0 transition-transform duration-300 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}>
                <Sidebar frame={frame} mobile />
            </div>
        </div>
    );
}
