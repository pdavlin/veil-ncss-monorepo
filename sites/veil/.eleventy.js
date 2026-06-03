import { EleventyHtmlBasePlugin } from '@11ty/eleventy';
import eleventyImage from '@11ty/eleventy-img';
import nunjucks from 'nunjucks';
import { registerComponents } from '@veil-ncss/components/eleventy.config.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function (eleventyConfig) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '../..');

  const { srcDir: componentsSrc } = registerComponents(eleventyConfig);

  // Wire Nunjucks to resolve component includes from the shared package.
  const njkEnv = new nunjucks.Environment(
    new nunjucks.FileSystemLoader([
      path.join(here, 'src/_includes'),
      componentsSrc,
    ]),
    { autoescape: true, throwOnUndefined: false },
  );
  eleventyConfig.setLibrary('njk', njkEnv);

  eleventyConfig.addPassthroughCopy({
    [path.join(repoRoot, 'packages/tokens-base/dist')]: 'styles/tokens-base',
    [path.join(repoRoot, 'packages/tokens-veil/dist')]: 'styles/tokens-veil',
    [path.join(repoRoot, 'packages/tokens-ncss/dist')]: 'styles/tokens-ncss',
  });
  eleventyConfig.addPassthroughCopy('src/admin');
  eleventyConfig.addPassthroughCopy('src/assets');
  eleventyConfig.addPassthroughCopy('src/styles');

  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);

  // Build-time year, used in site-footer copyright.
  eleventyConfig.addGlobalData('siteYear', () => new Date().getFullYear());

  // `arr | take(n)` — first n elements. Used to surface "recent projects" on home.
  eleventyConfig.addFilter('take', (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []));

  eleventyConfig.addAsyncShortcode('image', async function (src, alt, sizes = '100vw', loading = 'lazy') {
    if (alt === undefined) {
      throw new Error(`image shortcode missing alt text for ${src}`);
    }
    const meta = await eleventyImage(src, {
      widths: [400, 800, 1200, 1600],
      formats: ['avif', 'webp', 'jpeg'],
      outputDir: '_site/assets/img/',
      urlPath: '/assets/img/',
    });
    return eleventyImage.generateHTML(meta, {
      alt,
      sizes,
      loading,
      decoding: 'async',
    });
  });

  // Portfolio: every markdown under content/portfolio/ except the index.
  // Sorted by frontmatter `date` DESCENDING so the most recently added show first.
  eleventyConfig.addCollection('projects', (api) =>
    api
      .getFilteredByGlob('src/content/portfolio/*.md')
      .filter((p) => !p.fileSlug.startsWith('index'))
      .sort((a, b) => {
        const da = a.data.date ? new Date(a.data.date).getTime() : 0;
        const db = b.data.date ? new Date(b.data.date).getTime() : 0;
        return db - da;
      }),
  );

  // Innovation articles.
  eleventyConfig.addCollection('articles', (api) =>
    api
      .getFilteredByGlob('src/content/articles/*.md')
      .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0)),
  );

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data',
    },
    templateFormats: ['md', 'njk', 'html'],
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
}
