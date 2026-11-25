import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Wordmark } from '../ui/Wordmark';
import { navigate } from '../router';
import { useStore } from '../state/store';
import type { StationId } from '../lib/types';

interface Chapter {
  id: string;
  title: string;
  station: StationId;
  stationName: string;
  intro: string;
  points: { term: string; text: string }[];
}

const CHAPTERS: Chapter[] = [
  {
    id: 'data',
    title: 'Know what kind of data you have',
    station: 'survey',
    stationName: 'Survey',
    intro: 'Every symbology decision starts with one question: does this column say what kind, or how much?',
    points: [
      { term: 'Qualitative', text: 'Categories with no natural order: building use, road type, animal. Show them with different hues or shapes, and never with a light-to-dark ramp, which would invent an order.' },
      { term: 'Quantitative', text: 'Amounts you can compare: population, cost, magnitude. Show them with gradients of size, lightness or saturation, so readers see more and less.' },
      { term: 'Rates over raw counts', text: 'A map of people over 65 should show the share, not the head count, or it simply becomes a map of where people live. Equal-area hexagons are the exception: every cell covers the same ground, so counts compare fairly.' },
      { term: 'Geometry follows scale', text: 'A city is a point on a map of the country and a polygon on a map of its streets. Pick the geometry the reader needs at that scale.' },
    ],
  },
  {
    id: 'labels',
    title: 'Let the words do work',
    station: 'symbolize',
    stationName: 'Symbolize',
    intro: 'Labels are often the most direct way to say something. Readers bring centuries of map conventions with them, so use those conventions.',
    points: [
      { term: 'Two typefaces at most', text: 'One serif, one sans-serif that complement each other, such as Georgia with Verdana. Use one for natural features and the other for human-made ones.' },
      { term: 'Water in italics', text: 'Rivers, lakes and seas in italic, usually in blue. Readers expect it without noticing they do.' },
      { term: 'Hierarchy through style', text: 'Bold for capitals and major places, capitals for large regions, title case for towns.' },
      { term: 'Readable on anything', text: 'High contrast with what sits underneath, and a halo when the background is busy.' },
      { term: 'Label classes', text: 'Different styles for different groups in the same layer: motorways, major roads, minor roads, each with its own size and colour.' },
    ],
  },
  {
    id: 'advanced',
    title: 'Layer more meaning without more clutter',
    station: 'symbolize',
    stationName: 'Symbolize',
    intro: 'Once the basics are right, a few techniques let one map carry several layers of information at a glance.',
    points: [
      { term: 'Transparency', text: 'Lets a large polygon or a dense cloud of points sit over the basemap without hiding it.' },
      { term: 'Layer blending', text: 'Mixes a layer with what is below it. Multiply keeps basemap labels readable without fading the data.' },
      { term: 'Feature blending', text: 'Mixes overlapping features within the same layer, so three floods in the same place all stay visible.' },
      { term: 'One variable per visual channel', text: 'For earthquakes: size for magnitude, colour for significance, transparency for how recent. Readers decode all three at once.' },
      { term: 'Expressions', text: 'Calculate what the data does not store: convert Fahrenheit to Celsius, compute a percentage, pick the weekday from a timestamp, then use it for labels or symbols.' },
    ],
  },
  {
    id: 'analysis',
    title: 'Test the pattern before you claim it',
    station: 'test',
    stationName: 'Test',
    intro: 'A visual pattern suggests that something is happening. Geographic analysis supplies the evidence, or shows that there is none.',
    points: [
      { term: 'Heat maps show density', text: 'Kernel density makes dense areas glow. It does not say whether the density is unusual, and it often just traces where people live.' },
      { term: 'Hexagon bins', text: 'Counting points into equal-area hexagons removes overplotting and makes every cell comparable.' },
      { term: 'Hot spot analysis', text: 'Getis-Ord Gi* compares each cell and its neighbours with the whole study area and reports a z-score and p-value. A hot spot is a cluster too strong to be chance.' },
      { term: 'Correct for many tests', text: 'Testing a thousand hexagons at 95% confidence flags about fifty by luck. A false discovery rate correction keeps those out.' },
      { term: 'Ask whether it is the data or the drawing', text: 'Change the classification, the cell size, the colour ramp. A real pattern survives; an artefact of the visualization does not.' },
    ],
  },
  {
    id: 'three-d',
    title: 'Use 3D only with a reason',
    station: 'relief',
    stationName: 'Relief',
    intro: 'Three dimensions can show what two cannot: lines of sight, volume, layers below ground, time stacked as height. They also cost the reader effort.',
    points: [
      { term: 'Ways to bring 2D data into 3D', text: 'Drape it on the ground, extrude it by an attribute, or float it above or below the surface at its real elevation.' },
      { term: 'Native 3D data', text: 'Meshes, multipatches and 3D objects for buildings, point clouds for scanned surfaces, voxels for volumes such as soils or the atmosphere.' },
      { term: 'Some data will hide', text: 'Tall features block others and terrain hides valleys. Plan the viewpoint.' },
      { term: 'Guide the viewer', text: 'Not everyone navigates 3D easily. Bookmarks and guided tours take people straight to the views that matter.' },
      { term: 'Nonphysical values', text: 'Extruding counts or prices is legitimate emphasis, as long as colour repeats the message and height is never the only cue.' },
    ],
  },
  {
    id: 'charts',
    title: 'Pair the map with the right chart',
    station: 'charts',
    stationName: 'Chart',
    intro: 'Maps show where. Charts show how much, when and how values are spread, which a map alone hides.',
    points: [
      { term: 'Histogram', text: 'Check the distribution before choosing class breaks or running a test that assumes a shape.' },
      { term: 'Bar and pie', text: 'Proportions of each category. Bars compare more precisely; a pie works for a few parts of one whole.' },
      { term: 'Data clock', text: 'Hour by weekday in one radial view, so rhythms such as rush hours or weekends stand out.' },
      { term: 'Calendar heat chart', text: 'Every day as a square, for seasonal patterns that a map cannot show.' },
      { term: 'Charts inside the map', text: 'Pie charts as symbols, or a small chart inside each pop-up, tie the numbers to a single place.' },
      { term: 'Linked selection', text: 'Selecting a bar selects the matching features on the map, and the other way round. The point is less cognitive load, not more charts.' },
    ],
  },
  {
    id: 'time',
    title: 'Show change honestly',
    station: 'time',
    stationName: 'Time',
    intro: 'Mapping time is one of the oldest problems in cartography. Each method trades something off.',
    points: [
      { term: 'Small multiples', text: 'The same map once per period, side by side. The best way to compare, but only with the same colours, breaks and sizes in every panel.' },
      { term: 'Animation', text: 'Good for movement and spread, poor for comparison, because every frame disappears.' },
      { term: 'Trend tests', text: 'The Mann-Kendall test asks whether a series rises or falls more steadily than chance would allow.' },
      { term: 'Space-time cubes', text: 'Stack each period as a layer, with time as height, and find where events are increasing, decreasing or consistently high.' },
      { term: 'Simulation', text: 'The same tools can show what might happen, such as the extent of a flood after heavy rain, not only what did happen.' },
    ],
  },
  {
    id: 'audience',
    title: 'Choose the product for the audience',
    station: 'deliver',
    stationName: 'Deliver',
    intro: 'Who will read it, what do they already know, and do they need a story or a tool to explore? The answer decides the product.',
    points: [
      { term: 'Print map', text: 'Static reference with a title, legend, north arrow, scale bar and sources.' },
      { term: 'Story', text: 'A narrative with maps, text, images and charts, for an audience that should follow an argument from start to finish.' },
      { term: 'Dashboard', text: 'Maps, indicators, charts and lists in one view, for monitoring a situation at a glance, often with live data.' },
      { term: 'App', text: 'A focused tool for a specific workflow, for an audience that needs to do something, not only read.' },
    ],
  },
];

export function Guide() {
  useEffect(() => {
    document.title = 'Field guide · Wherewise';
  }, []);
  const go = (station: StationId) => (e: React.MouseEvent) => {
    e.preventDefault();
    useStore.getState().setStation(station);
    navigate('/studio');
  };
  return (
    <div className="guide">
      <header className="collar">
        <a href="/" className="collar-brand" onClick={(e) => { e.preventDefault(); navigate('/'); }} aria-label="Wherewise home"><Wordmark size={17} /></a>
        <p className="collar-meta num"><span>Field guide</span><span>8 chapters</span></p>
        <nav className="collar-nav" aria-label="Primary">
          <a href="/studio" className="btn btn--ink btn--sm" onClick={(e) => { e.preventDefault(); navigate('/studio'); }}>Open the studio</a>
        </nav>
      </header>
      <div className="guide-layout">
        <nav className="guide-toc" aria-label="Chapters">
          <ol>
            {CHAPTERS.map((c, k) => (
              <li key={c.id}><a href={`#${c.id}`}><span className="num">{String(k + 1).padStart(2, '0')}</span> {c.title}</a></li>
            ))}
          </ol>
        </nav>
        <main className="guide-main" id="main">
          <header className="guide-head">
            <h1>The field guide</h1>
            <p>
              The principles behind every station in Wherewise, written in plain language. They come from Esri's MOOC <em>The Power of Where: Communicating with Maps</em> (October to December 2026). This is a summary in my own words, not the course material.
            </p>
          </header>
          {CHAPTERS.map((c) => (
            <section key={c.id} id={c.id} className="chapter" aria-labelledby={`${c.id}-t`}>
              <h2 id={`${c.id}-t`}>{c.title}</h2>
              <p className="chapter-intro">{c.intro}</p>
              <dl>
                {c.points.map((p) => (
                  <div key={p.term}>
                    <dt>{p.term}</dt>
                    <dd>{p.text}</dd>
                  </div>
                ))}
              </dl>
              <a className="chapter-link" href="/studio" onClick={go(c.station)}>
                Try it at the {c.stationName} station <ArrowRight size={14} aria-hidden />
              </a>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
