import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "食事日記 - たべコーチ",
  description: "あなたの食事記録とAI総評",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1e293b",
  viewportFit: "cover",
};

export default function DiaryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
