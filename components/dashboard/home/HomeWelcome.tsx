import type { ReactNode } from "react";

import NewOrderButton from "@/components/dashboard/orders/NewOrderButton";
import DeferredHomeExpenseButton from "./DeferredHomeExpenseButton";
import DeferredHomePurchaseButton from "./DeferredHomePurchaseButton";

function ActionCard({
    step,
    title,
    description,
    children,
}: {
    step: string;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <article className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-sm font-semibold text-accent">
                {step}
            </span>

            <h3 className="mt-4 text-base font-semibold text-text-primary">
                {title}
            </h3>

            <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary">
                {description}
            </p>

            <div className="mt-5 [&_button]:w-full">
                {children}
            </div>
        </article>
    );
}

const features = [
    {
        title: "გაყიდვები და მოგება",
        description:
            "ნახავთ გაყიდვების თანხასა და ხარჯების შემდეგ დარჩენილ მოგებას. დიაგრამები პერიოდების შედარებაში დაგეხმარებათ.",
        path: "M4 20V10h4v10M10 20V6h4v14M16 20V3h4v17",
        color: "bg-success/10 text-success",
    },
    {
        title: "ბოლო შეკვეთები",
        description:
            "აქ გამოჩნდება ბოლო ხუთი შეკვეთა - ნომრით, მიმღებით, თანხითა და მიმდინარე სტატუსით.",
        path: "M8 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-2M9 3h6v4H9zM8 12h8M8 16h8",
        color: "bg-accent/10 text-accent",
    },
    {
        title: "პოპულარული პროდუქტები",
        description:
            "გაიგებთ, რომელი პროდუქტები იყიდება ყველაზე მეტად და რა თანხის გაყიდვები მოაქვს თითოეულს.",
        path: "m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9",
        color: "bg-warning/10 text-warning",
    },
];

export default function HomeWelcome({
    businessId,
}: {
    businessId: string;
}) {
    return (
        <div className="space-y-6">
            <section aria-labelledby="home-start-heading">
                <div className="mb-4">
                    <h2
                        id="home-start-heading"
                        className="text-lg font-semibold text-text-primary"
                    >
                        დაიწყეთ მართეოს გამოყენება
                    </h2>

                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
                        დაამატეთ პირველი პარტია ან შეკვეთა.
                        თქვენი მონაცემების მიხედვით აქ გამოჩნდება
                        ბიზნესის მოკლე მიმოხილვა.
                    </p>
                </div>

                <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-3 xl:gap-4">
                    <ActionCard
                        step="01"
                        title="დაამატეთ პირველი პარტია"
                        description="შეინახეთ შეძენილი მარაგები, რაოდენობები და შესყიდვის ხარჯები."
                    >
                        <DeferredHomePurchaseButton />
                    </ActionCard>

                    <ActionCard
                        step="02"
                        title="მიიღეთ პირველი შეკვეთა"
                        description="დაამატეთ მიმღები და პროდუქტები, მიუთითეთ გადახდა და მოამზადეთ ინვოისი."
                    >
                        <NewOrderButton />
                    </ActionCard>

                    <ActionCard
                        step="03"
                        title="აღრიცხეთ სხვა ხარჯი"
                        description="დაამატეთ რეკლამის, ქირის ან სხვა ბიზნესხარჯი. პარტიის ფასში შეტანილი ხარჯი აქ ხელახლა არ გაიმეოროთ."
                    >
                        <DeferredHomeExpenseButton
                            businessId={businessId}
                        />
                    </ActionCard>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-text-secondary">
                    შეგიძლიათ ნებისმიერი მოქმედებით დაიწყოთ -
                    ეს სავალდებულო ნაბიჯების მიმდევრობა არ არის.
                </p>
            </section>

            <section
                aria-labelledby="home-features-heading"
                className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
            >
                <h2
                    id="home-features-heading"
                    className="text-lg font-semibold text-text-primary"
                >
                    რას დაინახავთ აქ?
                </h2>

                <div className="mt-5 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-3">
                    {features.map(feature => (
                        <article
                            key={feature.title}
                            className="flex min-w-0 items-start gap-3"
                        >
                            <span
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${feature.color}`}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="22"
                                    height="22"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d={feature.path} />
                                </svg>
                            </span>

                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-text-primary">
                                    {feature.title}
                                </h3>

                                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                                    {feature.description}
                                </p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}