const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = readFileSync(`${__dirname}/app.js`, 'utf8');
const names = ['normalizeEffortDays', 'normalizeTaskSchedule', 'isCapacityStatus', 'isCapacityIssue', 'recalculateSchedules', 'scheduleWithStatus', 'capacityForDate', 'isWorkingDate', 'nextDateWithCapacity', 'addCalendarDays', 'localDateString', 'applyQueuePosition', 'moveGanttQueueTask'];
const functions = names.map(name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}).join('\n');
const context = vm.createContext({
  effortStepDays: 0.5,
  capacityStatuses: ['調査中', '修正中', 'テスト中'],
  japaneseHolidayDates: new Set(['2026-09-21', '2026-09-22', '2026-09-23']),
  todayOffset: () => '2026-09-24',
  isDone: task => task.status === '完了',
  markStateMutation: () => {},
  render: () => {}
});
vm.runInContext(functions, context);
function schedule(efforts, capacity = 1) {
  const state = {
    members: ['我'],
    scheduling: { memberSettings: { '我': { dailyCapacityDays: capacity } } },
    tasks: efforts.map((effort, index) => ({
      id: String(index), type: 'issue', owner: '我', status: '修正中',
      schedule: { remainingEffortDays: effort, queueOrder: index }
    }))
  };
  context.recalculateSchedules(state);
  return state.tasks.map(task => task.schedule);
}
let result = schedule([2, 2, 1]);
assert.deepEqual(result.map(s => [s.plannedStart, s.eta]), [
  ['2026-09-24', '2026-09-25'],
  ['2026-09-28', '2026-09-29'],
  ['2026-09-30', '2026-09-30']
]);
result = schedule([0.5, 0.5, 0.5]);
assert.deepEqual(result.map(s => s.plannedStart), ['2026-09-24', '2026-09-24', '2026-09-25']);
result = schedule([1, 0.5], 0.5);
assert.equal(result[1].plannedStart, '2026-09-28');
assert.equal(schedule([2], 0)[0].calculationStatus, 'missing_capacity');
assert.equal(schedule([null, 2])[1].plannedStart, '2026-09-24');
const queueState = {
  members: ['我'],
  scheduling: { memberSettings: { '我': { dailyCapacityDays: 1 } } },
  tasks: [1, 2, 3].map((effort, index) => ({ id: String(index), type: 'issue', owner: '我', status: '修正中', schedule: { remainingEffortDays: effort, queueOrder: index } }))
};
context.applyQueuePosition(queueState, '我', '2', 1);
assert.deepEqual(queueState.tasks.sort((a, b) => a.schedule.queueOrder - b.schedule.queueOrder).map(task => task.id), ['2', '0', '1']);
context.state = queueState;
context.moveGanttQueueTask('0', '1', true);
assert.deepEqual(queueState.tasks.sort((a, b) => a.schedule.queueOrder - b.schedule.queueOrder).map(task => task.id), ['2', '1', '0']);
console.log('Scheduling regression checks passed');
