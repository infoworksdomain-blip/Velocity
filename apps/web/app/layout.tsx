import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VELOCITY",
  description: "URL in, published post out.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
