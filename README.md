# http-market-app

JavaScript とネットワークプログラミングの学習を目的とした、軽量なマーケットアプリ。
すべての商品取引は HTTP 経由で、自分または他者が立てた Node.js サーバーとの通信で行われます。

各参加者は自分の店（学生サーバー）を立て、商品を登録し、中央サーバー（教師サーバー）に
マーケット情報を公開します。他の店の `/buy` エンドポイントへ HTTP リクエストを送ることで取引が成立します。

## 構成

| パッケージ | 役割 | 既定ポート | 起動エントリ |
| --- | --- | --- | --- |
| `centoral-server/` | マーケット情報サーバー（中央／教師サーバー）。店の登録受付・一覧配信・ヘルスチェック。 | `8090` | `src/central-server.js` |
| `market-app/` | 店側アプリケーション（学生サーバー）。商品定義・購入 API・資産管理・Web UI。 | `8082` | `src/my-store.js` |

```
[ market-app (店A) ] --register/markets--> [ centoral-server ]
        |  ^                                       |
        |  | buy                                   | health check
        v  |                                       v
[ market-app (店B) ] <-----------------------------+
```

ファイル I/O は各パッケージの `src/db.js`（`readJSON` / `writeJSON`）経由に統一されています。
状態はローカル JSON ファイル（`data/` 配下）に永続化されます。

- `centoral-server/data/markets.json` — 登録済みマーケット一覧
- `market-app/data/assets.json` — 資金・仕入れポイント・在庫・コレクション
- `market-app/data/product.json` — 自店の商品定義
- `market-app/data/transactions.json` — 取引ログ

## セットアップ

各パッケージはそれぞれ独立した npm パッケージです。

```sh
cd centoral-server && ni
cd ../market-app && ni
```

## 起動

中央サーバーを先に起動します。

```sh
# 中央サーバー（教師サーバー）
cd centoral-server
nr start            # → http://localhost:8090
```

```sh
# 店側アプリ（学生サーバー）
cd market-app
nr start            # → http://localhost:8082
```

起動すると店側アプリは Web UI を提供します。ブラウザで `http://localhost:8082/` を開いてください。

ポートは環境変数 `PORT` で上書きできます。

```sh
PORT=8083 nr start
```

> 接続先の中央サーバーは `market-app/src/config.js` の `CENTRAL_SERVER` で指定します。
> ローカルで完結させる場合は `http://localhost:8090` に変更してください。

## API

### 中央サーバー（`centoral-server`）

| メソッド | パス | 説明 |
| --- | --- | --- |
| `GET` | `/` | サーバー情報・エンドポイント一覧 |
| `GET` | `/markets` | 登録済みマーケット一覧を取得 |
| `POST` | `/register` | マーケットを登録（`{ ip, port, products: [{ product, priceYen }] }`） |

30 秒ごとに登録済みサーバーの `/health` をチェックし、応答がなければ `status: "OFFLINE"` に更新します。

### 店側アプリ（`market-app`）

| メソッド | パス | 説明 |
| --- | --- | --- |
| `GET` | `/` | Web UI |
| `GET` | `/health` | ヘルスチェック（状態・商品一覧を返す） |
| `GET` | `/api/assets` | 自店の資産情報を取得 |
| `GET` | `/api/markets` | 中央サーバーのマーケット一覧をプロキシ取得 |
| `POST` | `/buy` | 購入処理（`{ product, qty }`）。ローカルアクセスのみ許可 |

## ビジネスルール（概要）

- 初期状態: 資金 **1 億円** / 仕入れポイント **1 億 PP**（1 PP = 1 円相当）
- 商品登録時、`数量 = floor(仕入れPP / 価格)` 分の在庫を確保
- 購入は他店の `/buy` への HTTP リクエストで確定し、売り手・買い手双方の資産を更新
- バリデーション失敗時のレスポンス
  - 商品名不一致 / 在庫（PP）不足 → `409 Conflict`
  - ローカル以外からの `/buy` → `403 Forbidden`

詳細は [`docs/spec.md`](docs/spec.md)（技術仕様書）と [`docs/architecture.md`](docs/architecture.md) を参照してください。

## ドキュメント

- [`docs/spec.md`](docs/spec.md) — 技術仕様書（用語・ルール・API・データ設計）
- [`docs/architecture.md`](docs/architecture.md) — ディレクトリ構成とデータフロー
- [`docs/dev-container-analysis.md`](docs/dev-container-analysis.md) — Dev Container 構成の分析
