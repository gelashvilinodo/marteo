import type { HomeSummary } from "@/lib/dashboard/get-home-summary";

function formatNumber(value: string) {
    const negative = value.startsWith("-");
    const unsigned = negative ? value.slice(1) : value;
    const [integer, decimal] = unsigned.split(".");

    const grouped = integer.replace(
        /\B(?=(\d{3})+(?!\d))/g,
        " ",
    );

    return `${negative ? "-" : ""}${grouped}${
        decimal !== undefined ? `.${decimal}` : ""
    }`;
}

const paths = {
    sales: "M3 4h2l2 11h11l3-8H6M9 20h.01M17 20h.01",
    profit: "M4 20V10h4v10M10 20V6h4v14M16 20V3h4v17",
    orders: "M8 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-2M9 3h6v4H9zM8 12h8M8 16h8",
    stock: "m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5",
};

export default function HomeSummaryCards({
    data,
}: {
    data: HomeSummary;
}) {
    const cards = [
        {
            key: "sales" as const,
            title: "სულ გაყიდვები",
            value: `${formatNumber(data.sales)} ₾`,
            iconClass: "bg-accent/10 text-accent",
        },
        {
            key: "profit" as const,
            title: "სუფთა მოგება",
            value: data.profit === null
                ? "—"
                : `${formatNumber(data.profit)} ₾`,
            iconClass: "bg-success/10 text-success",
        },
        {
            key: "orders" as const,
            title: "სულ შეკვეთები",
            value: formatNumber(data.orders),
            iconClass: "bg-accent/10 text-accent",
        },
        {
            key: "stock" as const,
            title: "ამჟამად მარაგში",
            value: formatNumber(data.stock),
            iconClass: "bg-warning/10 text-warning",
        },
    ];

    return (
        <section
            aria-label="ბიზნესის მოკლე მიმოხილვა"
            className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4"
        >
            {cards.map(card => (
                <article
                    key={card.key}
                    className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5"
                >
                    <div className="flex flex-col items-start gap-3 2xl:flex-row 2xl:items-center">
                        <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconClass}`}
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
                                <path d={paths[card.key]} />
                            </svg>
                        </span>

                        <h2 className="min-w-0 break-words text-sm font-medium leading-relaxed text-text-secondary">
                            {card.title}
                        </h2>
                    </div>

                    <p className="mt-4 break-words text-xl font-semibold leading-tight text-text-primary tabular-nums sm:text-2xl">
                        {card.value}
                    </p>
                </article>
            ))}
        </section>
    );
}