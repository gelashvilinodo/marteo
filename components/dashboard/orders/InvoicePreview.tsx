"use client";

import {
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";

export default function InvoicePreview({
    width,
    children,
}: {
    width: string;
    children: ReactNode;
}) {
    const container = useRef<HTMLDivElement>(null);
    const document = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({
        width: 0,
        height: 0,
        scale: 1,
    });

    useLayoutEffect(() => {
        const host = container.current;
        const content = document.current;
        if (!host || !content) return;

        const measure = () => {
            const naturalWidth = content.offsetWidth;
            const naturalHeight = content.offsetHeight;

            if (!naturalWidth || !host.clientWidth) return;

            const scale = Math.min(
                1,
                host.clientWidth / naturalWidth,
            );

            setSize(previous => {
                if (
                    previous.width === naturalWidth &&
                    previous.height === naturalHeight &&
                    previous.scale === scale
                ) {
                    return previous;
                }

                return {
                    width: naturalWidth,
                    height: naturalHeight,
                    scale,
                };
            });
        };

        const observer = new ResizeObserver(measure);
        observer.observe(host);
        observer.observe(content);
        measure();

        return () => observer.disconnect();
    }, [width]);

    return (
        <div
            ref={container}
            className="invoice-preview-host w-full min-w-0"
        >
            <div
                className="invoice-preview-stage relative mx-auto"
                style={{
                    width: size.width
                        ? size.width * size.scale
                        : "100%",
                    height: size.height * size.scale,
                }}
            >
                <div
                    ref={document}
                    className="invoice-preview-inner absolute left-0 top-0 origin-top-left"
                    style={{
                        width,
                        transform: `scale(${size.scale})`,
                    }}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}