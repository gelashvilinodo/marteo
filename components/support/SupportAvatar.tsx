import Image from "next/image";

type SupportAvatarProps = {
    name: string;
    imageUrl?: string | null;
    size?: "sm" | "md" | "lg";
    className?: string;
};

const sizes = { sm: "h-8 w-8 text-[11px]", md: "h-10 w-10 text-xs", lg: "h-14 w-14 text-base" } as const;
const pixels = { sm: 32, md: 40, lg: 56 } as const;

export function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.trim().slice(0, 2)).toUpperCase() || "?";
}

export default function SupportAvatar({ name, imageUrl, size = "sm", className = "" }: SupportAvatarProps) {
    return <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent/15 font-semibold text-accent ring-2 ring-surface ${sizes[size]} ${className}`}>
        {imageUrl
            ? <Image src={imageUrl} alt={name} width={pixels[size]} height={pixels[size]} className="h-full w-full object-cover" />
            : <span aria-hidden="true">{initials(name)}</span>}
    </span>;
}

export function MarteoAvatar({ size = "sm", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
    // The brand mark's square spans 66% of the file; scaling fills the circle with it.
    // Dark mode uses the light variant so the mark stays visible on dark surfaces.
    return <span className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-[#0b1928] dark:bg-white ${sizes[size]} ${className}`}>
        <Image src="/images/marteo-11.svg" alt="MARTEO" width={pixels[size]} height={pixels[size]} className="h-full w-full scale-[1.52] dark:hidden" />
        <Image src="/images/marteo-12.svg" alt="" aria-hidden="true" width={pixels[size]} height={pixels[size]} className="hidden h-full w-full scale-[1.52] dark:block" />
    </span>;
}
