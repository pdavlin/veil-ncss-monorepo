export default {
  name: 'NCSS',
  shortName: 'NCSS',
  wordmark: 'ncss',
  logo: {
    src: '/assets/img/brand/ncss-logo-horiz.png',
    alt: 'NCSS',
    width: 6984,
    height: 2475,
  },
  headerLogo: {
    src: '/assets/img/brand/ncss-logo-horiz.png',
    alt: 'NCSS',
    width: 6984,
    height: 2475,
  },
  tagline: 'National Commercial Shading Solutions',
  url: 'https://ncss.example.com',
  // Reduced sitemap: portfolio + team only for now.
  // Home hero: stack both items into homePrimary so the left-aligned column
  // reads as one tight list. Secondary intentionally empty.
  nav: {
    full: [
      { label: 'portfolio.', href: '/portfolio/' },
      { label: 'team.', href: '/team/' },
    ],
    homePrimary: [
      { label: 'portfolio.', href: '/portfolio/' },
      { label: 'team.', href: '/team/' },
    ],
    homeSecondary: [],
  },
  social: [],
  founders: [
    {
      name: 'Ben MacKenzie, PE',
      role: 'Founder',
      email: 'bmackenzie@veilengineering.com',
      phone: '402.536.9115',
    },
    {
      name: 'Adam MacKenzie, PE',
      role: 'Founder',
      email: 'amackenzie@veilengineering.com',
      phone: '402.536.9118',
    },
  ],
};
