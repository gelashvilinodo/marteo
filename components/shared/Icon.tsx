"use client";

import { Icon as IconifyIcon, type IconProps } from "@iconify/react";

// Iconify ხატულებს მხოლოდ JavaScript-ის ჩატვირთვის შემდეგ ხატავს. მანამდე მათ ადგილას იმავე ზომის
// ცარიელი ყუთი დგას, რომ ხატულის გამოჩენისას ტექსტი არ გადაადგილდეს (CLS).
export function Icon({ className, ...props }: IconProps) {
    return (
        <IconifyIcon
            {...props}
            className={className}
            fallback={<span aria-hidden="true" className={className ? `iconify-placeholder ${className}` : "iconify-placeholder"} />}
        />
    );
}
