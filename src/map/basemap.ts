import type { StyleSpecification } from 'maplibre-gl';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

let cached: Promise<StyleSpecification> | null = null;

/**
 * OpenFreeMap Positron, retinted to the drafting-film palette: a quiet,
 * low-contrast reference layer so the data carries the colour.
 */
export function loadBasemap(): Promise<StyleSpecification> {
  if (!cached) {
    cached = fetch(STYLE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`basemap ${r.status}`);
        return r.json() as Promise<StyleSpecification>;
      })
      .then((style) => {
        const tint: Record<string, Record<string, unknown>> = {
          background: { 'background-color': '#e8ebe7' },
          water: { 'fill-color': '#cbd6d9' },
          park: { 'fill-color': '#dfe4dc' },
          landcover_wood: { 'fill-color': '#dce1d9' },
          landuse_residential: { 'fill-color': '#e3e6e1' },
          building: { 'fill-color': '#dee1dc' },
          waterway: { 'line-color': '#b9c9ce' },
          boundary_2: { 'line-color': '#8c9499' },
          boundary_3: { 'line-color': '#a3aaae' },
        };
        style.layers = style.layers.map((l) => {
          const p = tint[l.id];
          if (p && 'paint' in l) return { ...l, paint: { ...(l.paint ?? {}), ...p } } as typeof l;
          if (l.type === 'symbol' && 'paint' in l) {
            return { ...l, paint: { ...(l.paint ?? {}), 'text-color': '#5a6268', 'text-halo-color': 'rgba(240,242,238,0.9)' } } as typeof l;
          }
          return l;
        });
        return style;
      })
      .catch(() => {
        cached = null;
        // offline / blocked: a plain film-coloured sheet so the data still draws
        return {
          version: 8,
          sources: {},
          layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8ebe7' } }],
        } as StyleSpecification;
      });
  }
  return cached;
}

export const BASEMAP_ATTRIBUTION = '© OpenStreetMap contributors · OpenFreeMap · OpenMapTiles';
