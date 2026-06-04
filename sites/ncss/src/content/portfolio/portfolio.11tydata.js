// Directory data for src/content/portfolio/.
//
// permalink is computed per-project against the current build's `brands` field:
//   - field absent → render on every brand (shared project)
//   - field present → only render if it includes the current brand
//                     (set in this site's .eleventy.js via addGlobalData)
//
// permalink: false makes Eleventy skip writing the detail page for that
// project on this build, which combined with the `projects` collection
// filter in .eleventy.js keeps brand-restricted projects fully invisible
// on the brands they don't belong to.
export default {
  eleventyComputed: {
    permalink: (data) => {
      // portfolio/index.md has fileSlug === 'portfolio' (Eleventy uses the
      // parent dir name when the file is named index). Leave the listing
      // page's frontmatter permalink alone.
      if (data.page.fileSlug === 'portfolio') return data.permalink;

      const brands = data.brands;
      if (!brands || brands.length === 0) {
        return `/portfolio/${data.page.fileSlug}/`;
      }
      return brands.includes(data.currentBrand)
        ? `/portfolio/${data.page.fileSlug}/`
        : false;
    },
  },
};
