import type { TourStep } from "@/components/tour/GuidedTour";
import { hasBusinessFeature, type BusinessMode } from "@/lib/business/business-mode";

// მართეოს ზოგადი მიმოხილვა: ბარათები შუაშია და არაფერზე მიუთითებს.
// გვერდი მხოლოდ მაშინ ჩანს, თუ ბიზნესის ტიპს აქვს და წევრს მისი ნახვის უფლება აქვს.
// ai: მართეო AI მხოლოდ მფლობელს უჩანს (იხ. dashboard/layout.tsx).
export function homeTourSteps(mode: BusinessMode, canOpen: (path: string) => boolean, ai: boolean): TourStep[] {
    const imports = hasBusinessFeature(mode, "imports");
    const manufacturing = hasBusinessFeature(mode, "manufacturing");
    const pages: Array<TourStep & { path?: string; show?: boolean }> = [
        {
            icon: "solar:home-2-linear",
            path: "/dashboard",
            title: "მთავარი",
            body: "არჩეული პერიოდის მოკლე სურათი: გაყიდვები, მოგება, შეკვეთები, ხარჯები და ბოლო აქტივობა. აქედანვე დაამატებ ახალ შეკვეთას.",
        },
        {
            icon: "solar:clipboard-list-linear",
            path: "/dashboard/orders",
            title: "შეკვეთები",
            body: "აქ ამატებ და მართავ შეკვეთებს: სტატუსი, გადახდა, დაბრუნება და გადაცვლა. იქვე ამობეჭდავ ინვოისებს და რამდენიმე შეკვეთას ერთად შეუცვლი სტატუსს.",
        },
        {
            icon: "solar:cart-large-2-linear",
            path: "/dashboard/purchases",
            show: imports,
            title: "შესყიდვები",
            body: "შემოტანილი პროდუქტის პარტიები: ფასები, ტრანსპორტირება და სხვა ხარჯები. თვითღირებულებას მართეო თავად ითვლის, გასაყიდ ფასს კი შენი წესით. მიღების შემდეგ პროდუქტი მარაგს ემატება.",
        },
        {
            icon: "solar:layers-linear",
            path: "/dashboard/material-purchases",
            show: manufacturing,
            title: "მასალების შესყიდვა",
            body: "წარმოებისთვის საჭირო მასალების პარტიები. მიღების დადასტურების შემდეგ მასალები მარაგში ჩნდება და წარმოებაში გამოიყენება.",
        },
        {
            icon: "solar:structure-linear",
            path: "/dashboard/production",
            show: manufacturing,
            title: "წარმოება",
            body: "მასალებისგან პროდუქტის დამზადება. მასალები და დამატებითი ხარჯები თვითღირებულებაში ჯამდება, დასრულებული პროდუქტი კი მარაგს ემატება.",
        },
        {
            icon: "solar:box-linear",
            path: "/dashboard/inventory",
            title: "მარაგები",
            body: manufacturing
                ? "რა გაქვს საწყობში, რა იწურება და რა არის წუნდებული. პროდუქტებისა და მასალების მარაგი ცალ-ცალკე ჩანს, ინვენტარიზაციისთვის კი უწყისს A4-ზე ამობეჭდავ."
                : "რა გაქვს საწყობში, რა იწურება და რა არის წუნდებული. ინვენტარიზაციისთვის უწყისს A4-ზე ამობეჭდავ.",
        },
        {
            icon: "solar:users-group-rounded-linear",
            path: "/dashboard/customers",
            title: "მომხმარებლები",
            body: "შეკვეთებიდან თავისით ივსება. ხედავ ახალ, განმეორებით და ყველაზე ხშირ მყიდველებს და მათ შეკვეთებს.",
        },
        {
            icon: "solar:chart-2-linear",
            path: "/dashboard/analytics",
            title: "ანალიტიკა",
            body: "ფინანსები: გაყიდვები, თვითღირებულება, ხარჯები და სუფთა მოგება. აქ ამატებ ხარჯებს, მაგალითად ქირას ან რეკლამას, და ბეჭდავ ბიზნესის ანგარიშს ბუღალტრისთვის.",
        },
        {
            icon: "solar:graph-up-linear",
            path: "/dashboard/statistics",
            title: "სტატისტიკა",
            body: "როგორ ვითარდება ბიზნესი: დასრულებული შეკვეთები დროში, გადახდის მეთოდები, ყველაზე გაყიდვადი პროდუქტები და ერთგული მომხმარებლები.",
        },
        {
            icon: "solar:calendar-linear",
            path: "/dashboard/calendar",
            title: "კონტენტ-კალენდარი",
            body: "სოციალური ქსელების პოსტების დაგეგმვა: რას, როდის და რომელ პლატფორმაზე გამოაქვეყნებ. ერთად ჩანს დაგეგმილი, გამოქვეყნებული და დაგვიანებული პოსტები.",
        },
    ];
    return [
        {
            icon: "solar:star-shine-linear",
            title: "მოგესალმებით მართეოში",
            body: "მართეო შენი ბიზნესის ერთი სივრცეა: შეკვეთები, მარაგი, შესყიდვები და ფინანსები ერთ ადგილას. მოკლედ გაჩვენებ, რა არის თითო გვერდზე. გვერდებს მენიუდან გახსნი.",
        },
        ...pages.filter(page => page.show !== false && (!page.path || canOpen(page.path))).map(({ icon, title, body }) => ({ icon, title, body })),
        ...(ai ? [{
            icon: "solar:magic-stick-3-linear",
            title: "მართეო AI",
            body: "ასისტენტი, რომელსაც ბიზნესზე კითხვას დაუსვამ, მაგალითად: „რა გაიყიდა ყველაზე მეტად ამ თვეში?“. Excel, Numbers ან CSV ფაილიდან შესყიდვის შედგენაშიც დაგეხმარება.",
        }] : []),
        {
            icon: "solar:chat-round-dots-linear",
            title: "დახმარება",
            body: "თუ რამე გაუგებარია, „დახმარების“ გვერდიდან პირდაპირ მოგვწერე. ჩვეულებრივ რამდენიმე წუთში გპასუხობთ.",
        },
        {
            icon: "solar:question-circle-linear",
            title: "გვერდის გაცნობა",
            body: "ყველა გვერდზე სათაურის გვერდით „?“ ღილაკია. დააჭირე და გვერდს ნაბიჯ-ნაბიჯ აგიხსნის. ამ მიმოხილვას კი ნებისმიერ დროს ნახავ მთავარ გვერდზე „?“-ით.",
        },
    ];
}
