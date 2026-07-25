import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Local Prospect Finder – AI Business Intelligence Platform',
  description: 'Discover local businesses, analyze their digital presence, score leads, and identify sales opportunities with AI-powered auditing.',
  keywords: 'local business discovery, lead generation, SEO audit, website analysis, sales intelligence',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-950 text-gray-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
