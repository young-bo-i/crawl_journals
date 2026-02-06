import "./globals.css";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { ThemeProvider } from "@/components/layout/theme-provider";

export const metadata = {
  title: "期刊数据聚合爬取工具",
  description: "OpenAlex + Crossref + DOAJ + NLM + Wikidata 聚合与导出",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme="dark" storageKey="journal-crawler-theme">
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 pl-52 overflow-x-hidden">
              <div className="px-5 py-4">
                {children}
              </div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
