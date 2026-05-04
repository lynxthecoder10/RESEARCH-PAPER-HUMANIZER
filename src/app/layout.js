import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Chatbot from "@/components/Chatbot";
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
        <div className="app-container">
          <Sidebar />
          <main className="main-viewport">
            <div className="background-mesh"></div>
            <div className="noise-overlay"></div>
            {children}
            <Chatbot />
          </main>
        </div>
      </body>
    </html>
  );
}
