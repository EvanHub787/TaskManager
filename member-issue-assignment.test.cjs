const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = readFileSync(`${__dirname}/app.js`, 'utf8');
const names = [
  'normalizeName',
  'normalizeGitLabUsername',
  'normalizeGitLabAssignees',
  'memberIssueAssignmentKinds',
  'memberIssueEntryMatchesFilter'
];
const functions = names.map((name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}).join('\n');
const context = vm.createContext({ memberIssueAssignmentFilter: 'all' });
vm.runInContext(functions, context);

const settings = { memberUsernames: { '田中': '@tanaka' } };
const collected = {
  owner: '田中',
  gitlab: { assignees: [{ id: 1, name: 'Tanaka', username: 'TANAKA' }] }
};
assert.deepEqual(
  JSON.parse(JSON.stringify(context.memberIssueAssignmentKinds(collected, '田中', settings))),
  { management: true, git: true }
);

const pending = { assignees: [{ id: 1, name: 'Tanaka', username: 'tanaka' }] };
assert.deepEqual(
  JSON.parse(JSON.stringify(context.memberIssueAssignmentKinds(pending, '田中', settings, true))),
  { management: false, git: true }
);

assert.deepEqual(
  JSON.parse(JSON.stringify(context.memberIssueAssignmentKinds(collected, '佐藤', settings))),
  { management: false, git: false }
);

context.memberIssueAssignmentFilter = 'git';
assert.equal(context.memberIssueEntryMatchesFilter({ management: true, git: false }), false);
assert.equal(context.memberIssueEntryMatchesFilter({ management: true, git: true }), true);
context.memberIssueAssignmentFilter = 'management';
assert.equal(context.memberIssueEntryMatchesFilter({ management: false, git: true }), false);
assert.equal(context.memberIssueEntryMatchesFilter({ management: true, git: false }), true);
context.memberIssueAssignmentFilter = 'all';
assert.equal(context.memberIssueEntryMatchesFilter({ management: false, git: true }), true);

console.log('Member Issue assignment regression checks passed');
