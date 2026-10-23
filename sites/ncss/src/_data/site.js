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
  url: 'https://ncss.build',
  // Sitemap per the 2026-09 copy rewrite. "about." is a dropdown (client
  // note: "drop-down tab at the top, re. Contexture") grouping the
  // who-we-are pages; its landing page is the first child because the
  // disclosure button has no href of its own.
  // Home hero has no dropdown support: it lists the same pages flat. Primary
  // carries the top level, secondary the about group, so the stacked
  // left-aligned column still reads in the header's order.
  nav: {
    full: [
      { label: 'portfolio.', href: '/portfolio/' },
      { label: 'capabilities.', href: '/capabilities/' },
      { label: 'manufacturers.', href: '/manufacturers/' },
      { label: 'offices.', href: '/offices/' },
      {
        label: 'about.',
        children: [
          { label: 'about.', href: '/about/' },
          { label: 'team.', href: '/team/' },
          { label: 'research.', href: '/research/' },
        ],
      },
      { label: 'contact.', href: '/contact/' },
    ],
    homePrimary: [
      { label: 'portfolio.', href: '/portfolio/' },
      { label: 'capabilities.', href: '/capabilities/' },
      { label: 'manufacturers.', href: '/manufacturers/' },
      { label: 'offices.', href: '/offices/' },
    ],
    homeSecondary: [
      { label: 'about.', href: '/about/' },
      { label: 'team.', href: '/team/' },
      { label: 'research.', href: '/research/' },
      { label: 'contact.', href: '/contact/' },
    ],
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
