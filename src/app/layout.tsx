import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SessionProvider } from "@/components/SessionProvider";
import { AppLayout } from "@/components/AppLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MyPocket - Suas finanças sob controle",
  description: "Aplicativo de controle de finanças pessoais. Organize suas despesas, receitas e orçamentos de forma simples e inteligente.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        <SessionProvider>
          <AppLayout>{children}</AppLayout>
          <Toaster />
        </SessionProvider>
      </body>
    </html>
  );
}
