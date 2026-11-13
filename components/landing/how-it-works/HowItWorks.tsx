"use client";

import { DemoPlayer } from "./Player";
import { Header, MobileMenu, Sidebar } from "./Shell";
import { OrderForm, StockPicker, Toast } from "./OrderForm";
import { AnalyticsPage, HomePage, InventoryPage, OrdersPage } from "./Pages";
import { buildFrame, buildScript, type Frame } from "./timeline";
import type { DemoDates } from "./engine";

// „როგორ მუშაობს" #1: ახალი შეკვეთა → შეკვეთების სია → მარაგი → მოგება.
export default function HowItWorks() {
    return (
        <DemoPlayer
            id="how-it-works"
            className="border-t border-border"
            eyebrow={{ icon: "solar:magic-stick-3-linear", label: "როგორ მუშაობს" }}
            title="ერთი შეკვეთა — დანარჩენს MARTEO აკეთებს"
            subtitle="ნახეთ, როგორ ფორმდება შეკვეთა და როგორ ახლდება მარაგი და მოგება თავისით."
            buildScript={buildScript}
            render={(t, script, dates) => <DemoApp frame={buildFrame(t, script)} m={script.mode === "mobile"} dates={dates} />}
        />
    );
}

function DemoApp({ frame, m, dates }: { frame: Frame; m: boolean; dates: DemoDates }) {
    const props = { frame, m, dates };

    return (
        <div className="relative flex h-full w-full bg-background font-sans text-text-primary">
            {!m && <Sidebar frame={frame} />}

            <div className="relative flex min-w-0 flex-1 flex-col">
                <Header frame={frame} m={m} />

                <div className="relative min-h-0 flex-1">
                    <div key={frame.page} data-demo-scroll className="demo-page absolute inset-0 overflow-hidden">
                        <div data-demo-scroll-content>
                            {frame.page === "home" && <HomePage {...props} />}
                            {frame.page === "orders" && <OrdersPage orders={frame.orders} m={m} dates={dates} />}
                            {frame.page === "inventory" && <InventoryPage {...props} />}
                            {frame.page === "analytics" && <AnalyticsPage {...props} />}
                        </div>
                    </div>

                    <OrderForm frame={frame} m={m} />
                    <Toast frame={frame} m={m} />
                </div>

                {m && <MobileMenu frame={frame} />}
            </div>

            <StockPicker frame={frame} m={m} />
        </div>
    );
}
