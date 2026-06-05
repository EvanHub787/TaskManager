# TaskManager

Issue 対応フロー、Todo 受信箱、メンバー、案件進捗をローカルで管理する軽量ツールです。

## 機能

- Issue 看板: デフォルトフローは `調査中 -> 修正中 -> テスト中 -> MR`
- フロー編集: Issue ステップの追加、名称変更、削除
- Todo 受信箱: 複数行の memo を貼り付けると、1行ごとに Todo を作成
- txt インポート: `.txt` の memo を Todo として取り込み
- Todo の Issue 化: 一時対応項目を Issue フローへ移動
- メンバー管理: メンバーの追加、名称変更、削除
- データ保存: ブラウザのローカル保存、JSON インポート/エクスポート、データファイル保存

## 使い方

ブラウザで `index.html` を直接開きます。

ローカルサーバーで開く場合:

```bash
python3 -m http.server 4173
```

その後、次の URL を開きます。

```text
http://localhost:4173/
```

## データについて

デフォルトではブラウザの `localStorage` に保存されます。key は互換性維持のため次のままです。

```text
follow-manager-v1
```

定期的に右上のエクスポート機能で JSON バックアップを作成してください。File System Access API 対応ブラウザでは「データファイルを開く / データファイルへ保存」も利用できます。
