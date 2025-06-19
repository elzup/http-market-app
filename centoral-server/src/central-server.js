/**
 * central-server.js - マーケット情報サーバー
 *
 * このサーバーは以下の機能を提供します：
 * 1. マーケット登録API（POST /register）
 * 2. マーケット一覧取得API（GET /markets）
 * 3. ヘルスチェック機能
 * 4. マーケット情報の永続化
 */

import express from 'express'
import { readJSON, writeJSON } from './db.js'
import path from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'
import fs from 'node:fs'

// ESモジュールで__dirnameを使用するための設定
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 定数
const PORT = process.env.PORT || 8080
const MARKETS_FILE = path.join(__dirname, '../data/markets.json')
const HEALTH_CHECK_INTERVAL = 30000 // 30秒

// Expressアプリケーションの初期化
const app = express()
app.use(express.json())

// CORS設定
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  )
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }
  next()
})

// 静的ファイル配信の設定
const publicDir = path.resolve(__dirname, '../public')
console.log(`静的ファイル配信ディレクトリ(絶対パス): ${publicDir}`)
app.use(express.static(publicDir))

/**
 * マーケット情報を読み込む
 * ファイルが存在しない場合は空の配列を返す
 * @returns {Promise<Array>} マーケット情報の配列
 */
async function loadMarkets() {
  try {
    return await readJSON(MARKETS_FILE)
  } catch (error) {
    console.log('マーケット情報ファイルが見つからないため、新規作成します')
    return []
  }
}

/**
 * マーケット情報を保存する
 * @param {Array} markets マーケット情報の配列
 * @returns {Promise<void>}
 */
async function saveMarkets(markets) {
  try {
    await writeJSON(MARKETS_FILE, markets)
  } catch (error) {
    console.error('マーケット情報の保存に失敗しました:', error)
    throw error
  }
}

/**
 * 指定されたアドレスにヘルスチェックリクエストを送信する
 * @param {string} address サーバーアドレス（IP:PORT形式）
 * @returns {Promise<boolean>} サーバーが応答した場合はtrue、それ以外はfalse
 */
async function checkServerHealth(address) {
  try {
    const response = await axios.get(`http://${address}/health`, {
      timeout: 5000,
    })
    return response.status === 200
  } catch (error) {
    console.log(`ヘルスチェック失敗: ${address} - ${error.message}`)
    return false
  }
}

/**
 * 登録されているすべてのマーケットのヘルスチェックを実行する
 * @returns {Promise<void>}
 */
async function performHealthChecks() {
  try {
    const markets = await loadMarkets()

    // 各マーケットのヘルスチェックを実行
    const updatedMarkets = await Promise.all(
      markets.map(async (market) => {
        const isOnline = await checkServerHealth(market.address)
        return {
          ...market,
          status: isOnline ? 'ONLINE' : 'OFFLINE',
        }
      })
    )

    // 更新されたマーケット情報を保存
    await saveMarkets(updatedMarkets)
    console.log('ヘルスチェック完了')
  } catch (error) {
    console.error('ヘルスチェック処理中にエラーが発生しました:', error)
  }
}

// ルートパスへのアクセス時にindex.htmlを返す
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'))
})

// マーケット登録API
app.post('/register', async (req, res) => {
  try {
    const { ip, product, priceYen, port } = req.body

    // バリデーション
    if (!ip || !product || !priceYen || !port) {
      return res.status(400).json({ error: '必須パラメータが不足しています' })
    }

    if (typeof priceYen !== 'number' || priceYen <= 0) {
      return res
        .status(400)
        .json({ error: '価格は正の数値である必要があります' })
    }

    // マーケット情報を読み込む
    const markets = await loadMarkets()

    // アドレスを生成
    const address = `${ip}:${port}`

    // 既存のマーケットを検索
    const existingIndex = markets.findIndex((m) => m.address === address)

    if (existingIndex >= 0) {
      // 既存のマーケットを更新
      markets[existingIndex] = {
        product,
        price: priceYen,
        address,
        status: 'ONLINE',
        updatedAt: new Date().toISOString(),
      }
    } else {
      // 新しいマーケットを追加
      markets.push({
        product,
        price: priceYen,
        address,
        status: 'ONLINE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    // マーケット情報を保存
    await saveMarkets(markets)

    res.status(200).json({ message: 'マーケット登録が完了しました' })
  } catch (error) {
    console.error('マーケット登録中にエラーが発生しました:', error)
    res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
})

// マーケット一覧取得API
app.get('/markets', async (req, res) => {
  try {
    const markets = await loadMarkets()

    // クライアントに返すデータを整形
    const responseData = markets.map((market) => ({
      product: market.product,
      price: market.price,
      address: market.address,
      status: market.status || 'UNKNOWN',
    }))

    res.status(200).json(responseData)
  } catch (error) {
    console.error('マーケット一覧取得中にエラーが発生しました:', error)
    res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
})

// サーバー起動
app.listen(PORT, async () => {
  console.log(`マーケット情報サーバーが起動しました - ポート: ${PORT}`)

  try {
    // データディレクトリが存在しない場合は作成する
    const dataDir = path.join(__dirname, '../data')

    // データディレクトリが存在しない場合は作成
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // publicディレクトリの存在を確認
    const publicDirExists = fs.existsSync(publicDir)
    console.log(
      `静的ファイル配信ディレクトリ: ${publicDir} (${
        publicDirExists ? 'ok' : 'ng'
      })`
    )

    // マーケット情報を読み込む（ファイルが存在しない場合は新規作成される）
    await loadMarkets()

    console.log(`マーケット情報ファイル: ${MARKETS_FILE}`)

    // 定期的なヘルスチェックを開始
    setInterval(performHealthChecks, HEALTH_CHECK_INTERVAL)
    console.log(`ヘルスチェック間隔: ${HEALTH_CHECK_INTERVAL / 1000}秒`)
  } catch (error) {
    console.error('サーバー初期化中にエラーが発生しました:', error)
  }
})
