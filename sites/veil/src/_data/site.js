export default {
  name: 'Veil | engineered shading',
  shortName: 'Veil',
  wordmark: 'veil',
  // bare "veil" wordmark — used on the home hero where the brand mark is the page
  logo: {
    src: '/assets/img/brand/veil-logo.png',
    alt: 'Veil',
    // intrinsic dimensions help the browser reserve space before the image loads
    width: 913,
    height: 551,
  },
  // full "veil | engineered shading" logo (wordmark + tagline) — used in the
  // site-nav header on standard pages
  headerLogo: {
    src: '/assets/img/brand/veil-engineered-shading-logo.png',
    alt: 'Veil | engineered shading',
    width: 1241,
    height: 731,
  },
  tagline: 'engineered shading consultants',
  url: 'https://veilengineering.com',
  // Standard header nav (non-home pages): single row, 7 items.
  // Home page uses the split arrangement below (4 + 3) on its own hero block.
  nav: {
    full: [
      { label: 'portfolio.', href: '/portfolio/' },
      { label: 'services.', href: '/services/' },
      { label: 'team.', href: '/team/' },
      { label: 'innovation.', href: '/innovation/' },
      { label: 'sustainable design.', href: '/sustainability/' },
      { label: 'about.', href: '/about/' },
      { label: 'contact.', href: '/contact/' },
    ],
    homePrimary: [
      { label: 'portfolio.', href: '/portfolio/' },
      { label: 'services.', href: '/services/' },
      { label: 'innovation.', href: '/innovation/' },
      { label: 'sustainability.', href: '/sustainability/' },
    ],
    homeSecondary: [
      { label: 'team.', href: '/team/' },
      { label: 'about.', href: '/about/' },
      { label: 'contact.', href: '/contact/' },
    ],
  },
  social: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/company/veilengineering' },
  ],
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
