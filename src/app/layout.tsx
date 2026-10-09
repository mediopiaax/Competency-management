import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "역량 평가",
  description: "역량 목록으로 평가기준표를 만들고 대상자 데이터를 평가합니다",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
      </head>
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-36 pt-10">{children}</main>
      </body>
    </html>
  );
}
