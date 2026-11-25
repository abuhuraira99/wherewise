/**
 * MapLibre 6 loads its tile-parsing worker from a file next to its own bundle.
 * Bundlers rename and relocate that bundle, so the worker is shipped as a
 * separate asset and its URL is registered explicitly before any map exists.
 */
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

let done = false;
export function setupMaplibre() {
  if (done) return;
  done = true;
  setWorkerUrl(new URL(workerUrl, location.href).href);
}

setupMaplibre();
