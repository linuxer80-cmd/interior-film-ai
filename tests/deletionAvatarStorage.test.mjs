import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteUserAvatars } from '../lib/deletionAvatarStorage.mjs';

const user = 'd1e7e001-0000-4000-8000-000000000001';
const name = 'd1e7e001-0000-4000-8000-000000000006.jpg';
function mock(initial, failure) {
  let files = initial.map(name => ({ id: name, name }));
  const removed = [];
  return { removed, storage: { from(bucket) {
    assert.equal(bucket, 'labor-avatars');
    return {
      async list(prefix, { limit, offset }) {
        assert.equal(prefix, user);
        if (failure === 'list') return { error: new Error('list failed') };
        return { data: files.slice(offset, offset + limit), error: null };
      },
      async remove(paths) {
        if (failure === 'remove') return { error: new Error('remove failed') };
        removed.push(...paths);
        if (failure !== 'not-deleted') files = files.filter(file => !paths.includes(`${user}/${file.name}`));
        return { error: null };
      },
    };
  } } };
}
test('deletes only the requested user avatar and verifies the result', async () => {
  const m = mock([name]);
  assert.deepEqual(await deleteUserAvatars(m.storage, user), { deleted: 1, verified: true });
  assert.deepEqual(m.removed, [`${user}/${name}`]);
});
test('fails closed for unknown paths and storage errors', async () => {
  await assert.rejects(deleteUserAvatars(mock(['other-user.jpg']).storage, user));
  for (const failure of ['list', 'remove', 'not-deleted']) {
    await assert.rejects(deleteUserAvatars(mock([name], failure).storage, user));
  }
  await assert.rejects(deleteUserAvatars(mock([]).storage, '../other'));
});
test('collects all pages before removing files, then supports a retry', async () => {
  const names = Array.from({ length: 201 }, (_, i) =>
    `00000000-0000-4000-8000-${String(i).padStart(12, '0')}.jpg`);
  let files = names.map(name => ({ id: name, name }));
  let removeCalls = 0;
  let failOnce = true;
  const storage = { from() { return {
    async list(_prefix, { limit, offset }) {
      return { data: files.slice(offset, offset + limit), error: null };
    },
    async remove(paths) {
      removeCalls++;
      if (removeCalls === 2 && failOnce) {
        failOnce = false;
        return { error: new Error('temporary failure') };
      }
      files = files.filter(file => !paths.includes(`${user}/${file.name}`));
      return { error: null };
    },
  }; } };
  await assert.rejects(deleteUserAvatars(storage, user), /temporary failure/);
  assert.equal(files.length, 101);
  assert.deepEqual(await deleteUserAvatars(storage, user), { deleted: 101, verified: true });
  assert.equal(files.length, 0);
});

test('does not delete any files when a later listing page contains an unknown item', async () => {
  const names = Array.from({ length: 100 }, (_, i) =>
    `00000000-0000-4000-8000-${String(i).padStart(12, '0')}.jpg`);
  const m = mock([...names, 'unexpected-file']);
  await assert.rejects(deleteUserAvatars(m.storage, user), /requires review/);
  assert.deepEqual(m.removed, []);
});
