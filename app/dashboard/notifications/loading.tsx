// Mirrors NotificationsView: same max width, push card and list rows, so nothing jumps
// when the real page arrives. Row widths vary so the list doesn't look like a grid.
const rows = [
    { title: "w-2/3", body: ["w-full", "w-4/5"], action: true, unread: true },
    { title: "w-1/2", body: ["w-full", "w-3/5"], action: false, unread: true },
    { title: "w-3/5", body: ["w-11/12"], action: true, unread: false },
    { title: "w-2/5", body: ["w-full", "w-2/3"], action: false, unread: false },
    { title: "w-1/2", body: ["w-4/5"], action: false, unread: false },
];

export default function NotificationsLoading() {
    return (
        <main
            aria-busy="true"
            className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
            <div className="mx-auto max-w-3xl">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold text-text-primary">
                            შეტყობინებები
                        </h1>
                        <p className="mt-2 text-sm text-text-secondary">
                            მართეოს სიახლეები და თქვენი ბიზნესის მნიშვნელოვანი მოვლენები
                        </p>
                    </div>

                    <div
                        aria-hidden="true"
                        className="h-10 w-36 rounded-xl bg-border/40 motion-safe:animate-pulse"
                    />
                </div>

                <section
                    aria-hidden="true"
                    className={
                        "mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 " +
                        "motion-safe:animate-pulse sm:flex-row sm:items-start sm:p-5"
                    }
                >
                    <div className="h-11 w-11 shrink-0 rounded-xl bg-accent/12" />

                    <div className="min-w-0 flex-1 space-y-2.5 pt-1">
                        <div className="h-4 w-56 max-w-full rounded bg-border/60" />
                        <div className="h-3 w-full rounded bg-border/40" />
                        <div className="h-3 w-3/4 rounded bg-border/40" />
                    </div>

                    <div className="h-11 w-full rounded-xl bg-border/40 sm:w-64 sm:shrink-0" />
                </section>

                <ul
                    aria-hidden="true"
                    className="mt-6 space-y-3 motion-safe:animate-pulse"
                >
                    {rows.map((row, index) => (
                        <li
                            key={index}
                            className={
                                "flex gap-4 rounded-2xl border p-4 " +
                                (row.unread ? "border-accent/40 bg-accent/5" : "border-border bg-surface")
                            }
                        >
                            <div className="h-12 w-12 shrink-0 rounded-xl bg-border/50" />

                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                    <div className={`mt-1 h-4 rounded bg-border/60 ${row.title}`} />

                                    <div className="flex shrink-0 items-center gap-2">
                                        {row.unread && <span className="h-2 w-2 rounded-full bg-accent/60" />}
                                        <div className="h-8 w-8 rounded-lg bg-border/30" />
                                    </div>
                                </div>

                                <div className="mt-2 space-y-2">
                                    {row.body.map((width, line) => (
                                        <div
                                            key={line}
                                            className={`h-3 rounded bg-border/40 ${width}`}
                                        />
                                    ))}
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                    <div className="h-3 w-28 rounded bg-border/40" />
                                    {row.action && <div className="h-7 w-20 rounded-xl bg-accent/25" />}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </main>
    );
}
