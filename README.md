# X Bookmark Archiver

自分のXブックマークを、ログイン済みブラウザの画面からローカルへ保存する個人用アーカイバです。X公式APIや非公式APIを呼び出さないため、API利用料金は発生しません。

投稿本文、投稿URL、投稿者、日時、画像、および画面上で確認できた投稿者本人の返信を、投稿ごとのMarkdownとJSONに保存します。Xの長文記事も画面から取得を試みます。

## 大切な注意事項

- 自分のアカウントと、自分が閲覧できる内容にだけ使用してください。
- Xの利用規約、著作権、投稿者のプライバシーを守ってください。
- CAPTCHA、追加認証、アクセス制限は回避しません。表示された場合は自動処理を停止します。
- DOMだけを読み取るため、Xの画面構造が変わると修正が必要になる場合があります。
- 削除済み・非公開・表示されなかった返信まで完全に復元するものではありません。
- 動画は画面上のポスター画像だけになる場合があります。

## 必要環境

- Node.js 20以上
- Windows 10/11（自動実行用スクリプト）。手動実行自体はmacOS/Linuxでも可能です。

## インストール

```powershell
corepack enable
pnpm install
pnpm exec playwright install chromium
```

必要に応じて `.env.example` を `.env` にコピーして設定を変更できます。`.env` は自動的に読み込まれ、Gitには含まれません。

## 初回ログイン

Windowsでは、Node.jsがPATHにない場合もCodex付属版を検出するランチャーを利用できます。

```powershell
powershell -ExecutionPolicy Bypass -File .\xba.ps1 setup
```

表示されたChromiumでXへログインしてください。ログイン完了を検出すると、ブックマーク画面を確認して自動的にブラウザを閉じます。Cookieを含むブラウザプロフィールは `.browser-profile/` に保存され、Gitには含まれません。

## 1回実行

```powershell
powershell -ExecutionPolicy Bypass -File .\xba.ps1 run
```

既定の保存先は `archive/` です。

```text
archive/
├── .state.json
└── 2026-01-01-1234567890/
    ├── README.md
    ├── post.json
    └── media/
```

`archive/` は公開リポジトリに誤って含まれないよう `.gitignore` で除外されています。Google DriveやDropboxの同期フォルダへ保存する場合は、`XBA_ARCHIVE_DIR` にその絶対パスを指定してください。

## Windowsで15分ごとに自動実行

初回ログインと手動実行が成功した後、PowerShellで次を実行します。

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Install-ScheduledTask.ps1 -Minutes 15
```

タスクは同時に複数起動せず、前回処理中なら次回をスキップします。PCが停止中の実行は、次回起動時に補われます。

## 設定

| 環境変数 | 既定値 | 説明 |
|---|---:|---|
| `XBA_ARCHIVE_DIR` | `archive` | 保存先 |
| `XBA_PROFILE_DIR` | `.browser-profile` | ログイン済みChromiumプロフィール |
| `XBA_HEADLESS` | `true` | 通常実行時にブラウザを非表示にする |
| `XBA_BOOKMARK_LIMIT` | `50` | 1回に調べるブックマーク上限 |
| `XBA_BOOKMARK_SCROLLS` | `8` | ブックマーク一覧のスクロール回数 |
| `XBA_THREAD_SCROLLS` | `10` | 返信画面のスクロール回数 |
| `XBA_SCROLL_DELAY_MS` | `1200` | スクロール後の待機時間 |
| `XBA_SETUP_TIMEOUT_MS` | `600000` | 初回ログインを待つ時間（ミリ秒） |

例:

```powershell
$env:XBA_ARCHIVE_DIR = "D:\XArchive"
pnpm run archive
```

## 診断とテスト

```powershell
powershell -ExecutionPolicy Bypass -File .\xba.ps1 doctor
pnpm run test
```

macOS/Linux、またはNode.jsがPATHにある環境では、従来どおり `pnpm run setup`、`pnpm run archive`、`pnpm run doctor` も使用できます。

## ライセンス

[MIT](./LICENSE)
