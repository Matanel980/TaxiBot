import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const heebo = Heebo({
  subsets: ["latin", "hebrew"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-heebo",
});

export const metadata: Metadata = {
  title: "TaxiFlow - מערכת ניהול מוניות",
  description: "מערכת ניהול מוניות מקצועית",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className={heebo.className} suppressHydrationWarning>
        {children}
        <Toaster 
          position="top-right"
          richColors
          closeButton
          offset="20px"
          toastOptions={{
            classNames: {
              toast: 'glass-card-light border-2 border-white/50 backdrop-blur-xl shadow-2xl',
              success: 'bg-green-50/90 border-green-200',
              error: 'bg-red-50/90 border-red-200',
              info: 'bg-blue-50/90 border-blue-200',
              warning: 'bg-yellow-50/90 border-yellow-200',
            },
          }}
        />
      </body>
    </html>
  );
}


