import type { ReactNode } from "react";

// Keep sample text in the layout so Georgian wrapping follows the real page.
export function SkeletonText({ children, className = "" }: { children: ReactNode; className?: string }) {
    return <span className={`rounded bg-text-secondary/10 text-transparent select-none [box-decoration-break:clone] ${className}`}>{children}</span>;
}

export function SkeletonPage({ children, narrow = false, spaced = false }: { children: ReactNode; narrow?: boolean; spaced?: boolean }) {
    return <main className="min-w-0 p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="იტვირთება">
        <span role="status" className="sr-only">იტვირთება…</span>
        <div aria-hidden="true" inert className={`mx-auto w-full motion-safe:animate-pulse ${narrow ? "max-w-4xl" : "max-w-6xl"} ${spaced ? "space-y-6" : "space-y-5"}`}>{children}</div>
    </main>;
}
