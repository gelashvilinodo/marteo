import { Icon } from "@/components/shared/Icon";

// შესაძლებლობების გვერდის ჰიროს ეკრანი: მთავარი გვერდის ზედა ზოლი, ციფრებით,
// რომლებიც ქვემოთ სექციების სცენებს ემთხვევა (მოგება 2 742 ₾, საფულე იწურება).

const cards = [
    { icon: "solar:clipboard-list-bold-duotone", label: "შეკვეთები დღეს", value: "14", tone: "text-text-primary" },
    { icon: "solar:chart-2-bold-duotone", label: "გაყიდვა, ეს თვე", value: "7 120 ₾", tone: "text-text-primary" },
    { icon: "solar:wallet-money-bold-duotone", label: "სუფთა მოგება", value: "2 742 ₾", tone: "text-success" },
    { icon: "solar:box-bold-duotone", label: "იწურება", value: "1", tone: "text-warning" },
];

const orders = [
    { name: "ნინო ბერიძე", amount: "65 ₾", status: "გაგზავნილი", tone: "bg-accent/10 text-accent" },
    { name: "გიორგი კაპანაძე", amount: "120 ₾", status: "დასრულებული", tone: "bg-success/10 text-success" },
    { name: "ანა კვარაცხელია", amount: "48 ₾", status: "მუშავდება", tone: "bg-warning/10 text-warning" },
];

export default function FeaturesHeroPreview() {
    return (
        <div
            aria-hidden="true"
            className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-2xl border border-white/15 bg-background text-left text-text-primary shadow-[0_2em_5em_-1em_rgb(2_8_23/0.7)] ring-[0.4em] ring-white/5 select-none sm:mt-14"
        >
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                <span className="ml-3 truncate text-xs text-text-secondary">marteo.ge/dashboard</span>
            </div>

            <div className="grid gap-3 p-3 sm:gap-4 sm:p-5">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                    {cards.map(card => (
                        <div key={card.label} className="rounded-xl border border-border bg-surface p-3 sm:p-4">
                            <p className="flex items-center gap-1.5 truncate text-xs text-text-secondary sm:text-sm">
                                <Icon icon={card.icon} className="h-4 w-4 shrink-0 text-accent sm:h-5 sm:w-5" />
                                {card.label}
                            </p>
                            <p className={`mt-1.5 text-xl font-bold tabular-nums sm:text-2xl ${card.tone}`}>{card.value}</p>
                        </div>
                    ))}
                </div>

                <div className="hidden divide-y divide-border rounded-xl border border-border bg-surface sm:block">
                    {orders.map(order => (
                        <div key={order.name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                            <span className="truncate">{order.name}</span>
                            <span className="flex shrink-0 items-center gap-3">
                                <span className="tabular-nums text-text-secondary">{order.amount}</span>
                                <span className={`rounded-lg px-2 py-1 text-xs font-medium ${order.tone}`}>{order.status}</span>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
