import "./globals.css";
import { ThemeProvider } from "@/shared/components/theme-provider";
import { cn } from "@/lib/utils";
import { Providers } from "@/shared/components/Providers";
import { Toaster } from "@/shared/components/ui/sonner";
import { MainLayout } from "@/shared/components/layout/MainLayout";
import { SplashScreen } from "@/shared/components/ui/SplashScreen";
import NextTopLoader from 'nextjs-toploader';
import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/shared/components/ServiceWorkerRegister";

import { Inter } from "next/font/google";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getTrades, getRules, getMonthlyAnalyses, getConstitution, getBreaches, getImpulses } from "@/lib/db";
import type { Trade, Rule, MonthlyAnalysis, ConstitutionSettings, Breach, Impulse } from "@/lib/db";
import { DataProvider } from "@/shared/context/DataContext";
import { canUseConstitution } from "@/lib/access";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "TradeHow | Professional Trading Journal",
  description: "Enterprise-grade personal trading journal assistant",
  applicationName: "TradeHow",
  appleWebApp: { capable: true, title: "TradeHow", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
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
  let constitution: ConstitutionSettings | null = null;
  let breaches: Breach[] = [];
  let impulses: Impulse[] = [];
  
  const constitutionAllowed = canUseConstitution(session?.user?.email);

  if (session?.user?.email) {
      const email = session.user.email;
      [trades, rules, analyses, constitution, breaches, impulses] = await Promise.all([
          getTrades(email),
          getRules(email),
          getMonthlyAnalyses(email),
          constitutionAllowed ? getConstitution(email) : Promise.resolve(null),
          constitutionAllowed ? getBreaches(email) : Promise.resolve([]),
          constitutionAllowed ? getImpulses(email) : Promise.resolve([])
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
        <ServiceWorkerRegister />
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
            <DataProvider
              initialTrades={trades}
              initialRules={rules}
              initialMonthlyAnalyses={analyses}
              initialConstitution={constitution}
              initialBreaches={breaches}
              initialImpulses={impulses}
              constitutionAllowed={constitutionAllowed}
            >
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
