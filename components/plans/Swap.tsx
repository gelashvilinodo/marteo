import type { ReactNode } from "react";

// ორი ვარიანტი ერთ უჯრაში დგას (grid stack), ამიტომ ადგილი ყოველთვის უფრო დიდისაა და გადართვისას განლაგება არ ხტება.
// ჩართვისას ყველაფერი ზემოთ გადაგორდება, გამორთვისას ქვემოთ, როგორც ბარაბანი. prefers-reduced-motion-ზე უბრალოდ იცვლება.
export default function Swap({ on, yes, no, inline = false, className = "" }: {
    on: boolean;
    yes: ReactNode;
    no: ReactNode;
    inline?: boolean;
    className?: string;
}) {
    const Tag = inline ? "span" : "div";
    const layer = (visible: boolean, hiddenAt: string, content: ReactNode) => <Tag aria-hidden={!visible}
        className={`col-start-1 row-start-1 transition-[opacity,translate,visibility] duration-300 ease-out motion-reduce:transition-none ${visible ? "visible translate-y-0 opacity-100" : `invisible ${hiddenAt} opacity-0`}`}>
        {content}
    </Tag>;
    return <Tag className={`${inline ? "inline-grid" : "grid"} ${className}`}>
        {layer(!on, "-translate-y-1.5", no)}
        {layer(on, "translate-y-1.5", yes)}
    </Tag>;
}
