import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Inwards · Warehouse receiving",
  description:
    "Scan SKU tags, review received quantities, and export receipts.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
