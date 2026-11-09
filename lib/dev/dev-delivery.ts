// ლოკალური ტესტირების რეჟიმი: ელფოსტა და SMS არ იგზავნება, კოდი/ბმული სერვერის ჟურნალში იწერება.
// ირთვება მხოლოდ ორივე პირობით: `next dev` (NODE_ENV=development) და DEV_DELIVERY=console.
// production build-ში NODE_ENV ყოველთვის "production"-ია, ამიტომ ცოცხალ საიტზე ვერ ჩაირთვება.
export function devDeliveryToConsole(): boolean {
    return process.env.NODE_ENV === "development" && process.env.DEV_DELIVERY === "console";
}

export function logDevDelivery(channel: "email" | "sms", to: string, content: string): void {
    console.info(`[DEV_DELIVERY] ${channel} to=${to} ${content}`);
}
