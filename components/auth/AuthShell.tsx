import Link from "next/link";
import type { ReactNode } from "react";

// ავტორიზაციის გვერდების საერთო სტილები — ზომები და ფერები დაშბორდის
// ფორმებს ემთხვევა (h-11 ველი, text-[16px], accent ღილაკი).
export const authLabelClass = "mb-1.5 block text-sm text-text-secondary";

export function authInputClass(invalid = false) {
    return [
        "block h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-[16px] text-text-primary outline-none transition-colors",
        "placeholder:text-text-secondary/70 disabled:opacity-50",
        invalid ? "border-danger focus:border-danger" : "border-border focus:border-accent",
    ].join(" ");
}

export const authPrimaryButtonClass =
    "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-accent";

export const authCardClass =
    "w-full min-w-0 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6";

export const authErrorClass =
    "rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger";

// ორსვეტიანი განლაგება: მარცხნივ MARTEO-ს მუქი ლურჯი პანელი (ჰეროს ფონით),
// მარჯვნივ ფორმა. ტელეფონზე მხოლოდ ფორმა ჩანს, ზემოთ ლოგოთი.
export default function AuthShell({
    heading,
    text,
    eyebrow,
    wide = false,
    children,
}: {
    heading: ReactNode;
    text: string;
    eyebrow?: string;
    wide?: boolean;
    children: ReactNode;
}) {
    return (
        <main className="min-h-dvh bg-background">
            <div className="grid min-h-dvh lg:grid-cols-[0.9fr_1.1fr]">
                <section className="landing-hero landing-hero-page relative isolate hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
                    <div aria-hidden="true" className="landing-hero-backdrop">
                        <span className="landing-hero-glow landing-hero-glow-1" />
                        <span className="landing-hero-glow landing-hero-glow-2" />
                        <span className="landing-hero-glow landing-hero-glow-3" />
                    </div>

                    <Link href="/" aria-label="MARTEO.GE" className="self-start">
                        <img src="/images/logo.svg" alt="MARTEO.GE" className="h-20 w-auto" />
                    </Link>

                    <div className="max-w-md">
                        {eyebrow && (
                            <p className="mb-4 text-sm font-medium text-accent">{eyebrow}</p>
                        )}
                        <h1 className="text-4xl leading-tight font-semibold text-white xl:text-5xl">
                            {heading}
                        </h1>
                        <p className="mt-6 max-w-sm text-base leading-7 text-white/65">{text}</p>
                    </div>

                    <p className="text-sm text-white/40">© {new Date().getFullYear()} MARTEO.GE</p>
                </section>

                <section className="flex min-h-dvh min-w-0 items-center justify-center px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
                    <div className={`w-full min-w-0 ${wide ? "max-w-xl" : "max-w-md"}`}>
                        <div className="mb-8 flex justify-center lg:hidden">
                            <Link href="/" aria-label="MARTEO.GE">
                                <img src="/images/marteo-08.svg" alt="MARTEO.GE" className="h-12 w-auto dark:hidden" />
                                <img src="/images/logo.svg" alt="MARTEO.GE" className="hidden h-12 w-auto dark:block" />
                            </Link>
                        </div>

                        {children}
                    </div>
                </section>
            </div>
        </main>
    );
}
