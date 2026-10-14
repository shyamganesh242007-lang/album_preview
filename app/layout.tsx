import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zeebook Studio – Wedding Album Proofing & Review System",
  description: "Professional client proofing, physical-style page flip viewer, correction pins, and approval system for wedding photography studios.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#07090e] text-slate-100">
        {children}
      </body>
    </html>
  );
}
