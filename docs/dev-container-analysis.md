# HTTP Market App 技術スタック分析

このドキュメントは、market-app と centoral-server の技術スタックと構造を分析し、Dev Container 設定を作成するための基礎情報をまとめたものです。

## 技術スタック分析

### 共通技術

- **Node.js**: 両アプリケーションとも Node.js で実装されています
- **ES モジュール**: 両アプリケーションとも `type: "module"` を使用しています
- **JSON ファイルストレージ**: データベースの代わりに JSON ファイルを使用しています

### market-app

- **フレームワーク**: Express.js
- **HTTP クライアント**: axios
- **データストレージ**: JSON ファイル

### centoral-server

- **フレームワーク**: Express.js
- **HTTP クライアント**: axios
- **データストレージ**: JSON ファイル
- **ヘルスチェック機能**: 定期的に各マーケットの状態を確認

## 依存関係

### market-app

```json
"dependencies": {
  "express": "^4.18.2",
  "axios": "^1.6.2"
}
```

### centoral-server

```json
"dependencies": {
  "express": "^4.18.2",
  "axios": "^1.6.2"
}
```

## 実行方法

### market-app

- **起動コマンド**: `npm start`
- **実行ファイル**: `src/my-store.js`
- **ポート**: 8081

### centoral-server

- **起動コマンド**: `npm start`
- **実行ファイル**: `src/central-server.js`
- **ポート**: 8090

## 開発環境で必要なツールやサービス

- **Node.js**: バージョン 18 以上
- **npm**: パッケージ管理
- **VS Code**: 推奨される開発環境
- **ESLint**: コード品質管理（推奨）
- **Prettier**: コードフォーマット（推奨）

## Dev Container 設定

Dev Container 設定ファイル (`.devcontainer/devcontainer.json`) を作成しました。この設定には以下の要素が含まれています：

- **ベースイメージ**: `node:18`
- **ポート転送**:
  - market-app: 8081
  - centoral-server: 8090
- **初期化コマンド**: `npm install`
- **推奨拡張機能**:
  - ESLint
  - Prettier

### 設定ファイルの内容

```json
{
  "name": "HTTP Market App Development",
  "image": "node:18",
  "portsAttributes": {
    "8081": {
      "label": "Market App",
      "onAutoForward": "openBrowser"
    },
    "8090": {
      "label": "Central Server",
      "onAutoForward": "openBrowser"
    }
  },
  "forwardPorts": [8081, 8090],
  "postCreateCommand": "npm install",
  "remoteUser": "node",
  "customizations": {
    "vscode": {
      "settings": {
        "terminal.integrated.shell.linux": "/bin/bash"
      },
      "extensions": ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"]
    }
  }
}
```

## 使用方法

1. VS Code で「Reopen in Container」を選択
2. コンテナのビルドと初期化が完了するのを待つ
3. ターミナルで以下のコマンドを実行して各アプリを起動:

   ```bash
   # centoral-server を起動
   cd centoral-server
   npm start

   # 別のターミナルで market-app を起動
   cd market-app
   npm start
   ```

4. ブラウザで以下の URL にアクセス:
   - centoral-server: http://localhost:8090
   - market-app: http://localhost:8081
