import "./globals.css";
import { ThemeProvider } from "@/shared/components/theme-provider";
import { cn } from "@/lib/utils";
import { Providers } from "@/shared/components/Providers";
import { Toaster } from "@/shared/components/ui/sonner";
import { MainLayout } from "@/shared/components/layout/MainLayout";
import { SplashScreen } from "@/shared/components/ui/SplashScreen";

import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "TradeHow | Professional Trading Journal",
  description: "Enterprise-grade personal trading journal assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable,
          "bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/20 via-background to-background dark:from-indigo-950/20 dark:via-background dark:to-background"
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <SplashScreen>
              <MainLayout>
                {children}
              </MainLayout>
            </SplashScreen>
            <Toaster />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
