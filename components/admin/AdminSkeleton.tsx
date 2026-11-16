import type { ReactNode } from "react";
import { SkeletonText as Text } from "@/components/plans/LoadingSkeleton";

// ადმინის გვერდების ჩონჩხი: სათაური ნამდვილია, დანარჩენი ნაცრისფერი ფორმებია იმავე ზომით,
// რომ ჩატვირთვისას გვერდი არ „ხტუნავდეს“. AdminShell უკვე აძლევს padding-ს, ამიტომ აქ არ ემატება.

export { Text };

const WIDTHS = { "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl", "6xl": "max-w-6xl" } as const;

export function AdminSkeleton({ children, width = "6xl" }: { children: ReactNode; width?: keyof typeof WIDTHS }) {
    return <div aria-busy="true" aria-label="იტვირთება">
        <span role="status" className="sr-only">იტვირთება…</span>
        <div aria-hidden="true" inert className={`mx-auto w-full min-w-0 motion-safe:animate-pulse ${WIDTHS[width]}`}>{children}</div>
    </div>;
}

export const Block = ({ className = "" }: { className?: string }) => <span className={`block rounded-lg bg-text-secondary/10 ${className}`} />;

export function SkHeader({ title, subtitle, action = false }: { title: string; subtitle?: string; action?: boolean }) {
    return <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
            {subtitle && <p className="mt-1 text-sm"><Text>{subtitle}</Text></p>}
        </div>
        {action && <Block className="h-10 w-28 rounded-xl" />}
    </div>;
}

export function SkFilters({ selects = 3 }: { selects?: number }) {
    return <div className="mt-5 flex flex-col gap-2 xl:flex-row xl:items-center">
        <Block className="h-11 w-full rounded-xl xl:flex-1" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {Array.from({ length: selects }, (_, index) => <Block key={index} className="h-11 w-full rounded-xl sm:w-36" />)}
        </div>
    </div>;
}

export function SkStats({ count = 6, cols = "grid-cols-2 lg:grid-cols-3" }: { count?: number; cols?: string }) {
    return <div className={`mt-4 grid gap-3 sm:gap-4 ${cols}`}>
        {Array.from({ length: count }, (_, index) => <div key={index} className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <Block className="h-10 w-10 rounded-xl" />
            <p className="mt-4 text-2xl font-semibold sm:text-3xl"><Text>000</Text></p>
            <p className="mt-1 text-xs sm:text-sm"><Text>მაჩვენებელი</Text></p>
        </div>)}
    </div>;
}

/** A list in one bordered box, like the businesses, users and payments lists. */
export function SkList({ rows = 8, avatar = true, className = "mt-4" }: { rows?: number; avatar?: boolean; className?: string }) {
    return <ul className={`flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface ${className}`}>
        {Array.from({ length: rows }, (_, index) => <li key={index} className="flex items-center gap-3 px-4 py-3">
            {avatar && <Block className="h-10 w-10 shrink-0 rounded-full" />}
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold"><Text>{index % 2 ? "ბიზნესის სახელი" : "მომხმარებლის სახელი გვარი"}</Text></p>
                <p className="mt-0.5 truncate text-xs"><Text>ელფოსტა · ტელეფონი · თარიღი</Text></p>
            </div>
            <Block className="hidden h-6 w-16 shrink-0 rounded-full sm:block" />
        </li>)}
    </ul>;
}

/** A titled panel with plain rows inside (detail pages, settings). */
export function SkPanel({ title, rows = 3, children, className = "" }: { title: string; rows?: number; children?: ReactNode; className?: string }) {
    return <section className={`min-w-0 rounded-3xl border border-border bg-surface p-5 ${className}`}>
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        <div className="mt-3">
            {children ?? <div className="flex flex-col gap-3">
                {Array.from({ length: rows }, (_, index) => <div key={index} className="flex items-center gap-3">
                    <Block className="h-8 w-8 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm"><Text>ჩანაწერის სათაური</Text></p>
                        <p className="truncate text-xs"><Text>დეტალები და თარიღი</Text></p>
                    </div>
                </div>)}
            </div>}
        </div>
    </section>;
}

export function SkBack() {
    return <Block className="h-5 w-24" />;
}

/** Header card of a business or user page: avatar, name, a line of facts. */
export function SkProfile() {
    return <header className="mt-3 flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
        <Block className="h-16 w-16 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold sm:text-2xl"><Text>სახელი და გვარი</Text></p>
            <p className="mt-2 text-sm"><Text>რეჟიმი · პაკეტი · შეიქმნა 00.00.0000</Text></p>
        </div>
        <Block className="h-10 w-36 rounded-xl" />
    </header>;
}

export function SkChart({ title, height = "h-44" }: { title: string; height?: string }) {
    return <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="mt-4 text-sm"><Text>სულ 000</Text></p>
        <div className={`mt-4 flex items-end gap-1 ${height}`}>
            {[40, 65, 30, 80, 55, 70, 25, 90, 45, 60, 35, 75].map((value, index) =>
                <span key={index} className="block min-w-0 flex-1 rounded-t bg-text-secondary/10" style={{ height: `${value}%` }} />)}
        </div>
    </section>;
}
