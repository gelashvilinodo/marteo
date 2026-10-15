"use client";

import { useState, type ComponentProps } from "react";
import Image from "next/image";
import { productThumbnailUrl } from "@/lib/images/product-thumbnail-url";

export default function ProductThumbnail({ src, alt, onError, ...props }: ComponentProps<typeof Image>) {
    const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
    const thumbnail = typeof src === "string" ? productThumbnailUrl(src) : src;
    const useThumbnail = typeof thumbnail === "string" && thumbnail !== src && thumbnail !== failedThumbnail;
    return <Image {...props} alt={alt} src={useThumbnail ? thumbnail : src} unoptimized onError={event => {
        if (useThumbnail) setFailedThumbnail(thumbnail);
        else onError?.(event);
    }} />;
}
