import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readTag = (html: string, selector: RegExp) => {
  const tag = html.match(selector)?.[0];
  expect(tag).toBeDefined();
  return tag ?? '';
};

describe('DrivePrep social card contract', () => {
  it('publishes complete Open Graph and Twitter metadata', () => {
    const html = readFileSync('index.html', 'utf8');
    const expectedMeta = [
      ['name', 'description', '초보 운전자와 운전 면허 준비생을 위한 웹 3D 운전 연습 시뮬레이터'],
      ['property', 'og:type', 'website'],
      ['property', 'og:locale', 'ko_KR'],
      ['property', 'og:site_name', 'DrivePrep 3D'],
      ['property', 'og:title', '초보 운전, 3D로 먼저 연습하세요'],
      ['property', 'og:description', '차폭감 · 주차 · 차선 변경 · 도로주행을 단계별 미션으로'],
      ['property', 'og:url', 'https://driving.pysyntax.com/'],
      ['property', 'og:image', 'https://driving.pysyntax.com/og-image.png'],
      ['property', 'og:image:width', '1200'],
      ['property', 'og:image:height', '630'],
      ['property', 'og:image:alt', 'DrivePrep 3D 초보 운전 연습 시뮬레이터'],
      ['name', 'twitter:card', 'summary_large_image'],
      ['name', 'twitter:title', '초보 운전, 3D로 먼저 연습하세요'],
      ['name', 'twitter:description', '차폭감 · 주차 · 차선 변경 · 도로주행을 단계별 미션으로'],
      ['name', 'twitter:image', 'https://driving.pysyntax.com/og-image.png'],
      ['name', 'twitter:image:alt', 'DrivePrep 3D 초보 운전 연습 시뮬레이터'],
    ];

    for (const [attribute, key, content] of expectedMeta) {
      const tag = readTag(html, new RegExp(`<meta\\s+[^>]*${attribute}=["']${key}["'][^>]*>`, 'i'));
      expect(tag).toContain(`content="${content}"`);
    }

    const canonical = readTag(html, /<link\s+[^>]*rel=["']canonical["'][^>]*>/i);
    expect(canonical).toContain('href="https://driving.pysyntax.com/"');
  });

  it('keeps a safe, editable 1200 by 630 SVG source with the approved copy', () => {
    const path = 'public/brand/og-image.svg';
    expect(existsSync(path)).toBe(true);
    const svg = readFileSync(path, 'utf8');

    expect(svg).toMatch(/viewBox=["']0 0 1200 630["']/);
    expect(svg).toContain('DrivePrep 3D');
    expect(svg).toContain('초보 운전, 3D로 먼저 연습하세요');
    expect(svg).toContain('차폭감 · 주차 · 차선 변경 · 도로주행을 단계별 미션으로');
    expect(svg).toContain('웹 3D 운전 연습 시뮬레이터');
    expect(svg).not.toMatch(
      /<script|<image|<foreignObject|\son[a-z]+\s*=|(?:href|src)=["']https?:|url\(["']?https?:/i
    );
  });

  it('exports the social card as a 1200 by 630 PNG', () => {
    const path = 'public/og-image.png';
    expect(existsSync(path)).toBe(true);
    const png = readFileSync(path);

    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});
