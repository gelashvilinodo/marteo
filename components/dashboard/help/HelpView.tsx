"use client";

import { Icon } from "@iconify/react";
import SupportChat from "@/components/support/SupportChat";
import { MarteoAvatar } from "@/components/support/SupportAvatar";
import PushBanner from "@/components/support/PushBanner";
import { SUPPORT_CHANNELS, SUPPORT_WELCOME_TEXT } from "@/lib/support/support-config";

type HelpViewProps = {
    business: { name: string; logoUrl: string | null };
    self: { name: string; avatarUrl: string | null };
    firstName: string | null;
    pushKey: string | null;
};

function ChannelLink({ channel, compact }: { channel: typeof SUPPORT_CHANNELS[number]; compact?: boolean }) {
    const available = Boolean(channel.href);
    const content = <>
        <span className={`flex shrink-0 items-center justify-center rounded-xl bg-background ${compact ? "h-8 w-8" : "h-11 w-11"}`}>
            <Icon icon={channel.icon} className={`${compact ? "h-5 w-5" : "h-6 w-6"} ${channel.id === "email" ? "text-accent" : ""}`} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-text-primary">{channel.label}</span>
            {!compact && <span className="block truncate text-xs text-text-secondary">{available ? channel.hint : "მალე დაემატება"}</span>}
        </span>
        {!compact && <Icon icon="solar:arrow-right-up-linear" className="h-4 w-4 shrink-0 text-text-secondary transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent" aria-hidden="true" />}
    </>;
    const className = `group flex items-center gap-3 rounded-2xl border border-border bg-surface transition ${compact ? "shrink-0 px-2.5 py-1.5 pr-3.5" : "px-3 py-3"} ${available ? "hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md" : "cursor-not-allowed opacity-60"}`;
    if (!available) return <span aria-disabled="true" className={className}>{content}</span>;
    const external = channel.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {};
    return <a href={channel.href} {...external} className={className}>{content}</a>;
}

export default function HelpView({ business, self, firstName, pushKey }: HelpViewProps) {
    const welcome = firstName ? SUPPORT_WELCOME_TEXT.replace("გამარჯობა!", `გამარჯობა, ${firstName}!`) : SUPPORT_WELCOME_TEXT;

    return <main className="flex h-[calc(100dvh-4rem)] min-w-0 flex-col gap-3 p-3 sm:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-5 lg:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <nav aria-label="სხვა არხები" className="-mx-3 flex shrink-0 gap-2 overflow-x-auto px-3 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
            {SUPPORT_CHANNELS.map(channel => <ChannelLink key={channel.id} channel={channel} compact />)}
        </nav>

        <div className="min-h-0 flex-1 lg:h-full">
            <SupportChat
                viewer="USER"
                endpoint="/api/support/messages"
                banner={<PushBanner publicKey={pushKey} text="ჩართე შეტყობინებები, რომ პასუხი არ გამოგრჩეს." />}
                welcome={welcome}
                business={business}
                self={self}
                header={<>
                    <span className="relative">
                        <MarteoAvatar size="md" className="ring-white/20" />
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0A244B] bg-success" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-[15px] font-semibold">MARTEO მხარდაჭერა</h1>
                        <p className="truncate text-xs text-slate-300">ჩვეულებრივ ვპასუხობთ რამდენიმე წუთში</p>
                    </div>
                </>}
            />
        </div>

        <aside className="hidden min-h-0 flex-col gap-3 overflow-y-auto lg:flex">
            <section className="rounded-3xl border border-border bg-surface p-4">
                <h2 className="text-sm font-semibold text-text-primary">სხვა არხები</h2>
                <p className="mt-1 text-xs leading-5 text-text-secondary">გირჩევნია სხვაგან მოგვწერო? აირჩიე შენთვის მოსახერხებელი.</p>
                <div className="mt-4 flex flex-col gap-2">
                    {SUPPORT_CHANNELS.map(channel => <ChannelLink key={channel.id} channel={channel} />)}
                </div>
            </section>
        </aside>
    </main>;
}
