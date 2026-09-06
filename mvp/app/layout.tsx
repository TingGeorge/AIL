import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const themeInitializationScript = `
  (() => {
    const storageKey = 'all-in-life-theme';
    let theme = 'dark';

    try {
      const savedTheme = window.localStorage.getItem(storageKey);
      theme = savedTheme === 'light' || savedTheme === 'dark'
        ? savedTheme
        : window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
    } catch {
      theme = window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#090c0a' : '#f1efe6');
  })();
`;

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ALL IN LIFE｜圓山 CP 值生活平台',
  description:
    '透過可信資料、CP Value、Team 協作與 Zero-Cost 情報，找到圓山 2 公里內更好的生活選擇。',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/app-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/app-icon-192.png', sizes: '192x192' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ALL IN LIFE',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#090c0a" />
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
