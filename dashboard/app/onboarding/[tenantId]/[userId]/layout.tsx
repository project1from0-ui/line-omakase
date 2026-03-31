import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "初回登録 - たべコーチ",
  description: "あなたの情報を登録して、パーソナライズされた食事指導を始めましょう",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1e293b",
  viewportFit: "cover",
};

export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
