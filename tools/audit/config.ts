import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface OriginConfig {
  origin: string;
  sitemaps: string[];
  excludePatterns: RegExp[];
  optional?: boolean;
}

export interface AuditConfig {
  origins: OriginConfig[];
  viewports: readonly number[];
  outputRoot: string;
  crawl: {
    maxDepth: number;
    maxUrls: number;
    requestTimeoutMs: number;
  };
  playwright: {
    canonicalWidth: number;
    canonicalHeight: number;
    navigationTimeoutMs: number;
    networkIdleTimeoutMs: number;
  };
  clustering: {
    hslThreshold: number;
  };
}

export const config: AuditConfig = {
  origins: [
    {
      origin: 'https://www.veilengineering.com',
      sitemaps: [
        'https://www.veilengineering.com/sitemap.xml',
        'https://www.veilengineering.com/pages-sitemap.xml',
        'https://www.veilengineering.com/dynamic-portfolio-1_p_f72f6ea0_18e2_4e07_aac1_d3042fd09d52_0_5000-sitemap.xml',
      ],
      excludePatterns: [
        /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|woff2?|ttf|css|js|mp4|webm)(\?.*)?$/i,
        /\/_partials\//,
        /\/wp-admin\//,
      ],
    },
    {
      origin: 'https://ncss.example.com',
      sitemaps: ['https://ncss.example.com/sitemap.xml'],
      excludePatterns: [/\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|woff2?|ttf|css|js|mp4|webm)(\?.*)?$/i],
      optional: true,
    },
  ],
  viewports: [320, 768, 1024, 1440],
  outputRoot: path.resolve(__dirname, '..', '..', 'audit-output'),
  crawl: {
    maxDepth: 4,
    maxUrls: 200,
    requestTimeoutMs: 20_000,
  },
  playwright: {
    canonicalWidth: 1440,
    canonicalHeight: 900,
    navigationTimeoutMs: 45_000,
    networkIdleTimeoutMs: 30_000,
  },
  clustering: {
    hslThreshold: 0.05,
  },
};

export function originSlug(origin: string): string {
  return origin.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function outputDirFor(origin: string): string {
  return path.join(config.outputRoot, originSlug(origin));
}

export function parseOriginsFromArgv(argv: readonly string[]): OriginConfig[] {
  const requested: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--origin' && argv[i + 1]) {
      requested.push(argv[i + 1] as string);
      i++;
    }
  }
  if (requested.length === 0) {
    return config.origins.filter((o) => !o.optional);
  }
  return requested.map((req) => {
    const match = config.origins.find(
      (o) =>
        o.origin === req ||
        o.origin === `https://${req}` ||
        o.origin === `https://www.${req}` ||
        originSlug(o.origin) === req ||
        originSlug(o.origin) === `www.${req}`,
    );
    if (!match) {
      throw new Error(`Unknown origin: ${req}. Add it to config.ts or pass a full URL.`);
    }
    return match;
  });
}
