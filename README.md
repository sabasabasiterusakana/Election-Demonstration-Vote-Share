# 模擬投票サイト（Googleログイン対応版）

## フォルダ構成

```
voting-sim/
├── index.html      # 投票ページ（Googleログイン必須）
├── results.html    # 集計・投票ログページ
├── admin.html      # 管理者ページ（候補者追加・削除・リセット）
├── firebase.js     # ★ Firebase設定ファイル（ここを編集）
├── style.css       # 共通スタイル
└── README.md       # このファイル
```

---

## セットアップ手順（初回のみ）

### STEP 1 — Firebaseプロジェクトを作成

1. https://console.firebase.google.com にアクセス（Googleアカウントでログイン）
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を入力（例: `voting-sim`）
4. Google アナリティクスは「無効」でOK → 「プロジェクトを作成」

---

### STEP 2 — Webアプリを登録して firebase.js を編集

1. プロジェクトのトップページで `</>` アイコン（Webアプリを追加）をクリック
2. アプリのニックネームを入力（例: `voting-web`）→「アプリを登録」
3. 表示される `firebaseConfig` の内容をコピー
4. **`firebase.js`** を開き、`YOUR_...` の部分を書き換える

```js
// firebase.js の書き換え箇所
const firebaseConfig = {
  apiKey: "ここにコピーした値",
  authDomain: "ここにコピーした値",
  projectId: "ここにコピーした値",
  storageBucket: "ここにコピーした値",
  messagingSenderId: "ここにコピーした値",
  appId: "ここにコピーした値",
};

const ADMIN_PASSCODE = "好きなパスコードに変更";
```

---

### STEP 3 — Google認証を有効化

1. Firebase Console 左メニュー →「Authentication」→「始める」2.「Sign-in method」タブ →「Google」→「有効にする」
2. プロジェクトのサポートメール（自分のGmailアドレス）を入力 →「保存」

---

### STEP 4 — Firestore Database を有効化

1. Firebase Console 左メニュー →「Firestore Database」→「データベースを作成」2.「テストモードで開始」を選択（30日間無料で読み書き可能）
2. ロケーション：`asia-northeast1`（東京）を選択 →「有効にする」

**⚠️ テストモード終了後のセキュリティルール（30日後に設定推奨）:**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 選挙設定・候補者：誰でも読める
    match /election/{doc} {
      allow read: if true;
      allow write: if false; // 管理はAdmin SDKで行う想定
    }
    match /candidates/{id} {
      allow read: if true;
      allow write: if false;
    }

    // 投票：ログイン済みユーザーのみ・自分のレコードのみ書ける
    match /votes/{uid} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == uid;
      allow update, delete: if false;
    }
  }
}
```

---

### STEP 5 — GitHub Pages で公開

1. GitHubで新しいリポジトリを作成（**Public**）
2. `voting-sim/` フォルダの**中のファイルをすべて**アップロード
   （フォルダごとではなく、ファイルを直接ルートに置く）
3. Settings → Pages → Branch: `main` / `root` → 「Save」
4. 数分後に `https://ユーザー名.github.io/リポジトリ名/` で公開

**⚠️ 重要：GitHub PagesのURLをFirebaseに登録する**

GitHub Pagesで公開したら、以下の手順でURLを許可リストに追加してください：

1. Firebase Console →「Authentication」→「Settings」タブ2.「承認済みドメイン」→「ドメインを追加」
2. `ユーザー名.github.io` を追加

---

## 機能一覧

| ページ         | 機能                                                       |
| -------------- | ---------------------------------------------------------- |
| `index.html`   | Googleログイン → 候補者一覧 → 投票（1人1票）               |
| `results.html` | リアルタイム集計・円グラフ・棒グラフ・投票ログ（誰が誰に） |
| `admin.html`   | パスコード保護・候補者追加/削除・投票リセット              |

## Firestoreのデータ構造

```
/election/config          { name: "選挙名" }
/candidates/{id}          { name, party, status, bio, tags, aiAnalysis, color, votes, createdAt }
/votes/{uid}              { candidateId, candidateName, voterName, voterEmail, voterPhoto, votedAt }
```

`votes` のドキュメントIDがGoogleの `uid`（ユーザーID）なので、
同じGoogleアカウントでは絶対に2回投票できません。
