/**
 * Parse CLI arguments into a normalized object.
 *
 * @param {string[]} argv
 * @returns {Record<string, any>}
 */
export function parseArgs(argv) {
  const args = { _: [] };

  const booleanFlags = [
    'details',
    'verbose',
    'help',
    'no-interactive',
    'no-sandbox',
    'sitemap',
    'spa',
    'init',
    'code-evidence',
    'no-code-evidence',
    'csv-legacy',
    'include-manual-checks',
    'verification-v2',
    'verification-deterministic',
  ];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;

    if (a.startsWith('--')) {
      const key = a.slice(2);
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

      if (booleanFlags.includes(key)) {
        args[camelKey] = true;
      } else {
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
          throw new Error(`Missing value for --${key}`);
        }
        if (key === 'tool') {
          if (args[camelKey] === undefined) {
            args[camelKey] = next;
          } else if (Array.isArray(args[camelKey])) {
            args[camelKey].push(next);
          } else {
            args[camelKey] = [args[camelKey], next];
          }
        } else {
          args[camelKey] = next;
        }
        i++;
      }
    } else {
      args._.push(a);
    }
  }

  return args;
}

export default parseArgs;
