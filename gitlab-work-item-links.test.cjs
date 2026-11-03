const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = readFileSync(`${__dirname}/app.js`, 'utf8');
const names = [
  'parseGitLabIssueLink',
  'gitLabIssueIdentity',
  'normalizeDiscoveredGitLabIssue',
  'normalizeGitLabUsername',
  'normalizeGitLabAssignees',
  'isGitLabRefreshCandidate',
  'splitGitLabProjectPath',
  'normalizeUrl',
  'extractIssueNumber',
  'issueLabel',
  'issueCategory',
  'isBareIssueNumber'
];
const functions = names.map((name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}).join('\n');
const context = vm.createContext({ URL });
vm.runInContext(`const completedStatus = "完了";\n${functions}`, context);

const legacy = context.parseGitLabIssueLink('https://gitlab.example.com/team/project/-/issues/123');
assert.equal(legacy.resourceType, 'issues');
assert.equal(legacy.projectPath, 'team/project');
assert.equal(legacy.issueIid, '123');
assert.equal(legacy.apiUrl, 'https://gitlab.example.com/api/v4/projects/team%2Fproject/issues/123');

const workItem = context.parseGitLabIssueLink('https://gitlab.example.com/team/project/-/work_items/456?show=activity');
assert.equal(workItem.resourceType, 'work_items');
assert.equal(workItem.projectPath, 'team/project');
assert.equal(workItem.issueIid, '456');
assert.equal(workItem.apiUrl, 'https://gitlab.example.com/api/v4/projects/team%2Fproject/-/work_items/456');

const selfManaged = context.parseGitLabIssueLink('https://example.com/tec/gitlab/team/project/-/work_items/789/');
assert.equal(selfManaged.origin, 'https://example.com/tec/gitlab');
assert.equal(selfManaged.projectPath, 'team/project');
assert.equal(selfManaged.apiUrl, 'https://example.com/tec/gitlab/api/v4/projects/team%2Fproject/-/work_items/789');

assert.equal(context.extractIssueNumber('https://gitlab.example.com/team/project/-/issues/123'), '123');
assert.equal(context.extractIssueNumber('https://gitlab.example.com/team/project/-/work_items/456'), '456');
assert.equal(context.issueLabel('https://gitlab.example.com/step3/external-test-issue/-/work_items/456'), '外結 #456');
assert.equal(context.parseGitLabIssueLink('https://gitlab.example.com/team/project/-/merge_requests/1'), null);
assert.equal(
  context.gitLabIssueIdentity('https://gitlab.example.com/team/project/-/issues/456'),
  context.gitLabIssueIdentity('https://gitlab.example.com/team/project/-/work_items/456')
);

assert.equal(context.normalizeGitLabUsername('@Member.One'), 'member.one');

assert.equal(context.issueCategory('https://gitlab.example.com/step3/external-test-issue/-/work_items/1'), '外結');
assert.equal(context.issueCategory('https://gitlab.example.com/step3/integration-test-issue/-/issues/2'), '総合');
assert.equal(context.issueCategory('https://gitlab.example.com/001-sej/issue/-/work_items/3'), '開発');
assert.equal(context.issueCategory('https://gitlab.example.com/001-sej/unit-integration-tests/step3/-/issues/4'), '単結');

const discovered = context.normalizeDiscoveredGitLabIssue({
  iid: 456,
  title: '未収録 Issue',
  state: 'opened',
  web_url: 'https://gitlab.example.com/team/project/-/work_items/456',
  updated_at: '2026-11-03T00:00:00Z',
  assignees: [{ id: 1, name: 'Member One', username: 'member.one' }]
});
assert.equal(discovered.projectPath, 'team/project');
assert.equal(discovered.assignees[0].username, 'member.one');
assert.equal(context.normalizeDiscoveredGitLabIssue({ ...discovered, state: 'closed' }), null);

const linkedIssue = {
  type: 'issue',
  status: '調査中',
  link: 'https://gitlab.example.com/team/project/-/work_items/456'
};
assert.equal(context.isGitLabRefreshCandidate(linkedIssue), true);
assert.equal(context.isGitLabRefreshCandidate({ ...linkedIssue, status: '完了' }), false);
assert.equal(context.isGitLabRefreshCandidate({ ...linkedIssue, type: 'todo' }), false);
assert.equal(context.isGitLabRefreshCandidate({ ...linkedIssue, link: '' }), false);

console.log('GitLab work item link regression checks passed');
