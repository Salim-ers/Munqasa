/** Déclaration minimale de fontkit (mesure des textes avec les métriques réelles des polices embarquées). */
declare module "fontkit" {
  export interface GlyphRun {
    advanceWidth: number;
  }
  export interface Font {
    unitsPerEm: number;
    layout(text: string): GlyphRun;
  }
  export function create(buffer: Buffer | Uint8Array, postscriptName?: string): Font;
}
