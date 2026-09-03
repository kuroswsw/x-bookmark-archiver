# X Bookmark Archiver

XへログインしたChromiumをLinux VPS上で常駐させ、自分のブックマークを定期的に保存するアーカイバです。X公式APIや非公式APIは呼び出さず、ブラウザに表示されたDOMだけを読み取ります。

既定では60秒間隔でブックマークを確認し、投稿本文、投稿者本人の返信、X長文記事、画像、元データJSONをVPSへ保存します。

## できること

- Linux VPS上でDocker Composeによる常時稼働
- API料金なしの約60秒ポーリング
- Markdown、JSON、投稿画像、記事画像の保存
- 投稿者本人による返信一覧の保存
- 保存済みIDの記録による重複防止
- Windows上での単発実行とタスクスケジューラ実行

## 制約

公式APIを使わないため、Xからブックマーク追加イベントを受け取るWebhookはありません。完全なリアルタイム検出はできず、既定では最大約60秒＋画面読み込み時間の遅延があります。30秒未満の巡回はコード側で禁止しています。短すぎる巡回はXの制限を受ける可能性が高くなります。

また、次の制約があります。

- Xの追加認証、CAPTCHA、アクセス制限は回避しません。
- XのログインセッションはVPSの `vps-data/profile/` に保存されます。このディレクトリを取得した人はアカウントへアクセスできる可能性があります。
- DOMだけを読み取るため、Xの画面構造が変わると修正が必要になる場合があります。
- 削除済み・非公開・画面に表示されなかった返信までは復元できません。
- 動画はポスター画像だけになる場合があります。

## VPSの必要環境

- Linux VPS（x86_64推奨）
- Docker Engine
- Docker Compose v2
- SSHで接続できること
- Chromiumを動かせる2GB以上のメモリ（4GB推奨）

## VPSへ配置

```bash
git clone https://github.com/kuroswsw/x-bookmark-archiver.git
cd x-bookmark-archiver
cp .env.vps.example .env.vps
docker compose build
```

保存データとログインプロフィールは、リポジトリ内の `vps-data/` に作成され、Gitには含まれません。

## 初回ログイン

ログイン画面用noVNCはVPSの `127.0.0.1:6080` だけで待ち受けます。Xのログイン画面をインターネットへ直接公開しないでください。

まず手元のPCからSSHトンネルを作ります。

```bash
ssh -L 6080:localhost:6080 VPSユーザー@VPSのホスト名
```

そのSSH接続を開いたまま、VPS側の別セッションでセットアップコンテナを起動します。

```bash
cd x-bookmark-archiver
docker compose --profile setup run --service-ports --rm setup
```

手元のブラウザで次を開きます。

```text
http://localhost:6080/vnc.html?autoconnect=1&resize=scale
```

noVNC内のChromiumでXへログインしてください。ログインを検出するとプロフィールを保存し、セットアップコンテナが自動終了します。noVNCにはパスワードを設定していませんが、ポートはVPSのループバックアドレスだけにバインドされ、SSHトンネル経由でのみ利用します。

ログイン直後にXから一時的な制限が表示された場合は、繰り返し試行せず時間を置いてください。

## 常駐監視を開始

```bash
docker compose up -d archiver
docker compose logs -f archiver
```

正常に動作すると、次のようなログが表示されます。

```text
常駐監視を開始します（60秒間隔）。
50件を確認、2件が未保存です。
```

停止と再起動:

```bash
docker compose stop archiver
docker compose restart archiver
```

## 保存場所

```text
vps-data/
├── profile/                  # Xログインセッション（機密）
└── archive/
    ├── .state.json
    └── 2026-01-01-1234567890/
        ├── README.md
        ├── post.json
        └── media/
```

`vps-data/profile/` は所有者だけがアクセスできる権限にしてください。

```bash
chmod -R go-rwx vps-data/profile
```

## 巡回間隔と取得範囲

`.env.vps` で変更します。

| 環境変数 | 既定値 | 説明 |
|---|---:|---|
| `XBA_POLL_INTERVAL_SECONDS` | `60` | 巡回間隔。最小30秒 |
| `XBA_BOOKMARK_LIMIT` | `50` | 1回に確認するブックマーク数 |
| `XBA_BOOKMARK_SCROLLS` | `4` | ブックマーク一覧のスクロール回数 |
| `XBA_THREAD_SCROLLS` | `10` | 返信画面のスクロール回数 |
| `XBA_SCROLL_DELAY_MS` | `1200` | スクロール後の待機時間 |
| `XBA_ARCHIVE_DIR` | `/data/archive` | コンテナ内保存先 |
| `XBA_PROFILE_DIR` | `/data/profile` | コンテナ内プロフィール |

変更後はコンテナを作り直します。

```bash
docker compose up -d --force-recreate archiver
```

## 更新

```bash
git pull
docker compose build --pull
docker compose up -d --force-recreate archiver
```

## Windowsでの利用

従来のPlaywright版も利用できます。初回ログイン:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\xba.ps1 setup
```

単発実行:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\xba.ps1 run
```

15分ごとのタスク登録:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Install-ScheduledTask.ps1 -Minutes 15
```

## 開発者向け検証

```bash
corepack enable
pnpm install
pnpm test
```

## セキュリティと利用上の注意

- 自分のアカウントと、自分が閲覧できる内容にだけ使用してください。
- `vps-data/`、`.browser-profile/`、`.env` をGitへ追加しないでください。
- Xの利用規約、著作権、投稿者のプライバシーを守ってください。
- VPS自体を更新し、SSH鍵認証やファイアウォールなどの基本的な保護を行ってください。

## ライセンス

[MIT](./LICENSE)
