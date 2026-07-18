import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function registerComponents(eleventyConfig) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const srcDir = path.join(here, 'src');
  const stylesDir = path.join(here, 'styles');

  eleventyConfig.addNunjucksGlobal('componentRoot', srcDir);

  eleventyConfig.addPassthroughCopy({
    [stylesDir]: 'styles/components',
  });

  return { srcDir, stylesDir };
}

/*
 * Shared `image` shortcode wiring for both brand sites.
 *
 * Components pass PUBLIC url paths (e.g. /assets/img/brand/logo.png). eleventy-img
 * needs a DISK path, so we resolve `/assets/...` against the site's on-disk src dir.
 * The native format is kept as the <img> fallback (png stays png so logo transparency
 * survives; jpg stays jpeg) while modern browsers get avif/webp from the <picture>.
 *
 * This is a SYNCHRONOUS shortcode on purpose. Nunjucks async shortcodes silently
 * render to empty output when used inside `{% block %}` / `{% extends %}` content
 * (which is exactly how the services/capabilities/innovation layouts include their
 * cards). The documented eleventy-img sync pattern — `statsSync` for the markup plus
 * a fire-and-forget generate for the files — works in every Nunjucks context.
 *
 * Remote images (http/https) are NOT handled here — components branch on that and
 * render a plain <img> for them; this shortcode is only ever called for local files.
 */
export function registerImageShortcode(eleventyConfig, { eleventyImage, siteRoot }) {
  const diskAssetsRoot = path.join(siteRoot, 'src');
  const outputDir = path.join(siteRoot, '_site/assets/img/');

  eleventyConfig.addShortcode(
    'image',
    function (src, alt, sizes = '100vw', loading = 'lazy', className) {
      if (alt === undefined) {
        throw new Error(`image shortcode missing alt text for ${src}`);
      }

      const diskPath = src.startsWith('/') ? path.join(diskAssetsRoot, src) : src;
      const ext = path.extname(diskPath).toLowerCase();
      const fallback = ext === '.png' ? 'png' : 'jpeg';
      const options = {
        widths: [400, 800, 1200, 1600],
        formats: ['avif', 'webp', fallback],
        outputDir,
        urlPath: '/assets/img/',
      };

      // Kick off the (async) file generation; eleventy-img's internal queue drains
      // before the build exits. statsSync gives us the identical metadata synchronously.
      eleventyImage(diskPath, options);
      const meta = eleventyImage.statsSync(diskPath, options);

      const attributes = { alt, sizes, loading, decoding: 'async' };
      if (className) attributes.class = className;

      return eleventyImage.generateHTML(meta, attributes, { whitespaceMode: 'block' });
    },
  );
}

export default { registerComponents, registerImageShortcode };
