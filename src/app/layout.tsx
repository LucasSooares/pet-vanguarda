import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Providers } from "@/components/providers"
import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" })

export const metadata: Metadata = {
  title: { default: "Pet Vanguarda — Portal", template: "%s · Pet Vanguarda" },
  description: "Portal administrativo da equipe Pet Vanguarda",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: "#0d8a72" }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
