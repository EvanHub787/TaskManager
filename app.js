const defaultWorkflow = ["調査中", "修正中", "テスト中", "MR"];
const completedStatus = "完了";
const todoOpenStatus = "未対応";
const todoDoneStatus = "完了";
const priorities = ["高", "中", "低"];
const defaultMembers = ["自分", "メンバーA", "メンバーB", "メンバーC", "メンバーD", "メンバーE"];
const storageKey = "follow-manager-v1";

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
  search: "",
  owner: "all",
  priority: "all"
};

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
  ownerFilter: document.querySelector("#ownerFilter"),
  priorityFilter: document.querySelector("#priorityFilter"),
  resetFilters: document.querySelector("#resetFilters"),
  addTaskBtn: document.querySelector("#addTaskBtn"),
  workflowTopSlot: document.querySelector("#workflowTopSlot"),
  openDataFileBtn: document.querySelector("#openDataFileBtn"),
  saveDataFileBtn: document.querySelector("#saveDataFileBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importFile: document.querySelector("#importFile"),
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
  taskPriority: document.querySelector("#taskPriority"),
  taskNext: document.querySelector("#taskNext"),
  taskLink: document.querySelector("#taskLink"),
  taskNotes: document.querySelector("#taskNotes"),
  deleteTaskBtn: document.querySelector("#deleteTaskBtn"),
  closeDialog: document.querySelector("#closeDialog"),
  cancelDialog: document.querySelector("#cancelDialog"),
  projectList: document.querySelector("#projectList")
};

bootstrap();

function bootstrap() {
  bindEvents();
  fillStaticSelects();
  render();
}

function bindEvents() {
  els.navButtons.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  els.searchInput.addEventListener("input", (event) => {
    filters.search = event.target.value.trim().toLowerCase();
    render();
  });

  els.ownerFilter.addEventListener("change", (event) => {
    filters.owner = event.target.value;
    render();
  });

  els.priorityFilter.addEventListener("change", (event) => {
    filters.priority = event.target.value;
    render();
  });

  els.resetFilters.addEventListener("click", () => {
    filters = { search: "", owner: "all", priority: "all" };
    els.searchInput.value = "";
    els.ownerFilter.value = "all";
    els.priorityFilter.value = "all";
    render();
  });

  els.addTaskBtn.addEventListener("click", () => openTaskDialog());
  els.openDataFileBtn.addEventListener("click", openDataFile);
  els.saveDataFileBtn.addEventListener("click", saveDataFile);
  els.closeDialog.addEventListener("click", closeTaskDialog);
  els.cancelDialog.addEventListener("click", closeTaskDialog);
  els.deleteTaskBtn.addEventListener("click", deleteCurrentTask);
  els.exportBtn.addEventListener("click", exportData);
  els.importFile.addEventListener("change", importData);
  els.taskType.addEventListener("change", () => fillStatusSelect(els.taskType.value));
  els.form.addEventListener("submit", saveTask);
  els.boardView.addEventListener("click", suppressBoardClickAfterDrag, true);
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
  renderWorkflowTopControl();
  renderFilterOptions();
  renderProjectList();
  renderTodayFocus();
  renderDashboard();
  renderBoard();
  renderTodo();
  renderProjects();
  renderPeople();
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
  const ownerOptions = [`<option value="all">すべての担当者</option>`]
    .concat(state.members.map((member) => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`));
  els.ownerFilter.innerHTML = ownerOptions.join("");
  els.ownerFilter.value = filters.owner;
  els.taskOwner.innerHTML = state.members.map((member) => `<option value="${escapeHtml(member)}">${escapeHtml(member)}</option>`).join("");
}

function renderProjectList() {
  const projects = [...new Set(state.tasks.map((task) => task.project).filter(Boolean))].sort();
  els.projectList.innerHTML = projects.map((project) => `<option value="${escapeHtml(project)}"></option>`).join("");
}

function renderTodayFocus() {
  const focusTasks = state.tasks
    .filter((task) => !isDone(task))
    .sort(sortByUrgency)
    .slice(0, 4);

  els.todayFocus.innerHTML = focusTasks.length
    ? focusTasks.map((task) => `<div class="focus-item"><strong>${escapeHtml(task.title)}</strong><span>${taskLabel(task)} · ${escapeHtml(task.owner)} · ${formatDue(task.due)}</span></div>`).join("")
    : `<div class="focus-item">フォロー対象はありません</div>`;
}

function renderDashboard() {
  const visible = filteredTasks();
  const openTasks = state.tasks.filter((task) => !isDone(task));
  const overdue = openTasks.filter((task) => daysUntil(task.due) < 0);
  const issues = openTasks.filter((task) => task.type === "issue");
  const todos = openTasks.filter((task) => task.type === "todo");

  els.dashboardView.innerHTML = `
    <div class="stats-grid">
      ${stat("未完了", openTasks.length)}
      ${stat("対応中 Issue", issues.length)}
      ${stat("未対応 Todo", todos.length)}
      ${stat("期限超過", overdue.length)}
    </div>
    ${taskSection("優先対応", visible.filter((task) => !isDone(task)).sort(sortByUrgency).slice(0, 8))}
    ${taskSection("最近の完了", visible.filter(isDone).slice(0, 8))}
  `;
  wireTaskButtons(els.dashboardView);
}

function renderBoard() {
  const visible = filteredTasks().filter((task) => task.type === "issue" && task.status !== completedStatus);
  els.boardView.innerHTML = `
    <div class="board">
      ${state.workflow.map((status) => {
        const tasks = visible.filter((task) => task.status === status).sort(sortByBoardOrder);
        return `
          <div class="column" data-status="${escapeHtml(status)}">
            <div class="column-title"><span>${escapeHtml(status)}</span><span class="tag">${tasks.length}</span></div>
            <div class="cards" data-drop-status="${escapeHtml(status)}">${tasks.length ? tasks.map((task) => taskCard(task, true)).join("") : `<div class="empty">Issue はありません</div>`}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
  wireTaskButtons(els.boardView);
  wireBoardDragAndDrop();
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
  const open = todos.filter((task) => task.status !== todoDoneStatus).sort(sortByUrgency);
  const done = todos.filter((task) => task.status === todoDoneStatus).sort(sortByUrgency);

  els.todoView.innerHTML = `
    <div class="todo-capture">
      <form id="todoForm">
        <textarea id="todoMemo" rows="5" placeholder="txt の一時メモをここに貼り付けます。1行ごとに Todo として登録されます"></textarea>
        <div class="todo-actions">
          <input id="todoTxtFile" type="file" accept=".txt,text/plain">
          <button class="primary-button" type="submit">Todo に追加</button>
        </div>
      </form>
    </div>
    ${taskSection("未対応 Todo", open)}
    ${taskSection("完了 Todo", done)}
  `;
  wireTodoButtons();
  wireTaskButtons(els.todoView);
}

function renderProjects() {
  const projects = groupBy(filteredTasks(), "project");
  const rows = Object.entries(projects).sort(([a], [b]) => a.localeCompare(b, "zh-Hans-CN")).map(([project, tasks]) => {
    const done = tasks.filter(isDone).length;
    const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    const high = tasks.filter((task) => task.priority === "高" && !isDone(task)).length;
    const next = tasks.filter((task) => !isDone(task)).sort(sortByUrgency)[0];
    return `
      <tr>
        <td><strong>${escapeHtml(project)}</strong><div class="progress"><span style="width:${progress}%"></span></div></td>
        <td>${tasks.length}</td>
        <td>${progress}%</td>
        <td>${high}</td>
        <td>${next ? `${escapeHtml(next.title)}<br><span class="meta">${taskLabel(next)} · ${escapeHtml(next.owner)} · ${formatDue(next.due)}</span>` : "なし"}</td>
      </tr>
    `;
  }).join("");

  els.projectsView.innerHTML = rows
    ? `<table class="list-table"><thead><tr><th>案件</th><th>件数</th><th>完了率</th><th>高優先度の未完了</th><th>次の対応</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">案件はありません</div>`;
}

function renderPeople() {
  const rows = state.members.map((member) => {
    const tasks = filteredTasks().filter((task) => task.owner === member);
    const open = tasks.filter((task) => !isDone(task));
    const overdue = open.filter((task) => daysUntil(task.due) < 0);
    const issues = open.filter((task) => task.type === "issue");
    const todos = open.filter((task) => task.type === "todo");
    const next = open.sort(sortByUrgency)[0];
    return `
      <tr>
        <td><strong>${escapeHtml(member)}</strong></td>
        <td>${open.length}</td>
        <td>${issues.length}</td>
        <td>${todos.length}</td>
        <td>${overdue.length}</td>
        <td>${next ? `${escapeHtml(next.title)}<br><span class="meta">${taskLabel(next)} · ${formatDue(next.due)}</span>` : "なし"}</td>
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
    <table class="list-table"><thead><tr><th>担当者</th><th>未完了</th><th>Issue</th><th>Todo</th><th>期限超過</th><th>次の対応</th></tr></thead><tbody>${rows}</tbody></table>
  `;
  wireMemberButtons();
}

function taskSection(title, tasks) {
  return `
    <div class="section-title"><h3>${title}</h3><span class="tag">${tasks.length}</span></div>
    <div class="cards">${tasks.length ? tasks.map((task) => taskCard(task)).join("") : `<div class="empty">項目はありません</div>`}</div>
  `;
}

function taskCard(task, enableDrag = false) {
  const urgencyClass = daysUntil(task.due) < 0 && !isDone(task) ? "overdue" : daysUntil(task.due) <= 2 && !isDone(task) ? "soon" : "";
  const priorityClass = task.priority === "高" ? "high" : task.priority === "中" ? "middle" : "low";
  const canAdvance = task.type === "issue" && task.status !== completedStatus;
  const canFinish = !isDone(task);
  const issueNumber = extractIssueNumber(task.link);
  const taskUrl = normalizeUrl(task.link);
  const issueBadge = issueNumber
    ? `<a class="issue-number" href="${escapeHtml(taskUrl)}" target="_blank" rel="noopener noreferrer">#${escapeHtml(issueNumber)}</a>`
    : "";
  const title = task.link
    ? `<a class="task-link" href="${escapeHtml(taskUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(task.title)}</a>`
    : escapeHtml(task.title);
  return `
    <article class="task-card ${urgencyClass}" data-task-id="${task.id}" ${enableDrag && task.type === "issue" && !isDone(task) ? `draggable="true"` : ""}>
      <h4>${issueBadge}${title}</h4>
      <div class="meta">${taskLabel(task)} · ${escapeHtml(task.project)} · ${escapeHtml(task.owner)} · ${formatDue(task.due)}</div>
      <p class="next">${escapeHtml(task.next)}</p>
      <div class="tags">
        <span class="tag ${priorityClass}">${task.priority}</span>
        <span class="tag">${escapeHtml(task.status)}</span>
      </div>
      <div class="card-actions">
        <button class="tiny-button" data-edit="${task.id}" type="button">編集</button>
        ${task.type === "todo" && task.status !== todoDoneStatus ? `<button class="tiny-button" data-convert="${task.id}" type="button">Issue 化</button>` : ""}
        ${canAdvance && nextWorkflowStep(task.status) ? `<button class="tiny-button" data-advance="${task.id}" type="button">次へ</button>` : ""}
        ${canFinish ? `<button class="tiny-button" data-done="${task.id}" type="button">完了</button>` : ""}
      </div>
    </article>
  `;
}

function wireTaskButtons(root) {
  root.querySelectorAll(".task-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.open(link.href, "_blank", "noopener,noreferrer");
    });
  });
  root.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openTaskDialog(button.dataset.edit));
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
      updateTask(task.id, { status: task.type === "todo" ? todoDoneStatus : completedStatus });
      render();
    });
  });
  root.querySelectorAll("[data-convert]").forEach((button) => {
    button.addEventListener("click", () => {
      updateTask(button.dataset.convert, { type: "issue", status: state.workflow[0], project: "Issue" });
      switchView("board");
      render();
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

  state.tasks = state.tasks.map((item) => {
    if (item.id === taskId) return { ...item, status: targetStatus, order: insertIndex };
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

function wireTodoButtons() {
  const form = els.todoView.querySelector("#todoForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const textarea = els.todoView.querySelector("#todoMemo");
    addTodosFromText(textarea.value);
    textarea.value = "";
  });

  els.todoView.querySelector("#todoTxtFile").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => addTodosFromText(reader.result);
    reader.readAsText(file);
    event.target.value = "";
  });
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

function addTodosFromText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    alert("追加できる Todo がありません。");
    return;
  }
  const todos = lines.map((line) => todoTask(line, state.members[0] || "自分", todayOffset(1), "中", "対応するか、Issue 化するか、完了にするか確認する。", "memo/txt からのクイック登録。"));
  state.tasks = [...todos, ...state.tasks];
  render();
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
    state.tasks = state.tasks.map((task) => task.owner === oldName ? { ...task, owner: newName } : task);
    state.members = state.members.filter((_, memberIndex) => memberIndex !== index);
    if (filters.owner === oldName) filters.owner = newName;
  } else {
    state.members[index] = newName;
    state.tasks = state.tasks.map((task) => task.owner === oldName ? { ...task, owner: newName } : task);
    if (filters.owner === oldName) filters.owner = newName;
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
  state.members = state.members.filter((_, memberIndex) => memberIndex !== index);
  if (filters.owner === member) filters.owner = "all";
  render();
}

function stat(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function switchView(view) {
  const titles = {
    dashboard: "作業概要",
    board: "Issue 看板",
    todo: "Todo 受信箱",
    projects: "案件概要",
    people: "メンバー管理"
  };
  els.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  els.pageTitle.textContent = titles[view];
  renderWorkflowTopControl();
}

function openTaskDialog(id) {
  const task = id ? state.tasks.find((item) => item.id === id) : null;
  const defaultType = currentView() === "todo" ? "todo" : "issue";
  const type = task?.type || defaultType;
  els.dialogTitle.textContent = task ? "項目を編集" : "新規項目";
  els.deleteTaskBtn.hidden = !task;
  els.taskId.value = task?.id || "";
  els.taskType.value = type;
  fillStatusSelect(type, task?.status);
  els.taskTitle.value = task?.title || "";
  els.taskProject.value = task?.project || (type === "todo" ? "Todo" : "Issue");
  els.taskOwner.value = task?.owner || state.members[0];
  els.taskDue.value = task?.due || todayOffset(3);
  els.taskPriority.value = task?.priority || "中";
  els.taskNext.value = task?.next || "";
  els.taskLink.value = task?.link || "";
  els.taskNotes.value = task?.notes || "";
  els.dialog.showModal();
}

function closeTaskDialog() {
  els.dialog.close();
}

function saveTask(event) {
  event.preventDefault();
  const id = els.taskId.value || crypto.randomUUID();
  const type = els.taskType.value;
  const existingTask = state.tasks.find((item) => item.id === id);
  const task = {
    id,
    type,
    title: els.taskTitle.value.trim(),
    project: els.taskProject.value.trim() || (type === "todo" ? "Todo" : "Issue"),
    owner: els.taskOwner.value,
    due: els.taskDue.value,
    status: els.taskStatus.value,
    priority: els.taskPriority.value,
    next: els.taskNext.value.trim(),
    link: normalizeUrl(els.taskLink.value),
    order: Number.isFinite(existingTask?.order) ? existingTask.order : Date.now(),
    notes: els.taskNotes.value.trim()
  };

  const index = state.tasks.findIndex((item) => item.id === id);
  if (index >= 0) {
    state.tasks[index] = task;
  } else {
    state.tasks.unshift(task);
  }

  closeTaskDialog();
  render();
}

function deleteCurrentTask() {
  const id = els.taskId.value;
  if (!id) return;
  state.tasks = state.tasks.filter((task) => task.id !== id);
  closeTaskDialog();
  render();
}

function updateTask(id, patch) {
  state.tasks = state.tasks.map((task) => task.id === id ? { ...task, ...patch } : task);
}

function filteredTasks() {
  return state.tasks.filter((task) => {
    const haystack = `${task.type} ${task.title} ${task.project} ${task.owner} ${task.status} ${task.priority} ${task.next} ${task.notes}`.toLowerCase();
    const matchSearch = !filters.search || haystack.includes(filters.search);
    const matchOwner = filters.owner === "all" || task.owner === filters.owner;
    const matchPriority = filters.priority === "all" || task.priority === filters.priority;
    return matchSearch && matchOwner && matchPriority;
  });
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
  localStorage.setItem(storageKey, JSON.stringify(state));
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
    return {
      ...task,
      id: task.id || crypto.randomUUID(),
      type,
      project: task.project || (type === "todo" ? "Todo" : "Issue"),
      owner: task.owner || migrated.members[0] || "自分",
      due: task.due || todayOffset(3),
      status: type === "todo" ? (validTodoStatus ? mappedStatus : todoOpenStatus) : (validIssueStatus ? mappedStatus : migrated.workflow[0]),
      priority: priorities.includes(task.priority) ? task.priority : "中",
      next: task.next || "次のアクションを確認する。",
      link: normalizeUrl(task.link || extractUrl(task.notes || "")),
      order: Number.isFinite(task.order) ? task.order : index,
      notes: task.notes || ""
    };
  });

  migrated.workflow = [...new Set(migrated.workflow.map(normalizeName).filter(Boolean))];
  if (!migrated.workflow.length) migrated.workflow = defaultWorkflow;
  return migrated;
}

function sortByUrgency(a, b) {
  const doneWeight = (task) => isDone(task) ? 3 : 0;
  const typeWeight = (task) => task.type === "issue" ? -1 : 0;
  const priorityWeight = { 高: -3, 中: -2, 低: -1 };
  return doneWeight(a) - doneWeight(b)
    || daysUntil(a.due) - daysUntil(b.due)
    || priorityWeight[a.priority] - priorityWeight[b.priority]
    || typeWeight(a) - typeWeight(b);
}

function sortByBoardOrder(a, b) {
  const orderA = Number.isFinite(a.order) ? a.order : 0;
  const orderB = Number.isFinite(b.order) ? b.order : 0;
  return orderA - orderB || sortByUrgency(a, b);
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const group = item[key] || "未分類";
    acc[group] = acc[group] || [];
    acc[group].push(item);
    return acc;
  }, {});
}

function currentView() {
  return document.querySelector(".view.active")?.id.replace("View", "") || "dashboard";
}

function isDone(task) {
  return task.type === "todo" ? task.status === todoDoneStatus : task.status === completedStatus;
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

function formatDue(dateString) {
  const diff = daysUntil(dateString);
  if (diff < 0) return `${Math.abs(diff)}日遅れ`;
  if (diff === 0) return "本日締切";
  if (diff === 1) return "明日締切";
  return `${dateString} 期限`;
}

function todayOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
