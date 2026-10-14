import type { Metadata } from "next";
import "./globals.css";
import ModalBackdropDismiss from "@/components/ModalBackdropDismiss";

export const metadata: Metadata = {
  title: "Marteo",
  applicationName: "Marteo",
  description: "ბიზნესის მართვის თანამედროვე პლატფორმა",
  appleWebApp: {
    capable: true,
    title: "Marteo",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ka" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ModalBackdropDismiss />
        {children}
      </body>
    </html>
  );
}