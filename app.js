const defaultWorkflow = ["調査中", "修正中", "テスト中", "MR"];
const completedStatus = "完了";
const todoOpenStatus = "未対応";
const todoDoneStatus = "完了";
const priorities = ["高", "中", "低"];
const defaultMembers = ["自分", "メンバーA", "メンバーB", "メンバーC", "メンバーD", "メンバーE"];
const storageKey = "follow-manager-v1";
const historyKey = "follow-manager-history-v1";
const databaseName = "task-manager-data";
const databaseVersion = 1;
const stateStoreName = "state";
const recoveryStoreName = "recovery";
const maxUndoEntries = 30;
const maxRecoveryPoints = 12;

const sampleTasks = [
  issueTask("Issue 対応フローを確認", "チーム管理", "自分", todayOffset(0), "調査中", "高", "Issue を調査、修正、テスト、MR の流れで管理できるか確認する。", "Issue 画面でフローをカスタマイズできます。"),
  issueTask("顧客フィードバック画面の不具合", "顧客案件", "メンバーA", todayOffset(2), "修正中", "高", "発生条件を特定し、修正後に MR を作成する。", ""),
  issueTask("ログインフローの回帰テスト", "品質改善", "メンバーB", todayOffset(1), "テスト中", "中", "テスト観点に沿って修正影響範囲を確認する。", ""),
  todoTask("顧客からの一時依頼 memo を整理", "自分", todayOffset(1), "中", "txt のメモを Todo に分解し、Issue 化するか判断する。", "")
];

let state = migrateState(loadState());
let dataFileHandle = null;
let dragPlaceholderHeight = 96;
let activeDropZone = null;
let activeBeforeId = "";
let suppressBoardClickUntil = 0;
let keepWorkflowMenuOpen = false;
let workflowDragPlaceholderHeight = 52;
let filters = {
  search: ""
};
let dashboardStatFilter = "";
let pendingDoneTaskId = "";
let pendingConvertTaskId = "";
let showAllTodoDone = false;
let ownerPickerTaskId = "";
let projectPickerTaskId = "";
let duePickerTaskId = "";
let nextEditorTaskId = "";
let priorityPickerTaskId = "";
let currentTaskAttachments = [];
let storageQuotaAlertShown = false;
let undoStack = [];
let operationLog = loadOperationLog();
let lastStateSnapshot = "";
let lastPersistedSnapshot = "";
let pendingMutationLabel = "";
let suppressHistoryCapture = true;
let toastTimer = null;
let appDatabase = null;

const els = {
  pageTitle: document.querySelector("#pageTitle"),
  navButtons: document.querySelectorAll(".nav-button"),
  dashboardView: document.querySelector("#dashboardView"),
  boardView: document.querySelector("#boardView"),
  todoView: document.querySelector("#todoView"),
  projectsView: document.querySelector("#projectsView"),
  peopleView: document.querySelector("#peopleView"),
  todayFocus: document.querySelector("#todayFocus"),
  searchInput: document.querySelector("#searchInput"),
  searchAssist: document.querySelector("#searchAssist"),
  addTaskBtn: document.querySelector("#addTaskBtn"),
  workflowTopSlot: document.querySelector("#workflowTopSlot"),
  openDataFileBtn: document.querySelector("#openDataFileBtn"),
  saveDataFileBtn: document.querySelector("#saveDataFileBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importFile: document.querySelector("#importFile"),
  dailyReportBtn: document.querySelector("#dailyReportBtn"),
  historyBtn: document.querySelector("#historyBtn"),
  recoveryBtn: document.querySelector("#recoveryBtn"),
  shortcutHelpBtn: document.querySelector("#shortcutHelpBtn"),
  storageUsage: document.querySelector("#storageUsage"),
  dialog: document.querySelector("#taskDialog"),
  form: document.querySelector("#taskForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  taskId: document.querySelector("#taskId"),
  taskType: document.querySelector("#taskType"),
  taskTitle: document.querySelector("#taskTitle"),
  taskProject: document.querySelector("#taskProject"),
  taskOwner: document.querySelector("#taskOwner"),
  taskDue: document.querySelector("#taskDue"),
  taskStatus: document.querySelector("#taskStatus"),
  taskCompletedAtLabel: document.querySelector("#taskCompletedAtLabel"),
  taskCompletedAt: document.querySelector("#taskCompletedAt"),
  taskPriority: document.querySelector("#taskPriority"),
  taskLinkedIssueId: document.querySelector("#taskLinkedIssueId"),
  taskNext: document.querySelector("#taskNext"),
  taskLink: document.querySelector("#taskLink"),
  taskNotes: document.querySelector("#taskNotes"),
  taskImages: document.querySelector("#taskImages"),
  taskAttachmentList: document.querySelector("#taskAttachmentList"),
  imagePreviewDialog: document.querySelector("#imagePreviewDialog"),
  imagePreview: document.querySelector("#imagePreview"),
  imagePreviewName: document.querySelector("#imagePreviewName"),
  closeImagePreview: document.querySelector("#closeImagePreview"),
  deleteTaskBtn: document.querySelector("#deleteTaskBtn"),
  createTodoFromIssueBtn: document.querySelector("#createTodoFromIssueBtn"),
  closeDialog: document.querySelector("#closeDialog"),
  cancelDialog: document.querySelector("#cancelDialog"),
  projectList: document.querySelector("#projectList"),
  utilityDialog: document.querySelector("#utilityDialog"),
  utilityTitle: document.querySelector("#utilityTitle"),
  utilityContent: document.querySelector("#utilityContent"),
  utilityActions: document.querySelector("#utilityActions"),
  closeUtilityDialog: document.querySelector("#closeUtilityDialog"),
  endDayDialog: document.querySelector("#endDayDialog"),
  endDayForm: document.querySelector("#endDayForm"),
  endDayList: document.querySelector("#endDayList"),
  closeEndDayDialog: document.querySelector("#closeEndDayDialog"),
  cancelEndDayDialog: document.querySelector("#cancelEndDayDialog"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toastMessage"),
  undoBtn: document.querySelector("#undoBtn")
};

bootstrap();

async function bootstrap() {
  bindEvents();
  fillStaticSelects();
  els.addTaskBtn.title = "新規項目を追加 (N)";
  els.searchInput.title = "検索へ移動 (/) · 例: 担当:自分 期限:今日";
  els.closeDialog.title = "閉じる (Esc)";
  els.closeUtilityDialog.title = "閉じる (Esc)";
  els.form.querySelector("button[type='submit']").title = "保存 (Ctrl+Enter)";
  lastStateSnapshot = serializeState(state);
  render();
  suppressHistoryCapture = false;
  await initializeIndexedDb();
  updateStorageUsage();
}

function bindEvents() {
  els.navButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  els.searchInput.addEventListener("input", (event) => {
    filters.search = event.target.value.trim();
    render();
  });
  els.searchInput.addEventListener("focus", renderSearchAssist);
  els.searchInput.addEventListener("click", renderSearchAssist);
  els.searchInput.addEventListener("blur", () => setTimeout(renderSearchAssist, 120));

  els.addTaskBtn.addEventListener("click", () => openTaskDialog());
  els.openDataFileBtn.addEventListener("click", openDataFile);
  els.saveDataFileBtn.addEventListener("click", saveDataFile);
  els.closeDialog.addEventListener("click", closeTaskDialog);
  els.cancelDialog.addEventListener("click", closeTaskDialog);
  els.deleteTaskBtn.addEventListener("click", deleteCurrentTask);
  els.createTodoFromIssueBtn.addEventListener("click", createTodoFromCurrentIssue);
  els.exportBtn.addEventListener("click", exportData);
  els.importFile.addEventListener("change", importData);
  els.dailyReportBtn.addEventListener("click", openDailyReport);
  els.historyBtn.addEventListener("click", openHistoryDialog);
  els.recoveryBtn.addEventListener("click", openRecoveryDialog);
  els.shortcutHelpBtn.addEventListener("click", openShortcutHelp);
  els.closeUtilityDialog.addEventListener("click", closeUtilityDialog);
  els.endDayForm.addEventListener("submit", applyEndDayReview);
  els.closeEndDayDialog.addEventListener("click", () => els.endDayDialog.close());
  els.cancelEndDayDialog.addEventListener("click", () => els.endDayDialog.close());
  els.undoBtn.addEventListener("click", undoLastChange);
  els.taskLink.addEventListener("input", () => els.taskLink.setCustomValidity(""));
  els.taskNext.addEventListener("input", autoResizeTaskNext);
  els.taskImages.addEventListener("change", handleTaskImageFiles);
  els.taskNotes.addEventListener("paste", handleTaskImagePaste);
  els.taskAttachmentList.addEventListener("click", removeTaskAttachment);
  els.taskAttachmentList.addEventListener("click", openTaskAttachmentPreview);
  els.closeImagePreview.addEventListener("click", closeTaskAttachmentPreview);
  els.imagePreviewDialog.addEventListener("click", closeTaskAttachmentPreviewFromBackdrop);
  els.taskType.addEventListener("change", () => {
    fillStatusSelect(els.taskType.value);
    syncIssueLinkRequirement();
    syncCompletedAtField();
  });
  els.taskStatus.addEventListener("change", syncCompletedAtField);
  els.form.addEventListener("keydown", submitTaskDialogWithShortcut);
  els.form.addEventListener("submit", saveTask);
  els.boardView.addEventListener("click", suppressBoardClickAfterDrag, true);
  document.addEventListener("click", closeWorkflowMenuOnOutsideClick, true);
  document.addEventListener("click", clearPendingDoneOnOtherClick);
  document.addEventListener("click", closeOwnerPickerOnOtherClick);
  document.addEventListener("click", closeProjectPickerOnOtherClick);
  document.addEventListener("click", closeDuePickerOnOtherClick);
  document.addEventListener("click", closeNextEditorOnOtherClick);
  document.addEventListener("click", closePriorityPickerOnOtherClick);
  document.addEventListener("input", clearPendingDoneConfirmation);
  document.addEventListener("change", clearPendingDoneConfirmation);
  document.addEventListener("keydown", handleGlobalShortcuts);
}

function fillStaticSelects() {
  els.taskType.innerHTML = `<option value="issue">Issue</option><option value="todo">Todo</option>`;
  els.taskPriority.innerHTML = priorities.map((priority) => `<option value="${priority}">${priority}</option>`).join("");
  fillStatusSelect("issue");
}

function fillStatusSelect(type, selected) {
  const options = type === "todo" ? [todoOpenStatus, todoDoneStatus] : [...state.workflow, completedStatus];
  els.taskStatus.innerHTML = options.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("");
  els.taskStatus.value = selected && options.includes(selected) ? selected : options[0];
}

function render() {
  state = migrateState(state);
  syncMembersFromTasks();
  captureStateChange();
  renderWorkflowTopControl();
  renderFilterOptions();
  renderProjectList();
  renderTodayFocus();
  renderDashboard();
  renderBoard();
  renderTodo();
  renderProjects();
  renderPeople();
  renderSearchAssist();
  wireClearSearchButtons();
  saveState();
}

async function openDataFile() {
  if (!window.showOpenFilePicker) {
    alert("このブラウザはデータファイルの直接読み込みに対応していません。右上のインポートボタンを使うか、Windows の Chrome / Edge で利用してください。");
    return;
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: "TaskManager データファイル",
        accept: { "application/json": [".json"] }
      }],
      multiple: false
    });
    const file = await handle.getFile();
    const imported = JSON.parse(await file.text());
    validateImportedData(imported);
    dataFileHandle = handle;
    markStateMutation("データファイルを読み込み");
    state = migrateState(imported);
    render();
    alert("データファイルを開きました。変更後は「データファイルへ保存」を押してください。");
  } catch (error) {
    if (error.name !== "AbortError") {
      alert("読み込みに失敗しました。TaskManager の JSON データファイルを選択してください。");
    }
  }
}

async function saveDataFile() {
  if (!window.showSaveFilePicker) {
    exportData();
    alert("このブラウザはファイルへの直接保存に対応していません。代わりにバックアップ JSON をダウンロードします。");
    return;
  }

  try {
    if (!dataFileHandle) {
      dataFileHandle = await window.showSaveFilePicker({
        suggestedName: `task-manager-${new Date().toISOString().slice(0, 10)}.json`,
        types: [{
          description: "TaskManager データファイル",
          accept: { "application/json": [".json"] }
        }]
      });
    }
    const writable = await dataFileHandle.createWritable();
    await writable.write(JSON.stringify(state, null, 2));
    await writable.close();
    alert("データファイルへ保存しました。");
  } catch (error) {
    if (error.name !== "AbortError") {
      alert("保存に失敗しました。右上のエクスポートでバックアップしてください。");
    }
  }
}

function renderFilterOptions() {
  els.taskOwner.innerHTML = state.members.map((member) => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`).join("");
}

function renderProjectList() {
  const projects = [...new Set(state.tasks.map((task) => task.project).filter(Boolean))].sort();
  els.projectList.innerHTML = projects.map((project) => `<option value="${escapeHtml(project)}"></option>`).join("");
}

function renderTodayFocus() {
  const focusTasks = state.tasks
    .filter((task) => task.type === "todo" && !isDone(task))
    .sort(sortByBoardOrder);

  els.todayFocus.innerHTML = focusTasks.length
    ? focusTasks.map((task) => focusItem(task)).join("")
    : `<div class="focus-item">フォロー対象はありません</div>`;
  wireTodayFocus();
}

function focusItem(task) {
  const issueNumber = extractIssueNumber(task.link);
  const taskUrl = normalizeUrl(task.link);
  const issueLink = issueNumber
    ? `<a class="focus-issue-number" href="${escapeHtml(taskUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(issueLabel(task.link))}</a>`
    : "";
  return `
    <div class="focus-item">
      ${issueLink}
      <button class="focus-item-body" data-focus-task="${task.id}" type="button">
        <strong>${escapeHtml(task.title)}</strong>
        <em>${escapeHtml(task.next)}</em>
      </button>
    </div>
  `;
}

function wireTodayFocus() {
  els.todayFocus.querySelectorAll("[data-focus-task]").forEach((button) => {
    button.addEventListener("click", () => openTaskDialog(button.dataset.focusTask));
  });
}

function renderDashboard() {
  const visible = filteredTasks();
  const openTasks = visible.filter((task) => !isDone(task));
  const overdue = openTasks.filter((task) => daysUntil(task.due) < 0);
  const stalled = openTasks.filter(isTaskStalled);
  const issues = openTasks.filter((task) => task.type === "issue");
  const todos = openTasks.filter((task) => task.type === "todo");
  const statItems = [
    { key: "open", label: "未完了", tasks: openTasks },
    { key: "issue", label: "対応中 Issue", tasks: issues },
    { key: "todo", label: "Todo", tasks: todos },
    { key: "overdue", label: "期限超過", tasks: overdue },
    { key: "done", label: "完了", tasks: visible.filter(isDone) },
    { key: "stalled", label: "停滞 Issue", tasks: stalled }
  ];
  const selectedStat = statItems.find((item) => item.key === dashboardStatFilter);
  const selectedTasks = selectedStat
    ? selectedStat.tasks.sort(selectedStat.key === "done" ? sortByCompletedAt : sortByUrgency)
    : null;
  const recentDone = visible.filter(isDone).sort(sortByCompletedAt).slice(0, 8);

  els.dashboardView.innerHTML = `
    <div class="stats-grid">
      ${statItems.map((item) => stat(item.label, item.tasks.length, item.key)).join("")}
    </div>
    ${selectedStat
      ? compactTaskSection(`${selectedStat.label} の結果`, selectedTasks)
      : `
        ${compactTaskSection("優先対応", openTasks.sort(sortByUrgency).slice(0, 8))}
        ${compactTaskSection("最近の完了", recentDone, `<button class="section-link" data-section-filter="done" type="button">すべての完了を見る &gt;</button>`)}
      `}
  `;
  wireDashboardStats();
  wireDashboardSectionFilters();
  wireTaskButtons(els.dashboardView);
}

function renderBoard() {
  const previousScrollLeft = els.boardView.querySelector(".board")?.scrollLeft || 0;
  const visible = filteredTasks().filter((task) => task.type === "issue" && task.status !== completedStatus);
  els.boardView.innerHTML = `
    <div class="board">
      ${state.workflow.map((status) => {
        const tasks = visible.filter((task) => task.status === status).sort(sortByBoardOrder);
        return `
          <div class="column" data-status="${escapeHtml(status)}">
            <div class="column-title"><span>${escapeHtml(status)}</span><span class="tag">${tasks.length}</span></div>
            <div class="cards" data-drop-status="${escapeHtml(status)}">${tasks.length ? tasks.map((task) => taskCard(task, true)).join("") : emptyState("Issue はありません")}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
  wireTaskButtons(els.boardView);
  wireBoardDragAndDrop();
  const board = els.boardView.querySelector(".board");
  if (board) {
    board.scrollLeft = previousScrollLeft;
    requestAnimationFrame(() => {
      board.scrollLeft = previousScrollLeft;
    });
  }
}

function renderWorkflowTopControl() {
  if (currentView() !== "board") {
    els.workflowTopSlot.innerHTML = "";
    keepWorkflowMenuOpen = false;
    return;
  }

  els.workflowTopSlot.innerHTML = `
    <details class="action-menu workflow-top-menu"${keepWorkflowMenuOpen ? " open" : ""}>
      <summary class="secondary-button">フロー編集</summary>
      <div class="action-menu-content workflow-menu-content">
        <form id="workflowForm" class="workflow-form">
          <input id="newStepName" maxlength="20" placeholder="新しいフローステップ">
          <button class="primary-button" type="submit">ステップ追加</button>
        </form>
        <div class="workflow-list">
          ${state.workflow.map((step, index) => workflowStepRow(step, index)).join("")}
        </div>
      </div>
    </details>
  `;
  const workflowMenu = els.workflowTopSlot.querySelector(".workflow-top-menu");
  workflowMenu.addEventListener("toggle", () => {
    keepWorkflowMenuOpen = workflowMenu.open;
  });
  wireWorkflowButtons();
}

function workflowStepRow(step, index) {
  const used = state.tasks.some((task) => task.type === "issue" && task.status === step);
  return `
    <div class="workflow-row" draggable="true" data-workflow-index="${index}">
      <span class="workflow-drag-handle" aria-hidden="true">↕</span>
      <input value="${escapeHtml(step)}" data-step-name="${index}" aria-label="フローステップ名">
      <span class="tag">${used ? "使用中" : "未使用"}</span>
      <button class="tiny-button" data-save-step="${index}" type="button">保存</button>
      <button class="tiny-button" data-delete-step="${index}" type="button" ${used || state.workflow.length <= 1 ? "disabled" : ""}>削除</button>
    </div>
  `;
}

function renderTodo() {
  const todos = filteredTasks().filter((task) => task.type === "todo");
  const open = todos.filter((task) => !isDone(task)).sort(sortByBoardOrder);
  const done = todos.filter(isDone).sort(sortByCompletedAt);
  const todayDone = done.filter((task) => completionDate(task) === todayOffset(0));
  const recentDone = done.filter((task) => {
    const days = daysSince(completionDate(task));
    return days >= 0 && days < 7;
  });

  els.todoView.innerHTML = `
    ${todoSection("To-do List", open, `<div class="section-actions"><button class="section-link" data-end-day-review type="button">日次整理</button><span class="tag">${open.length}</span></div>`, true)}
    ${showAllTodoDone
      ? todoDoneHistorySection("完了", recentDone)
      : todoSection("完了", todayDone, `<button class="section-link" data-todo-done-view="all" type="button">すべての完了を見る &gt;</button>`)}
  `;
  wireTodoDoneViewButtons();
  els.todoView.querySelector("[data-end-day-review]")?.addEventListener("click", openEndDayReview);
  wireTaskButtons(els.todoView);
  wireTodoDragAndDrop();
}

function renderProjects() {
  const projects = groupBy(state.tasks, "project");
  const rows = Object.entries(projects).sort(([a], [b]) => a.localeCompare(b, "zh-Hans-CN")).map(([project, tasks]) => {
    const done = tasks.filter(isDone).length;
    const open = tasks.length - done;
    const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    const issues = tasks.filter((task) => task.type === "issue" && !isDone(task)).length;
    const todos = tasks.filter((task) => task.type === "todo" && !isDone(task)).length;
    const high = tasks.filter((task) => task.priority === "高" && !isDone(task)).length;
    const overdue = tasks.filter((task) => !isDone(task) && daysUntil(task.due) < 0).length;
    return `
      <tr>
        <td><button class="table-link" data-project-filter="${escapeHtml(project)}" type="button">${escapeHtml(project)}</button><div class="progress"><span style="width:${progress}%"></span></div></td>
        <td>${tasks.length}</td>
        <td>${open}</td>
        <td>${issues}</td>
        <td>${todos}</td>
        <td>${high}</td>
        <td>${overdue}</td>
        <td>${progress}%</td>
        <td><button class="tiny-button" data-project-detail="${escapeHtml(project)}" type="button">詳細</button></td>
      </tr>
    `;
  }).join("");

  els.projectsView.innerHTML = rows
    ? `<table class="list-table"><thead><tr><th>案件</th><th>件数</th><th>未完了</th><th>Issue</th><th>Todo</th><th>高優先度</th><th>期限超過</th><th>完了率</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : emptyState("案件はありません");
  wireTaskButtons(els.projectsView);
  els.projectsView.querySelectorAll("[data-project-detail]").forEach((button) => {
    button.addEventListener("click", () => openProjectDetail(button.dataset.projectDetail));
  });
}

function renderPeople() {
  const rows = state.members.map((member) => {
    const tasks = state.tasks.filter((task) => task.owner === member);
    const open = tasks.filter((task) => !isDone(task));
    const overdue = open.filter((task) => daysUntil(task.due) < 0);
    const issues = open.filter((task) => task.type === "issue");
    const todos = open.filter((task) => task.type === "todo");
    return `
      <tr>
        <td><button class="table-link" data-filter-member="${escapeHtml(member)}" type="button">${escapeHtml(member)}</button></td>
        <td>${open.length}</td>
        <td>${issues.length}</td>
        <td>${todos.length}</td>
        <td>${overdue.length}</td>
      </tr>
    `;
  }).join("");

  const memberRows = state.members.map((member, index) => {
    const assigned = state.tasks.filter((task) => task.owner === member).length;
    return `
      <div class="member-row">
        <input value="${escapeHtml(member)}" data-member-name="${index}" aria-label="メンバー名">
        <span class="tag">${assigned} 件</span>
        <button class="tiny-button" data-save-member="${index}" type="button">保存</button>
        <button class="tiny-button" data-delete-member="${index}" type="button" ${assigned ? "disabled" : ""}>削除</button>
      </div>
    `;
  }).join("");

  els.peopleView.innerHTML = `
    <details class="member-panel collapsible-panel">
      <summary>メンバー編集</summary>
      <div class="collapsible-body">
        <form id="memberForm" class="member-form">
          <input id="newMemberName" maxlength="24" placeholder="新しいメンバー名">
          <button class="primary-button" type="submit">メンバー追加</button>
        </form>
        <div class="member-list">${memberRows}</div>
      </div>
    </details>
    <table class="list-table"><thead><tr><th>担当者</th><th>未完了</th><th>Issue</th><th>Todo</th><th>期限超過</th></tr></thead><tbody>${rows}</tbody></table>
  `;
  wireMemberButtons();
}

function openDailyReport() {
  const today = todayOffset(0);
  const completed = state.tasks.filter((task) => isDone(task) && completionDate(task) === today).sort(sortByCompletedAt);
  const openTodos = state.tasks.filter((task) => task.type === "todo" && !isDone(task)).sort(sortByBoardOrder);
  const activeIssues = state.tasks.filter((task) => task.type === "issue" && !isDone(task)).sort(sortByUrgency);
  const risks = activeIssues.filter((task) => daysUntil(task.due) < 0 || isTaskStalled(task));
  const report = [
    `日報 ${today}`,
    "",
    "【今日の完了】",
    ...reportTaskLines(completed, "完了した作業はありません。"),
    "",
    "【対応中】",
    ...reportTaskLines(activeIssues, "対応中の Issue はありません。"),
    "",
    "【次の予定】",
    ...reportTaskLines(openTodos, "未完了 Todo はありません。"),
    "",
    "【期限超過・停滞】",
    ...reportTaskLines(risks, "該当項目はありません。")
  ].join("\n");

  openUtilityDialog("日報を作成", `
    <p class="dialog-description">今日の完了内容と現在の作業状況をテキストでまとめています。</p>
    <textarea id="dailyReportText" class="report-text" rows="18" readonly>${escapeHtml(report)}</textarea>
  `, `
    <button class="ghost-button" data-utility-close type="button">閉じる</button>
    <span class="spacer"></span>
    <button class="primary-button" id="copyDailyReport" type="button">コピー</button>
  `);
  document.querySelector("#copyDailyReport").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(report);
      showToast("日報をコピーしました。", false);
    } catch {
      const textarea = document.querySelector("#dailyReportText");
      textarea.select();
      document.execCommand("copy");
      showToast("日報をコピーしました。", false);
    }
  });
}

function reportTaskLines(tasks, emptyMessage) {
  return tasks.length
    ? tasks.map((task) => {
      const prefix = extractIssueNumber(task.link) ? `${issueLabel(task.link)} ` : "";
      const stateText = isDone(task) ? "" : ` (${task.status} / ${task.owner})`;
      return `・${prefix}${task.title}: ${task.next}${stateText}`;
    })
    : [`・${emptyMessage}`];
}

function openEndDayReview() {
  const todos = state.tasks.filter((task) => task.type === "todo" && !isDone(task)).sort(sortByBoardOrder);
  els.endDayList.innerHTML = todos.length
    ? todos.map((task) => `
      <div class="end-day-row">
        <div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.next)}</span></div>
        <select name="end-day-${escapeHtml(task.id)}" aria-label="${escapeHtml(task.title)}の処理">
          <option value="keep">変更しない</option>
          <option value="tomorrow">明日に延長</option>
          <option value="done">完了</option>
          <option value="delete">削除</option>
        </select>
      </div>
    `).join("")
    : `<div class="empty">整理する Todo はありません</div>`;
  els.endDayDialog.showModal();
}

function applyEndDayReview(event) {
  event.preventDefault();
  const decisions = [...els.endDayList.querySelectorAll("select")]
    .map((select) => ({ id: select.name.replace("end-day-", ""), action: select.value }))
    .filter((decision) => decision.action !== "keep");
  if (!decisions.length) {
    els.endDayDialog.close();
    return;
  }
  markStateMutation(`Todo 日次整理 (${decisions.length}件)`);
  const deleteIds = new Set(decisions.filter((decision) => decision.action === "delete").map((decision) => decision.id));
  const actionById = new Map(decisions.map((decision) => [decision.id, decision.action]));
  state.tasks = state.tasks.filter((task) => !deleteIds.has(task.id)).map((task) => {
    const action = actionById.get(task.id);
    if (action === "tomorrow") return touchTask(task, { due: todayOffset(1) });
    if (action === "done") return touchTask(task, { status: todoDoneStatus, completedAt: todayOffset(0) });
    return task;
  });
  els.endDayDialog.close();
  render();
}

function openProjectDetail(project) {
  const tasks = state.tasks.filter((task) => task.project === project);
  const open = tasks.filter((task) => !isDone(task)).sort(sortByUrgency);
  const done = tasks.filter(isDone).sort(sortByCompletedAt);
  const issues = open.filter((task) => task.type === "issue");
  const todos = open.filter((task) => task.type === "todo");
  const risks = open.filter((task) => daysUntil(task.due) < 0 || isTaskStalled(task));
  openUtilityDialog(`${project} 詳細`, `
    <div class="detail-stats">
      ${detailStat("未完了", open.length)}${detailStat("Issue", issues.length)}${detailStat("Todo", todos.length)}${detailStat("リスク", risks.length)}
    </div>
    ${utilityTaskSection("対応中", open)}
    ${utilityTaskSection("最近の完了", done.slice(0, 8))}
  `, `<button class="ghost-button" data-utility-close type="button">閉じる</button>`);
  els.utilityContent.querySelectorAll("[data-utility-task]").forEach((button) => {
    button.addEventListener("click", () => {
      closeUtilityDialog();
      openTaskDialog(button.dataset.utilityTask);
    });
  });
}

function detailStat(label, value) {
  return `<div><span>${label}</span><strong>${value}</strong></div>`;
}

function utilityTaskSection(title, tasks) {
  return `
    <section class="utility-task-section"><h4>${title}</h4>
      <div class="utility-task-list">${tasks.length ? tasks.map((task) => `
        <button data-utility-task="${task.id}" type="button">
          <strong>${escapeHtml(task.title)}</strong>
          <span>${escapeHtml(task.owner)} · ${escapeHtml(task.status)} · ${escapeHtml(formatDue(task.due))}</span>
        </button>`).join("") : `<div class="empty">項目はありません</div>`}
      </div>
    </section>`;
}

function openUtilityDialog(title, content, actions = "") {
  closeActionMenus();
  els.utilityTitle.textContent = title;
  els.utilityContent.innerHTML = content;
  els.utilityActions.innerHTML = actions;
  els.utilityActions.querySelectorAll("[data-utility-close]").forEach((button) => button.addEventListener("click", closeUtilityDialog));
  els.utilityDialog.showModal();
}

function closeUtilityDialog() {
  if (els.utilityDialog.open) els.utilityDialog.close();
}

function closeActionMenus() {
  document.querySelectorAll("details.action-menu[open]").forEach((menu) => { menu.open = false; });
}

function openShortcutHelp() {
  openUtilityDialog("ショートカット", `
    <div class="shortcut-list">
      <div><span>新規項目</span><span><kbd>N</kbd></span></div>
      <div><span>検索へ移動</span><span><kbd>/</kbd></span></div>
      <div><span>項目を保存</span><span><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span></div>
      <div><span>閉じる・メニュー解除</span><span><kbd>Esc</kbd></span></div>
    </div>
  `, `<button class="ghost-button" data-utility-close type="button">閉じる</button>`);
}

function taskSection(title, tasks, action = `<span class="tag">${tasks.length}</span>`) {
  return `
    <div class="section-title"><h3>${title}</h3>${action}</div>
    <div class="cards">${tasks.length ? tasks.map((task) => taskCard(task)).join("") : emptyState("項目はありません")}</div>
  `;
}

function compactTaskSection(title, tasks, action = `<span class="tag">${tasks.length}</span>`) {
  return `
    <div class="section-title compact-section-title"><h3>${title}</h3>${action}</div>
    <div class="todo-list dashboard-compact-list">${tasks.length ? tasks.map((task) => compactTaskCard(task)).join("") : emptyState("項目はありません")}</div>
  `;
}

function todoSection(title, tasks, action = `<span class="tag">${tasks.length}</span>`, enableDrag = false) {
  return `
    <div class="section-title compact-section-title"><h3>${title}</h3>${action}</div>
    <div class="todo-list" ${enableDrag ? `data-todo-drop-zone="open"` : ""}>${tasks.length ? tasks.map((task) => todoCard(task, enableDrag)).join("") : emptyState("項目はありません")}</div>
  `;
}

function todoDoneHistorySection(title, tasks) {
  const groups = groupDoneTasksByDate(tasks);
  return `
    <div class="section-title compact-section-title"><h3>${title}</h3><button class="section-link" data-todo-done-view="today" type="button">今日の完了だけ見る</button></div>
    <div class="todo-done-history">
      ${groups.length ? groups.map(([date, dateTasks]) => `
        <section class="todo-done-day">
          <div class="todo-done-day-title"><h4>${escapeHtml(formatDoneDate(date))}</h4><span class="tag">${dateTasks.length}</span></div>
          <div class="todo-list">${dateTasks.map((task) => todoCard(task)).join("")}</div>
        </section>
      `).join("") : `<div class="empty">7日内の完了はありません</div>`}
    </div>
  `;
}

function compactTaskCard(task) {
  const urgencyClass = daysUntil(task.due) < 0 && !isDone(task) ? "overdue" : daysUntil(task.due) <= 2 && !isDone(task) ? "soon" : "";
  const issueNumber = extractIssueNumber(task.link);
  const taskUrl = normalizeUrl(task.link);
  const issueBadge = issueNumber
    ? `<a class="issue-number compact-issue-number" href="${escapeHtml(taskUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(issueLabel(task.link))}</a>`
    : "";
  const doneButton = !isDone(task)
    ? (pendingDoneTaskId === task.id
      ? `<button class="todo-check confirm" data-done="${task.id}" type="button" aria-label="完了を確認"></button>`
      : `<button class="todo-check" data-done="${task.id}" type="button" aria-label="完了"></button>`)
    : task.type === "todo"
      ? `<button class="todo-check done" data-reopen-todo="${task.id}" type="button" aria-label="Todoに戻す"></button>`
      : `<span class="todo-check done" aria-label="完了済み"></span>`;
  const ownerMenu = ownerPickerTaskId === task.id
    ? `<div class="owner-menu" role="menu">
        ${state.members.map((member) => `
          <button class="owner-choice${member === task.owner ? " active" : ""}" data-owner-choice="${escapeHtml(member)}" data-owner-task="${task.id}" type="button" role="menuitem">${escapeHtml(member)}</button>
        `).join("")}
      </div>`
    : "";
  const projectControl = projectQuickControl(task);
  const nextAction = nextQuickControl(task, true);
  const stalledBadge = isTaskStalled(task) ? `<span class="stalled-badge">${stalledDays(task)}日停滞</span>` : "";
  return `
    <article class="todo-card dashboard-compact-card ${urgencyClass}" data-task-id="${task.id}">
      ${doneButton}
      <div class="todo-card-main">
        <div class="todo-title-row">
          ${issueBadge}
          <button class="todo-title-button" data-title-edit="${task.id}" type="button">${escapeHtml(task.title)}</button>
          <div class="compact-owner-wrap">
            <button class="owner-name" data-owner-picker="${task.id}" type="button">${escapeHtml(task.owner)}</button>
            ${ownerMenu}
          </div>
        </div>
        <div class="todo-detail-row">
          ${nextAction}
          ${projectControl}
          ${dueText(task, !isDone(task))}
          ${stalledBadge}
        </div>
      </div>
    </article>
  `;
}

function todoCard(task, enableDrag = false) {
  const urgencyClass = daysUntil(task.due) < 0 && !isDone(task) ? "overdue" : daysUntil(task.due) <= 2 && !isDone(task) ? "soon" : "";
  const issueNumber = extractIssueNumber(task.link);
  const taskUrl = normalizeUrl(task.link);
  const issueBadge = issueNumber
    ? `<a class="issue-number compact-issue-number" href="${escapeHtml(taskUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(issueLabel(task.link))}</a>`
    : "";
  const doneButton = !isDone(task)
    ? (pendingDoneTaskId === task.id
      ? `<button class="todo-check confirm" data-done="${task.id}" type="button" aria-label="完了を確認"></button>`
      : `<button class="todo-check" data-done="${task.id}" type="button" aria-label="完了"></button>`)
    : `<button class="todo-check done" data-reopen-todo="${task.id}" type="button" aria-label="Todoに戻す"></button>`;
  const projectControl = projectQuickControl(task);
  const nextAction = nextQuickControl(task, true);
  return `
    <article class="todo-card ${urgencyClass}" data-task-id="${task.id}" ${enableDrag && !isDone(task) ? `draggable="true"` : ""}>
      ${doneButton}
      <div class="todo-card-main">
        <div class="todo-title-row">
          ${issueBadge}
          <button class="todo-title-button" data-title-edit="${task.id}" type="button">${escapeHtml(task.title)}</button>
        </div>
        <div class="todo-detail-row">
          ${nextAction}
          ${projectControl}
        </div>
      </div>
    </article>
  `;
}

function taskCard(task, enableDrag = false) {
  const urgencyClass = daysUntil(task.due) < 0 && !isDone(task) ? "overdue" : daysUntil(task.due) <= 2 && !isDone(task) ? "soon" : "";
  const priorityClass = task.priority === "高" ? "high" : task.priority === "中" ? "middle" : "low";
  const canFinish = !isDone(task);
  const issueNumber = extractIssueNumber(task.link);
  const taskUrl = normalizeUrl(task.link);
  const issueBadge = issueNumber
    ? `<a class="issue-number" href="${escapeHtml(taskUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(issueLabel(task.link))}</a>`
    : "";
  const title = `<button class="task-title-button" data-title-edit="${task.id}" type="button">${escapeHtml(task.title)}</button>`;
  const canConvert = task.type === "todo" && !task.linkedIssueId && task.status !== todoDoneStatus;
  const convertButton = pendingConvertTaskId === task.id
    ? `<button class="tiny-button confirm-button" data-convert="${task.id}" type="button">確認</button>`
    : `<button class="tiny-button" data-convert="${task.id}" type="button">Issue 化</button>`;
  const doneButton = pendingDoneTaskId === task.id
    ? `<button class="tiny-button confirm-button" data-done="${task.id}" type="button">確認</button>`
    : `<button class="tiny-button" data-done="${task.id}" type="button">完了</button>`;
  const ownerMenu = ownerPickerTaskId === task.id
    ? `<div class="owner-menu" role="menu">
        ${state.members.map((member) => `
          <button class="owner-choice${member === task.owner ? " active" : ""}" data-owner-choice="${escapeHtml(member)}" data-owner-task="${task.id}" type="button" role="menuitem">${escapeHtml(member)}</button>
        `).join("")}
      </div>`
    : "";
  const projectControl = projectQuickControl(task);
  const priorityControl = priorityQuickControl(task, priorityClass);
  const stalledBadge = isTaskStalled(task) ? `<span class="stalled-badge">${stalledDays(task)}日停滞</span>` : "";
  const nextAction = nextQuickControl(task);
  return `
    <article class="task-card ${urgencyClass}" data-task-id="${task.id}" ${enableDrag && task.type === "issue" && !isDone(task) ? `draggable="true"` : ""}>
      <div class="card-heading">
        <h4>${issueBadge}${title}</h4>
        <div class="card-side">
          <button class="owner-name" data-owner-picker="${task.id}" type="button">${escapeHtml(task.owner)}</button>
          ${ownerMenu}
        </div>
      </div>
      <div class="meta">${projectControl}<span class="meta-right">${stalledBadge}${dueText(task, task.type === "issue" && !isDone(task))}</span></div>
      ${nextAction}
      <div class="tags">
        ${priorityControl}
        <span class="tag-spacer"></span>
        ${canConvert ? convertButton : ""}
        ${canFinish ? doneButton : ""}
      </div>
    </article>
  `;
}

function projectQuickControl(task) {
  const projects = [...new Set([...state.tasks.map((item) => item.project), task.project].filter(Boolean))].sort();
  const menu = projectPickerTaskId === task.id
    ? `<div class="quick-menu project-menu" role="menu">
        <input class="quick-menu-input" value="${escapeHtml(task.project)}" data-project-input="${task.id}" list="projectList" maxlength="40" aria-label="案件を変更">
        ${projects.map((project) => `
          <button class="quick-choice${project === task.project ? " active" : ""}" data-project-choice="${escapeHtml(project)}" data-project-task="${task.id}" type="button" role="menuitem">${escapeHtml(project)}</button>
        `).join("")}
      </div>`
    : "";
  return `<span class="quick-field-wrap project-quick-wrap"><button class="project-name" data-project-picker="${task.id}" data-project-filter="${escapeHtml(task.project)}" type="button" title="クリックで変更、Ctrl+クリックで絞り込み">${escapeHtml(task.project)}</button>${menu}</span>`;
}

function priorityQuickControl(task, priorityClass) {
  const menu = priorityPickerTaskId === task.id
    ? `<div class="quick-menu priority-menu" role="menu">
        ${priorities.map((priority) => `
          <button class="quick-choice${priority === task.priority ? " active" : ""}" data-priority-choice="${priority}" data-priority-task="${task.id}" type="button" role="menuitem">${priority}</button>
        `).join("")}
      </div>`
    : "";
  return `<span class="quick-field-wrap"><button class="tag ${priorityClass} priority-button" data-priority-picker="${task.id}" data-priority-filter="${escapeHtml(task.priority)}" type="button" title="クリックで変更、Ctrl+クリックで絞り込み">${escapeHtml(task.priority)}</button>${menu}</span>`;
}

function nextQuickControl(task, compact = false) {
  const compactClass = compact ? " compact-next-editor" : "";
  const buttonClass = compact ? "next compact-next-button" : "next next-edit-button";
  return nextEditorTaskId === task.id
    ? `<div class="next-quick-editor${compactClass}">
        <textarea data-next-editor="${task.id}" maxlength="220" rows="3" aria-label="次のアクションを編集">${escapeHtml(task.next)}</textarea>
        <div class="next-editor-actions">
          <span>Ctrl+Enter で保存</span>
          <button data-next-cancel="${task.id}" type="button" aria-label="キャンセル" title="キャンセル">×</button>
          <button class="save" data-next-save="${task.id}" type="button" aria-label="保存" title="保存">✓</button>
        </div>
      </div>`
    : `<button class="${buttonClass}" data-next-open="${task.id}" type="button" title="クリックで変更、Ctrl+クリックで絞り込み">${escapeHtml(task.next)}</button>`;
}

function wireTaskButtons(root) {
  root.querySelectorAll(".task-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.open(link.href, "_blank", "noopener,noreferrer");
    });
  });
  root.querySelectorAll("[data-title-edit]").forEach((button) => {
    button.addEventListener("click", () => openTaskDialog(button.dataset.titleEdit));
  });
  root.querySelectorAll("[data-owner-picker]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) {
        filterTasksByMember(button.textContent.trim(), currentView());
        return;
      }
      ownerPickerTaskId = ownerPickerTaskId === button.dataset.ownerPicker ? "" : button.dataset.ownerPicker;
      projectPickerTaskId = "";
      duePickerTaskId = "";
      nextEditorTaskId = "";
      priorityPickerTaskId = "";
      pendingDoneTaskId = "";
      pendingConvertTaskId = "";
      render();
    });
  });
  root.querySelectorAll("[data-project-picker]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) {
        const targetView = currentView() === "projects" ? "dashboard" : currentView();
        filterTasksByProject(button.dataset.projectFilter, targetView);
        return;
      }
      projectPickerTaskId = projectPickerTaskId === button.dataset.projectPicker ? "" : button.dataset.projectPicker;
      ownerPickerTaskId = "";
      duePickerTaskId = "";
      nextEditorTaskId = "";
      priorityPickerTaskId = "";
      pendingDoneTaskId = "";
      pendingConvertTaskId = "";
      render();
      requestAnimationFrame(() => {
        const input = document.querySelector(`[data-project-input="${CSS.escape(projectPickerTaskId)}"]`);
        input?.focus();
        input?.select();
      });
    });
  });
  root.querySelectorAll("[data-due-picker]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) {
        filterTasksBySearch(dueFilterQuery(button.dataset.dueFilter || button.textContent.trim()), currentView());
        return;
      }
      duePickerTaskId = duePickerTaskId === button.dataset.duePicker ? "" : button.dataset.duePicker;
      ownerPickerTaskId = "";
      projectPickerTaskId = "";
      nextEditorTaskId = "";
      priorityPickerTaskId = "";
      pendingDoneTaskId = "";
      pendingConvertTaskId = "";
      render();
      if (duePickerTaskId) {
        requestAnimationFrame(() => {
          const input = document.querySelector(`[data-due-choice="${CSS.escape(duePickerTaskId)}"]`);
          input?.focus();
          try {
            input?.showPicker?.();
          } catch {
            // The inline date input stays available when the browser blocks programmatic opening.
          }
        });
      }
    });
  });
  root.querySelectorAll("[data-due-choice]").forEach((input) => {
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", (event) => {
      event.stopPropagation();
      const taskId = input.dataset.dueChoice;
      if (!taskId || !input.value) return;
      updateTask(taskId, { due: input.value }, `「${state.tasks.find((task) => task.id === taskId)?.title || "Issue"}」の期限を変更`);
      duePickerTaskId = "";
      render();
    });
  });
  root.querySelectorAll("[data-next-open]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) {
        filterTasksBySearch(`次:"${button.textContent.trim()}"`, currentView());
        return;
      }
      nextEditorTaskId = button.dataset.nextOpen;
      ownerPickerTaskId = "";
      projectPickerTaskId = "";
      duePickerTaskId = "";
      priorityPickerTaskId = "";
      pendingDoneTaskId = "";
      pendingConvertTaskId = "";
      render();
      requestAnimationFrame(() => {
        const textarea = document.querySelector(`[data-next-editor="${CSS.escape(nextEditorTaskId)}"]`);
        textarea?.focus();
        if (textarea) textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      });
    });
  });
  root.querySelectorAll("[data-next-editor]").forEach((textarea) => {
    textarea.addEventListener("click", (event) => event.stopPropagation());
    textarea.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        nextEditorTaskId = "";
        render();
      } else if (event.key === "Enter" && event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        saveQuickNextAction(textarea.dataset.nextEditor, textarea.value);
      }
    });
  });
  root.querySelectorAll("[data-next-save]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const textarea = root.querySelector(`[data-next-editor="${CSS.escape(button.dataset.nextSave)}"]`);
      saveQuickNextAction(button.dataset.nextSave, textarea?.value || "");
    });
  });
  root.querySelectorAll("[data-next-cancel]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      nextEditorTaskId = "";
      render();
    });
  });
  root.querySelectorAll("[data-owner-choice]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const taskId = button.dataset.ownerTask;
      const owner = button.dataset.ownerChoice;
      if (!taskId || !owner) return;
      updateTask(taskId, { owner }, `「${state.tasks.find((task) => task.id === taskId)?.title || "項目"}」の担当者を変更`);
      ownerPickerTaskId = "";
      pendingDoneTaskId = "";
      pendingConvertTaskId = "";
      render();
    });
  });
  root.querySelectorAll("[data-project-input]").forEach((input) => {
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        projectPickerTaskId = "";
        render();
      } else if (event.key === "Enter") {
        event.preventDefault();
        saveQuickProject(input.dataset.projectInput, input.value);
      }
    });
    input.addEventListener("change", () => saveQuickProject(input.dataset.projectInput, input.value));
  });
  root.querySelectorAll("[data-project-choice]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      saveQuickProject(button.dataset.projectTask, button.dataset.projectChoice);
    });
  });
  root.querySelectorAll("[data-priority-picker]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey) {
        filterTasksBySearch(`優先:${button.dataset.priorityFilter}`, currentView());
        return;
      }
      priorityPickerTaskId = priorityPickerTaskId === button.dataset.priorityPicker ? "" : button.dataset.priorityPicker;
      ownerPickerTaskId = "";
      projectPickerTaskId = "";
      duePickerTaskId = "";
      nextEditorTaskId = "";
      pendingDoneTaskId = "";
      pendingConvertTaskId = "";
      render();
    });
  });
  root.querySelectorAll("[data-priority-choice]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const taskId = button.dataset.priorityTask;
      const priority = button.dataset.priorityChoice;
      if (!taskId || !priorities.includes(priority)) return;
      updateTask(taskId, { priority }, `「${state.tasks.find((task) => task.id === taskId)?.title || "項目"}」の優先度を変更`);
      priorityPickerTaskId = "";
      pendingDoneTaskId = "";
      pendingConvertTaskId = "";
      render();
    });
  });
  root.querySelectorAll("[data-project-filter]:not([data-project-picker])").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const targetView = currentView() === "projects" ? "dashboard" : currentView();
      filterTasksByProject(button.dataset.projectFilter, targetView);
    });
  });
  root.querySelectorAll("[data-advance]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find((item) => item.id === button.dataset.advance);
      if (!task) return;
      updateTask(task.id, { status: nextWorkflowStep(task.status) || task.status });
      render();
    });
  });
  root.querySelectorAll("[data-done]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find((item) => item.id === button.dataset.done);
      if (!task) return;
      if (pendingDoneTaskId !== task.id) {
        pendingDoneTaskId = task.id;
        pendingConvertTaskId = "";
        render();
        return;
      }
      pendingDoneTaskId = "";
      updateTask(task.id, {
        status: task.type === "todo" ? todoDoneStatus : completedStatus,
        completedAt: todayOffset(0)
      });
      render();
    });
  });
  root.querySelectorAll("[data-reopen-todo]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find((item) => item.id === button.dataset.reopenTodo);
      if (!task || task.type !== "todo" || !isDone(task)) return;
      pendingDoneTaskId = "";
      pendingConvertTaskId = "";
      updateTask(task.id, {
        status: todoOpenStatus,
        completedAt: ""
      });
      render();
    });
  });
  root.querySelectorAll("[data-convert]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find((item) => item.id === button.dataset.convert);
      if (!task) return;
      if (pendingConvertTaskId !== task.id) {
        pendingConvertTaskId = task.id;
        pendingDoneTaskId = "";
        render();
        return;
      }
      pendingConvertTaskId = "";
      openTaskDialog(task.id, { type: "issue", status: state.workflow[0], project: "Issue" });
    });
  });
}

function wireBoardDragAndDrop() {
  els.boardView.querySelectorAll(".task-card[draggable='true']").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("a, button, input, select, textarea")) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.taskId);
      dragPlaceholderHeight = Math.max(72, Math.round(card.getBoundingClientRect().height));
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      suppressNextBoardClick();
      clearDropIndicators();
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      const draggingId = els.boardView.querySelector(".task-card.dragging")?.dataset.taskId;
      if (draggingId && draggingId !== card.dataset.taskId) {
        showDropPlaceholder(card.closest("[data-drop-status]"), card);
      }
    });

    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === card.dataset.taskId) return;
      const targetStatus = card.closest("[data-drop-status]")?.dataset.dropStatus;
      suppressNextBoardClick();
      moveIssueTask(draggedId, targetStatus, card.dataset.taskId);
    });
  });

  els.boardView.querySelectorAll("[data-drop-status]").forEach((dropZone) => {
    dropZone.addEventListener("dragover", (event) => {
      event.preventDefault();
      dropZone.classList.add("drop-active");
      if (isPointerOverPlaceholder(event)) return;
      if (event.target.closest(".drop-placeholder")) return;
      if (!event.target.closest(".task-card")) {
        showDropPlaceholder(dropZone, null);
      }
    });

    dropZone.addEventListener("dragleave", (event) => {
      if (!dropZone.contains(event.relatedTarget)) {
        dropZone.classList.remove("drop-active");
      }
    });

    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      const cardTarget = event.target.closest(".task-card");
      if (!draggedId || cardTarget) return;
      const placeholder = dropZone.querySelector(".drop-placeholder");
      const beforeId = placeholder?.nextElementSibling?.dataset.taskId || "";
      suppressNextBoardClick();
      moveIssueTask(draggedId, dropZone.dataset.dropStatus, beforeId);
    });
  });
}

function wireTodoDragAndDrop() {
  const dropZone = els.todoView.querySelector("[data-todo-drop-zone='open']");
  if (!dropZone) return;

  dropZone.querySelectorAll(".todo-card[draggable='true']").forEach((card) => {
    card.addEventListener("dragstart", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("a, button, input, select, textarea")) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.taskId);
      dragPlaceholderHeight = Math.max(40, Math.round(card.getBoundingClientRect().height));
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      clearTodoDropIndicators();
    });

    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      const draggingId = dropZone.querySelector(".todo-card.dragging")?.dataset.taskId;
      if (draggingId && draggingId !== card.dataset.taskId) {
        showTodoDropPlaceholder(dropZone, card);
      }
    });

    card.addEventListener("drop", (event) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === card.dataset.taskId) return;
      moveTodoTask(draggedId, card.dataset.taskId);
    });
  });

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drop-active");
    if (event.target.closest(".drop-placeholder")) return;
    if (!event.target.closest(".todo-card")) {
      showTodoDropPlaceholder(dropZone, null);
    }
  });

  dropZone.addEventListener("dragleave", (event) => {
    if (!dropZone.contains(event.relatedTarget)) {
      dropZone.classList.remove("drop-active");
    }
  });

  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("text/plain");
    if (!draggedId || event.target.closest(".todo-card")) return;
    const beforeId = dropZone.querySelector(".drop-placeholder")?.nextElementSibling?.dataset.taskId || "";
    moveTodoTask(draggedId, beforeId);
  });
}

function suppressNextBoardClick() {
  suppressBoardClickUntil = Date.now() + 250;
}

function suppressBoardClickAfterDrag(event) {
  if (Date.now() <= suppressBoardClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function showDropPlaceholder(dropZone, beforeCard) {
  if (!dropZone) return;
  const beforeId = beforeCard?.dataset.taskId || "";
  if (activeDropZone === dropZone && activeBeforeId === beforeId) return;

  const placeholder = getDropPlaceholder();
  placeholder.style.minHeight = `${dragPlaceholderHeight}px`;
  if (beforeCard && beforeCard.parentElement === dropZone) {
    dropZone.insertBefore(placeholder, beforeCard);
  } else if (placeholder.parentElement !== dropZone || placeholder.nextElementSibling) {
    dropZone.appendChild(placeholder);
  }
  activeDropZone = dropZone;
  activeBeforeId = beforeId;
}

function getDropPlaceholder() {
  let placeholder = els.boardView.querySelector(".drop-placeholder");
  if (!placeholder) {
    placeholder = document.createElement("div");
    placeholder.className = "drop-placeholder";
    placeholder.textContent = "ここに移動";
  }
  return placeholder;
}

function isPointerOverPlaceholder(event) {
  const placeholder = els.boardView.querySelector(".drop-placeholder");
  if (!placeholder) return false;
  const rect = placeholder.getBoundingClientRect();
  return event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom;
}

function moveIssueTask(taskId, targetStatus, beforeId) {
  const task = state.tasks.find((item) => item.id === taskId && item.type === "issue");
  if (!task || !targetStatus) return;
  const sourceStatus = task.status;
  const targetTasks = state.tasks
    .filter((item) => item.type === "issue" && item.status === targetStatus && item.id !== taskId)
    .sort(sortByBoardOrder);
  const beforeIndex = beforeId ? targetTasks.findIndex((item) => item.id === beforeId) : -1;
  const insertIndex = beforeIndex >= 0 ? beforeIndex : targetTasks.length;
  targetTasks.splice(insertIndex, 0, { ...task, status: targetStatus });
  markStateMutation(sourceStatus === targetStatus ? "Issue を並べ替え" : `Issue を ${targetStatus} へ移動`);

  state.tasks = state.tasks.map((item) => {
    if (item.id === taskId) return touchTask(item, { status: targetStatus, order: insertIndex });
    if (item.type === "issue" && item.status === targetStatus) {
      const index = targetTasks.findIndex((targetTask) => targetTask.id === item.id);
      return index >= 0 ? { ...item, order: index } : item;
    }
    return item;
  });

  if (sourceStatus !== targetStatus) {
    reindexIssueStatus(sourceStatus);
  }
  reindexIssueStatus(targetStatus);
  render();
}

function showTodoDropPlaceholder(dropZone, beforeCard) {
  if (!dropZone) return;
  const beforeId = beforeCard?.dataset.taskId || "";
  if (activeDropZone === dropZone && activeBeforeId === beforeId) return;

  const placeholder = getTodoDropPlaceholder();
  placeholder.style.minHeight = `${dragPlaceholderHeight}px`;
  if (beforeCard && beforeCard.parentElement === dropZone) {
    dropZone.insertBefore(placeholder, beforeCard);
  } else if (placeholder.parentElement !== dropZone || placeholder.nextElementSibling) {
    dropZone.appendChild(placeholder);
  }
  activeDropZone = dropZone;
  activeBeforeId = beforeId;
}

function getTodoDropPlaceholder() {
  let placeholder = els.todoView.querySelector(".drop-placeholder");
  if (!placeholder) {
    placeholder = document.createElement("div");
    placeholder.className = "drop-placeholder";
    placeholder.textContent = "ここに移動";
  }
  return placeholder;
}

function moveTodoTask(taskId, beforeId) {
  const task = state.tasks.find((item) => item.id === taskId && item.type === "todo" && !isDone(item));
  if (!task) return;
  const targetTasks = state.tasks
    .filter((item) => item.type === "todo" && !isDone(item) && item.id !== taskId)
    .sort(sortByBoardOrder);
  const beforeIndex = beforeId ? targetTasks.findIndex((item) => item.id === beforeId) : -1;
  const insertIndex = beforeIndex >= 0 ? beforeIndex : targetTasks.length;
  targetTasks.splice(insertIndex, 0, task);
  const indexById = new Map(targetTasks.map((item, index) => [item.id, index]));
  markStateMutation("Todo を並べ替え");
  state.tasks = state.tasks.map((item) => indexById.has(item.id) ? { ...item, order: indexById.get(item.id) } : item);
  render();
}

function reindexIssueStatus(status) {
  const ordered = state.tasks
    .filter((task) => task.type === "issue" && task.status === status)
    .sort(sortByBoardOrder);
  const indexById = new Map(ordered.map((task, index) => [task.id, index]));
  state.tasks = state.tasks.map((task) => indexById.has(task.id) ? { ...task, order: indexById.get(task.id) } : task);
}

function clearDropIndicators() {
  els.boardView.querySelectorAll(".drop-active").forEach((element) => element.classList.remove("drop-active"));
  els.boardView.querySelector(".drop-placeholder")?.remove();
  activeDropZone = null;
  activeBeforeId = "";
}

function clearTodoDropIndicators() {
  els.todoView.querySelectorAll(".drop-active").forEach((element) => element.classList.remove("drop-active"));
  els.todoView.querySelector(".drop-placeholder")?.remove();
  activeDropZone = null;
  activeBeforeId = "";
}

function wireWorkflowButtons() {
  const form = els.workflowTopSlot.querySelector("#workflowForm");
  if (!form) return;
  const workflowList = els.workflowTopSlot.querySelector(".workflow-list");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = els.workflowTopSlot.querySelector("#newStepName");
    addWorkflowStep(input.value);
  });

  els.workflowTopSlot.querySelectorAll("[data-save-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.saveStep);
      const input = els.workflowTopSlot.querySelector(`[data-step-name="${index}"]`);
      renameWorkflowStep(index, input.value);
    });
  });

  els.workflowTopSlot.querySelectorAll("[data-delete-step]").forEach((button) => {
    button.addEventListener("click", () => deleteWorkflowStep(Number(button.dataset.deleteStep)));
  });

  workflowList.querySelectorAll(".workflow-row[draggable='true']").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, button")) {
        event.preventDefault();
        return;
      }
      const index = row.dataset.workflowIndex;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-workflow-index", index);
      event.dataTransfer.setData("text/plain", index);
      workflowDragPlaceholderHeight = Math.max(48, Math.round(row.getBoundingClientRect().height));
      row.classList.add("dragging");
    });

    row.addEventListener("dragend", () => clearWorkflowDropIndicators());

    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      const draggingIndex = workflowList.querySelector(".workflow-row.dragging")?.dataset.workflowIndex;
      if (draggingIndex && draggingIndex !== row.dataset.workflowIndex) {
        showWorkflowDropPlaceholder(workflowList, row);
      }
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const fromIndex = workflowDragIndex(event);
      if (fromIndex === null || fromIndex === Number(row.dataset.workflowIndex)) return;
      moveWorkflowStep(fromIndex, Number(row.dataset.workflowIndex));
    });
  });

  workflowList.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.target.closest(".workflow-drop-placeholder")) return;
    if (!event.target.closest(".workflow-row")) {
      showWorkflowDropPlaceholder(workflowList, null);
    }
  });

  workflowList.addEventListener("drop", (event) => {
    event.preventDefault();
    const fromIndex = workflowDragIndex(event);
    if (fromIndex === null || event.target.closest(".workflow-row")) return;
    const placeholder = workflowList.querySelector(".workflow-drop-placeholder");
    const beforeIndex = placeholder?.nextElementSibling?.dataset.workflowIndex;
    moveWorkflowStep(fromIndex, beforeIndex === undefined ? state.workflow.length : Number(beforeIndex));
  });
}

function closeWorkflowMenuOnOutsideClick(event) {
  const workflowMenu = els.workflowTopSlot.querySelector(".workflow-top-menu");
  const target = event.target instanceof Element ? event.target : null;
  if (!workflowMenu?.open || target?.closest(".workflow-top-menu")) return;
  workflowMenu.open = false;
  keepWorkflowMenuOpen = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function wireMemberButtons() {
  const form = els.peopleView.querySelector("#memberForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = els.peopleView.querySelector("#newMemberName");
    addMember(input.value);
  });

  els.peopleView.querySelectorAll("[data-save-member]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.saveMember);
      const input = els.peopleView.querySelector(`[data-member-name="${index}"]`);
      renameMember(index, input.value);
    });
  });

  els.peopleView.querySelectorAll("[data-delete-member]").forEach((button) => {
    button.addEventListener("click", () => deleteMember(Number(button.dataset.deleteMember)));
  });

  els.peopleView.querySelectorAll("[data-filter-member]").forEach((button) => {
    button.addEventListener("click", () => filterTasksByMember(button.dataset.filterMember));
  });
}

function addWorkflowStep(rawName) {
  const name = normalizeName(rawName);
  if (!name) {
    alert("フローステップ名を入力してください。");
    return;
  }
  if (state.workflow.includes(name) || name === completedStatus) {
    alert("このフローステップはすでに存在します。");
    return;
  }
  markStateMutation(`フローステップ「${name}」を追加`);
  state.workflow.push(name);
  keepWorkflowMenuOpen = true;
  render();
}

function renameWorkflowStep(index, rawName) {
  const oldName = state.workflow[index];
  const newName = normalizeName(rawName);
  if (!oldName || !newName) {
    alert("フローステップ名は空にできません。");
    renderBoard();
    return;
  }
  if (oldName === newName) return;
  if (state.workflow.includes(newName) || newName === completedStatus) {
    alert("このフローステップはすでに存在します。");
    renderBoard();
    return;
  }
  markStateMutation(`フローステップを「${newName}」へ変更`);
  state.workflow[index] = newName;
  state.tasks = state.tasks.map((task) => task.type === "issue" && task.status === oldName ? { ...task, status: newName } : task);
  keepWorkflowMenuOpen = true;
  render();
}

function deleteWorkflowStep(index) {
  const step = state.workflow[index];
  if (!step || state.workflow.length <= 1) return;
  const used = state.tasks.some((task) => task.type === "issue" && task.status === step);
  if (used) {
    alert("このステップにはまだ Issue があります。先に移動または完了してください。");
    return;
  }
  markStateMutation(`フローステップ「${step}」を削除`);
  state.workflow = state.workflow.filter((_, stepIndex) => stepIndex !== index);
  keepWorkflowMenuOpen = true;
  render();
}

function moveWorkflowStep(fromIndex, beforeIndex) {
  if (fromIndex < 0 || fromIndex >= state.workflow.length) return;
  if (beforeIndex < 0 || beforeIndex > state.workflow.length) return;
  if (fromIndex === beforeIndex || fromIndex + 1 === beforeIndex) return;

  const workflow = [...state.workflow];
  const [movedStep] = workflow.splice(fromIndex, 1);
  const insertIndex = fromIndex < beforeIndex ? beforeIndex - 1 : beforeIndex;
  workflow.splice(insertIndex, 0, movedStep);
  markStateMutation("フローを並べ替え");
  state.workflow = workflow;
  keepWorkflowMenuOpen = true;
  render();
}

function workflowDragIndex(event) {
  const rawIndex = event.dataTransfer.getData("application/x-workflow-index") || event.dataTransfer.getData("text/plain");
  const index = Number(rawIndex);
  return Number.isInteger(index) ? index : null;
}

function showWorkflowDropPlaceholder(workflowList, beforeRow) {
  const placeholder = getWorkflowDropPlaceholder();
  placeholder.style.minHeight = `${workflowDragPlaceholderHeight}px`;
  if (beforeRow && beforeRow.parentElement === workflowList) {
    workflowList.insertBefore(placeholder, beforeRow);
  } else if (placeholder.parentElement !== workflowList || placeholder.nextElementSibling) {
    workflowList.appendChild(placeholder);
  }
}

function getWorkflowDropPlaceholder() {
  let placeholder = els.workflowTopSlot.querySelector(".workflow-drop-placeholder");
  if (!placeholder) {
    placeholder = document.createElement("div");
    placeholder.className = "workflow-drop-placeholder";
    placeholder.textContent = "ここに移動";
  }
  return placeholder;
}

function clearWorkflowDropIndicators() {
  els.workflowTopSlot.querySelectorAll(".workflow-row.dragging").forEach((row) => row.classList.remove("dragging"));
  els.workflowTopSlot.querySelector(".workflow-drop-placeholder")?.remove();
}

function addMember(rawName) {
  const name = normalizeName(rawName);
  if (!name) {
    alert("メンバー名を入力してください。");
    return;
  }
  if (state.members.includes(name)) {
    alert("このメンバーはすでに存在します。");
    return;
  }
  markStateMutation(`メンバー「${name}」を追加`);
  state.members.push(name);
  render();
}

function renameMember(index, rawName) {
  const oldName = state.members[index];
  const newName = normalizeName(rawName);
  if (!oldName || !newName) {
    alert("メンバー名は空にできません。");
    renderPeople();
    return;
  }
  if (oldName === newName) return;

  const existingIndex = state.members.findIndex((member) => member === newName);
  if (existingIndex >= 0 && existingIndex !== index) {
    markStateMutation(`担当者を「${newName}」へ統合`);
    state.tasks = state.tasks.map((task) => task.owner === oldName ? { ...task, owner: newName } : task);
    state.members = state.members.filter((_, memberIndex) => memberIndex !== index);
  } else {
    markStateMutation(`メンバーを「${newName}」へ変更`);
    state.members[index] = newName;
    state.tasks = state.tasks.map((task) => task.owner === oldName ? { ...task, owner: newName } : task);
  }
  render();
}

function deleteMember(index) {
  const member = state.members[index];
  if (!member) return;
  const assigned = state.tasks.some((task) => task.owner === member);
  if (assigned) {
    alert("このメンバーにはまだ項目があります。先に担当者を変更してください。");
    return;
  }
  markStateMutation(`メンバー「${member}」を削除`);
  state.members = state.members.filter((_, memberIndex) => memberIndex !== index);
  render();
}

function filterTasksByMember(member, targetView = "dashboard") {
  filterTasksBySearch(`担当:"${member}"`, targetView);
}

function filterTasksByProject(project, targetView = "dashboard") {
  filterTasksBySearch(`案件:"${project}"`, targetView);
}

function filterTasksBySearch(value, targetView = "dashboard") {
  filters.search = String(value || "").trim();
  els.searchInput.value = String(value || "").trim();
  dashboardStatFilter = "";
  pendingDoneTaskId = "";
  pendingConvertTaskId = "";
  ownerPickerTaskId = "";
  projectPickerTaskId = "";
  duePickerTaskId = "";
  nextEditorTaskId = "";
  priorityPickerTaskId = "";
  switchView(targetView);
  render();
}

function stat(label, value, key) {
  const activeClass = dashboardStatFilter === key ? " active" : "";
  return `<button class="stat${activeClass}" data-stat-filter="${key}" type="button"><span>${label}</span><strong>${value}</strong></button>`;
}

function wireDashboardStats() {
  els.dashboardView.querySelectorAll("[data-stat-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardStatFilter = dashboardStatFilter === button.dataset.statFilter ? "" : button.dataset.statFilter;
      renderDashboard();
    });
  });
}

function wireDashboardSectionFilters() {
  els.dashboardView.querySelectorAll("[data-section-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      dashboardStatFilter = button.dataset.sectionFilter;
      renderDashboard();
    });
  });
}

function wireTodoDoneViewButtons() {
  els.todoView.querySelectorAll("[data-todo-done-view]").forEach((button) => {
    button.addEventListener("click", () => {
      showAllTodoDone = button.dataset.todoDoneView === "all";
      renderTodo();
    });
  });
}

function switchView(view) {
  const titles = {
    dashboard: "作業概要",
    board: "Issue 看板",
    todo: "Todo",
    projects: "案件概要",
    people: "メンバー管理"
  };
  els.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  els.pageTitle.textContent = titles[view];
  renderWorkflowTopControl();
  renderSearchAssist();
}

function openTaskDialog(id, overrides = {}) {
  const task = id ? state.tasks.find((item) => item.id === id) : null;
  const defaultType = currentView() === "todo" ? "todo" : "issue";
  const type = overrides.type || task?.type || defaultType;
  els.dialogTitle.textContent = task ? "項目を編集" : "新規項目";
  els.deleteTaskBtn.hidden = !task;
  els.createTodoFromIssueBtn.hidden = !(task?.type === "issue" && !isDone(task));
  els.taskId.value = task?.id || "";
  els.taskType.value = type;
  fillStatusSelect(type, overrides.status || task?.status);
  els.taskTitle.value = overrides.title || task?.title || "";
  els.taskProject.value = overrides.project || task?.project || (type === "todo" ? "Todo" : "Issue");
  els.taskOwner.value = overrides.owner || task?.owner || state.members[0];
  els.taskDue.value = overrides.due || task?.due || todayOffset(3);
  els.taskPriority.value = overrides.priority || task?.priority || "中";
  els.taskLinkedIssueId.value = overrides.linkedIssueId || task?.linkedIssueId || "";
  els.taskCompletedAt.value = overrides.completedAt || task?.completedAt || todayOffset(0);
  els.taskNext.value = overrides.next || task?.next || "";
  els.taskLink.value = overrides.link || task?.link || "";
  els.taskNotes.value = overrides.notes || task?.notes || "";
  currentTaskAttachments = normalizeAttachments(overrides.attachments || task?.attachments || []);
  els.taskImages.value = "";
  renderTaskAttachments();
  syncIssueLinkRequirement();
  syncCompletedAtField();
  els.dialog.showModal();
  autoResizeTaskNext();
}

function autoResizeTaskNext() {
  const textarea = els.taskNext;
  const styles = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(styles.lineHeight) || 20;
  const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const border = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
  const minHeight = lineHeight * 3 + padding + border;
  const maxHeight = lineHeight * 10 + padding + border;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

async function handleTaskImageFiles(event) {
  await addTaskImageFiles([...event.target.files]);
  event.target.value = "";
}

async function handleTaskImagePaste(event) {
  const files = [...event.clipboardData?.files || []].filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  event.preventDefault();
  await addTaskImageFiles(files);
}

async function addTaskImageFiles(files) {
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (!images.length) return;
  const converted = await Promise.all(images.map(fileToAttachment));
  currentTaskAttachments = [...currentTaskAttachments, ...converted.filter(Boolean)];
  renderTaskAttachments();
}

async function fileToAttachment(file) {
  try {
    const dataUrl = await resizeImageFile(file);
    return {
      id: crypto.randomUUID(),
      name: file.name || "clipboard-image",
      type: dataUrl.slice(5, dataUrl.indexOf(";")) || file.type,
      dataUrl
    };
  } catch {
    alert("画像の追加に失敗しました。別の画像を選択してください。");
    return null;
  }
}

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderTaskAttachments() {
  if (!currentTaskAttachments.length) {
    els.taskAttachmentList.innerHTML = "";
    return;
  }
  els.taskAttachmentList.innerHTML = currentTaskAttachments.map((attachment) => `
    <figure class="attachment-item">
      <button class="attachment-preview-button" data-attachment-preview="${escapeHtml(attachment.id)}" type="button" aria-label="画像を拡大">
        <img src="${escapeHtml(attachment.dataUrl)}" alt="${escapeHtml(attachment.name)}">
      </button>
      <figcaption>${escapeHtml(attachment.name)}</figcaption>
      <button class="attachment-remove" data-attachment-remove="${escapeHtml(attachment.id)}" type="button" aria-label="画像を削除">削除</button>
    </figure>
  `).join("");
}

function openTaskAttachmentPreview(event) {
  const button = event.target.closest("[data-attachment-preview]");
  if (!button) return;
  const attachment = currentTaskAttachments.find((item) => item.id === button.dataset.attachmentPreview);
  if (!attachment) return;
  els.imagePreview.src = attachment.dataUrl;
  els.imagePreview.alt = attachment.name;
  els.imagePreviewName.textContent = attachment.name;
  els.imagePreviewDialog.showModal();
}

function closeTaskAttachmentPreview() {
  els.imagePreviewDialog.close();
  els.imagePreview.removeAttribute("src");
  els.imagePreviewName.textContent = "";
}

function closeTaskAttachmentPreviewFromBackdrop(event) {
  if (event.target === els.imagePreviewDialog) {
    closeTaskAttachmentPreview();
  }
}

function removeTaskAttachment(event) {
  const button = event.target.closest("[data-attachment-remove]");
  if (!button) return;
  currentTaskAttachments = currentTaskAttachments.filter((attachment) => attachment.id !== button.dataset.attachmentRemove);
  renderTaskAttachments();
}

function normalizeAttachments(attachments) {
  return Array.isArray(attachments)
    ? attachments.filter((attachment) => attachment?.dataUrl).map((attachment) => ({
      id: attachment.id || crypto.randomUUID(),
      name: attachment.name || "image",
      type: attachment.type || "image/*",
      dataUrl: attachment.dataUrl
    }))
    : [];
}

function createTodoFromCurrentIssue() {
  const issue = state.tasks.find((task) => task.id === els.taskId.value);
  if (!issue || issue.type !== "issue" || isDone(issue)) return;
  closeTaskDialog();
  openTodoDialogFromIssue(issue);
}

function openTodoDialogFromIssue(issue) {
  openTaskDialog("", {
    type: "todo",
    title: `調査: ${issue.title}`,
    project: issue.project,
    owner: issue.owner,
    due: todayOffset(0),
    status: todoOpenStatus,
    priority: issue.priority,
    next: "この Issue を調査する。",
    link: issue.link,
    linkedIssueId: issue.id,
    notes: `関連 Issue: ${issue.title}`
  });
}

function closeTaskDialog() {
  els.dialog.close();
}

function saveTask(event) {
  event.preventDefault();
  els.taskLink.setCustomValidity("");
  const id = els.taskId.value || crypto.randomUUID();
  const type = els.taskType.value;
  const existingTask = state.tasks.find((item) => item.id === id);
  const link = normalizeUrl(els.taskLink.value);
  const status = els.taskStatus.value;
  const doneStatus = type === "todo" ? todoDoneStatus : completedStatus;
  const completedAt = status === doneStatus
    ? els.taskCompletedAt.value || existingTask?.completedAt || todayOffset(0)
    : "";

  if (type === "issue" && !extractIssueNumber(link)) {
    els.taskLink.setCustomValidity("Issue URL には Issue 番号を含めてください。");
    els.taskLink.reportValidity();
    return;
  }

  if (type === "issue" && link && hasDuplicateIssueLink(id, link)) {
    els.taskLink.setCustomValidity("同じ Issue URL はすでに存在します。");
    els.taskLink.reportValidity();
    return;
  }

  const task = {
    id,
    type,
    title: els.taskTitle.value.trim(),
    project: els.taskProject.value.trim() || (type === "todo" ? "Todo" : "Issue"),
    owner: els.taskOwner.value,
    due: els.taskDue.value,
    status,
    priority: els.taskPriority.value,
    linkedIssueId: type === "todo" ? els.taskLinkedIssueId.value : "",
    completedAt,
    next: els.taskNext.value.trim(),
    link,
    order: Number.isFinite(existingTask?.order) ? existingTask.order : Date.now(),
    notes: els.taskNotes.value.trim(),
    attachments: normalizeAttachments(currentTaskAttachments),
    createdAt: existingTask?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const index = state.tasks.findIndex((item) => item.id === id);
  if (index >= 0) {
    markStateMutation(`「${task.title}」を更新`);
    state.tasks[index] = task;
  } else {
    markStateMutation(`「${task.title}」を追加`);
    state.tasks.unshift(task);
  }

  closeTaskDialog();
  render();
}

function hasDuplicateIssueLink(taskId, link) {
  return state.tasks.some((task) => (
    task.type === "issue"
    && task.id !== taskId
    && normalizeUrl(task.link) === link
  ));
}

function clearPendingDoneOnOtherClick(event) {
  if ((!pendingDoneTaskId && !pendingConvertTaskId) || event.target.closest("[data-done], [data-convert]")) return;
  clearPendingConfirmations();
}

function closeOwnerPickerOnOtherClick(event) {
  if (!ownerPickerTaskId || event.target.closest("[data-owner-picker], [data-owner-choice]")) return;
  ownerPickerTaskId = "";
  render();
}

function closeProjectPickerOnOtherClick(event) {
  if (!projectPickerTaskId || event.target.closest("[data-project-picker], [data-project-choice], [data-project-input], .project-menu")) return;
  projectPickerTaskId = "";
  render();
}

function closeDuePickerOnOtherClick(event) {
  if (!duePickerTaskId || event.target.closest("[data-due-picker], [data-due-choice], .due-picker-menu")) return;
  duePickerTaskId = "";
  render();
}

function closeNextEditorOnOtherClick(event) {
  if (!nextEditorTaskId || event.target.closest("[data-next-open], [data-next-editor], [data-next-save], [data-next-cancel], .next-quick-editor")) return;
  nextEditorTaskId = "";
  render();
}

function closePriorityPickerOnOtherClick(event) {
  if (!priorityPickerTaskId || event.target.closest("[data-priority-picker], [data-priority-choice], .priority-menu")) return;
  priorityPickerTaskId = "";
  render();
}

function saveQuickProject(taskId, value) {
  const project = String(value || "").trim();
  if (!taskId || !project) return;
  const task = state.tasks.find((item) => item.id === taskId);
  updateTask(taskId, { project }, `「${task?.title || "項目"}」の案件を変更`);
  projectPickerTaskId = "";
  render();
}

function saveQuickNextAction(taskId, value) {
  const next = String(value || "").trim();
  if (!taskId || !next) return;
  const task = state.tasks.find((item) => item.id === taskId);
  updateTask(taskId, { next }, `「${task?.title || "Issue"}」の次のアクションを変更`);
  nextEditorTaskId = "";
  render();
}

function clearPendingDoneConfirmation() {
  clearPendingConfirmations();
}

function clearPendingConfirmations() {
  if (!pendingDoneTaskId && !pendingConvertTaskId) return;
  pendingDoneTaskId = "";
  pendingConvertTaskId = "";
  render();
}

function syncIssueLinkRequirement() {
  const isIssue = els.taskType.value === "issue";
  els.taskLink.setCustomValidity("");
  els.taskLink.required = isIssue;
  els.taskLink.placeholder = isIssue ? "https://example.com/issues/123" : "任意: https://example.com/issues/123";
}

function syncCompletedAtField() {
  const doneStatus = els.taskType.value === "todo" ? todoDoneStatus : completedStatus;
  const isCompleted = els.taskStatus.value === doneStatus;
  els.taskCompletedAtLabel.hidden = !isCompleted;
  els.taskCompletedAt.required = isCompleted;
  if (isCompleted && !els.taskCompletedAt.value) {
    els.taskCompletedAt.value = todayOffset(0);
  }
}

function submitTaskDialogWithShortcut(event) {
  if (event.key !== "Enter" || !event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof HTMLElement) || !event.target.closest("input, textarea, select")) return;
  event.preventDefault();
  els.form.requestSubmit();
}

function deleteCurrentTask() {
  const id = els.taskId.value;
  if (!id) return;
  const task = state.tasks.find((item) => item.id === id);
  markStateMutation(`「${task?.title || "項目"}」を削除`);
  state.tasks = state.tasks.filter((task) => task.id !== id);
  closeTaskDialog();
  render();
}

function updateTask(id, patch, label = "") {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  markStateMutation(label || taskMutationLabel(task, patch));
  state.tasks = state.tasks.map((item) => item.id === id ? touchTask(item, patch) : item);
}

function touchTask(task, patch = {}) {
  return { ...task, ...patch, updatedAt: new Date().toISOString() };
}

function taskMutationLabel(task, patch) {
  if (patch.owner && patch.owner !== task.owner) return `「${task.title}」の担当者を変更`;
  if (patch.due && patch.due !== task.due) return `「${task.title}」の期限を変更`;
  if (patch.status === completedStatus || patch.status === todoDoneStatus) return `「${task.title}」を完了`;
  if (patch.status && patch.status !== task.status) return `「${task.title}」を ${patch.status} へ変更`;
  if (Object.prototype.hasOwnProperty.call(patch, "completedAt") && !patch.completedAt) return `「${task.title}」を未完了へ戻す`;
  return `「${task.title}」を更新`;
}

function filteredTasks() {
  const criteria = parseSearchQuery(filters.search);
  if (!criteria.length) return [...state.tasks];
  return state.tasks.filter((task) => criteria.every((criterion) => matchesSearchCriterion(task, criterion)));
}

function parseSearchQuery(query) {
  const aliases = {
    "担当": "owner", "担当者": "owner", owner: "owner",
    "案件": "project", project: "project",
    "種別": "type", type: "type",
    "期限": "due", due: "due",
    "状態": "status", "ステータス": "status", status: "status",
    "優先": "priority", "優先度": "priority", priority: "priority",
    "次": "next", "次のアクション": "next", next: "next",
    "完了": "done", done: "done"
  };
  return (String(query || "").match(/(?:[^\s\"]+|\"[^\"]*\")+/g) || []).map((rawToken) => {
    const token = rawToken.replace(/^\"|\"$/g, "");
    const separator = token.search(/[:：]/);
    if (separator <= 0) return { key: "text", value: token.toLowerCase(), label: token };
    const rawKey = token.slice(0, separator).toLowerCase();
    const value = token.slice(separator + 1).replace(/^\"|\"$/g, "").trim();
    const key = aliases[rawKey];
    return key && value
      ? { key, value: value.toLowerCase(), label: `${token.slice(0, separator)}:${value}` }
      : { key: "text", value: token.toLowerCase(), label: token };
  }).filter((criterion) => criterion.value);
}

function matchesSearchCriterion(task, criterion) {
  const value = criterion.value;
  if (criterion.key === "text") return searchableTaskText(task).includes(value);
  if (criterion.key === "owner") return task.owner.toLowerCase().includes(value);
  if (criterion.key === "project") return task.project.toLowerCase().includes(value);
  if (criterion.key === "type") return taskLabel(task).toLowerCase() === value || task.type === value;
  if (criterion.key === "priority") return task.priority.toLowerCase() === value.replace(/優先度|優先/g, "");
  if (criterion.key === "next") return task.next.toLowerCase().includes(value);
  if (criterion.key === "done") {
    const wantsDone = ["true", "yes", "1", "済", "完了"].includes(value);
    const wantsOpen = ["false", "no", "0", "未完了"].includes(value);
    return wantsDone ? isDone(task) : wantsOpen ? !isDone(task) : searchableTaskText(task).includes(value);
  }
  if (criterion.key === "status") {
    if (["停滞", "stalled"].includes(value)) return isTaskStalled(task);
    return task.status.toLowerCase().includes(value);
  }
  if (criterion.key === "due") return matchesDueSearch(task, value);
  return true;
}

function matchesDueSearch(task, value) {
  const diff = daysUntil(task.due);
  if (["今日", "本日", "today"].includes(value)) return diff === 0;
  if (["明日", "tomorrow"].includes(value)) return diff === 1;
  if (["期限超過", "超過", "overdue"].includes(value)) return !isDone(task) && diff < 0;
  if (["今週", "week"].includes(value)) return diff >= 0 && diff <= 7;
  return task.due.toLowerCase().includes(value);
}

function renderSearchAssist() {
  const criteria = parseSearchQuery(filters.search);
  const showExamples = !criteria.length && document.activeElement === els.searchInput;
  const ignoresSearch = ["projects", "people"].includes(currentView());
  els.searchAssist.hidden = !criteria.length && !showExamples;
  if (!criteria.length) {
    els.searchAssist.innerHTML = showExamples ? `
      <span class="search-assist-label">条件検索</span>
      ${["担当:自分", "期限:今日", "期限:期限超過", "状態:停滞", "種別:Todo"].map((example) => `<button class="search-chip search-example" data-search-example="${example}" type="button">${example}</button>`).join("")}
    ` : "";
    els.searchAssist.querySelectorAll("[data-search-example]").forEach((button) => {
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => filterTasksBySearch(button.dataset.searchExample, currentView()));
    });
    return;
  }
  els.searchAssist.innerHTML = `
    <span class="search-assist-label">検索条件</span>
    ${criteria.map((criterion) => `<span class="search-chip">${escapeHtml(criterion.label)}</span>`).join("")}
    <button class="search-clear" type="button">クリア</button>
    <span class="search-count">${ignoresSearch ? "この画面は常に全件表示" : `${filteredTasks().length} 件`}</span>
  `;
  els.searchAssist.querySelector(".search-clear").addEventListener("click", clearSearch);
}

function clearSearch() {
  filters.search = "";
  els.searchInput.value = "";
  dashboardStatFilter = "";
  render();
  els.searchInput.focus();
}

function wireClearSearchButtons() {
  document.querySelectorAll("[data-clear-search]").forEach((button) => button.addEventListener("click", clearSearch));
}

function handleGlobalShortcuts(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const isTyping = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
  if (event.key === "Escape") {
    closeActionMenus();
    if (ownerPickerTaskId) {
      ownerPickerTaskId = "";
      render();
    }
    if (duePickerTaskId) {
      duePickerTaskId = "";
      render();
    }
    if (nextEditorTaskId) {
      nextEditorTaskId = "";
      render();
    }
    return;
  }
  if (document.querySelector("dialog[open]")) return;
  if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "/") {
    event.preventDefault();
    els.searchInput.focus();
    els.searchInput.select();
    renderSearchAssist();
  } else if (event.key.toLowerCase() === "n") {
    event.preventDefault();
    openTaskDialog();
  }
}

function emptyState(defaultMessage) {
  return filters.search
    ? `<div class="empty search-empty"><strong>検索条件に一致する項目はありません</strong><span>${escapeHtml(filters.search)}</span><button class="tiny-button" data-clear-search type="button">検索をクリア</button></div>`
    : `<div class="empty">${escapeHtml(defaultMessage)}</div>`;
}

function searchableTaskText(task) {
  const issueNumber = extractIssueNumber(task.link);
  return [
    task.type,
    task.title,
    task.project,
    task.owner,
    task.status,
    task.priority,
    task.next,
    task.notes,
    ...(Array.isArray(task.attachments) ? task.attachments.map((attachment) => attachment.name).filter(Boolean) : []),
    task.link,
    issueNumber,
    issueNumber ? `#${issueNumber}` : "",
    task.linkedIssueId ? "関連 issue todo" : ""
  ].filter(Boolean).join(" ").toLowerCase();
}

function syncMembersFromTasks() {
  state.members = [...new Set([...state.members, ...state.tasks.map((task) => task.owner)])].filter(Boolean);
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `task-manager-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      validateImportedData(imported);
      markStateMutation("JSON データをインポート");
      state = migrateState(imported);
      dataFileHandle = null;
      render();
    } catch {
      alert("インポートに失敗しました。TaskManager からエクスポートした JSON ファイルを選択してください。");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function validateImportedData(imported) {
  if (!Array.isArray(imported.tasks) || !Array.isArray(imported.members)) {
    throw new Error("invalid shape");
  }
}

function markStateMutation(label) {
  pendingMutationLabel = label || "データを更新";
}

function captureStateChange() {
  const currentSnapshot = serializeState(state);
  if (!lastStateSnapshot) {
    lastStateSnapshot = currentSnapshot;
    pendingMutationLabel = "";
    return;
  }
  if (currentSnapshot === lastStateSnapshot) {
    pendingMutationLabel = "";
    return;
  }
  const label = pendingMutationLabel || "データを更新";
  if (!suppressHistoryCapture) {
    undoStack.push({ label, timestamp: new Date().toISOString(), state: JSON.parse(lastStateSnapshot) });
    if (undoStack.length > maxUndoEntries) undoStack.shift();
    operationLog.unshift({ label, timestamp: new Date().toISOString() });
    operationLog = operationLog.slice(0, 50);
    saveOperationLog();
    createRecoveryPoint(label, state);
    showToast(`${label}しました。`, true);
  }
  lastStateSnapshot = currentSnapshot;
  pendingMutationLabel = "";
}

function serializeState(value) {
  return JSON.stringify(value);
}

function undoLastChange() {
  const entry = undoStack.pop();
  if (!entry) return;
  suppressHistoryCapture = true;
  state = migrateState(entry.state);
  lastStateSnapshot = serializeState(state);
  suppressHistoryCapture = false;
  operationLog.unshift({ label: `取り消し: ${entry.label}`, timestamp: new Date().toISOString() });
  operationLog = operationLog.slice(0, 50);
  saveOperationLog();
  render();
  showToast(`${entry.label}を取り消しました。`, false);
}

function showToast(message, canUndo = true) {
  clearTimeout(toastTimer);
  els.toastMessage.textContent = message;
  els.undoBtn.hidden = !canUndo || !undoStack.length;
  els.toast.hidden = false;
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 5200);
}

function loadOperationLog() {
  try {
    const log = JSON.parse(localStorage.getItem(historyKey));
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

function saveOperationLog() {
  try {
    localStorage.setItem(historyKey, JSON.stringify(operationLog));
  } catch {
    // History metadata is optional; task data remains in IndexedDB.
  }
}

function openHistoryDialog() {
  const rows = operationLog.length ? operationLog.map((entry) => `
    <div class="history-row"><span>${escapeHtml(entry.label)}</span><time>${escapeHtml(formatTimestamp(entry.timestamp))}</time></div>
  `).join("") : `<div class="empty">操作履歴はありません</div>`;
  openUtilityDialog("操作履歴", `<div class="history-list">${rows}</div>`, `
    <button class="ghost-button" data-utility-close type="button">閉じる</button>
    <span class="spacer"></span>
    <button class="primary-button" id="historyUndoBtn" type="button" ${undoStack.length ? "" : "disabled"}>直前の操作を取り消す</button>
  `);
  document.querySelector("#historyUndoBtn").addEventListener("click", () => {
    closeUtilityDialog();
    undoLastChange();
  });
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

async function initializeIndexedDb() {
  if (!("indexedDB" in window)) return;
  try {
    appDatabase = await openAppDatabase();
    const saved = await idbGet(stateStoreName, "current");
    if (saved?.state?.tasks) {
      suppressHistoryCapture = true;
      state = migrateState(saved.state);
      lastStateSnapshot = serializeState(state);
      render();
      suppressHistoryCapture = false;
    } else {
      await persistStateToIndexedDb();
      await createRecoveryPoint("初期データ", state);
    }
  } catch {
    appDatabase = null;
  }
}

function openAppDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(stateStoreName)) database.createObjectStore(stateStoreName, { keyPath: "id" });
      if (!database.objectStoreNames.contains(recoveryStoreName)) database.createObjectStore(recoveryStoreName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function idbStore(storeName, mode = "readonly") {
  return appDatabase.transaction(storeName, mode).objectStore(storeName);
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(storeName, key) {
  return idbRequest(idbStore(storeName).get(key));
}

function idbGetAll(storeName) {
  return idbRequest(idbStore(storeName).getAll());
}

function idbPut(storeName, value) {
  return idbRequest(idbStore(storeName, "readwrite").put(value));
}

function idbDelete(storeName, key) {
  return idbRequest(idbStore(storeName, "readwrite").delete(key));
}

async function persistStateToIndexedDb() {
  if (!appDatabase) return;
  await idbPut(stateStoreName, { id: "current", state, updatedAt: new Date().toISOString() });
}

async function createRecoveryPoint(label, pointState) {
  if (!appDatabase) return;
  try {
    await idbPut(recoveryStoreName, {
      id: crypto.randomUUID(),
      label,
      timestamp: new Date().toISOString(),
      state: JSON.parse(serializeState(pointState))
    });
    const points = (await idbGetAll(recoveryStoreName)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    await Promise.all(points.slice(maxRecoveryPoints).map((point) => idbDelete(recoveryStoreName, point.id)));
  } catch {
    // Recovery points must never block the primary save.
  }
}

async function openRecoveryDialog() {
  closeActionMenus();
  const points = appDatabase ? (await idbGetAll(recoveryStoreName)).sort((a, b) => b.timestamp.localeCompare(a.timestamp)) : [];
  const rows = points.length ? points.map((point) => `
    <div class="recovery-row">
      <div><strong>${escapeHtml(point.label)}</strong><time>${escapeHtml(formatTimestamp(point.timestamp))}</time></div>
      <button class="tiny-button" data-restore-point="${point.id}" type="button">復元</button>
    </div>
  `).join("") : `<div class="empty">復元ポイントはありません</div>`;
  openUtilityDialog("復元ポイント", `<p class="dialog-description">直近 ${maxRecoveryPoints} 件の変更後データを保存しています。</p><div class="recovery-list">${rows}</div>`, `<button class="ghost-button" data-utility-close type="button">閉じる</button>`);
  els.utilityContent.querySelectorAll("[data-restore-point]").forEach((button) => {
    button.addEventListener("click", async () => {
      const point = points.find((item) => item.id === button.dataset.restorePoint);
      if (!point) return;
      markStateMutation(`復元: ${point.label}`);
      state = migrateState(point.state);
      closeUtilityDialog();
      render();
    });
  });
}

async function updateStorageUsage() {
  if (!navigator.storage?.estimate) {
    els.storageUsage.textContent = appDatabase ? "IndexedDB で保存中" : "localStorage で保存中";
    return;
  }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    els.storageUsage.textContent = `${appDatabase ? "IndexedDB" : "localStorage"} · ${formatBytes(usage)} / ${formatBytes(quota)}`;
  } catch {
    els.storageUsage.textContent = appDatabase ? "IndexedDB で保存中" : "localStorage で保存中";
  }
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.tasks?.length) return saved;
  } catch {
    localStorage.removeItem(storageKey);
  }
  return { members: defaultMembers, workflow: defaultWorkflow, tasks: sampleTasks };
}

function saveState() {
  const snapshot = serializeState(state);
  if (snapshot === lastPersistedSnapshot) return;
  lastPersistedSnapshot = snapshot;
  persistStateToIndexedDb().then(updateStorageUsage).catch(() => { lastPersistedSnapshot = ""; });
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    storageQuotaAlertShown = false;
  } catch {
    if (!appDatabase) lastPersistedSnapshot = "";
    if (!appDatabase && !storageQuotaAlertShown) {
      storageQuotaAlertShown = true;
      alert("データを保存できませんでした。画像を減らすか、小さい画像を追加してください。");
    }
  }
}

function migrateState(rawState) {
  const statusMap = {
    "待确认": "調査中",
    "待處理": "調査中",
    "待处理": "調査中",
    "调查": "調査中",
    "調査": "調査中",
    "进行中": "修正中",
    "進行中": "修正中",
    "修正": "修正中",
    "等待反馈/阻塞": "テスト中",
    "等待反饋/阻塞": "テスト中",
    "测试": "テスト中",
    "測試": "テスト中",
    "テスト": "テスト中",
    "本周完成": "完了",
    "已完成": "完了",
    "待办": "未対応",
    "待辦": "未対応"
  };
  const migrated = {
    members: Array.isArray(rawState?.members) ? rawState.members : defaultMembers,
    workflow: Array.isArray(rawState?.workflow) && rawState.workflow.length ? rawState.workflow.map((step) => statusMap[step] || step) : defaultWorkflow,
    tasks: Array.isArray(rawState?.tasks) ? rawState.tasks : sampleTasks
  };

  migrated.tasks = migrated.tasks.map((task, index) => {
    const type = task.type === "todo" ? "todo" : "issue";
    const fallbackStatus = type === "todo" ? todoOpenStatus : migrated.workflow[0];
    const mappedStatus = statusMap[task.status] || task.status || fallbackStatus;
    const validIssueStatus = [...migrated.workflow, completedStatus].includes(mappedStatus);
    const validTodoStatus = [todoOpenStatus, todoDoneStatus].includes(mappedStatus);
    const legacyTodoPlan = type === "issue" && Boolean(task.todoPlan || task.todayPlan);
    return {
      ...task,
      id: task.id || crypto.randomUUID(),
      type,
      project: task.project || (type === "todo" ? "Todo" : "Issue"),
      owner: task.owner || migrated.members[0] || "自分",
      due: task.due || todayOffset(3),
      status: type === "todo" ? (validTodoStatus ? mappedStatus : todoOpenStatus) : (validIssueStatus ? mappedStatus : migrated.workflow[0]),
      priority: priorities.includes(task.priority) ? task.priority : "中",
      todoPlan: undefined,
      todayPlan: undefined,
      legacyTodoPlan,
      linkedIssueId: type === "todo" ? task.linkedIssueId || "" : "",
      completedAt: [todoDoneStatus, completedStatus].includes(mappedStatus) ? task.completedAt || task.due || todayOffset(0) : "",
      next: task.next || "次のアクションを確認する。",
      link: normalizeUrl(task.link || extractUrl(task.notes || "")),
      order: Number.isFinite(task.order) ? task.order : index,
      notes: task.notes || "",
      attachments: normalizeAttachments(task.attachments),
      createdAt: task.createdAt || task.updatedAt || new Date().toISOString(),
      updatedAt: task.updatedAt || task.createdAt || new Date().toISOString()
    };
  });

  const linkedTodoIds = new Set(migrated.tasks.filter((task) => task.type === "todo").map((task) => task.linkedIssueId).filter(Boolean));
  const migratedLegacyTodos = migrated.tasks
    .filter((task) => task.type === "issue" && task.legacyTodoPlan && !linkedTodoIds.has(task.id))
    .map((issue) => ({
      id: `todo-${issue.id}`,
      type: "todo",
      title: `調査: ${issue.title}`,
      project: issue.project,
      owner: issue.owner,
      due: todayOffset(0),
      status: todoOpenStatus,
      priority: issue.priority,
      next: "この Issue を調査する。",
      link: issue.link,
      linkedIssueId: issue.id,
      completedAt: "",
      order: Date.now(),
      notes: `関連 Issue: ${issue.title}`,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
  migrated.tasks = [
    ...migratedLegacyTodos,
    ...migrated.tasks.map(({ legacyTodoPlan, ...task }) => task)
  ];

  migrated.workflow = [...new Set(migrated.workflow.map(normalizeName).filter(Boolean))];
  if (!migrated.workflow.length) migrated.workflow = defaultWorkflow;
  return migrated;
}

function sortByUrgency(a, b) {
  const doneWeight = (task) => isDone(task) ? 3 : 0;
  const stalledWeight = (task) => isTaskStalled(task) ? -1 : 0;
  const typeWeight = (task) => task.type === "issue" ? -1 : 0;
  const priorityWeight = { 高: -3, 中: -2, 低: -1 };
  return doneWeight(a) - doneWeight(b)
    || stalledWeight(a) - stalledWeight(b)
    || daysUntil(a.due) - daysUntil(b.due)
    || priorityWeight[a.priority] - priorityWeight[b.priority]
    || typeWeight(a) - typeWeight(b);
}

function sortByTodo(a, b) {
  const priorityWeight = { 高: -3, 中: -2, 低: -1 };
  const typeWeight = (task) => task.type === "issue" ? -1 : 0;
  return daysUntil(a.due) - daysUntil(b.due)
    || priorityWeight[a.priority] - priorityWeight[b.priority]
    || typeWeight(a) - typeWeight(b)
    || a.title.localeCompare(b.title, "ja");
}

function sortByCompletedAt(a, b) {
  return completionDate(b).localeCompare(completionDate(a)) || sortByTodo(a, b);
}

function sortByBoardOrder(a, b) {
  const orderA = Number.isFinite(a.order) ? a.order : 0;
  const orderB = Number.isFinite(b.order) ? b.order : 0;
  return orderA - orderB || sortByUrgency(a, b);
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const group = (typeof key === "function" ? key(item) : item[key]) || "未分類";
    acc[group] = acc[group] || [];
    acc[group].push(item);
    return acc;
  }, {});
}

function groupDoneTasksByDate(tasks) {
  const groups = groupBy(tasks, (task) => completionDate(task));
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

function currentView() {
  return document.querySelector(".view.active")?.id.replace("View", "") || "dashboard";
}

function isDone(task) {
  return task.type === "todo" ? task.status === todoDoneStatus : task.status === completedStatus;
}

function stalledDays(task) {
  if (!task.updatedAt) return 0;
  return Math.max(0, daysSince(task.updatedAt.slice(0, 10)));
}

function isTaskStalled(task) {
  return task.type === "issue" && !isDone(task) && stalledDays(task) >= 3;
}

function nextWorkflowStep(status) {
  const index = state.workflow.indexOf(status);
  if (index < 0 || index >= state.workflow.length - 1) return "";
  return state.workflow[index + 1];
}

function taskLabel(task) {
  return task.type === "todo" ? "Todo" : "Issue";
}

function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function extractUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : "";
}

function extractIssueNumber(value) {
  const match = normalizeUrl(value).match(/\/issues\/(\d+)(?:[/?#]|$)/i);
  return match ? match[1] : "";
}

function issueLabel(value) {
  const number = extractIssueNumber(value);
  if (!number) return "";
  const url = normalizeUrl(value).toLowerCase();
  const categories = [
    { path: "/step3/external-test-issue/-/issues/", label: "外結" },
    { path: "/step3/integration-test-issue/-/issues/", label: "総合" },
    { path: "/001-sej/inner-coupling-tests/step3/-/issues/", label: "内結" },
    { path: "/001-sej/issue/-/issues/", label: "開発" },
    { path: "/001-sej/unit-integration-tests/step3/-/issues/", label: "単結" }
  ];
  const category = categories.find((item) => url.includes(item.path));
  return `${category ? `${category.label} ` : ""}#${number}`;
}

function issueTask(title, project, owner, due, status, priority, next, notes) {
  return {
    id: crypto.randomUUID(),
    type: "issue",
    title,
    project,
    owner,
    due,
    status,
    priority,
    next,
    link: "",
    order: Date.now(),
    notes
  };
}

function todoTask(title, owner, due, priority, next, notes) {
  return {
    id: crypto.randomUUID(),
    type: "todo",
    title,
    project: "Todo",
    owner,
    due,
    status: todoOpenStatus,
    priority,
    next,
    link: "",
    order: Date.now(),
    notes
  };
}

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateString}T00:00:00`);
  return Math.round((due - today) / 86400000);
}

function dueFilterQuery(dateString) {
  const diff = daysUntil(dateString);
  if (diff < 0) return "期限:期限超過";
  if (diff === 0) return "期限:今日";
  if (diff === 1) return "期限:明日";
  return `期限:${dateString}`;
}

function formatDue(dateString) {
  const diff = daysUntil(dateString);
  if (diff < 0) return `${Math.abs(diff)}日遅れ`;
  if (diff === 0) return "本日締切";
  if (diff === 1) return "明日締切";
  return dateString;
}

function completionDate(task) {
  return task.completedAt || task.due || todayOffset(0);
}

function daysSince(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(`${dateString}T00:00:00`);
  return Math.round((today - date) / 86400000);
}

function formatDoneDate(dateString) {
  const diff = daysSince(dateString);
  if (diff === 0) return "今日";
  if (diff === 1) return "昨日";
  return `${dateString}`;
}

function dueText(task, editable = false) {
  const diff = daysUntil(task.due);
  const className = !isDone(task) && diff < 0
    ? "due-text overdue"
    : !isDone(task) && diff <= 1
      ? "due-text soon"
      : "due-text";
  const label = escapeHtml(formatDue(task.due));
  if (!editable) return `<span class="${className}">${label}</span>`;
  const picker = duePickerTaskId === task.id
    ? `<span class="due-picker-menu"><input type="date" value="${escapeHtml(task.due)}" data-due-choice="${task.id}" aria-label="期限を変更"></span>`
    : "";
  return `<span class="due-picker-wrap"><button class="${className} due-button" data-due-picker="${task.id}" data-due-filter="${escapeHtml(task.due)}" type="button" title="クリックで変更、Ctrl+クリックで絞り込み">${label}</button>${picker}</span>`;
}

function todayOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}
