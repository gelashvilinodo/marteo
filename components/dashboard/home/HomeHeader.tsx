import NewOrderButton from "@/components/dashboard/orders/NewOrderButton";
import type { ReactNode } from "react";

export default function HomeHeader({
    firstName,
    periodControl,
}: {
    firstName: string | null;
    periodControl?: ReactNode;
}) {
    const name = firstName?.trim();

    return (
        <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-text-primary">
                    მთავარი
                </h1>

                <p className="mt-2 flex items-start gap-2 text-sm text-text-secondary">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="shrink-0 text-accent"
                    >
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
                    </svg>

                    <span className="min-w-0 break-words">
                        {name ? (
                            <>
                                გამარჯობა,{" "}
                                <span className="font-medium text-text-primary">
                                    {name}
                                </span>
                                !
                            </>
                        ) : (
                            "გამარჯობა!"
                        )}
                    </span>
                </p>
            </div>

            <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start [&>button]:w-full sm:[&>button]:w-auto">
                {periodControl}
                <NewOrderButton />
            </div>
        </header>
    );
}