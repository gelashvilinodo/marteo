import { Icon } from "@iconify/react";
import { FEATURE_MIN_TIER, type PlanFeature } from "@/lib/subscription/plans";

// გვირგვინი დაბლოკილ ფუნქციაზე: ოქროსფერი, თუ მხოლოდ PRO-შია, თორემ ლურჯი (დღე) / თეთრი (ღამე).
// onDark: მუქ ფონზე (საიდბარი, ჰედერი) ლურჯი ორივე რეჟიმში ჩანს.
export default function PlanCrown({ feature, pro, onDark = false, className = "h-3.5 w-3.5" }: {
    feature?: PlanFeature | null;
    pro?: boolean;
    onDark?: boolean;
    className?: string;
}) {
    const gold = pro ?? (feature ? FEATURE_MIN_TIER[feature] === "PRO" : false);
    const color = gold ? "text-[#E0A526]" : onDark ? "text-accent" : "text-accent dark:text-white";
    return <Icon icon="solar:crown-bold" aria-hidden="true" className={`shrink-0 ${color} ${className}`} />;
}

// ღილაკის ზედა მარჯვენა კუთხეში დასმული გვირგვინი. მშობელს relative უნდა ჰქონდეს.
export function CornerCrown({ feature, pro, onDark }: { feature?: PlanFeature | null; pro?: boolean; onDark?: boolean }) {
    return <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface shadow-sm">
        <PlanCrown feature={feature} pro={pro} onDark={onDark} className="h-3 w-3" />
    </span>;
}
