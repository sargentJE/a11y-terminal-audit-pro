import path from 'path';
import { exec } from 'child_process';
import { defaultLogger as log } from '../../Logger.js';

/**
 * Open a file in the default browser.
 *
 * @param {string} filepath
 */
export function openInBrowser(filepath) {
  const absolutePath = path.resolve(filepath);
  const fileUrl = `file://${absolutePath}`;

  let command;
  if (process.platform === 'darwin') {
    command = `open "${fileUrl}"`;
  } else if (process.platform === 'win32') {
    command = `start "" "${fileUrl}"`;
  } else {
    command = `xdg-open "${fileUrl}"`;
  }

  exec(command, (err) => {
    if (err) {
      log.debug(`Could not open browser: ${err.message}`);
    } else {
      log.info('Opened HTML report in browser');
    }
  });
}

export default openInBrowser;
