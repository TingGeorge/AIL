import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'ALL in Life',
    short_name: 'ALL in Life',
    description: '圓山生活圈的 CP 值、零元機會與 Team 協作平台。',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d110d',
    theme_color: '#c9ff36',
    lang: 'zh-TW',
    icons: [
      { src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/app-icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
