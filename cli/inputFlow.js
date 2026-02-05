import enquirerPkg from 'enquirer';
import { parseHttpUrl, toBoundedInt } from '../utils/Validation.js';

const { Enquirer } = enquirerPkg;

/**
 * Gather validated runtime inputs.
 *
 * @param {object} params
 * @param {boolean} params.interactive
 * @param {string|undefined} params.urlArg
 * @param {string|undefined} params.limitArg
 * @param {string|undefined} params.timeoutArg
 * @param {string|undefined} params.standardArg
 * @returns {Promise<{ url: URL, limit: number, timeoutMs: number, standard: string }>}
 */
export async function getInputs({ interactive, urlArg, limitArg, timeoutArg, standardArg }) {
  if (!interactive) {
    const url = parseHttpUrl(urlArg || '');
    const limit = toBoundedInt(Number(limitArg ?? 5), { min: 1, max: 500, name: 'limit' });
    const timeoutMs = toBoundedInt(Number(timeoutArg ?? 60_000), {
      min: 5_000,
      max: 300_000,
      name: 'timeout',
    });

    return { url, limit, timeoutMs, standard: String(standardArg || 'WCAG2AA') };
  }

  const enquirer = new Enquirer();

  const prompts = [
    {
      type: 'input',
      name: 'url',
      message: 'Target URL:',
      initial: urlArg || 'https://example.com',
      validate: (value) => {
        try {
          parseHttpUrl(value);
          return true;
        } catch (e) {
          return e.message;
        }
      },
    },
    {
      type: 'input',
      name: 'limit',
      message: 'Page Limit:',
      initial: String(limitArg ?? 5),
      validate: (value) => {
        try {
          toBoundedInt(Number(value), { min: 1, max: 500, name: 'limit' });
          return true;
        } catch (e) {
          return e.message;
        }
      },
    },
    {
      type: 'input',
      name: 'timeoutMs',
      message: 'Timeout per tool (ms):',
      initial: String(timeoutArg ?? 60_000),
      validate: (value) => {
        try {
          toBoundedInt(Number(value), { min: 5_000, max: 300_000, name: 'timeout' });
          return true;
        } catch (e) {
          return e.message;
        }
      },
    },
    {
      type: 'select',
      name: 'standard',
      message: 'WCAG standard:',
      initial: standardArg || 'WCAG2AA',
      choices: [
        'WCAG2A',
        'WCAG2AA',
        'WCAG2AAA',
        'WCAG21A',
        'WCAG21AA',
        'WCAG21AAA',
        'WCAG22A',
        'WCAG22AA',
        'WCAG22AAA',
      ],
    },
  ];

  const answers = await enquirer.prompt(prompts);

  return {
    url: parseHttpUrl(answers.url),
    limit: toBoundedInt(Number(answers.limit), { min: 1, max: 500, name: 'limit' }),
    timeoutMs: toBoundedInt(Number(answers.timeoutMs), {
      min: 5_000,
      max: 300_000,
      name: 'timeout',
    }),
    standard: String(answers.standard || 'WCAG2AA'),
  };
}

export default getInputs;
