import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Safe Multi-Sig Demo",
  description: "Demo for Safe Protocol Kit + Safe Transaction Service",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
