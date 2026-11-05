import type { Metadata } from "next";
import "./globals.css";
import { appPath } from "../lib/paths";
export const metadata: Metadata = {
  title: "Readmory · Your reading, remembered",
  applicationName: "Readmory",
  icons: {
    icon: [{ url: appPath("/brand/favicon.svg"), type: "image/svg+xml" }],
    apple: appPath("/brand/readmory-r-icon.png"),
  },
  description:
    "Your reading, remembered. A private library for Kobo, KOReader and Kobalt books, highlights, and ideas.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('kobo-theme')==='dark')document.documentElement.dataset.theme='dark'}catch{}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
