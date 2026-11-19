export interface PortfolioCase {
  id: string;
  video: string;
  title: string;
  rows: [string, string, string];
  key: string;
  text: string;
}

export const MEDIA = {
  plate: '/media/plate.webp',
  casePlate: '/media/case-plate.webp',
  cut: '/media/cut.webp',
  badge: '/media/badge.webp',
  trans: '/media/transition.mp4',
} as const;

export const BADGE_ROWS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'NAME', value: 'E. HALDOREN' },
  { label: 'FOCUS', value: 'MOTION DESIGN' },
  { label: 'TG', value: '@HALDOREN.MOTION' },
  { label: 'EMAIL', value: 'HI@HALDOREN.STUDIO' },
];

export const CASES: ReadonlyArray<PortfolioCase> = [
  {
    id: 'vell-lookbook',
    video: '/media/vell-lookbook.mp4',
    title: 'VELL LOOKBOOK',
    rows: ['STUDIO VELL', 'E-COMMERCE', '2026'],
    key: '// vell lookbook',
    text: '— a runway lookbook where every look steps forward on scroll and the cart follows along.',
  },
  {
    id: 'vasari-shelf',
    video: '/media/vasari-vhs-hero.mp4',
    title: 'VASARI SHELF',
    rows: ['VASARI ARCHIVE', 'PORTFOLIO', '2026'],
    key: '// vasari shelf',
    text: '— a director’s archive told as a shelf of tapes: pull one out and its story plays.',
  },
  {
    id: 'mina-portrait',
    video: '/media/living-portrait-hero.mp4',
    title: 'MINA PORTRAIT',
    rows: ['MINA 3D', 'PERSONAL SITE', '2025'],
    key: '// mina portrait',
    text: '— a 3D creator’s homepage where the portrait follows your cursor and pulls faces.',
  },
];
