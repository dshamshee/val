import type { Metadata } from "next";
import "./globals.css";
import { GlobalHeader } from "@/components/GlobalHeader";

export const metadata: Metadata = {
  title: "RXBE Data Validator",
  description: "Live validation and audit engine for energy indicators, document sources, and data feeds",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans antialiased">
        <GlobalHeader />
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
