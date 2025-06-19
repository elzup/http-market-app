/**
 * config.js - 設定ファイル
 *
 * このファイルには、アプリケーションの設定値を定義します。
 */

// サーバーポート
export const PORT = process.env.PORT || 8082

// セントラルサーバーのアドレス
export const CENTRAL_SERVER = 'https://2c8f-113-149-250-1.ngrok-free.app'

// マーケット同期間隔（ミリ秒）
export const MARKET_SYNC_INTERVAL = 15000 // 15秒
