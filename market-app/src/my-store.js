/**
 * my-store.js - 店側アプリケーション（学生サーバー）
 *
 * このサーバーは以下の機能を提供します：
 * 1. 商品定義と在庫計算
 * 2. 購入API（/buy）
 * 3. ヘルスチェックAPI（/health）
 * 4. マーケット登録（セントラルサーバーへのPOST /register）
 * 5. マーケット同期（セントラルサーバーからのGET /markets）
 * 6. 資産管理（assets.json）
 * 7. トランザクションログ（transactions.json）
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
const PORT = process.env.PORT || 8082
const ASSETS_FILE = path.join(__dirname, '../data/assets.json')
const TRANSACTIONS_FILE = path.join(__dirname, '../data/transactions.json')
const PRODUCT_FILE = path.join(__dirname, '../data/product.json')
const ASSETS_LOCK_FILE = path.join(__dirname, '../data/assets.lock')
const CENTRAL_SERVER = 'http://localhost:8080'
const MARKET_SYNC_INTERVAL = 15000 // 15秒

// サーバーの状態
let serverState = 'INIT'
let myProduct = null
let myIpAddress = '127.0.0.1' // 開発環境ではローカルホストを使用

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

/**
 * 初期資産データを作成する
 * @returns {Object} 初期資産データ
 */
function createInitialAssets() {
  return {
    capitalYen: 100000000, // 1億円
    procurementPts: 100000000, // 1億PP
    inventory: [],
    collection: [],
  }
}

/**
 * 初期トランザクションログを作成する
 * @returns {Array} 空のトランザクションログ配列
 */
function createInitialTransactions() {
  return []
}

/**
 * 資産ファイルを読み込む
 * ファイルが存在しない場合は初期データを作成して保存する
 * @returns {Promise<Object>} 資産データ
 */
async function loadAssets() {
  try {
    return await readJSON(ASSETS_FILE)
  } catch (error) {
    console.log('資産ファイルが見つからないため、新規作成します')
    const initialAssets = createInitialAssets()
    await writeJSON(ASSETS_FILE, initialAssets)
    return initialAssets
  }
}

/**
 * トランザクションログを読み込む
 * ファイルが存在しない場合は初期データを作成して保存する
 * @returns {Promise<Array>} トランザクションログ配列
 */
async function loadTransactions() {
  try {
    return await readJSON(TRANSACTIONS_FILE)
  } catch (error) {
    console.log(
      'トランザクションログファイルが見つからないため、新規作成します'
    )
    const initialTransactions = createInitialTransactions()
    await writeJSON(TRANSACTIONS_FILE, initialTransactions)
    return initialTransactions
  }
}

/**
 * 商品情報を読み込む
 * ファイルが存在しない場合はnullを返す
 * @returns {Promise<Object|null>} 商品情報またはnull
 */
async function loadProduct() {
  try {
    return await readJSON(PRODUCT_FILE)
  } catch (error) {
    console.log('商品情報ファイルが見つかりません')
    return null
  }
}

/**
 * 商品情報を保存する
 * @param {Object} product 商品情報
 * @returns {Promise<void>}
 */
async function saveProduct(product) {
  try {
    await writeJSON(PRODUCT_FILE, product)
  } catch (error) {
    console.error('商品情報の保存に失敗しました:', error)
    throw error
  }
}

/**
 * 資産を更新する関数
 * @param {Function} updateFn 資産を更新する関数
 * @returns {Promise<Object>} 更新された資産データ
 */
async function updateAssets(updateFn) {
  // ロックファイルを作成してロックを取得
  try {
    fs.openSync(ASSETS_LOCK_FILE, 'wx')
  } catch (error) {
    throw new Error(
      '資産ファイルがロックされています。しばらく待ってから再試行してください。'
    )
  }

  try {
    // 資産データを読み込む
    const assets = await loadAssets()

    // 更新関数を実行
    const updatedAssets = updateFn(assets)

    // 更新された資産データを保存
    await writeJSON(ASSETS_FILE, updatedAssets)

    return updatedAssets
  } finally {
    // ロックを解除
    try {
      fs.unlinkSync(ASSETS_LOCK_FILE)
    } catch (error) {
      console.error('ロックファイルの削除に失敗しました:', error)
    }
  }
}

/**
 * トランザクションを記録する
 * @param {Object} transaction トランザクション情報
 * @returns {Promise<void>}
 */
async function recordTransaction(transaction) {
  try {
    const transactions = await loadTransactions()
    transactions.push({
      ...transaction,
      ts: Math.floor(Date.now() / 1000),
    })
    await writeJSON(TRANSACTIONS_FILE, transactions)
  } catch (error) {
    console.error('トランザクションの記録に失敗しました:', error)
    throw error
  }
}

/**
 * 商品を定義し、在庫を計算する
 * @param {string} productName 商品名
 * @param {number} priceYen 価格（円）
 * @returns {Promise<Object>} 商品情報と在庫数量
 */
async function defineProduct(productName, priceYen) {
  // 商品情報を作成
  const product = {
    name: productName,
    priceYen: priceYen,
  }

  // 資産を読み込む
  const assets = await loadAssets()

  // 在庫数量を計算
  const quantity = Math.floor(assets.procurementPts / priceYen)

  // 消費される仕入れポイント
  const consumedPts = quantity * priceYen

  // 資産を更新
  await updateAssets((assets) => {
    // 仕入れポイントを消費
    assets.procurementPts -= consumedPts

    // 在庫に商品を追加
    assets.inventory = [
      {
        product: productName,
        qty: quantity,
      },
    ]

    return assets
  })

  // 商品情報を保存
  await saveProduct(product)

  return {
    ...product,
    quantity,
  }
}

/**
 * 購入リクエストを処理する
 * @param {string} productName 商品名
 * @param {number} quantity 数量
 * @param {string} buyerIp 購入者のIPアドレス
 * @returns {Promise<Object>} 処理結果
 */
async function processPurchase(productName, quantity, buyerIp) {
  // 商品名の一致を確認
  if (productName !== myProduct.name) {
    throw new Error('商品名が一致しません')
  }

  // トランザクションID生成
  const tradeId = `trade-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  // 資産を更新
  const updatedAssets = await updateAssets((assets) => {
    // 在庫を確認
    const inventoryItem = assets.inventory.find(
      (item) => item.product === productName
    )
    if (!inventoryItem || inventoryItem.qty < quantity) {
      throw new Error('在庫が不足しています')
    }

    // 在庫を減らす
    inventoryItem.qty -= quantity

    // 売上を資金に加算
    const totalPrice = myProduct.priceYen * quantity
    assets.capitalYen += totalPrice

    return assets
  })

  // トランザクションを記録
  await recordTransaction({
    tradeId,
    buyer: buyerIp,
    seller: myIpAddress,
    product: productName,
    qty: quantity,
    price: myProduct.priceYen,
  })

  return {
    success: true,
    tradeId,
    product: productName,
    qty: quantity,
    totalPrice: myProduct.priceYen * quantity,
  }
}

/**
 * 教師サーバーにマーケット登録する
 * @returns {Promise<void>}
 */
async function registerToMarket() {
  try {
    const response = await axios.post(`${CENTRAL_SERVER}/register`, {
      ip: myIpAddress,
      product: myProduct.name,
      priceYen: myProduct.priceYen,
      port: PORT,
    })

    console.log('マーケット登録完了:', response.data)
    serverState = 'REGISTERED'
  } catch (error) {
    console.error('マーケット登録に失敗しました:', error.message)
    throw error
  }
}

/**
 * 教師サーバーからマーケット情報を取得する
 * @returns {Promise<Array>} マーケット情報の配列
 */
async function syncMarkets() {
  try {
    const response = await axios.get(`${CENTRAL_SERVER}/markets`)
    console.log(
      'マーケット同期完了:',
      response.data.length,
      '件のマーケット情報を取得'
    )
    return response.data
  } catch (error) {
    console.error('マーケット同期に失敗しました:', error.message)
    return []
  }
}

// ヘルスチェックAPI
app.get('/health', (req, res) => {
  res.status(200).json({
    status: serverState,
    product: myProduct,
    timestamp: new Date().toISOString(),
  })
})

// 購入API
app.post('/buy', async (req, res) => {
  try {
    // サーバーがアクティブでない場合はエラー
    if (serverState !== 'ACTIVE') {
      return res
        .status(503)
        .json({ error: 'サーバーがアクティブではありません' })
    }

    const { product, qty } = req.body

    // バリデーション
    if (!product || !qty) {
      return res.status(400).json({ error: '必須パラメータが不足しています' })
    }

    if (typeof qty !== 'number' || qty <= 0) {
      return res
        .status(400)
        .json({ error: '数量は正の整数である必要があります' })
    }

    // 購入者のIPアドレスを取得
    const buyerIp = req.ip.replace('::ffff:', '') // IPv4マッピングアドレスの場合の対応

    try {
      // 購入処理を実行
      const result = await processPurchase(product, qty, buyerIp)
      res.status(200).json(result)
    } catch (error) {
      if (
        error.message === '商品名が一致しません' ||
        error.message === '在庫が不足しています'
      ) {
        return res.status(409).json({ error: error.message })
      }
      throw error
    }
  } catch (error) {
    console.error('購入処理中にエラーが発生しました:', error)
    res.status(500).json({ error: 'サーバーエラーが発生しました' })
  }
})

// サーバー初期化と起動
async function initializeServer() {
  try {
    console.log('店側アプリケーションを初期化しています...')

    // データディレクトリが存在しない場合は作成
    const dataDir = path.join(__dirname, '../data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // 資産とトランザクションログを読み込む
    await loadAssets()
    await loadTransactions()

    // 商品情報を読み込む
    myProduct = await loadProduct()

    // 商品が定義されていない場合は新規作成
    if (!myProduct) {
      console.log('商品が定義されていません。新しい商品を定義します。')

      // 実際のアプリケーションではユーザー入力を受け付けるが、
      // ここではデモ用に固定値を使用
      const productName = 'りんごジュース'
      const priceYen = 120

      myProduct = await defineProduct(productName, priceYen)
      console.log('商品を定義しました:', myProduct)
    }

    serverState = 'CONFIGURED'

    // サーバーを起動
    app.listen(PORT, async () => {
      console.log(`店側アプリケーションが起動しました - ポート: ${PORT}`)

      // マーケットに登録
      try {
        await registerToMarket()
        serverState = 'ACTIVE'
        console.log('サーバー状態:', serverState)

        // 定期的にマーケット情報を同期
        setInterval(syncMarkets, MARKET_SYNC_INTERVAL)
      } catch (error) {
        console.error('マーケット登録に失敗しました:', error)
      }
    })
  } catch (error) {
    console.error('サーバー初期化中にエラーが発生しました:', error)
    process.exit(1)
  }
}

// サーバーを初期化
initializeServer()
