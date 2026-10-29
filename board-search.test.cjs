const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = readFileSync(`${__dirname}/app.js`, 'utf8');
const start = source.indexOf('function boardStatusesForView(');
assert.ok(start >= 0, 'boardStatusesForView');
const end = source.indexOf('\nfunction ', start + 1);
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);

const workflow = ['調査中', '修正中', 'テスト中', 'MR'];
const results = [
  { status: '修正中' },
  { status: '修正中' },
  { status: 'MR' }
];

assert.deepEqual(
  JSON.parse(JSON.stringify(context.boardStatusesForView(workflow, results, false))),
  workflow
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.boardStatusesForView(workflow, results, true))),
  ['修正中', 'MR']
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.boardStatusesForView(workflow, [], true))),
  []
);

console.log('Board search lane regression checks passed');
