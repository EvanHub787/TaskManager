# Follow 工作管理

一个本地运行的轻量项目管理工具，用于管理 Issue 流程、Todo 收件箱、成员和项目进度。

## 功能

- Issue 看板：默认流程为 `调查 -> 修正 -> 测试 -> MR`
- 自定义流程：可新增、重命名、删除 Issue 步骤
- Todo 收件箱：支持粘贴多行 memo，每行生成一个 Todo
- txt 导入：可把 `.txt` memo 导入为 Todo
- Todo 转 Issue：临时事项确认后可进入 Issue 流程
- 成员管理：新增、重命名、删除成员
- 数据保存：浏览器本地缓存，支持 JSON 导入导出和数据文件保存

## 使用方式

直接用浏览器打开 `index.html`。

如果需要通过本地服务访问：

```bash
python3 -m http.server 4173
```

然后打开：

```text
http://localhost:4173/
```

## 数据说明

默认数据保存在浏览器 `localStorage` 中，key 为：

```text
follow-manager-v1
```

建议定期使用页面右上角的导出功能备份 JSON 数据。支持 File System Access API 的浏览器可以使用“打开数据文件 / 保存到数据文件”。
