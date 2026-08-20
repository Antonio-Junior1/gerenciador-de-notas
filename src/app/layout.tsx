import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gerenciador de Notas",
  description: "Organize notas fiscais, boletos e documentos financeiros em um só lugar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
