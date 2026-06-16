import "./globals.css";
import { ThemeProvider } from "@/shared/components/theme-provider";
import { cn } from "@/lib/utils";
import { Providers } from "@/shared/components/Providers";
import { Toaster } from "@/shared/components/ui/sonner";
import { MainLayout } from "@/shared/components/layout/MainLayout";
import { SplashScreen } from "@/shared/components/ui/SplashScreen";
import NextTopLoader from 'nextjs-toploader';

import { Inter } from "next/font/google";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getTrades, getRules, getMonthlyAnalyses } from "@/lib/db";
import type { Trade, Rule, MonthlyAnalysis } from "@/lib/db";
import { DataProvider } from "@/shared/context/DataContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "TradeHow | Professional Trading Journal",
  description: "Enterprise-grade personal trading journal assistant",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  
  let trades: Trade[] = [];
  let rules: Rule[] = [];
  let analyses: MonthlyAnalysis[] = [];
  
  if (session?.user?.email) {
      [trades, rules, analyses] = await Promise.all([
          getTrades(session.user.email),
          getRules(session.user.email),
          getMonthlyAnalyses(session.user.email)
      ]);
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable,
          "bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/20 via-background to-background dark:from-indigo-950/20 dark:via-background dark:to-background"
        )}
      >
        <NextTopLoader
          color="#6366f1"
          initialPosition={0.08}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 10px #6366f1,0 0 5px #6366f1"
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <DataProvider initialTrades={trades} initialRules={rules} initialMonthlyAnalyses={analyses}>
              <SplashScreen>
                <MainLayout>
                  {children}
                </MainLayout>
              </SplashScreen>
              <Toaster />
            </DataProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
