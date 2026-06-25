import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

const playfair = Playfair_Display({ 
  subsets: ["latin"],
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "LegacyBridge | Give your family the gift of knowing",
  description: "A guided way for families to preserve stories, organize important information, and ensure loved ones have everything they need.",
};

import { OnboardingProvider } from "@/components/onboarding/OnboardingContext";
import { ParentOnboardingProvider } from "@/components/onboarding/ParentOnboardingContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} font-inter antialiased`}>
        <OnboardingProvider>
          <ParentOnboardingProvider>
            {children}
          </ParentOnboardingProvider>
        </OnboardingProvider>
      </body>
    </html>
  );
}
