# TaskManager 团队排程扩展设计

## 1. 结论与设计原则

当前 TaskManager 是一个原生 HTML/CSS/JavaScript 的本地单页应用，没有后端与构建系统。全部业务状态集中在 `app.js` 的 `state` 对象中，保存到 IndexedDB，同时兼容 `localStorage`、JSON 导入导出和浏览器文件同步。现有 Issue 看板、成员页、任务编辑弹窗、撤销与恢复点都可以复用，不需要另建 Excel，也不建议另起一个排程项目。

建议在现有结构上增加一个独立的“负责人串行队列 + 日容量分配”层：

- 保留 `task.order` 作为看板流程列内顺序。
- 新增 `task.schedule.queueOrder` 作为负责人队列顺序，两者互不覆盖。
- 保留 `task.due` 作为人工承诺期限/目标期限。
- 新增 `plannedStart` 与 `eta` 作为系统计算结果，不覆盖 `due`。
- 人员仍沿用现有的字符串名称，第一阶段用 `state.scheduling.memberSettings` 按成员名保存 Capacity，避免立即把大量代码改成 member ID。
- 只有未完成 Issue 进入 Capacity 排程；Todo 已确认不纳入 Capacity，也不参与负责人排程队列。
- 工数单位确定为人日，最小输入单位为 0.5 人日；1 人日按 8 小时定义，但第一阶段界面和计算不拆成小时。
- `調査中`、`修正中`、`テスト中` 占 Capacity；`MR` 不占 Capacity，也不阻挡负责人继续处理队列中的下一项。
- 工作日按周一至周五并排除日本国民祝日、振替休日和法定“休日”。
- 没有剩余工数的旧 Issue 显示为“待估算”，不使用隐含默认工数，也不阻塞后续已估算 Issue 的计算；界面必须显著提示队列结果不完整。
- 每次排期变化由一个集中、永久保存的排期事件记录，现有本地“操作履历”只能作为撤销辅助，不能代替 ETA 审计记录。

## 2. 已确认的当前实现

### 2.1 技术栈与存储

- 页面入口为 `index.html`，样式为 `styles.css`，业务代码全部在 `app.js`。
- 无框架、无后端、无 npm/build 配置；通过浏览器直接打开或静态 HTTP 服务运行。
- `state` 当前包含：
  - `members: string[]`
  - `workflow: string[]`
  - `tasks: Task[]`
  - `selfMember: string`
- 主存储为 IndexedDB：数据库 `task-manager-data`、版本 1、对象仓库 `state` 与 `recovery`。
- 同时写入 `localStorage` 的 `follow-manager-v1`，并支持 JSON 导入/导出。
- 可打开一个共享 JSON 文件；本机每次变更自动写入，且每 30 秒轮询外部变化。
- 当前共享文件没有版本号、冲突检测或合并，多个成员同时编辑时是“后写覆盖前写”。这对排程历史尤其重要，见风险章节。

### 2.2 当前 Issue 数据字段

当前 task 同时承载 Issue 与 Todo。Issue 已确认字段如下：

| 字段 | 当前含义 | 排程设计中的处理 |
| --- | --- | --- |
| `id` | UUID | 继续作为 Issue 与审计引用键 |
| `type` | `issue` / `todo` | 第一阶段仅排 `issue` |
| `title` | 标题 | 不变 |
| `project` | 案件 | 不变 |
| `owner` | 负责人名称字符串 | 继续使用；决定进入哪个队列 |
| `due` | 人工期限 | 保留，不改成 ETA |
| `status` | 自定义 Issue 流程或完了 | 未完成状态都可进入队列 |
| `priority` | 高/中/低 | 只做展示和插单理由，不自动决定 Queue Order |
| `next` | 下一步行动 | 不变 |
| `link` / `relatedIssues` | Issue 关联信息 | 不变 |
| `quality` | 品质分析 | 不变 |
| `order` | 看板状态列内拖拽顺序 | 保留，不用于负责人队列 |
| `notes` / `attachments` | 备注与附件 | 不变 |
| `createdAt` / `updatedAt` | 创建/更新时间 | 不变；排期重算需谨慎决定是否更新 `updatedAt` |

当前不存在工数、剩余工数、Capacity、Queue Order、Planned Start、ETA、Original ETA、节假日或排期变更历史。

### 2.3 当前页面与工作流

- 概要页：未完成、Issue、Todo、超期、完了、停滞统计，以及按人工期限/优先级排序的优先处理列表。
- Issue 页：按自定义 workflow 分列的看板。拖拽卡片会改变状态以及该状态列内 `order`。
- Todo 页：开放 Todo 的手动排序，以及日次整理。
- 案件页：按项目统计件数、完成率、优先级和超期。
- 成员页：显示每位成员的未完成/Issue/Todo/超期数量；支持成员新增、改名、合并、设为自己、删除。
- Issue 可在卡片或编辑弹窗快速修改负责人、期限、优先级、下一行动等。
- 成员改名时会批量更新 task 的 `owner`；重名会合并成员。
- 当前排序逻辑主要是：
  - 看板与 Todo：`order` 优先。
  - 概要/成员外部负责人代表任务：人工 `due`、优先级、停滞情况优先。

### 2.4 当前历史能力的边界

- Undo 保存最近 30 次完整 state 快照，仅当前浏览器会话有效。
- Recovery 在 IndexedDB 保存最近 12 个完整 state 快照。
- “操作履历”只保存 label 与 timestamp 到本机 `localStorage`，没有字段级 before/after，也不会进入共享 JSON。
- 因此 ETA 留痕必须新增业务数据结构，不能复用当前操作履历来满足审计要求。

## 3. 建议的数据模型

### 3.1 顶层排程设置

在现有 state 增加 `schemaVersion` 和 `scheduling`：

```js
{
  schemaVersion: 2,
  members: ["自分", "成员A"],
  workflow: ["調査中", "修正中", "テスト中", "MR"],
  tasks: [],
  selfMember: "自分",
  scheduling: {
    unit: "person_days",
    hoursPerPersonDay: 8,
    effortStepDays: 0.5,
    capacityStatuses: ["調査中", "修正中", "テスト中"],
    workweek: [1, 2, 3, 4, 5],
    holidayCalendar: {
      region: "JP",
      source: "CAO",
      coveredThrough: "2027-12-31",
      dates: []
    },
    additionalNonWorkingDates: [],
    memberSettings: {
      "自分": {
        dailyCapacityDays: 1,
        capacityOverrides: {
          "2026-09-25": 0.5,
          "2026-09-28": 0
        }
      }
    },
    changeLog: []
  }
}
```

说明：

- 工数和 Capacity 都以人日计算，最小粒度为 0.5 人日。1 人日定义为 8 小时，只用于团队理解和将来数据交换；第一阶段不提供小时输入。
- `dailyCapacityDays` 表示成员每天可以投入 Issue 的有效人日，建议界面先提供 0、0.5、1.0 三档。例如每日 Capacity 为 0.5 人日时，一个 1 人日 Issue 需要两个工作日。
- `capacityOverrides` 支持请假、会议日、临时半天等，以人日填写。
- `capacityStatuses` 固定为现有流程中的 `調査中`、`修正中`、`テスト中`。`MR` 排除在外。
- `workweek` 为周一至周五。
- `holidayCalendar` 使用日本内阁府公布的国民祝日数据，必须包括振替休日和祝日法第 3 条第 3 项产生的“休日”。内阁府当前页面公布到 2027 年，并说明 2028 年数据将在 2027 年 2 月发布，因此应用应内置已公布日期、每年更新，并在 ETA 超出 `coveredThrough` 时明确提示“日本假期数据尚未发布/更新”。
- `additionalNonWorkingDates` 只用于公司统一休业日等日本法定假日以外的日期，不用来手工重复维护日本祝日。
- 日本祝日官方来源：[内阁府「国民の祝日」について](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)；该页面也提供 CSV 数据。
- 使用成员名作为 key 是对当前实现改动最小的方案。成员改名/合并时必须同步迁移 `memberSettings`；长期若需要同名成员、离职历史或稳定审计，可再引入 member ID。

### 3.2 Issue 排程字段

对 `type === "issue"` 的 task 增加：

```js
schedule: {
  remainingEffortDays: 1.5,
  queueOrder: 2,
  plannedStart: "2026-09-25",
  eta: "2026-09-26",
  originalEta: "2026-09-26",
  calculatedAt: "2026-09-23T10:30:00.000Z",
  calculationStatus: "scheduled"
}
```

字段规则：

- `remainingEffortDays`：用户维护的剩余工数；必须大于等于 0，且只能以 0.5 人日递增。0 表示已无剩余工作，但仍处于占 Capacity 状态时应提示确认。
- `queueOrder`：同一 owner 的未完成 Issue 串行顺序。建议保存为连续整数 0..n-1；每次负责人变更或拖拽后只重排涉及的负责人。
- `plannedStart` / `eta`：纯算法输出，不在普通编辑表单中允许直接覆盖。由于 `MR` 不占 Capacity，这里的 ETA 定义为“负责人完成需要投入 Capacity 的工作、预计进入 MR 的日期”，不预测 MR 等待评审后最终关闭的日期。
- `originalEta`：Issue 第一次成功进入排程时写入，之后永不自动修改；旧 Issue 在升级后的首次有效计算时初始化。
- `calculatedAt`：最近一次计算时间，仅用于解释数据新鲜度。
- `calculationStatus` 建议值：`scheduled`、`missing_effort`、`missing_capacity`、`waiting_mr`、`completed`、`external_owner`。Issue 进入 `MR` 时标记为 `waiting_mr`，退出负责人队列，并保留进入 MR 前最后一次计划快照供追溯。

不要把这些字段平铺到 task 顶层：嵌套结构可减少与现有 Issue/Todo 字段冲突，也方便 `migrateState` 为旧数据统一补齐。

### 3.3 ETA 变更事件

在 `state.scheduling.changeLog` 保存业务审计事件：

```js
{
  id: "uuid",
  changedAt: "2026-09-23T10:30:00.000Z",
  reasonCode: "urgent_insert",
  reasonText: "客户现场阻断，插入到第 2 位",
  triggerIssueId: "new-issue-id",
  actor: "自分",
  affectedOwners: ["成员A"],
  changes: [
    {
      issueId: "downstream-issue-id",
      beforePlannedStart: "2026-09-25",
      afterPlannedStart: "2026-09-26",
      beforeEta: "2026-09-26",
      afterEta: "2026-09-29",
      deltaWorkingDays: 2
    }
  ]
}
```

建议 reasonCode：

- `urgent_insert`：紧急插单。
- `queue_reorder`：普通队列调整。
- `owner_change`：负责人变化。
- `effort_change`：剩余工数变化。
- `capacity_change`：人员 Capacity 或日历变化。
- `priority_change`：明确选择“按优先级重新排队”时使用；单纯修改优先级不应暗中重排。
- `issue_complete` / `issue_reopen`：完了或重新打开。
- `initial_schedule`：首次纳入排程。

`changes` 只记录开始时间或 ETA 真正变化的 Issue。新 Issue 可记录 `before...: null`；`originalEta` 初始化本身也可在事件中体现。历史不建议自动截断，否则不能长期解释 ETA 为什么改变。

## 4. ETA 算法

### 4.1 输入与基本假设

第一阶段采用可解释的确定性算法：

1. 每位成员同一时间只处理队列中的一个 Issue。
2. 排程对象为该成员所有未完成、已有剩余工数，且状态为 `調査中`、`修正中`、`テスト中` 的 Issue，跨这三个状态形成一个统一队列。Todo 与 `MR` Issue 不参与计算。
3. 每日可分配量为：日期覆盖值（若有）或成员默认 `dailyCapacityDays`。
4. 周末、日本法定节假日、公司追加休业日、Capacity 为 0 的日期不分配工数。
5. 当一个 Issue 在某天用不满 Capacity 时，下一个 Issue 可使用当天剩余 Capacity，因此两个 Issue 可能有相同日期的 ETA/Planned Start。
6. `due` 不参与计算，仅用于显示“ETA 是否晚于承诺期限”。
7. 优先级不会自动改 Queue Order；系统只在用户明确插入/拖拽后计算。

### 4.2 日期桶分配

对某一 owner：

1. 取其未完成 Issue，按 `queueOrder`、再按稳定的 `createdAt/id` 排序。
2. 从排程基准日开始建立工作日 Capacity 桶。
3. 逐个 Issue 消耗日期桶：
   - 第一次消耗到正 Capacity 的日期为 `plannedStart`。
   - 工数归零的日期为 `eta`。
   - 当日剩余 Capacity 留给下一 Issue。
4. 完成全队列后，写回计算结果。

伪代码：

```js
function calculateOwnerSchedule(owner, anchorDate, issues, settings) {
  let cursor = firstWorkingDateWithCapacity(owner, anchorDate);
  let available = capacityFor(owner, cursor);

  for (const issue of issues.sort(byQueueOrder)) {
    let remaining = issue.schedule.remainingEffortDays;
    let plannedStart = null;

    while (remaining > 0) {
      if (available <= 0) {
        cursor = nextWorkingDateWithCapacity(owner, cursor);
        available = capacityFor(owner, cursor);
      }
      plannedStart ||= cursor;
      const allocated = Math.min(remaining, available);
      remaining -= allocated;
      available -= allocated;
    }

    issue.schedule.plannedStart = plannedStart;
    issue.schedule.eta = cursor;
  }
}
```

### 4.3 排程基准日与当天 Capacity

当前数据没有“今天已投入多少人日”或工时日志。第一阶段建议：

- 默认从浏览器本地日期的今天开始，并把今天视为尚可使用完整日 Capacity。
- 在界面明确显示“按今日完整 Capacity 估算”。
- 若团队需要更精确的当天 ETA，再新增 `capacityOverrides[today]` 或“今日剩余 Capacity”，不要通过猜测当前时间比例自动扣减。

### 4.4 缺数据处理

- 没有工数：标记 `missing_effort`，置空 `plannedStart/eta`，放入队列中的“待估算”区域。
- 负责人不在 `state.members`：标记 `external_owner`，不排程；现有成员页已把这种情况作为“团队外担当”展示。
- 成员没有 Capacity 或 Capacity <= 0：标记 `missing_capacity`，不生成 ETA。
- 已完成 Issue：标记 `completed`；保留 `originalEta` 与历史，当前 `plannedStart/eta` 可保留为最后计划快照，界面不再当作未来负荷。
- `MR` Issue：标记 `waiting_mr`，不消耗 Capacity、不阻挡后续队列；保留最后一次 ETA。若从 MR 返回 `調査中/修正中/テスト中`，由用户选择重新插入队列的位置并触发重算。

未估算 Issue 是否阻塞其后任务存在业务歧义。建议第一阶段“不阻塞但显示全队列 ETA 不完整”，这样不会因任意默认值产生虚假的延期；如果团队希望保守排期，可在后续增加“未知工数阻塞后续”的设置。

### 4.5 工作日差值

`deltaWorkingDays` 不能用自然日相减，应按相同的 workweek、日本假期、追加休业日与成员 Capacity 日历计算。若 before/after 任一为空，则显示为“新纳入排程”或“变为不可排程”，不伪造数字。

## 5. 重算范围与写入流程

所有会影响排期的操作都应经过统一入口，例如 `applyScheduleMutation`，而不是分别在表单、卡片快捷编辑和拖拽代码中各自写算法。

建议流程：

1. 保存操作前，抓取受影响 owner 的当前排程快照。
2. 应用用户变更。
3. 规范化该 owner 的 `queueOrder`。
4. 只对受影响 owner 运行纯计算函数。
5. 对比 before/after，生成 changeLog 事件。
6. 一次性更新 state 并调用现有 `render()`，从而复用撤销、恢复点与持久化。

受影响范围：

| 操作 | 需要重算的队列 |
| --- | --- |
| 同一负责人队列内插单/拖拽 | 该负责人，从最早受影响位置开始；实现上全队列重算也足够轻量 |
| Issue 负责人 A 改为 B | A 与 B |
| 剩余工数变化 | 当前负责人，从该 Issue 开始 |
| Issue 完了/重新打开 | 当前负责人 |
| 成员 Capacity 变化 | 该成员全队列 |
| 日本假期数据或团队追加休业日变化 | 全部成员 |
| workflow 在 `調査中/修正中/テスト中` 之间变化 | 不重算 |
| Issue 进入或离开 `MR` / `完了` | 当前负责人；进入时释放 Capacity，离开时重新进入队列 |
| `due`、标题、案件、下一行动变化 | 不重算 |
| 优先级变化 | 默认不重算；只有用户选择重排时才重算 |

对于约 6 人团队和当前本地数组规模，全队列重算的成本很低。代码上仍应接受 `owner` 集合，以确保紧急插单不会无意改动其他成员的 ETA 或生成无关历史。

### 5.1 紧急插单

正式插单交互：

1. 新建或选择 Issue。
2. 选择负责人和插入位置（队首、某 Issue 之后或队尾）。
3. 填写剩余工数。
4. 系统先显示该成员的影响摘要。
5. 用户确认，原因默认为“紧急插单”，可补充文本。
6. 写入 Queue Order，只重算该成员队列，并保存一个 changeLog 事件。

如果插入的 Issue 原先属于另一名成员，则旧负责人和新负责人都属于受影响范围；这是“只重算相关成员”的必要例外。

## 6. 可选的插单影响模拟

模拟必须是纯函数，不修改 state、不写历史、不触发现有 `render()`/自动保存：

```js
simulateInsertion({ issueId, candidateOwner, insertIndex, remainingEffortDays })
```

对每个候选成员返回：

```js
{
  owner: "成员A",
  newIssuePlannedStart: "2026-09-24",
  newIssueEta: "2026-09-25",
  affectedIssues: [
    { issueId: "...", beforeEta: "2026-09-25", afterEta: "2026-09-26", deltaWorkingDays: 1 }
  ],
  totalDelayedWorkingDays: 4,
  maxDelayWorkingDays: 2,
  queueEndDate: "2026-10-03"
}
```

比较界面建议按成员横向列出：新 Issue ETA、受影响件数、最大延期、累计延期、队列排到日期。默认不做“最佳负责人”自动决定；可以按新任务 ETA 排序，但必须明确最终负责人由用户选择。

模拟时要使用与正式排程完全相同的计算函数，避免预览和保存后结果不一致。

## 7. 界面调整

### 7.1 成员页升级为主要排程视图

保留现有成员编辑折叠区和团队外负责人区，在其上方或下方增加成员排程卡：

- 成员名与每日有效 Capacity，可原位编辑。
- 本周剩余 Capacity：本周剩余可用人日减去已经排进本周的 Issue 人日。
- 累计剩余工数。
- 队列排到日期。
- 风险提示：缺工数、ETA 晚于 due、缺 Capacity。
- 串行 Issue 队列，支持拖拽改变 Queue Order。
- 每行显示：序号、Issue、状态、剩余工数、Planned Start、ETA、人工 due、ETA 与 due 的差异。

不建议把负责人队列直接塞进现有 workflow 看板列，因为一个是“流程状态维度”，一个是“人员执行顺序维度”，混在一次拖拽中会产生歧义。

成员页之外，第一版已增加独立的“スケジュール”甘特图视图：默认展示从本周开始的 6 周，按成员分组，以 Planned Start 到 ETA 绘制任务条；周末、日本祝日和当天分别着色，并支持按周前后移动。任务条按 `調査中`、`修正中`、`テスト中` 区分颜色，ETA 晚于 due 时标红。工数未设置的 Issue 以“工数を設定”占位行显示，可直接打开 Issue 编辑弹窗。MR、完了和 Todo 不绘制 Capacity 任务条。

### 7.2 Issue 编辑弹窗

仅对 Issue 增加一个“排程”区：

- 剩余工数（人日，0.5 人日步进，必填后才可计算）。
- Queue 位置（展示；正式位置优先通过成员队列拖拽/插单选择器调整）。
- Planned Start（只读）。
- ETA（只读）。
- Original ETA（只读）。
- “查看 ETA 变更记录”。

`due` 标签建议改为“目标期限”或“承诺期限”，旁边显示 ETA 风险，减少用户把 due 与 ETA 混淆。

### 7.3 Issue 看板卡片

现有卡片继续按 workflow 展示；增加简短排程信息：

- `1.5人日 · Queue #3`
- `ETA 9/26`
- ETA 超过 due 时显示“预计晚 2 工作日”。
- 缺工数时显示“待估算”。

看板拖拽仍只改变 workflow 状态和 `task.order`，不改变 Queue Order。必须在拖拽反馈或帮助文字中说明这一点。

### 7.4 ETA 历史

在 Issue 详情中按时间倒序显示与该 Issue 相关的 changeLog：

- 变更时间。
- 原因与触发 Issue。
- Planned Start before → after。
- ETA before → after。
- 延期/提前的工作日数。

成员队列顶部可提供“最近排期变更”入口，便于查看一次插单对多个 Issue 的整体影响。

### 7.5 模拟入口

建议放在新建 Issue 或 Issue 排程区的“比较负责人影响”按钮中。弹窗内可选择插入位置，显示所有有 Capacity 的团队成员。正式点击“分配并插入”前不写数据。

## 8. 与现有代码的集成点

### 8.1 `migrateState`

- 增加 `schemaVersion`。
- 为旧 state 补 `scheduling` 默认结构。
- 为旧 Issue 补 `schedule`，默认 `remainingEffortDays: null`、`calculationStatus: "missing_effort"`。
- 为已有未完成 Issue 按负责人生成稳定 `queueOrder`。建议初次迁移使用当前 `order`，再用 `createdAt/id` 打破并列；这只是初始顺序，需要在升级提示中请用户确认。
- 不为旧数据猜测工数或 ETA。
- 成员改名/合并时同步迁移 memberSettings；合并且双方都存在 Capacity 时必须让用户选择保留哪一个，不能静默覆盖。

### 8.2 任务保存与快捷编辑

当前修改入口不止 `saveTask()`：负责人、期限、状态、优先级、拖拽和成员改名都可能直接更新 task。需要先集中出以下服务函数：

- `normalizeSchedulingState(state)`
- `calculateOwnerSchedule(...)`
- `recalculateSchedules(state, owners, context)`
- `moveIssueInOwnerQueue(issueId, owner, insertIndex, reason)`
- `changeIssueOwner(issueId, newOwner, insertIndex, reason)`
- `updateIssueEffort(issueId, personDays, reason)`
- `simulateInsertion(...)`

卡片负责人快捷修改与表单保存必须走同一个 owner-change 服务，避免一个入口有历史、另一个入口没有历史。

### 8.3 看板拖拽

当前 `moveIssueTask` 会按目标 workflow 状态重新写 `order`。保持此逻辑；不要在此函数中顺便改 `queueOrder`。只有任务进入/离开占 Capacity 状态集合时调用排程服务：`調査中/修正中/テスト中` 互相切换不影响排程；进入 `MR` 或 `完了` 时释放 Capacity；从 `MR` 或 `完了` 返回时重新纳入队列。

### 8.4 成员改名与合并

除现有 task.owner 更新外，还必须：

- 搬迁 `memberSettings[oldName]`。
- 对合并后的队列重新编号并重算。
- 记录 owner change/capacity merge 排程事件。
- 若两名成员各有 Capacity，弹出明确选择；不能依赖对象覆盖顺序。

### 8.5 导入导出与 CSV

- JSON 会自然包含新字段，但 `validateImportedData` 应增加 schema 兼容检查与友好错误。
- 现有 Issue CSV 建议追加：剩余工数、Queue Order、Planned Start、ETA、Original ETA、ETA 相对 due 差异。
- 不需要新建 Excel 作为排程源；CSV 只做输出。

### 8.6 `updatedAt` 与停滞判断

当前停滞 Issue 由 `updatedAt` 距今天数判断。如果每次某人的 Capacity 变化都更新所有下游 Issue 的 `updatedAt`，会把实际上没有业务进展的 Issue 误判为“刚更新”。因此自动排程写回时不应刷新 task 的业务 `updatedAt`，只更新 `schedule.calculatedAt`；用户改负责人、工数或状态时才按现有规则更新 task.updatedAt。

## 9. 分阶段实施建议

### 阶段 0：规则确认与数据准备

- 工数单位已确认为人日，最小 0.5 人日，1 人日按 8 小时定义；第一阶段不细分小时。
- Todo 已确认不占 Capacity，也不进入负责人 Issue 队列。
- 确认今天按完整 Capacity 还是由用户输入今日剩余 Capacity。
- 工作日已确认排除日本法定节假日；数据采用内阁府公布清单，内置官方已发布年度并提供覆盖期警告。
- 占 Capacity 状态已确认为 `調査中`、`修正中`、`テスト中`；`MR` 不占。
- 明确旧 Issue 首次迁移后的 Queue Order 需要人工检查。

产出：字段与排程规则冻结，不改现有工作流。

### 阶段 1：最小可用排程

- 扩展 migrateState 与 JSON schema。
- 成员 Capacity 编辑。
- Issue 剩余工数编辑。
- 独立 Queue Order 与成员队列拖拽。
- 纯 ETA 计算函数和工作日函数。
- 成员视图显示累计工数、队列末日、本周剩余 Capacity。
- Issue 卡片/弹窗显示 Planned Start 与 ETA。

验收重点：旧数据可打开且不丢失；`due` 与 `order` 语义不变；同成员队列结果可重复计算。

### 阶段 2：插单与审计

- 统一所有排程 mutation 入口。
- 紧急插单到指定位置。
- 只重算相关成员。
- Original ETA 与 changeLog。
- Issue 级 ETA 历史和一次事件的整体影响明细。
- CSV 增加排程字段。

验收重点：插单只改变该成员后续任务；撤销可恢复队列和 ETA；每次 ETA 变化都有原因和 trigger Issue。

### 阶段 3：负责人影响模拟

- 对所有候选成员运行无副作用模拟。
- 比较新 Issue ETA、延期 Issue、累计/最大延期、队列末日。
- 用户确认后再应用，与模拟结果做一致性校验。

### 阶段 4：团队协作可靠性

- 给共享 JSON 增加 `revision`、`updatedAt`、`updatedBy`。
- 保存前检查读取时 revision；冲突时阻止覆盖并提示刷新/合并。
- 若多人高频同时使用，再评估轻量后端；当前文件轮询不能保证并发排程历史完整。
- 视实际需求增加个人请假、公司统一休业日、完成工数回写和报表。

## 10. 测试与验收场景

至少覆盖：

1. 6h/日、12h Issue 应跨两个工作日完成。
2. 第一个 Issue 当天只用 2h，第二个 Issue 可消费同日剩余 4h。
3. 周五未完成的工数跳到下一个非日本假期的工作日；日本祝日、振替休日、法定“休日”和个人 0 Capacity 日被跳过。
4. 队首插入 3h Issue，只改变该 owner 的后续 Planned Start/ETA。
5. 队尾插入不改变已有 Issue ETA。
6. A 转给 B 时同时压缩 A 队列、延后 B 队列，并生成一个事件。
7. 缺工数 Issue 显示待估算，不产生虚假 ETA。
8. Capacity 缺失/为 0 时不死循环，返回 `missing_capacity`。
9. 修改人工 due 不重算 ETA；ETA 晚于 due 时正确显示风险。
10. `調査中/修正中/テスト中` 之间切换不改变 Queue Order；进入 `MR` 或完了时释放后续 Capacity。
11. 自动重算不刷新业务 `updatedAt`，不消除停滞标记。
12. Original ETA 只初始化一次，后续插单/工数/Capacity 改动不覆盖。
13. 模拟不改变 state，正式应用结果与模拟一致。
14. JSON 导出再导入后 Capacity、Queue、ETA 与历史完整保留。
15. 旧版 JSON 迁移后可继续使用，原 task.order 与 due 不变。

## 11. 尚缺失、需要业务确认的信息

以下内容无法从现有代码推断，实施前需要明确：

- 当天 Capacity 是否按完整日、手工输入剩余值，或需要工时记录自动扣减。
- 日本法定节假日之外，公司统一休业日、个人请假与兼职日是否需要在第一阶段维护。
- 已经开始的 Issue 能否被插单打断；若不能，需要 `locked/inProgress` 规则保护队首。
- `due` 是内部目标、客户承诺还是硬性 SLA；这会影响风险展示文案，但不应改变 ETA 算法。
- 谁可以修改 Capacity、Queue Order 和延期原因；当前应用没有账号或权限模型。
- 多人是否会同时编辑同一个共享 JSON 文件；如果会，阶段 4 应前置。
- 是否需要记录真实完成日与当时计划 ETA 的偏差，用于估算准确度复盘。

## 12. 推荐的下一步

工数单位、占 Capacity 的 workflow 状态、Todo 范围和日本假期口径已经确认。下一步只需优先确认“当天剩余 Capacity”如何处理，以及第一阶段是否要维护公司休业日/个人请假，然后实施阶段 1，不先做模拟器。阶段 1 能验证数据是否足以支撑可靠 ETA，再进入插单审计与多成员比较。
