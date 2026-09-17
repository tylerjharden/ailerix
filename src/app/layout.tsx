import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authEnabled } from "@/lib/auth-config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ailerix.com"),
  title: "Ailerix — Jev-powered model router",
  description:
    "Type-safe OpenRouter competitor. TypeSafe Jev (System One) banks each request to a typed model route.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const shell = (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </TooltipProvider>
    </ThemeProvider>
  );

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {authEnabled() ? (
          <ClerkProvider dynamic>{shell}</ClerkProvider>
        ) : (
          shell
        )}
      </body>
    </html>
  );
}
