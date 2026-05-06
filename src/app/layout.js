import "./globals.css";
import AppShell from "@/components/AppShell";
import { Outfit } from "next/font/google";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata = {
  title: "Academic Suite | Research Humanizer & Generator",
  description: "Professional-grade research paper tools",
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={outfit.className}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
