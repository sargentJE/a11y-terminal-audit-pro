#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const JS_EXT = '.js';
const TODAY = new Date().toISOString().slice(0, 10);

const SIZE_LIMITS = {
  services: 700,
  utils: 500,
};

// Temporary allowlist for intentionally large generated/template assets.
const SIZE_ALLOWLIST = {
  'utils/report/html/styles.js': '2026-06-30',
};

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(JS_EXT)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * @param {string} relativeFile
 * @param {string} specifier
 * @returns {string|null}
 */
function resolveImport(relativeFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const from = path.dirname(path.join(ROOT, relativeFile));
  const resolved = path.resolve(from, specifier);
  return path.relative(ROOT, resolved).replaceAll('\\', '/');
}

/**
 * @param {string} relativeFile
 * @param {string} content
 * @returns {string[]}
 */
function checkImportBoundaries(relativeFile, content) {
  const violations = [];
  const importPattern = /^\s*import\s+.*?\s+from\s+['"]([^'"]+)['"]/gm;
  const specs = [...content.matchAll(importPattern)].map((m) => m[1]);

  for (const spec of specs) {
    const resolved = resolveImport(relativeFile, spec);
    if (!resolved) continue;

    if (relativeFile.startsWith('utils/') && resolved.startsWith('services/')) {
      violations.push(
        `${relativeFile}: utils modules must not import services modules (${spec} -> ${resolved})`
      );
    }
    if (relativeFile.startsWith('utils/') && resolved.startsWith('cli/')) {
      violations.push(
        `${relativeFile}: utils modules must not import cli modules (${spec} -> ${resolved})`
      );
    }
    if (relativeFile.startsWith('services/') && resolved.startsWith('cli/')) {
      violations.push(
        `${relativeFile}: services modules must not import cli modules (${spec} -> ${resolved})`
      );
    }
  }

  return violations;
}

/**
 * @param {string} relativeFile
 * @param {number} lineCount
 * @returns {string[]}
 */
function checkFileSize(relativeFile, lineCount) {
  const violations = [];
  const allowUntil = SIZE_ALLOWLIST[relativeFile];
  if (allowUntil && allowUntil >= TODAY) {
    return violations;
  }

  if (relativeFile.startsWith('services/') && lineCount > SIZE_LIMITS.services) {
    violations.push(
      `${relativeFile}: ${lineCount} lines exceeds services limit ${SIZE_LIMITS.services}`
    );
  }
  if (relativeFile.startsWith('utils/') && lineCount > SIZE_LIMITS.utils) {
    violations.push(`${relativeFile}: ${lineCount} lines exceeds utils limit ${SIZE_LIMITS.utils}`);
  }

  return violations;
}

async function main() {
  const scopedDirs = ['cli', 'services', 'utils'];
  const files = (
    await Promise.all(
      scopedDirs.map(async (dir) => {
        try {
          return await walk(path.join(ROOT, dir));
        } catch {
          return [];
        }
      })
    )
  ).flat();

  const violations = [];
  for (const absFile of files) {
    const rel = path.relative(ROOT, absFile).replaceAll('\\', '/');
    const content = await readFile(absFile, 'utf8');
    const lineCount = content.split('\n').length;
    violations.push(...checkImportBoundaries(rel, content));
    violations.push(...checkFileSize(rel, lineCount));
  }

  if (violations.length > 0) {
    console.error('Modularity checks failed:\n');
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log('Modularity checks passed.');
}

await main();
