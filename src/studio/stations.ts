import type { StationId } from '../lib/types';

export interface StationMeta {
  id: StationId;
  name: string;
  verb: string;
  /** the course section this station puts to work */
  course: string;
}

export const STATIONS: StationMeta[] = [
  { id: 'survey', name: 'Survey', verb: 'Read the file', course: 'What kind of data is this?' },
  { id: 'symbolize', name: 'Symbolize', verb: 'Draw it honestly', course: 'Symbology, labels, blending, expressions' },
  { id: 'test', name: 'Test', verb: 'Is the pattern real?', course: 'Visual versus geographic analysis' },
  { id: 'time', name: 'Time', verb: 'What is changing?', course: 'Patterns in time and space' },
  { id: 'relief', name: 'Relief', verb: 'Add the third dimension', course: '3D scenes, extrusion, space-time cubes' },
  { id: 'charts', name: 'Chart', verb: 'Say it with a chart', course: 'Charts that strengthen the map' },
  { id: 'deliver', name: 'Deliver', verb: 'Ship it to your audience', course: 'Print, story, dashboard or app' },
];
