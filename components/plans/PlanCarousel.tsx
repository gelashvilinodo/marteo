"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

// ტელეფონზე გეგმები ჰორიზონტალურად იფურცლება: ხელის აშვებისას ქარდი თავისით ცენტრში ჯდება (scroll-snap),
// გვერდებზე მეზობელი ქარდები მოჩანს: მათი ცენტრისკენ მიმართული კიდე ეკრანიდან ამოწეულია და ცენტრში ქარდი სწორდება.
// დიდ ეკრანზე (lg) ჩვეულებრივი სამსვეტიანი ბადეა და არაფერი ტრიალებს.
const DESKTOP = "(min-width: 1024px)";
const MAX_TILT = 22;

export default function PlanCarousel({ children, labels, start = 1 }: { children: ReactNode; labels: string[]; start?: number }) {
    const track = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(start);
    const slides = Children.toArray(children);

    useEffect(() => {
        const el = track.current;
        if (!el) return;
        const desktop = window.matchMedia(DESKTOP);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
        let frame = 0;

        const paint = () => {
            frame = 0;
            const items = Array.from(el.children) as HTMLElement[];
            if (desktop.matches) {
                items.forEach(item => { item.style.transform = ""; item.style.opacity = ""; });
                return;
            }
            const center = el.scrollLeft + el.clientWidth / 2;
            let closest = 0, best = Infinity;
            items.forEach((item, index) => {
                // -1 მარცხნივ მთელი ქარდით, 0 ცენტრში, 1 მარჯვნივ.
                const offset = (item.offsetLeft + item.offsetWidth / 2 - center) / item.offsetWidth;
                const distance = Math.min(Math.abs(offset), 1);
                if (Math.abs(offset) < best) { best = Math.abs(offset); closest = index; }
                item.style.opacity = String(1 - distance * 0.35);
                item.style.transform = reduced.matches
                    ? `scale(${1 - distance * 0.06})`
                    : `perspective(1000px) rotateY(${Math.max(-1, Math.min(1, offset)) * MAX_TILT}deg) scale(${1 - distance * 0.08})`;
            });
            setActive(closest);
        };
        const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };

        // პირველად შუა (ან მითითებული) ქარდი ჩანს, რომ ორივე მხარეს მეზობელი მოჩანდეს.
        const first = el.children[start] as HTMLElement | undefined;
        if (first && !desktop.matches) el.scrollLeft = first.offsetLeft + first.offsetWidth / 2 - el.clientWidth / 2;
        paint();

        el.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        desktop.addEventListener("change", schedule);
        return () => {
            cancelAnimationFrame(frame);
            el.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", schedule);
            desktop.removeEventListener("change", schedule);
        };
    }, [start]);

    const goTo = (index: number) => {
        const el = track.current;
        const item = el?.children[index] as HTMLElement | undefined;
        if (el && item) el.scrollTo({ left: item.offsetLeft + item.offsetWidth / 2 - el.clientWidth / 2, behavior: "smooth" });
    };

    return <div>
        <div className="mb-3 flex items-center justify-center lg:hidden" role="tablist" aria-label="გეგმები">
            {labels.map((label, index) => <button key={label} type="button" role="tab" aria-selected={active === index} aria-label={label} onClick={() => goTo(index)}
                className="group flex h-11 min-w-11 cursor-pointer items-center justify-center">
                <span className={`h-2.5 rounded-full transition-all duration-300 ${active === index ? "w-8 bg-accent" : "w-2.5 bg-text-secondary/35 group-hover:bg-text-secondary/60"}`} />
            </button>)}
        </div>
        <div ref={track} className="-mx-4 flex snap-x snap-mandatory items-stretch gap-2.5 overflow-x-auto overscroll-x-contain px-[12vw] pt-2 sm:px-[22vw] pb-6 [scrollbar-width:none] sm:-mx-6 lg:mx-0 lg:grid lg:snap-none lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:p-0 [&::-webkit-scrollbar]:hidden">
            {slides.map((slide, index) => <div key={index} className="flex w-[76vw] shrink-0 snap-center snap-always flex-col will-change-transform *:flex-1 sm:w-[56vw] lg:w-auto">
                {slide}
            </div>)}
        </div>
    </div>;
}
