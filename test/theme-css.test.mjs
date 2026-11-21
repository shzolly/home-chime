import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stylesheet = await readFile(new URL('../public/theme.css', import.meta.url), 'utf8');

function paletteTokens(theme) {
  const block = stylesheet.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`, 's'));
  assert.ok(block, `public/theme.css must define a ${theme} palette`);
  return Object.fromEntries([...block[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

const day = paletteTokens('day');
const night = paletteTokens('night');
const required = [
  '--text', '--text-soft', '--text-muted', '--accent', '--accent-2', '--status-dot',
  '--divider', '--panel-bg', '--panel-border', '--panel-shadow', '--bg-base', '--clock-glow', '--time-shadow'
];

test('both palettes define every token the dashboard paints with', () => {
  for (const token of required) {
    assert.ok(day[token], `day palette is missing ${token}`);
    assert.ok(night[token], `night palette is missing ${token}`);
  }
});

test('the palettes change the interface, not only the backdrop', () => {
  // Text, accents and the calendar glass must visibly differ, otherwise a
  // "theme" would be nothing more than a tinted image behind the same UI.
  for (const token of ['--text', '--accent', '--panel-bg', '--panel-border', '--bg-base', '--status-dot']) {
    assert.notEqual(day[token], night[token], `${token} is identical in both palettes`);
  }
});

test('most of the design tokens are palette-specific', () => {
  const differing = required.filter((token) => day[token] !== night[token]);
  assert.ok(differing.length >= required.length - 2, `only ${differing.length} of ${required.length} tokens differ`);
});
