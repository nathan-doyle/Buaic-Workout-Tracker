import { colors, radii, spacing, typography } from '../tokens';

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;
const surfaces = [colors.background, colors.surface1, colors.surface2, colors.surface3];

describe('brand colours', () => {
  it('keeps the V1 background and gold', () => {
    expect(colors.background).toBe('#0F0F0F');
    expect(colors.accent).toBe('#D4AF37');
  });
});

describe('contrast (WCAG AA)', () => {
  it.each(['textPrimary', 'textSecondary', 'textTertiary', 'accent', 'success', 'danger'] as const)(
    '%s is readable on every surface',
    (token) => {
      for (const surface of surfaces) {
        expect(contrast(colors[token], surface)).toBeGreaterThanOrEqual(AA);
      }
    }
  );

  it('text on the accent is readable', () => {
    expect(contrast(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(AA);
  });

  it('success and danger are readable on their own fills', () => {
    expect(contrast(colors.success, colors.successSurface)).toBeGreaterThanOrEqual(AA);
    expect(contrast(colors.danger, colors.dangerSurface)).toBeGreaterThanOrEqual(AA);
  });

  it('text levels are distinct and ordered', () => {
    const bg = colors.background;
    expect(contrast(colors.textPrimary, bg)).toBeGreaterThan(contrast(colors.textSecondary, bg));
    expect(contrast(colors.textSecondary, bg)).toBeGreaterThan(contrast(colors.textTertiary, bg));
    expect(contrast(colors.textTertiary, bg)).toBeGreaterThan(contrast(colors.textDisabled, bg));
  });
});

describe('scales', () => {
  it('uses the 4/8/12/16/24/32 spacing scale', () => {
    expect(Object.values(spacing)).toEqual([4, 8, 12, 16, 24, 32]);
  });

  it('has increasing radii', () => {
    const values = Object.values(radii);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('uses tabular figures for numeric styles', () => {
    for (const style of [typography.numericLarge, typography.numeric, typography.numericSmall]) {
      expect(style.fontVariant).toEqual(['tabular-nums']);
    }
  });
});
