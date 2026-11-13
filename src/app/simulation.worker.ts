import { simulate } from '../engine/simulate';
import { collectStatistics, type BatchStatistics } from '../engine/statistics';
import type { Settings } from '../engine/types';

export interface BatchRequest {
  seed: number;
  count: number;
  settings: Settings;
}

export type BatchMessage =
  | { type: 'progress'; completed: number }
  | { type: 'complete'; stats: BatchStatistics }
  | { type: 'error'; message: string };

self.onmessage = ({ data }: MessageEvent<BatchRequest>) => {
  const send = (message: BatchMessage) => self.postMessage(message);
  const { seed, count, settings } = data;
  try {
    const aggregate = collectStatistics();
    for (let i = 0; i < count; i++) {
      aggregate.add(simulate((seed + i) >>> 0, settings));
      if ((i + 1) % 50 === 0) send({ type: 'progress', completed: i + 1 });
    }
    send({ type: 'complete', stats: aggregate.result() });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'The batch could not finish.' });
  }
};
