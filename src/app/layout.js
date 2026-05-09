import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "Academic Suite | Research Humanizer & Generator",
  description: "Professional-grade research paper tools",
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
