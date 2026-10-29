"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";

import type { FaqGroup } from "@/components/landing/faq-content";

// ერთდროულად მხოლოდ ერთი კითხვაა გახსნილი — ახლის გახსნა წინას ხურავს.
export default function FaqAccordion({ groups }: { groups: FaqGroup[] }) {
    const [openId, setOpenId] = useState<string | null>(null);

    return (
        <div className="space-y-12 sm:space-y-14">
            {groups.map(group => (
                <section
                    key={group.id}
                    id={group.id}
                    aria-labelledby={`faq-group-${group.id}`}
                    className="scroll-mt-24"
                >
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                            <Icon icon={group.icon} className="h-5 w-5" />
                        </span>
                        <h2
                            id={`faq-group-${group.id}`}
                            className="text-lg font-semibold text-text-primary sm:text-xl"
                        >
                            {group.title}
                        </h2>
                    </div>

                    <ul className="mt-5 space-y-3">
                        {group.items.map(item => {
                            const open = openId === item.id;
                            const panelId = `faq-answer-${item.id}`;
                            const buttonId = `faq-question-${item.id}`;

                            return (
                                <li
                                    key={item.id}
                                    className={`rounded-2xl border bg-surface transition-colors duration-200 ${
                                        open ? "border-accent/40 shadow-sm shadow-accent/10" : "border-border hover:border-accent/30"
                                    }`}
                                >
                                    <h3>
                                        <button
                                            id={buttonId}
                                            type="button"
                                            aria-expanded={open}
                                            aria-controls={panelId}
                                            onClick={() => setOpenId(open ? null : item.id)}
                                            className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl px-4 py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-6 sm:py-5"
                                        >
                                            <span className={`text-[15px] leading-snug font-semibold sm:text-base ${open ? "text-accent" : "text-text-primary"}`}>
                                                {item.question}
                                            </span>
                                            <span
                                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-300 motion-reduce:transition-none ${
                                                    open ? "bg-accent text-white" : "bg-accent/10 text-accent"
                                                }`}
                                            >
                                                <Icon
                                                    icon="ic:round-add"
                                                    className={`h-5 w-5 transition-[rotate] duration-300 motion-reduce:transition-none ${open ? "rotate-45" : ""}`}
                                                />
                                            </span>
                                        </button>
                                    </h3>

                                    <div
                                        id={panelId}
                                        role="region"
                                        aria-labelledby={buttonId}
                                        inert={!open}
                                        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                                            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                                        }`}
                                    >
                                        <div className="overflow-hidden">
                                            <div className="space-y-3 px-4 pb-5 text-sm leading-relaxed text-text-secondary sm:px-6 sm:pb-6 sm:text-[15px]">
                                                {item.answer.map(paragraph => (
                                                    <p key={paragraph}>{paragraph}</p>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
    );
}
