"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { PlanFeature } from "@/lib/subscription/plans";
import { usePlan } from "./PlanContext";
import { CornerCrown } from "./PlanCrown";

// სერვერის გვერდებისთვის: გეგმაში ფუნქცია თუ არ შედის, ბმული გვირგვინიან ღილაკად იქცევა და გეგმის ფანჯარას ხსნის.
export default function PlanGatedLink({ href, feature, className, children }: { href: string; feature: PlanFeature; className: string; children: ReactNode }) {
    const { allows, guard } = usePlan();
    if (allows(feature)) return <Link href={href} className={className}>{children}</Link>;
    return <button type="button" onClick={() => guard(feature)} className={`relative ${className}`}>
        {children}
        <CornerCrown feature={feature} />
    </button>;
}
