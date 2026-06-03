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

export default { registerComponents };
