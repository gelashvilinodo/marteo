// Mirrors HelpView: compact channel pills under lg, the chat card filling the height,
// and the channel panel beside it from lg up, so nothing jumps when the page arrives.
const channels = ["w-16", "w-20", "w-16"];

const bubbles = [
    { mine: false, lines: ["w-48", "w-56", "w-32"] },
    { mine: true, lines: ["w-40"] },
    { mine: false, lines: ["w-52", "w-36"] },
];

export default function HelpLoading() {
    return (
        <main
            aria-busy="true"
            className={
                "flex h-[calc(100dvh-4rem)] min-w-0 flex-col gap-3 p-3 sm:p-5 " +
                "lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-5 lg:p-6 xl:grid-cols-[minmax(0,1fr)_320px]"
            }
        >
            <div
                aria-hidden="true"
                className="-mx-3 flex shrink-0 gap-2 overflow-hidden px-3 motion-safe:animate-pulse lg:hidden"
            >
                {channels.map((width, index) => (
                    <div
                        key={index}
                        className="flex shrink-0 items-center gap-3 rounded-2xl border border-border bg-surface px-2.5 py-1.5 pr-3.5"
                    >
                        <div className="h-8 w-8 rounded-xl bg-background" />
                        <div className={`h-3 rounded bg-border/60 ${width}`} />
                    </div>
                ))}
            </div>

            <section
                className={
                    "flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-surface " +
                    "shadow-[0_18px_50px_-30px_rgb(15_28_46/0.45)] lg:h-full"
                }
            >
                <header
                    className={
                        "flex shrink-0 items-center gap-3 border-b border-border bg-gradient-to-r " +
                        "from-[#0B2A55] via-[#0A244B] to-[#081F46] px-4 py-3 text-white sm:px-5"
                    }
                >
                    <div className="h-10 w-10 shrink-0 rounded-full bg-white/15 motion-safe:animate-pulse" />

                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-[15px] font-semibold">MARTEO მხარდაჭერა</h1>
                        <p className="truncate text-xs text-slate-300">
                            ჩვეულებრივ ვპასუხობთ რამდენიმე წუთში
                        </p>
                    </div>
                </header>

                <div
                    aria-hidden="true"
                    className="min-h-0 flex-1 overflow-hidden px-3 py-4 motion-safe:animate-pulse sm:px-5"
                >
                    <div className="mx-auto mb-4 h-6 w-64 max-w-full rounded-full bg-background" />

                    <ol className="flex flex-col">
                        {bubbles.map((bubble, index) => (
                            <li
                                key={index}
                                className={`mt-3 flex items-end gap-2 ${bubble.mine ? "flex-row-reverse" : ""}`}
                            >
                                <div className="h-8 w-8 shrink-0 rounded-full bg-border/50" />

                                <div
                                    className={
                                        "max-w-[82%] space-y-2 rounded-2xl border border-border px-4 py-3 sm:max-w-[70%] " +
                                        (bubble.mine ? "rounded-br-md bg-accent/15" : "rounded-bl-md bg-background")
                                    }
                                >
                                    {bubble.lines.map((width, line) => (
                                        <div
                                            key={line}
                                            className={`h-3 max-w-full rounded bg-border/60 ${width}`}
                                        />
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>

                <footer
                    aria-hidden="true"
                    className="shrink-0 border-t border-border bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
                >
                    <div className="flex items-end gap-2">
                        <div className="h-11 flex-1 rounded-2xl border border-border bg-background" />
                        <div className="h-11 w-11 shrink-0 rounded-full bg-accent/40" />
                    </div>
                </footer>
            </section>

            <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
                <section className="rounded-3xl border border-border bg-surface p-4">
                    <h2 className="text-sm font-semibold text-text-primary">სხვა არხები</h2>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">
                        გირჩევნია სხვაგან მოგვწერო? აირჩიე შენთვის მოსახერხებელი.
                    </p>

                    <div
                        aria-hidden="true"
                        className="mt-4 flex flex-col gap-2 motion-safe:animate-pulse"
                    >
                        {channels.map((width, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-3"
                            >
                                <div className="h-11 w-11 shrink-0 rounded-xl bg-background" />

                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className={`h-3 rounded bg-border/60 ${width}`} />
                                    <div className="h-2.5 w-28 max-w-full rounded bg-border/40" />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </aside>
        </main>
    );
}
