import { Icon } from "@/components/shared/Icon";
import type { Frame } from "./timeline";
import { FakeInput, Field, Menu, ProductThumb } from "./ui";
import { customer, money, order, ordered, products } from "./data";

// რეალური NewOrderDrawer-ის ასლი: მომხმარებელი, პროდუქტები, გადახდა, ქვედა ზოლი.
export function OrderForm({ frame, m }: { frame: Frame; m: boolean }) {
    if (!frame.formVisible) return null;

    const productsSum = frame.itemAdded ? ordered.price : 0;
    const courier = Number(frame.courier);
    const total = productsSum + courier;
    const paid = frame.paid ? total : 0;

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col bg-background text-text-primary"
            style={{ opacity: frame.formIn, transform: `translateY(${(1 - frame.formIn) * 24}px)` }}
        >
            <div className={`flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface ${m ? "px-4 py-3" : "px-6 py-3"}`}>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-border">
                    <Icon icon="solar:close-circle-linear" className="h-6 w-6" />
                </span>
                <p className={`flex items-center gap-2 font-bold ${m ? "text-xl" : "text-[22px]"}`}>
                    <Icon icon="solar:clipboard-add-linear" className="h-7 w-7 text-success" />
                    ახალი შეკვეთა
                </p>
            </div>

            <div data-demo-scroll className="relative min-h-0 flex-1 overflow-hidden">
                <div data-demo-scroll-content className={`space-y-3 ${m ? "p-3 pb-24" : "p-5"}`}>
                    <CustomerSection frame={frame} m={m} />

                    <div className={`grid items-start gap-4 ${m ? "grid-cols-1" : "grid-cols-[minmax(0,7fr)_minmax(0,3fr)]"}`}>
                        <section data-demo="products" className="flex min-h-[300px] min-w-0 flex-col rounded-2xl border border-border bg-surface">
                            <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-border ${m ? "p-3" : "p-4"}`}>
                                <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                                    <Icon icon="solar:box-linear" className="h-5 w-5 text-accent" />
                                    პროდუქტები
                                    <span className="font-normal text-text-secondary">{frame.itemAdded ? 1 : 0}</span>
                                </h3>
                                <span className="flex gap-2">
                                    <span
                                        data-demo="stock-open"
                                        className={`inline-flex h-11 items-center gap-2 rounded-xl border border-success/40 px-3 text-[13px] font-semibold text-success transition-transform ${frame.pressed("stock-open") ? "scale-95 bg-success/10" : ""}`}
                                    >
                                        <Icon icon="solar:box-linear" className="h-4 w-4" />
                                        მარაგიდან არჩევა
                                    </span>
                                    <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-3 text-[13px] font-semibold text-white">
                                        <Icon icon="solar:add-circle-linear" className="h-4 w-4" />
                                        ხელით დამატება
                                    </span>
                                </span>
                            </div>

                            <div className={`flex-1 ${m ? "p-3" : "p-4"}`}>
                                {frame.itemAdded ? (
                                    <OrderItem frame={frame} m={m} />
                                ) : (
                                    <div className="flex min-h-48 flex-col items-center justify-center gap-3 py-8 text-center text-text-secondary">
                                        <Icon icon="solar:box-linear" className="h-12 w-12 text-accent/60" />
                                        <p className="text-sm">აირჩიეთ მარაგიდან ან დაამატეთ ხელით</p>
                                    </div>
                                )}
                            </div>
                        </section>

                        <aside data-demo="payment" className={`relative min-w-0 rounded-2xl border border-border bg-surface ${m ? "p-3" : "p-4"}`}>
                            <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                                <Icon icon="solar:wallet-money-linear" className="h-5 w-5 text-success" />
                                გადახდა
                            </h3>

                            <div className="space-y-3">
                                <Field label="კურიერის საფასური · ₾">
                                    <FakeInput m={m} demo="courier" value={frame.courier} focused={frame.focus === "courier"} pressed={frame.pressed("courier")} />
                                </Field>

                                <Field label="გადახდა">
                                    <span className="relative block">
                                        <FakeInput m={m} demo="pay-select" select value={frame.paid ? "სრულად გადახდილი" : "გადახდა არ არის"} focused={frame.payMenu} pressed={frame.pressed("pay-select")} />
                                        {frame.payMenu && (
                                            <Menu
                                                options={["გადახდა არ არის", "სრულად გადახდილი", "მხოლოდ კურიერი", "ნაწილობრივ"]}
                                                active="გადახდა არ არის"
                                                hover={frame.near("pay-full") ? "სრულად გადახდილი" : undefined}
                                                demo={{ "სრულად გადახდილი": "pay-full" }}
                                            />
                                        )}
                                    </span>
                                </Field>

                                {frame.paid && (
                                    <div className="demo-pop space-y-3">
                                        <Field label="გადახდილი თანხა · ₾">
                                            <FakeInput m={m} value={money(paid).replace(" ₾", "")} />
                                        </Field>
                                        <Field label="გადახდის მეთოდი">
                                            <span className="relative block">
                                                <FakeInput m={m} demo="method-select" select value={frame.transfer ? "გადარიცხვა" : "ნაღდი"} focused={frame.methodMenu} pressed={frame.pressed("method-select")} />
                                                {frame.methodMenu && (
                                                    <Menu
                                                        options={["ნაღდი", "გადარიცხვა", "ბარათი"]}
                                                        active="ნაღდი"
                                                        hover={frame.near("method-transfer") ? "გადარიცხვა" : undefined}
                                                        demo={{ "გადარიცხვა": "method-transfer" }}
                                                    />
                                                )}
                                            </span>
                                        </Field>
                                        {frame.transfer && (
                                            <span className="demo-pop block">
                                                <Field label="ბანკი">
                                                    <FakeInput m={m} demo="bank" value={frame.bank} focused={frame.focus === "bank"} pressed={frame.pressed("bank")} />
                                                </Field>
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 rounded-xl bg-background p-3">
                                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-secondary">
                                    <Icon icon="solar:document-text-linear" className="h-4 w-4" />
                                    შეჯამება
                                </h4>
                                <dl className="space-y-1.5 text-sm">
                                    {[
                                        ["პროდუქტები", productsSum],
                                        ["კურიერი", courier],
                                        ["გადახდილი", paid],
                                        ["დარჩენილი", total - paid],
                                    ].map(([label, amount]) => (
                                        <div key={String(label)} className="flex justify-between gap-2">
                                            <dt className="text-text-secondary">{label}</dt>
                                            <dd key={String(amount)} className="demo-pop font-medium tabular-nums">{money(Number(amount))}</dd>
                                        </div>
                                    ))}
                                    <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2 text-base">
                                        <dt className="font-bold">სულ</dt>
                                        <dd key={total} className="demo-pop font-bold text-success tabular-nums">{money(total)}</dd>
                                    </div>
                                </dl>
                            </div>
                        </aside>
                    </div>
                </div>
            </div>

            <div className={`flex shrink-0 items-center justify-between gap-2 border-t border-border bg-surface ${m ? "px-3 py-3" : "px-5 py-3"}`}>
                <span className="flex h-12 items-center rounded-xl border border-border px-4 text-sm font-medium">გაუქმება</span>
                <span
                    data-demo="save"
                    className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-success px-5 text-[15px] font-semibold text-white shadow-lg shadow-success/25 transition-transform duration-150 ${frame.pressed("save") ? "scale-95 bg-success-hover" : ""}`}
                >
                    <Icon icon={frame.saving ? "solar:refresh-linear" : "solar:check-circle-linear"} className={`h-5 w-5 ${frame.saving ? "animate-spin" : ""}`} />
                    {frame.saving ? "ინახება…" : "შეკვეთის შენახვა"}
                </span>
            </div>
        </div>
    );
}

function CustomerSection({ frame, m }: { frame: Frame; m: boolean }) {
    const glow = frame.autofillGlow;

    return (
        <section data-demo="customer" className={`rounded-2xl border border-border bg-surface ${m ? "p-3" : "p-4"}`}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <Icon icon="solar:user-linear" className="h-5 w-5 text-accent" />
                <h3 className="text-[15px] font-semibold">მომხმარებლის ინფორმაცია</h3>
                {frame.lookupBusy && <Icon icon="solar:refresh-linear" className="h-4 w-4 animate-spin text-accent" />}
                {frame.found && (
                    <span className="demo-pop inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        <Icon icon="solar:check-circle-bold" className="h-3.5 w-3.5" />
                        მომხმარებელი მოიძებნა.
                    </span>
                )}
            </div>

            <div className={`grid min-w-0 gap-3 ${m ? "grid-cols-2" : "grid-cols-[minmax(0,0.85fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.75fr)_minmax(0,1.6fr)]"}`}>
                <span className={m ? "col-span-2" : ""}>
                    <Field label="ტელეფონი *">
                        <FakeInput m={m} demo="phone" value={frame.phone} placeholder="მაგ: 599 12 34 56" focused={frame.focus === "phone"} pressed={frame.pressed("phone")} />
                    </Field>
                </span>
                <Field label="სახელი">
                    <FakeInput m={m} value={frame.firstName} glow={frame.firstName ? glow : 0} />
                </Field>
                <Field label="გვარი">
                    <FakeInput m={m} value={frame.lastName} glow={frame.lastName ? glow : 0} />
                </Field>
                <span className={m ? "col-span-2" : ""}>
                    <Field label="მიწოდება">
                        <FakeInput m={m} select value={customer.zone} glow={frame.zoneFilled ? glow : 0} />
                    </Field>
                </span>
                <span className={m ? "col-span-2" : ""}>
                    <Field label="მისამართი">
                        <FakeInput m={m} value={frame.address} placeholder="ქალაქი, ქუჩა, ნომერი" glow={frame.address ? glow : 0} />
                    </Field>
                </span>
            </div>

            <p className="mt-3 inline-flex min-h-8 items-center gap-2 text-sm font-medium text-accent">
                <Icon icon="solar:notes-linear" className="h-5 w-5" />
                კომენტარის დამატება
                <Icon icon="solar:alt-arrow-down-linear" className="h-4 w-4" />
            </p>
        </section>
    );
}

function OrderItem({ frame, m }: { frame: Frame; m: boolean }) {
    const glow = frame.itemGlow;

    return (
        <div
            data-demo="order-item"
            className="demo-pop rounded-2xl border bg-background p-4 transition-colors duration-500"
            style={{ borderColor: glow > 0 ? `color-mix(in srgb, var(--marteo-success) ${Math.round(glow * 70)}%, var(--marteo-border))` : "var(--marteo-border)" }}
        >
            <div className="flex items-start gap-3">
                <ProductThumb icon={ordered.icon} tint={ordered.tint} size="h-14 w-14" iconSize="h-9 w-9" />
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">პროდუქტი 1 · მარაგიდან</span>
                    <span className="block text-xs text-text-secondary">ხელმისაწვდომია: {ordered.stock}</span>
                </span>
                <span className="text-[17px] font-bold tabular-nums">{money(ordered.price)}</span>
                <Icon icon="solar:trash-bin-trash-linear" className="h-6 w-6 text-danger" />
            </div>
            <div className={`mt-3 grid gap-3 ${m ? "grid-cols-2" : "grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]"}`}>
                <span className={m ? "col-span-2" : ""}>
                    <Field label="სახელი *"><FakeInput m={m} value={ordered.name} /></Field>
                </span>
                <Field label="რაოდენობა *"><FakeInput m={m} value="1" /></Field>
                <Field label="გასაყიდი ფასი · ₾ *"><FakeInput m={m} value={ordered.price.toFixed(2)} /></Field>
            </div>
            <p className="mt-3 flex items-center gap-1 text-[13px] text-text-secondary">
                <Icon icon="solar:alt-arrow-right-bold" className="h-3.5 w-3.5" />
                ფერი, ზომა და დამატებითი ინფორმაცია
            </p>
        </div>
    );
}

// „მარაგიდან არჩევა" — მთელ აპს ფარავს, როგორც რეალურ დეშბორდში.
export function StockPicker({ frame, m }: { frame: Frame; m: boolean }) {
    if (!frame.pickerVisible) return null;

    const query = frame.search;
    const list = products.filter(product => product.stock > 0 && (query.length < 2 || product.name.includes(query))).slice(0, m ? 4 : 5);
    const k = frame.pickerIn;

    return (
        <div className="absolute inset-0 z-40" style={{ opacity: k }}>
            <div className="absolute inset-0 bg-[rgb(2_8_23/0.55)] backdrop-blur-[3px]" />
            <div
                className={`absolute flex flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-[0_2rem_5rem_-1rem_rgb(2_8_23/0.6)] ${
                    m ? "inset-x-3 top-6 bottom-6" : "top-10 bottom-10 left-1/2 w-[760px] -translate-x-1/2"
                }`}
                style={{ scale: `${0.96 + k * 0.04}` }}
            >
                <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
                    <p className="flex items-center gap-2 text-lg font-bold text-text-primary">
                        <Icon icon="solar:box-linear" className="h-6 w-6 text-success" />
                        მარაგიდან არჩევა
                    </p>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-text-primary">
                        <Icon icon="solar:close-circle-linear" className="h-6 w-6" />
                    </span>
                </div>

                <div className="space-y-3 px-5 pt-4">
                    <span className="grid grid-cols-2 rounded-2xl border border-border bg-background p-1 text-[15px]">
                        <span className="flex h-10 items-center justify-center gap-2 rounded-xl bg-accent/15 font-semibold text-accent">
                            <Icon icon="solar:box-linear" className="h-5 w-5" />
                            პროდუქტები
                        </span>
                        <span className="flex h-10 items-center justify-center gap-2 text-text-primary">
                            <Icon icon="solar:layers-linear" className="h-5 w-5" />
                            მასალები
                        </span>
                    </span>
                    <span
                        data-demo="picker-search"
                        className={`flex h-12 items-center gap-3 rounded-2xl border bg-background px-4 text-[15px] transition-[border-color,box-shadow] ${
                            frame.focus === "picker-search" ? "border-accent ring-4 ring-accent/15" : "border-border"
                        }`}
                    >
                        <Icon icon="solar:magnifer-linear" className="h-5 w-5 shrink-0 text-text-secondary" />
                        <span className={query ? "text-text-primary" : "text-text-secondary"}>{query || "სახელი, SKU, ფერი ან ზომა"}</span>
                        {frame.focus === "picker-search" && <span className="demo-caret -ml-2 h-5 w-[1.5px] bg-accent" />}
                    </span>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-5">
                    {list.map(product => {
                        const target = product.id === ordered.id;
                        return (
                            <div key={product.id} className={`demo-pop flex items-center gap-4 rounded-2xl border bg-background p-3 ${target && frame.near("picker-add") ? "border-success/60" : "border-border"}`}>
                                <ProductThumb icon={product.icon} tint={product.tint} size="h-14 w-14" iconSize="h-9 w-9" />
                                <span className="min-w-0 flex-1">
                                    <span className={`block text-[15px] leading-snug font-semibold text-text-primary ${m ? "line-clamp-2" : "truncate"}`}>{product.name}</span>
                                    <span className="block truncate text-xs text-text-secondary">
                                        {product.sku} · {product.variant}
                                    </span>
                                    <span className="block text-sm font-bold text-text-primary tabular-nums">{money(product.price)}</span>
                                </span>
                                <span
                                    data-demo={target ? "picker-add" : undefined}
                                    className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-success/50 px-3 text-[13px] font-semibold text-success transition-[transform,background-color] duration-150 ${
                                        target && frame.pressed("picker-add") ? "scale-95 bg-success text-white" : target && frame.near("picker-add") ? "bg-success/10" : ""
                                    }`}
                                >
                                    <Icon icon="solar:add-circle-linear" className="h-5 w-5" />
                                    {m ? product.stock : `დაუზიანებელი · ${product.stock}`}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border py-3 text-sm text-text-secondary">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border"><Icon icon="solar:alt-arrow-left-linear" className="h-5 w-5" /></span>
                    {query.length >= 2 ? "1 / 1" : "1 / 3"}
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-accent"><Icon icon="solar:alt-arrow-right-linear" className="h-5 w-5" /></span>
                </div>
            </div>
        </div>
    );
}

export function Toast({ frame, m }: { frame: Frame; m: boolean }) {
    return (
        <div
            className={`absolute z-50 flex items-center gap-3 rounded-2xl border border-success/30 bg-surface p-3 pr-5 text-sm text-text-primary shadow-xl transition-all duration-300 ${
                m ? "inset-x-4 bottom-4" : "right-6 bottom-6"
            } ${frame.toast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}
        >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/15 text-success">
                <Icon icon="solar:check-circle-bold" className="h-6 w-6" />
            </span>
            <span>
                <span className="block font-semibold">შეკვეთა {order.number} შენახულია</span>
                <span className="block text-xs text-text-secondary">მარაგი და ანალიტიკა განახლდა</span>
            </span>
        </div>
    );
}
