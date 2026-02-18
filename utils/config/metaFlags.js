import { hasExplicitToolSelection } from '../toolSelection.js';

/**
 * @param {Record<string, any>} fileConfig
 * @param {Record<string, any>} cliArgs
 * @returns {boolean}
 */
export function hasUserThresholds(fileConfig, cliArgs) {
  const keys = ['maxViolations', 'maxCritical', 'maxSerious', 'minScore', 'minCompliance'];
  const hasAny = (obj) =>
    keys.some((key) => obj?.thresholds && obj.thresholds[key] !== undefined);
  return hasAny(fileConfig) || hasAny(cliArgs);
}

/**
 * @param {Record<string, any>} fileConfig
 * @param {Record<string, any>} cliArgs
 * @returns {boolean}
 */
export function hasUserToolsSelection(fileConfig, cliArgs) {
  return hasExplicitToolSelection(fileConfig?.tools) || hasExplicitToolSelection(cliArgs?.tools);
}
