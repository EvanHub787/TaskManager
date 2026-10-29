const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = readFileSync(`${__dirname}/app.js`, 'utf8');
const names = [
  'normalizeGitLabStatus',
  'normalizeGitLabAssignees',
  'mergeGitLabSyncResult',
  'gitLabAssigneeLabel'
];
const functions = names.map((name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}).join('\n');
const context = vm.createContext({});
vm.runInContext(functions, context);

assert.equal(context.gitLabAssigneeLabel(null), '未同期');
assert.equal(context.gitLabAssigneeLabel({ checkedAt: '2026-10-29T00:00:00Z' }), '未同期');
assert.equal(context.gitLabAssigneeLabel({ assignees: [], assigneesSynced: true }), '未割り当て');

const multi = context.normalizeGitLabStatus({
  assigneesSynced: true,
  assignees: [
    { id: 101, name: '田中', username: 'tanaka' },
    { id: 202, name: '佐藤', username: 'sato' },
    { id: 101, name: '重複', username: 'duplicate' }
  ]
});
assert.equal(multi.assignees.length, 2);
assert.deepEqual(
  JSON.parse(JSON.stringify(multi.assignees)),
  [
    { id: '101', name: '田中', username: 'tanaka' },
    { id: '202', name: '佐藤', username: 'sato' }
  ]
);
assert.equal(context.gitLabAssigneeLabel(multi), '田中、佐藤');

const previous = {
  state: 'opened',
  title: '既存タイトル',
  updatedAt: '2026-10-28T00:00:00Z',
  checkedAt: '2026-10-28T01:00:00Z',
  assigneesSynced: true,
  assignees: [{ id: 101, name: '田中', username: 'tanaka' }]
};
const failed = context.mergeGitLabSyncResult(previous, {
  state: '',
  assignees: [],
  checkedAt: '2026-10-29T00:00:00Z',
  error: 'network error'
});
assert.equal(failed.state, 'opened');
assert.equal(failed.title, '既存タイトル');
assert.equal(failed.assignees[0].name, '田中');
assert.equal(failed.checkedAt, '2026-10-29T00:00:00Z');
assert.equal(failed.error, 'network error');

const cleared = context.mergeGitLabSyncResult(previous, {
  state: 'opened',
  title: '更新タイトル',
  updatedAt: '2026-10-29T00:00:00Z',
  checkedAt: '2026-10-29T00:01:00Z',
  assignees: [],
  error: ''
});
assert.equal(cleared.assigneesSynced, true);
assert.equal(cleared.assignees.length, 0);
assert.equal(context.gitLabAssigneeLabel(cleared), '未割り当て');

const changed = context.mergeGitLabSyncResult(previous, {
  state: 'closed',
  title: '更新タイトル',
  updatedAt: '2026-10-29T00:00:00Z',
  checkedAt: '2026-10-29T00:01:00Z',
  assignees: [{ id: 303, name: '鈴木', username: 'suzuki' }],
  error: ''
});
assert.equal(changed.state, 'closed');
assert.equal(changed.assignees[0].id, '303');
assert.equal(changed.assignees[0].name, '鈴木');

console.log('GitLab assignee regression checks passed');
