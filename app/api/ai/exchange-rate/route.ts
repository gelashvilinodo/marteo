import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { orderJson } from "@/lib/orders/order-http";

type NbgDay = {
    date: string;
    currencies: Array<{ code: string; quantity: number; rate: number }>;
};

// ეროვნული ბანკის ოფიციალური კურსი: 1 ერთეული უცხოური ვალუტა ლარში.
export async function GET(request: Request) {
    const context = await getPgDashboardContext();

    if (!context?.membership) {
        return orderJson({ success: false, message: "გაიარე ავტორიზაცია." }, 401);
    }

    const params = new URL(request.url).searchParams;
    const currency = params.get("currency") ?? "";
    const date = params.get("date") ?? "";

    if (!/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return orderJson({ success: false, message: "ვალუტა ან თარიღი არასწორია." }, 400);
    }

    try {
        const response = await fetch(
            `https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?date=${date}`,
            { signal: AbortSignal.timeout(10_000) },
        );
        if (!response.ok) throw new Error(`NBG ${response.status}`);

        const [day] = await response.json() as NbgDay[];
        const entry = day?.currencies.find((item) => item.code === currency);

        if (!day || !entry || !(entry.rate > 0) || !(entry.quantity > 0)) {
            return orderJson({ success: false, message: `${currency}-ის კურსი ამ თარიღზე ვერ მოიძებნა. მიუთითე კურსი ხელით.` }, 404);
        }

        return orderJson({
            success: true,
            rate: entry.rate / entry.quantity,
            date: day.date.slice(0, 10),
        });
    } catch {
        return orderJson({ success: false, message: "ეროვნული ბანკის კურსი ვერ ჩაიტვირთა. მიუთითე კურსი ხელით." }, 502);
    }
}
