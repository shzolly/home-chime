import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeBuildId } from '../lib/version.mjs';

test('build id is stable until a dashboard source file changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'home-chime-build-'));
  try {
    await mkdir(join(root, 'lib'));
    await mkdir(join(root, 'public'));
    await writeFile(join(root, 'server.mjs'), 'console.log("first");');
    await writeFile(join(root, 'package.json'), '{"name":"home-chime"}');
    await writeFile(join(root, 'lib', 'theme.mjs'), 'export const phase = "night";');
    await writeFile(join(root, 'public', 'styles.css'), ':root { color: #fff; }');

    const first = await computeBuildId(root);
    const second = await computeBuildId(root);
    assert.equal(first, second);
    assert.match(first, /^[0-9a-f]{12}$/);

    await writeFile(join(root, 'lib', 'theme.mjs'), 'export const phase = "day";');
    const changed = await computeBuildId(root);
    assert.notEqual(changed, first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('build id ignores binary assets and missing optional directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'home-chime-build-'));
  try {
    await mkdir(join(root, 'lib'));
    await mkdir(join(root, 'public'));
    await writeFile(join(root, 'server.mjs'), 'console.log("stable");');
    await writeFile(join(root, 'package.json'), '{"name":"home-chime"}');
    await writeFile(join(root, 'lib', 'theme.mjs'), 'export const phase = "day";');
    await writeFile(join(root, 'public', 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const withoutBinary = await computeBuildId(root);

    await writeFile(join(root, 'public', 'photo.png'), Buffer.from([0x00, 0x01, 0x02]));
    const afterBinaryChange = await computeBuildId(root);
    assert.equal(withoutBinary, afterBinaryChange);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
