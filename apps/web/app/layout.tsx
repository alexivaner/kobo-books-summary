import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Kobo Books Summary · Your reading, remembered",
  description:
    "A private home for your books, highlights, and ideas. Local-first, offline-ready.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
