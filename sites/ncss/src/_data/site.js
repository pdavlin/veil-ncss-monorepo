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
      { label: 'capabilities.', href: '/capabilities/' },
      { label: 'team.', href: '/team/' },
    ],
    homePrimary: [
      { label: 'portfolio.', href: '/portfolio/' },
      { label: 'capabilities.', href: '/capabilities/' },
      { label: 'team.', href: '/team/' },
    ],
    homeSecondary: [],
  },
  social: [],
  // Founder email + phone intentionally omitted — direct addresses get
  // scraped by bots. Contact form is the public path. Components gate on
  // {% if founder.email %} / {% if founder.phone %} so they render
  // cleanly without these fields.
  founders: [
    { name: 'Ben MacKenzie, PE', role: 'Founder' },
    { name: 'Adam MacKenzie, PE', role: 'Founder' },
  ],
};
