import type { TourStep } from "@/components/tour/GuidedTour";
import { stocktakePrintSteps } from "@/components/dashboard/inventory/inventory-tour";

// „პარტიები“ მხოლოდ მაშინ ჩანს, როცა სიაში მასალა მაინც არის.
export const materialInventoryTourSteps: TourStep[] = [
    {
        target: "material-cards",
        title: "მასალების მდგომარეობა",
        body: "ხედავთ, რამდენი მასალა გაქვთ სულ, რომელია ხელმისაწვდომი წარმოებისთვის, რომელი ამოიწურა, რა არის გზაში და რომელს აქვს დეფექტი. ბარათზე დაჭერით სია გაიფილტრება.",
    },
    {
        target: "material-filters",
        title: "ძებნა და დალაგება",
        body: "მოძებნეთ მასალა სახელით, კატეგორიით, ფერით ან ზომით და დაალაგეთ სახელით ან სიახლით.",
    },
    {
        target: "material-list",
        title: "მასალების სია",
        body: "აქ ჩანს თითოეული მასალის ნაშთი, ასევე გზაში მყოფი და დეფექტური რაოდენობა. გზაში მყოფი და დეფექტური მასალა წარმოებისთვის ხელმისაწვდომ ნაშთში არ შედის.",
    },
    {
        target: "material-lots",
        title: "პარტიები",
        body: "აქ ნახავთ, რომელი შესყიდვიდან რამდენი მასალა დარჩა და რა ღირს ერთი ერთეული.",
    },
    {
        target: "material-purchase-link",
        title: "მასალების შესყიდვა",
        body: "ახალი მასალა მარაგში შესყიდვიდან შემოდის. ამ ღილაკით მასალების შესყიდვის გვერდზე გადახვალთ.",
    },
    ...stocktakePrintSteps("მასალაზე"),
];
