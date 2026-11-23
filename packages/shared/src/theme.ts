import { z } from 'zod';

const hex = (label: string) =>
  z
    .string({ error: `${label} es obligatorio` })
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, { error: `${label} debe ser un color hexadecimal (#RRGGBB)` })
    .transform((v) => v.toLowerCase());

/** Contraste WCAG entre dos colores #rrggbb. */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export const MAX_LOGO_BYTES = 300 * 1024;

/** Solo imágenes rasterizadas: un SVG puede contener scripts y no se acepta. */
const logoSchema = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, { error: 'El logo debe ser PNG, JPG o WEBP' })
  .refine((v) => (v.length * 3) / 4 <= MAX_LOGO_BYTES * 1.05, { error: 'El logo no puede superar 300 KB' })
  .nullable();

export const themeSchema = z
  .strictObject({
    appName: z.string().trim().min(2, { error: 'El nombre debe tener al menos 2 caracteres' }).max(60),
    primary: hex('El color principal'),
    accent: hex('El color de acento'),
    background: hex('El color de fondo'),
    text: hex('El color de texto'),
    radius: z.number().int().min(0).max(24),
    buttonShape: z.enum(['redondeado', 'pildora', 'recto']),
    fontScale: z.number().min(0.875).max(1.2),
    density: z.enum(['compacta', 'normal', 'amplia']),
    headerStyle: z.enum(['claro', 'marca']),
    logoDataUrl: logoSchema,
  })
  .superRefine((t, ctx) => {
    if (contrastRatio(t.primary, '#ffffff') < 4.5) {
      ctx.addIssue({ code: 'custom', path: ['primary'], message: 'El color principal necesita contraste 4.5:1 con texto blanco' });
    }
    if (contrastRatio(t.text, t.background) < 7) {
      ctx.addIssue({ code: 'custom', path: ['text'], message: 'El texto necesita contraste 7:1 con el fondo' });
    }
  });

export type ThemeSettings = z.infer<typeof themeSchema>;

export const DEFAULT_THEME: ThemeSettings = {
  appName: 'Créditos y Desembolsos',
  primary: '#043262',
  accent: '#0d5aa8',
  background: '#f4f6f9',
  text: '#101b2d',
  radius: 12,
  buttonShape: 'redondeado',
  fontScale: 1,
  density: 'normal',
  headerStyle: 'claro',
  logoDataUrl: null,
};
