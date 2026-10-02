import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "역량 평가",
  description: "역량 목록으로 채점기준표를 만들고 학생 데이터를 평가합니다",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
