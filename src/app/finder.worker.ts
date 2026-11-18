import { simulate } from '../engine/simulate';
import type { Settings } from '../engine/types';
import { describeMatch, matches, workerSeeds, type FinderConditions, type FinderMatch } from './timelineFinder';

export interface FinderRequest {
  start: number;
  count: number;
  /** This worker's place among `workers`; each checks every workers-th seed. */
  index: number;
  workers: number;
  settings: Settings;
  conditions: FinderConditions;
}

export type FinderMessage =
  | { type: 'progress'; checked: number; found: FinderMatch[] }
  | { type: 'error'; message: string };

const REPORT_EVERY = 100;

self.onmessage = ({ data }: MessageEvent<FinderRequest>) => {
  const send = (message: FinderMessage) => self.postMessage(message);
  const { start, count, index, workers, settings, conditions } = data;
  try {
    const seeds = workerSeeds(start, count, index, workers);
    let found: FinderMatch[] = [];
    let searched = 0;
    for (const seed of seeds) {
      const timeline = simulate(seed, settings);
      if (matches(timeline, conditions)) found.push(describeMatch(timeline));
      searched++;
      // Matches go out with each progress report so the list fills in as the search runs.
      if (searched % REPORT_EVERY === 0 && searched < seeds.length) {
        send({ type: 'progress', checked: searched, found });
        found = [];
      }
    }
    send({ type: 'progress', checked: searched, found });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'The search could not finish.' });
  }
};
