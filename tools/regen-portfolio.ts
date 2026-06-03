#!/usr/bin/env tsx
/*
 * regen-portfolio — rewrite sites/veil/src/content/portfolio/<slug>.md files
 * with the new flat-frontmatter + markdown-content shape.
 *
 * Idempotent: re-running with the same inputs produces the same output.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve('sites/veil/src/content/portfolio');

const WIX = 'https://static.wixstatic.com/media';
// Live portfolio card images in display order. Slug -> CDN URL.
interface MediaItem {
  type: 'image' | 'video';
  src: string;
  poster?: string;
  alt: string;
}

const PROJECTS: Array<{
  slug: string;
  title: string;
  location?: string;
  cardImage: { src: string; alt?: string };
  body: string;
  media?: MediaItem[];
}> = [
  {
    slug: 'joslyn-art-museum',
    title: 'Joslyn Art Museum',
    location: 'Omaha, NE',
    cardImage: { src: `${WIX}/cd57db_eceebcbcc8814840a459c13c36d7176c~mv2.jpeg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/cd57db_eceebcbcc8814840a459c13c36d7176c~mv2.jpeg`, alt: 'Joslyn Art Museum' },
    body: '',
  },
  {
    slug: 'pinnacle-bank',
    title: 'Pinnacle Bank',
    location: 'Omaha, NE',
    cardImage: { src: `${WIX}/cd57db_dd323fc216964b16a54b9f924079e299~mv2.jpg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/10007.jpg`, alt: 'Pinnacle Bank' },
    body: '',
  },
  {
    slug: 'merriam-plaza-library',
    title: 'Merriam Plaza Library',
    location: 'Merriam, KS',
    cardImage: { src: `${WIX}/02bfd7_1a13f4ddf5ad465ca48a45a1de43104a~mv2.jpg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/02bfd7_1a13f4ddf5ad465ca48a45a1de43104a~mv2.jpg`, alt: 'Merriam Plaza Library' },
    body: '',
    media: [
      { type: 'image', src: `${WIX}/02bfd7_1a13f4ddf5ad465ca48a45a1de43104a~mv2.jpg/v1/fill/w_1280,h_720,al_c,q_85,enc_auto/02bfd7_1a13f4ddf5ad465ca48a45a1de43104a~mv2.jpg`, alt: 'Merriam Plaza Library — interior view' },
      { type: 'video', src: '/assets/video/rtg-golf-sim.mp4', alt: 'Blackout bar in motion (RTG golf sim demo)' },
    ],
  },
  {
    slug: 'university-of-nebraska-osborne-legacy-complex',
    title: 'University of Nebraska — Osborne Legacy Complex',
    location: 'Lincoln, NE',
    cardImage: { src: `${WIX}/cd57db_133d505580f2423fad39b46142bb4682~mv2.jpg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/cd57db_133d505580f2423fad39b46142bb4682~mv2.jpg`, alt: 'University of Nebraska — Osborne Legacy Complex' },
    body: '',
  },
  {
    slug: 'university-of-nebraska-kiewit-hall',
    title: 'University of Nebraska — Kiewit Hall',
    location: 'Lincoln, NE',
    cardImage: { src: `${WIX}/02bfd7_57010be949234014a98eef2b8b358000~mv2.jpg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/02bfd7_57010be949234014a98eef2b8b358000~mv2.jpg`, alt: 'University of Nebraska — Kiewit Hall' },
    body: '',
  },
  {
    slug: 'catalyst',
    title: 'Catalyst',
    location: 'Omaha, NE',
    cardImage: { src: `${WIX}/02bfd7_814d2af137904f579794fa68f21d8475~mv2.jpg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/02bfd7_814d2af137904f579794fa68f21d8475~mv2.jpg`, alt: 'Catalyst' },
    body: `Catalyst represents a true commitment to the concept of adaptive reuse. The Omaha Steel Works building — originally built in 1906 — went through a multi-year complete renovation to be reborn as an extraordinary co-working and incubation space adjacent to the University of Nebraska Medical Center.`,
  },
  {
    slug: 'memphis-brooks-museum-of-art',
    title: 'Memphis Brooks Museum of Art',
    location: 'Memphis, TN',
    cardImage: { src: `${WIX}/02bfd7_d44d0850771e4515a4bd3cda0aac2bcb~mv2.jpeg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/02bfd7_d44d0850771e4515a4bd3cda0aac2bcb~mv2.jpeg`, alt: 'Memphis Brooks Museum of Art' },
    body: '',
  },
  {
    slug: 'wichita-state-university-woolsey-hall',
    title: 'Wichita State University — Woolsey Hall',
    location: 'Wichita, KS',
    cardImage: { src: `${WIX}/cd57db_1d67923fa6a74c7aacb36f29a69d64a4~mv2.jpg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/cd57db_1d67923fa6a74c7aacb36f29a69d64a4~mv2.jpg`, alt: 'Wichita State University — Woolsey Hall' },
    body: '',
  },
  {
    slug: 'university-of-nebraska-strauss-performing-arts-center',
    title: 'University of Nebraska — Strauss Performing Arts Center',
    location: 'Omaha, NE',
    cardImage: { src: `${WIX}/cd57db_9af6b4cf011c44f58c966c6683915f1b~mv2.png/v1/fill/w_762,h_434,al_c,q_85,enc_auto/cd57db_9af6b4cf011c44f58c966c6683915f1b~mv2.png`, alt: 'University of Nebraska — Strauss Performing Arts Center' },
    body: '',
    media: [
      { type: 'video', src: '/assets/video/clock-tower-strauss.mp4', poster: '/assets/video/clock-tower-strauss.jpg', alt: 'Strauss Performing Arts Center exterior with clock tower' },
    ],
  },
  {
    slug: 'university-of-nebraska-scott-engineering-center',
    title: 'University of Nebraska — Scott Engineering Center',
    location: 'Lincoln, NE',
    cardImage: { src: `${WIX}/02bfd7_b6257dadd73d44c78f6adb2a33c08ce2~mv2.jpg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/02bfd7_b6257dadd73d44c78f6adb2a33c08ce2~mv2.jpg`, alt: 'University of Nebraska — Scott Engineering Center' },
    body: '',
  },
  {
    slug: 'university-of-alabama-at-birmingham',
    title: 'University of Alabama at Birmingham — Inpatient Rehabilitation Facility',
    location: 'Birmingham, AL',
    cardImage: { src: `${WIX}/02bfd7_fc1668fd7a4144ac84b29319957e5b60~mv2.jpg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/02bfd7_fc1668fd7a4144ac84b29319957e5b60~mv2.jpg`, alt: 'University of Alabama at Birmingham — Inpatient Rehabilitation Facility' },
    body: '',
  },
  {
    slug: 'rtg-medical-headquarters',
    title: 'RTG Medical — Headquarters',
    location: 'Fremont, NE',
    // local poster jpeg from the transcoded GIF
    cardImage: { src: '/assets/img/projects/rtg-medical-headquarters/card.jpg', alt: 'RTG Medical — Headquarters (golf sim blackout)' },
    body: '',
    media: [
      { type: 'video', src: '/assets/video/rtg-golf-sim.mp4', alt: 'Golf sim blackout bar in motion' },
    ],
  },
  {
    slug: 'baxter-auto-group-headquarters',
    title: 'Baxter Auto Group — Headquarters',
    location: 'Omaha, NE',
    cardImage: { src: `${WIX}/cd57db_5a2040383e5e484b8b8bfda0da1ce3ad~mv2.jpg/v1/fill/w_762,h_434,al_c,q_85,enc_auto/cd57db_5a2040383e5e484b8b8bfda0da1ce3ad~mv2.jpg`, alt: 'Baxter Auto Group — Headquarters' },
    body: '',
  },
];

// Synthetic dates: index 0 (Joslyn) = today, index 12 (Baxter) = ~13 weeks ago.
// Client should edit these via the CMS to reflect actual project completion dates.
function dateFor(index: number): string {
  const start = new Date('2026-06-01T00:00:00Z').getTime();
  const ms = start - index * 7 * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function yamlEscape(s: string): string {
  return s.replace(/"/g, '\\"');
}

const FALLBACK_BODY = `Project details forthcoming.`;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });

  for (let i = 0; i < PROJECTS.length; i++) {
    const p = PROJECTS[i]!;

    const lines: string[] = [];
    lines.push('---');
    lines.push('layout: layouts/portfolio-detail.njk');
    lines.push(`title: "${yamlEscape(p.title)}"`);
    lines.push(`date: ${dateFor(i)}`);
    if (p.location) lines.push(`location: "${yamlEscape(p.location)}"`);
    lines.push('cardImage:');
    lines.push(`  src: "${yamlEscape(p.cardImage.src)}"`);
    lines.push(`  alt: "${yamlEscape(p.cardImage.alt || p.title)}"`);
    lines.push('metadata: []');
    if (p.media && p.media.length) {
      lines.push('media:');
      for (const m of p.media) {
        lines.push('  - type: ' + m.type);
        lines.push(`    src: "${yamlEscape(m.src)}"`);
        if (m.poster) lines.push(`    poster: "${yamlEscape(m.poster)}"`);
        lines.push(`    alt: "${yamlEscape(m.alt)}"`);
      }
    } else {
      lines.push('media: []');
    }
    lines.push('---');
    lines.push('');
    lines.push(p.body || FALLBACK_BODY);
    lines.push('');

    await writeFile(path.join(OUT_DIR, `${p.slug}.md`), lines.join('\n'), 'utf8');
    console.log(`wrote portfolio/${p.slug}.md (date ${dateFor(i)})`);
  }
}

void main();
