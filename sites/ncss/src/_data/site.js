export default {
  name: 'NCSS',
  shortName: 'NCSS',
  wordmark: 'ncss',
  logo: {
    src: '/assets/img/brand/ncss-logo-horiz.png',
    alt: 'NCSS',
    width: 1600,
    height: 567,
  },
  headerLogo: {
    src: '/assets/img/brand/ncss-logo-horiz.png',
    alt: 'NCSS',
    width: 1600,
    height: 567,
  },
  tagline: 'National Commercial Shading Solutions',
  url: 'https://goncss.com',
  // Home hero: stack all items into homePrimary so the left-aligned column
  // reads as one tight list. Secondary intentionally empty.
  nav: {
    full: [
      { label: 'portfolio.', href: '/portfolio/' },
      { label: 'capabilities.', href: '/capabilities/' },
      { label: 'team.', href: '/team/' },
      { label: 'about.', href: '/about/' },
      { label: 'offices.', href: '/offices/' },
    ],
    homePrimary: [
      { label: 'portfolio.', href: '/portfolio/' },
      { label: 'capabilities.', href: '/capabilities/' },
      { label: 'team.', href: '/team/' },
      { label: 'about.', href: '/about/' },
      { label: 'offices.', href: '/offices/' },
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
