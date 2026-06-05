const defaultWorkflow = ["调查", "修正", "测试", "MR"];
const completedStatus = "已完成";
const todoOpenStatus = "待办";
const todoDoneStatus = "已完成";
const priorities = ["高", "中", "低"];
const defaultMembers = ["我", "成员A", "成员B", "成员C", "成员D", "成员E"];
const storageKey = "follow-manager-v1";

const sampleTasks = [
  issueTask("确认 Issue 处理流程", "团队管理", "我", todayOffset(0), "调查", "高", "把 Issue 从调查、修正、测试、MR 四步跑通。", "流程可以在 Issue 页面自定义。"),
  issueTask("客户反馈页面异常", "客户项目", "成员A", todayOffset(2), "修正", "高", "定位触发条件，修正后提交 MR。", ""),
  issueTask("回归测试登录流程", "产品稳定性", "成员B", todayOffset(1), "测试", "中", "按测试清单验证修复影响范围。", ""),
  todoTask("整理客户临时需求 memo", "我", todayOffset(1), "中", "把 txt 里的散点需求整理成 Todo，再决定是否转 Issue。", "")
];

let state = migrateState(loadState());
let dataFileHandle = null;
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
    alert("当前浏览器不支持直接打开数据文件。请使用右上角导入按钮，或在 Windows 的 Chrome / Edge 中使用。");
    return;
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{
        description: "TaskManager 数据文件",
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
    alert("数据文件已打开。之后修改后请点“保存到数据文件”。");
  } catch (error) {
    if (error.name !== "AbortError") {
      alert("打开失败，请确认选择的是本工具的数据 JSON 文件。");
    }
  }
}

async function saveDataFile() {
  if (!window.showSaveFilePicker) {
    exportData();
    alert("当前浏览器不支持直接写入文件，已改为下载备份 JSON。");
    return;
  }

  try {
    if (!dataFileHandle) {
      dataFileHandle = await window.showSaveFilePicker({
        suggestedName: `task-manager-${new Date().toISOString().slice(0, 10)}.json`,
        types: [{
          description: "TaskManager 数据文件",
          accept: { "application/json": [".json"] }
        }]
      });
    }
    const writable = await dataFileHandle.createWritable();
    await writable.write(JSON.stringify(state, null, 2));
    await writable.close();
    alert("已保存到数据文件。");
  } catch (error) {
    if (error.name !== "AbortError") {
      alert("保存失败。请尝试右上角导出备份。");
    }
  }
}

function renderFilterOptions() {
  const ownerOptions = [`<option value="all">全部负责人</option>`]
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
    : `<div class="focus-item">暂无待跟进事项</div>`;
}

function renderDashboard() {
  const visible = filteredTasks();
  const openTasks = state.tasks.filter((task) => !isDone(task));
  const overdue = openTasks.filter((task) => daysUntil(task.due) < 0);
  const issues = openTasks.filter((task) => task.type === "issue");
  const todos = openTasks.filter((task) => task.type === "todo");

  els.dashboardView.innerHTML = `
    <div class="stats-grid">
      ${stat("未完成事项", openTasks.length)}
      ${stat("Issue 进行中", issues.length)}
      ${stat("Todo 待办", todos.length)}
      ${stat("已逾期", overdue.length)}
    </div>
    ${taskSection("需要优先处理", visible.filter((task) => !isDone(task)).sort(sortByUrgency).slice(0, 8))}
    ${taskSection("最近完成", visible.filter(isDone).slice(0, 8))}
  `;
  wireTaskButtons(els.dashboardView);
}

function renderBoard() {
  const visible = filteredTasks().filter((task) => task.type === "issue" && task.status !== completedStatus);
  els.boardView.innerHTML = `
    <div class="workflow-panel">
      <form id="workflowForm" class="workflow-form">
        <input id="newStepName" maxlength="20" placeholder="新增流程步骤">
        <button class="primary-button" type="submit">新增步骤</button>
      </form>
      <div class="workflow-list">
        ${state.workflow.map((step, index) => workflowStepRow(step, index)).join("")}
      </div>
    </div>
    <div class="board">
      ${state.workflow.map((status) => {
        const tasks = visible.filter((task) => task.status === status).sort(sortByUrgency);
        return `
          <div class="column">
            <div class="column-title"><span>${escapeHtml(status)}</span><span class="tag">${tasks.length}</span></div>
            <div class="cards">${tasks.length ? tasks.map(taskCard).join("") : `<div class="empty">暂无 Issue</div>`}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
  wireWorkflowButtons();
  wireTaskButtons(els.boardView);
}

function workflowStepRow(step, index) {
  const used = state.tasks.some((task) => task.type === "issue" && task.status === step);
  return `
    <div class="workflow-row">
      <input value="${escapeHtml(step)}" data-step-name="${index}" aria-label="流程步骤名称">
      <span class="tag">${used ? "使用中" : "未使用"}</span>
      <button class="tiny-button" data-save-step="${index}" type="button">保存</button>
      <button class="tiny-button" data-delete-step="${index}" type="button" ${used || state.workflow.length <= 1 ? "disabled" : ""}>删除</button>
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
        <textarea id="todoMemo" rows="5" placeholder="把 txt 里的临时事项粘贴到这里；每一行会变成一个 Todo"></textarea>
        <div class="todo-actions">
          <input id="todoTxtFile" type="file" accept=".txt,text/plain">
          <button class="primary-button" type="submit">加入 Todo</button>
        </div>
      </form>
    </div>
    ${taskSection("Todo 待办", open)}
    ${taskSection("Todo 已完成", done)}
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
        <td>${next ? `${escapeHtml(next.title)}<br><span class="meta">${taskLabel(next)} · ${escapeHtml(next.owner)} · ${formatDue(next.due)}</span>` : "暂无"}</td>
      </tr>
    `;
  }).join("");

  els.projectsView.innerHTML = rows
    ? `<table class="list-table"><thead><tr><th>项目</th><th>事项数</th><th>完成度</th><th>高优先级未完成</th><th>下一件事</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<div class="empty">暂无项目</div>`;
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
        <td>${next ? `${escapeHtml(next.title)}<br><span class="meta">${taskLabel(next)} · ${formatDue(next.due)}</span>` : "暂无"}</td>
      </tr>
    `;
  }).join("");

  const memberRows = state.members.map((member, index) => {
    const assigned = state.tasks.filter((task) => task.owner === member).length;
    return `
      <div class="member-row">
        <input value="${escapeHtml(member)}" data-member-name="${index}" aria-label="成员名称">
        <span class="tag">${assigned} 个事项</span>
        <button class="tiny-button" data-save-member="${index}" type="button">保存</button>
        <button class="tiny-button" data-delete-member="${index}" type="button" ${assigned ? "disabled" : ""}>删除</button>
      </div>
    `;
  }).join("");

  els.peopleView.innerHTML = `
    <div class="member-panel">
      <form id="memberForm" class="member-form">
        <input id="newMemberName" maxlength="24" placeholder="新增成员姓名">
        <button class="primary-button" type="submit">新增成员</button>
      </form>
      <div class="member-list">${memberRows}</div>
    </div>
    <table class="list-table"><thead><tr><th>负责人</th><th>未完成</th><th>Issue</th><th>Todo</th><th>逾期</th><th>下一件事</th></tr></thead><tbody>${rows}</tbody></table>
  `;
  wireMemberButtons();
}

function taskSection(title, tasks) {
  return `
    <div class="section-title"><h3>${title}</h3><span class="tag">${tasks.length}</span></div>
    <div class="cards">${tasks.length ? tasks.map(taskCard).join("") : `<div class="empty">暂无事项</div>`}</div>
  `;
}

function taskCard(task) {
  const urgencyClass = daysUntil(task.due) < 0 && !isDone(task) ? "overdue" : daysUntil(task.due) <= 2 && !isDone(task) ? "soon" : "";
  const priorityClass = task.priority === "高" ? "high" : task.priority === "中" ? "middle" : "low";
  const canAdvance = task.type === "issue" && task.status !== completedStatus;
  const canFinish = !isDone(task);
  return `
    <article class="task-card ${urgencyClass}">
      <h4>${escapeHtml(task.title)}</h4>
      <div class="meta">${taskLabel(task)} · ${escapeHtml(task.project)} · ${escapeHtml(task.owner)} · ${formatDue(task.due)}</div>
      <p class="next">${escapeHtml(task.next)}</p>
      <div class="tags">
        <span class="tag ${priorityClass}">${task.priority}</span>
        <span class="tag">${escapeHtml(task.status)}</span>
      </div>
      <div class="card-actions">
        <button class="tiny-button" data-edit="${task.id}" type="button">编辑</button>
        ${task.type === "todo" && task.status !== todoDoneStatus ? `<button class="tiny-button" data-convert="${task.id}" type="button">转 Issue</button>` : ""}
        ${canAdvance && nextWorkflowStep(task.status) ? `<button class="tiny-button" data-advance="${task.id}" type="button">下一步</button>` : ""}
        ${canFinish ? `<button class="tiny-button" data-done="${task.id}" type="button">完成</button>` : ""}
      </div>
    </article>
  `;
}

function wireTaskButtons(root) {
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

function wireWorkflowButtons() {
  const form = els.boardView.querySelector("#workflowForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = els.boardView.querySelector("#newStepName");
    addWorkflowStep(input.value);
  });

  els.boardView.querySelectorAll("[data-save-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.saveStep);
      const input = els.boardView.querySelector(`[data-step-name="${index}"]`);
      renameWorkflowStep(index, input.value);
    });
  });

  els.boardView.querySelectorAll("[data-delete-step]").forEach((button) => {
    button.addEventListener("click", () => deleteWorkflowStep(Number(button.dataset.deleteStep)));
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
    alert("请输入流程步骤名称。");
    return;
  }
  if (state.workflow.includes(name) || name === completedStatus) {
    alert("这个流程步骤已经存在。");
    return;
  }
  state.workflow.push(name);
  render();
}

function renameWorkflowStep(index, rawName) {
  const oldName = state.workflow[index];
  const newName = normalizeName(rawName);
  if (!oldName || !newName) {
    alert("流程步骤不能为空。");
    renderBoard();
    return;
  }
  if (oldName === newName) return;
  if (state.workflow.includes(newName) || newName === completedStatus) {
    alert("这个流程步骤已经存在。");
    renderBoard();
    return;
  }
  state.workflow[index] = newName;
  state.tasks = state.tasks.map((task) => task.type === "issue" && task.status === oldName ? { ...task, status: newName } : task);
  render();
}

function deleteWorkflowStep(index) {
  const step = state.workflow[index];
  if (!step || state.workflow.length <= 1) return;
  const used = state.tasks.some((task) => task.type === "issue" && task.status === step);
  if (used) {
    alert("这个步骤还有 Issue，请先移动或完成这些 Issue。");
    return;
  }
  state.workflow = state.workflow.filter((_, stepIndex) => stepIndex !== index);
  render();
}

function addTodosFromText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    alert("没有可加入的 Todo。");
    return;
  }
  const todos = lines.map((line) => todoTask(line, state.members[0] || "我", todayOffset(1), "中", "确认是否需要推进、转 Issue 或归档。", "来自 memo/txt 快速录入。"));
  state.tasks = [...todos, ...state.tasks];
  render();
}

function addMember(rawName) {
  const name = normalizeName(rawName);
  if (!name) {
    alert("请输入成员姓名。");
    return;
  }
  if (state.members.includes(name)) {
    alert("这个成员已经存在。");
    return;
  }
  state.members.push(name);
  render();
}

function renameMember(index, rawName) {
  const oldName = state.members[index];
  const newName = normalizeName(rawName);
  if (!oldName || !newName) {
    alert("成员姓名不能为空。");
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
    alert("这个成员还有事项，请先编辑负责人再删除。");
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
    dashboard: "工作总览",
    board: "Issue 看板",
    todo: "Todo 收件箱",
    projects: "项目总览",
    people: "成员跟进"
  };
  els.navButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  els.pageTitle.textContent = titles[view];
}

function openTaskDialog(id) {
  const task = id ? state.tasks.find((item) => item.id === id) : null;
  const defaultType = currentView() === "todo" ? "todo" : "issue";
  const type = task?.type || defaultType;
  els.dialogTitle.textContent = task ? "编辑事项" : "新建事项";
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
      alert("导入失败，请选择由本工具导出的 JSON 文件。");
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
  const migrated = {
    members: Array.isArray(rawState?.members) ? rawState.members : defaultMembers,
    workflow: Array.isArray(rawState?.workflow) && rawState.workflow.length ? rawState.workflow : defaultWorkflow,
    tasks: Array.isArray(rawState?.tasks) ? rawState.tasks : sampleTasks
  };
  const oldStatusMap = {
    "待确认": "调查",
    "待处理": "调查",
    "进行中": "修正",
    "等待反馈/阻塞": "测试",
    "本周完成": completedStatus
  };

  migrated.tasks = migrated.tasks.map((task) => {
    const type = task.type === "todo" ? "todo" : "issue";
    const fallbackStatus = type === "todo" ? todoOpenStatus : migrated.workflow[0];
    const mappedStatus = oldStatusMap[task.status] || task.status || fallbackStatus;
    const validIssueStatus = [...migrated.workflow, completedStatus].includes(mappedStatus);
    const validTodoStatus = [todoOpenStatus, todoDoneStatus].includes(mappedStatus);
    return {
      ...task,
      id: task.id || crypto.randomUUID(),
      type,
      project: task.project || (type === "todo" ? "Todo" : "Issue"),
      owner: task.owner || migrated.members[0] || "我",
      due: task.due || todayOffset(3),
      status: type === "todo" ? (validTodoStatus ? mappedStatus : todoOpenStatus) : (validIssueStatus ? mappedStatus : migrated.workflow[0]),
      priority: priorities.includes(task.priority) ? task.priority : "中",
      next: task.next || "确认下一步动作。",
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

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const group = item[key] || "未归类";
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
  if (diff < 0) return `逾期 ${Math.abs(diff)} 天`;
  if (diff === 0) return "今天到期";
  if (diff === 1) return "明天到期";
  return `${dateString} 到期`;
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
