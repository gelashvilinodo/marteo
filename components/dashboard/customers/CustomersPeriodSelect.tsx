"use client";

import type { ReactNode } from "react";
import type { CustomersPeriod } from "@/lib/customers/customers-period";

import PeriodFilter, {
    standardPeriodOptions,
    type PeriodValues,
} from "@/components/dashboard/shared/PeriodFilter";

export default function CustomersPeriodSelect({
    period,
    from,
    to,
    pending,
    heading,
    action,
    onChange,
}: {
    period: CustomersPeriod;
    from: string;
    to: string;
    pending: boolean;
    heading?: ReactNode;
    action?: ReactNode;
    onChange: (values: PeriodValues<CustomersPeriod>) => void;
}) {
    return (
        <PeriodFilter
            heading={heading}
            action={action}
            value={period}
            from={from}
            to={to}
            pending={pending}
            options={standardPeriodOptions}
            onChange={onChange}
        />
    );
}