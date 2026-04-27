import { Logger } from '../core/logger/Logger';

export async function globalTeardown(): Promise<void> {
  Logger.info('suite.done', { message: 'Test suite finished. Artifacts saved to output/.' });
  // Flush Winston transports so the final log lines reach disk before the
  // process exits. Logger.end() signals no more writes; 'finish' fires when
  // all buffered entries have been written.
  await new Promise<void>((resolve) => {
    Logger.on('finish', resolve);
    Logger.end();
  });
}
