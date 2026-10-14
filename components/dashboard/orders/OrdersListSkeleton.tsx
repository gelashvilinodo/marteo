export default function OrdersListSkeleton({
    selectionMode = false,
}: {
    selectionMode?: boolean;
}) {
    return (
        <div role="status" aria-label="შეკვეთები იტვირთება">
            <span className="sr-only">შეკვეთები იტვირთება…</span>

            <table
                aria-hidden="true"
                className="w-full table-fixed border-collapse text-left motion-safe:animate-pulse"
            >
                <thead className="bg-background text-xs sm:text-sm">
                    <tr>
                        {selectionMode && (
                            <th className="w-9 px-2 py-3">
                                <div className="h-4 w-4 rounded bg-border/50" />
                            </th>
                        )}

                        <th
                            className="px-3 py-3 sm:px-4"
                            style={{ width: "calc(6ch + 5rem)" }}
                        >
                            <div className="h-3 w-14 rounded bg-border/50" />
                        </th>

                        <th className="hidden px-3 py-3 sm:table-cell">
                            <div className="h-3 w-14 rounded bg-border/50" />
                        </th>

                        <th className="hidden w-[22%] px-3 py-3 lg:table-cell xl:w-[18%]">
                            <div className="h-3 w-20 max-w-full rounded bg-border/50" />
                        </th>

                        <th className="w-[23%] px-2 py-3 sm:w-[15%] xl:w-[14%]">
                            <div className="h-3 w-10 max-w-full rounded bg-border/50" />
                        </th>

                        <th className="w-20 px-1 py-3 sm:w-[20%] xl:w-[18%]">
                            <div className="h-3 w-12 max-w-full rounded bg-border/50" />
                        </th>

                        <th className="hidden w-[12%] px-2 py-3 xl:table-cell">
                            <div className="h-3 w-14 max-w-full rounded bg-border/50" />
                        </th>

                        <th className="w-14 px-1 py-3" />
                    </tr>
                </thead>

                <tbody>
                    {Array.from({ length: 6 }, (_, index) => (
                        <tr
                            key={index}
                            className="h-20 border-t border-border"
                        >
                            {selectionMode && (
                                <td className="px-2 py-2">
                                    <div className="h-4 w-4 rounded bg-border/40" />
                                </td>
                            )}

                            <td className="px-2 py-2 sm:px-3">
                                <div className="flex min-w-0 items-center gap-2">
                                    <div className="h-9 w-9 shrink-0 rounded-lg border border-border bg-background sm:h-10 sm:w-10" />

                                    <div className="min-w-0 flex-1 space-y-2">
                                        <div className="h-3 w-12 max-w-full rounded bg-border/60" />
                                        <div className="h-2 w-full max-w-16 rounded bg-border/35" />
                                    </div>
                                </div>
                            </td>

                            <td className="hidden px-3 py-2 sm:table-cell">
                                <div className="space-y-2">
                                    <div className="h-3 w-4/5 rounded bg-border/55" />
                                    <div className="h-2 w-3/5 rounded bg-border/35" />
                                </div>
                            </td>

                            <td className="hidden px-3 py-2 lg:table-cell">
                                <div className="space-y-2">
                                    <div className="h-3 w-3/4 rounded bg-border/55" />
                                    <div className="h-2 w-1/2 rounded bg-border/35" />
                                </div>
                            </td>

                            <td className="px-2 py-2">
                                <div className="h-3 w-14 max-w-full rounded bg-border/60" />
                            </td>

                            <td className="px-1 py-2">
                                <div className="@container min-w-0 w-full">
                                    <div className="h-8 w-12 max-w-full rounded-lg bg-success/10 @[11rem]:w-36" />
                                </div>
                            </td>

                            <td className="hidden px-2 py-2 xl:table-cell">
                                <div className="h-3 w-4/5 rounded bg-border/35" />
                            </td>

                            <td className="px-1 py-2">
                                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background">
                                    <div className="h-1 w-5 rounded bg-border/60" />
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}