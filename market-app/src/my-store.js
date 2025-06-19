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
import { PORT, CENTRAL_SERVER, MARKET_SYNC_INTERVAL } from './config.js'

// ESモジュールで__dirnameを使用するための設定
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 定数
const ASSETS_FILE = path.join(__dirname, '../data/assets.json')
const TRANSACTIONS_FILE = path.join(__dirname, '../data/transactions.json')
const PRODUCT_FILE = path.join(__dirname, '../data/product.json')
const ASSETS_LOCK_FILE = path.join(__dirname, '../data/assets.lock')
const PUBLIC_DIR = path.join(__dirname, '../public')

// サーバーの状態
let serverState = 'INIT'
let myProducts = [] // 複数商品に対応するため配列に変更
let myIpAddress = '127.0.0.1' // デフォルト値（取得失敗時に使用）

/**
 * IPアドレスを外部APIから取得する関数
 * @returns {Promise<string>} 取得したIPアドレス
 */
async function fetchIpAddress() {
  try {
    // ipify.orgのAPIを使用してIPアドレスを取得
    const response = await axios.get('https://api.ipify.org?format=json')
    return response.data.ip
  } catch (error) {
    console.error('IPアドレスの取得に失敗しました:', error.message)
    // 取得に失敗した場合はデフォルト値を返す
    return myIpAddress
  }
}

// Expressアプリケーションの初期化
const app = express()
app.use(express.json())

// 静的ファイル配信のためのミドルウェアを追加
app.use(express.static(PUBLIC_DIR))

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
 * ファイルが存在しない場合は空の配列を返す
 * @returns {Promise<Array>} 商品情報の配列
 */
async function loadProduct() {
  try {
    const products = await readJSON(PRODUCT_FILE)
    // 単一商品の場合は配列に変換
    return Array.isArray(products) ? products : [products]
  } catch (error) {
    console.log('商品情報ファイルが見つかりません')
    return []
  }
}

/**
 * 商品情報を保存する
 * @param {Array} products 商品情報の配列
 * @returns {Promise<void>}
 */
async function saveProduct(products) {
  try {
    await writeJSON(PRODUCT_FILE, products)
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
 * 商品を定義する
 * @param {Array} productsData 商品情報の配列
 * @returns {Promise<Array>} 商品情報の配列
 */
async function defineProducts(productsData) {
  // 商品情報を保存
  await saveProduct(productsData)

  return productsData
}

/**
 * 購入リクエストを処理する
 * @param {string} productName 商品名
 * @param {number} quantity 数量
 * @param {string} buyerIp 購入者のIPアドレス
 * @returns {Promise<Object>} 処理結果
 */
async function processPurchase(productName, quantity, buyerIp) {
  // 商品名に一致する商品を検索
  const product = myProducts.find((p) => p.name === productName)

  if (!product) {
    throw new Error('商品名が一致しません')
  }

  // トランザクションID生成
  const tradeId = `trade-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  // 現在時刻（UNIX秒）
  const timestamp = Math.floor(Date.now() / 1000)

  // 資産を更新
  const updatedAssets = await updateAssets((assets) => {
    // 必要な仕入れポイントを計算
    const requiredPts = product.priceYen * quantity

    // 仕入れポイントが十分かチェック
    if (assets.procurementPts < requiredPts) {
      // エラーを投げるのではなく、falseを返す
      return false
    }

    // 仕入れポイントを消費
    assets.procurementPts -= requiredPts

    // 売上を資金に加算
    const totalPrice = product.priceYen * quantity
    assets.capitalYen += totalPrice

    // コレクションに追加
    const collectionItem = {
      tradeId,
      product: productName,
      qty: quantity,
      price: product.priceYen,
      seller: myIpAddress,
      ts: timestamp,
    }

    // コレクションが存在しない場合は初期化
    if (!assets.collection) {
      assets.collection = []
    }

    // コレクションに追加
    assets.collection.push(collectionItem)

    return assets
  })

  // トランザクションを記録
  await recordTransaction({
    tradeId,
    buyer: buyerIp,
    seller: myIpAddress,
    product: productName,
    qty: quantity,
    price: product.priceYen,
  })

  return {
    success: true,
    tradeId,
    product: productName,
    qty: quantity,
    totalPrice: product.priceYen * quantity,
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
      port: PORT,
      products: myProducts.map((product) => ({
        product: product.name,
        priceYen: product.priceYen,
      })),
    })

    console.log('マーケット登録完了:', response.data)
    serverState = 'REGISTERED'
  } catch (error) {
    // 接続エラー（ECONNREFUSED）を特定して適切にキャッチする
    if (error.code === 'ECONNREFUSED') {
      console.error(
        '中央サーバーに接続できません。サーバーが起動しているか確認してください。'
      )
      serverState = 'ERROR'
      return
    }

    // その他のエラーの場合も、スタックトレースを表示せず簡潔なメッセージのみを表示
    console.error('マーケット登録に失敗しました:', error.message)
    serverState = 'ERROR'
    // エラーを再スローしない
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

// フロントエンドのメインページを提供
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'))
})

// 資産情報を取得するAPIエンドポイント
app.get('/api/assets', async (req, res) => {
  try {
    const assets = await loadAssets()
    res.json(assets)
  } catch (error) {
    console.error('資産情報の取得に失敗しました:', error.message)
    res.status(500).json({ error: '資産情報の取得に失敗しました' })
  }
})

// Central Serverからマーケット情報を取得するプロキシエンドポイント
app.get('/api/markets', async (req, res) => {
  try {
    const response = await axios.get(`${CENTRAL_SERVER}/markets`)
    res.json(response.data)
  } catch (error) {
    console.error('マーケット情報の取得に失敗しました:', error.message)
    res.status(500).json({ error: 'マーケット情報の取得に失敗しました' })
  }
})

// ヘルスチェックAPI
app.get('/health', (req, res) => {
  res.status(200).json({
    status: serverState,
    products: myProducts,
    timestamp: new Date().toISOString(),
  })
})

// 購入API - ローカルからのアクセスのみ許可
app.post('/buy', async (req, res) => {
  try {
    // サーバーがアクティブでない場合はエラー
    if (serverState !== 'ACTIVE') {
      return res
        .status(503)
        .json({ error: 'サーバーがアクティブではありません' })
    }

    // クライアントのIPアドレスを取得
    const clientIp = req.ip.replace('::ffff:', '') // IPv4マッピングアドレスの場合の対応

    // ローカルからのアクセスのみ許可（127.0.0.1またはlocalhostからのアクセス）
    if (
      clientIp !== '127.0.0.1' &&
      clientIp !== 'localhost' &&
      clientIp !== '::1'
    ) {
      return res
        .status(403)
        .json({ error: 'この操作はローカルからのみ許可されています' })
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
    const buyerIp = clientIp

    try {
      // 購入処理を実行
      const result = await processPurchase(product, qty, buyerIp)

      if (result === false) {
        // 仕入れポイントが不足している場合
        return res.status(409).json({ error: '仕入れポイントが不足しています' })
      }

      res.status(200).json(result)
    } catch (error) {
      if (error.message === '商品名が一致しません') {
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
    myProducts = await loadProduct()

    // 商品が定義されていない場合は新規作成
    if (myProducts.length === 0) {
      console.log('商品が定義されていません。新しい商品を定義します。')

      // 実際のアプリケーションではユーザー入力を受け付けるが、
      // ここではデモ用に固定値を使用
      const productsData = [
        {
          name: 'りんごジュース',
          priceYen: 120,
        },
        {
          name: 'コーヒー',
          priceYen: 150,
        },
      ]

      myProducts = await defineProducts(productsData)
      console.log('商品を定義しました:', myProducts)
    }

    serverState = 'CONFIGURED'

    // IPアドレスを自動取得
    try {
      console.log('IPアドレスを取得しています...')
      myIpAddress = await fetchIpAddress()
      console.log(`IPアドレスを取得しました: ${myIpAddress}`)
    } catch (error) {
      console.error(
        'IPアドレスの取得に失敗しました。デフォルト値を使用します:',
        myIpAddress
      )
    }

    // サーバーを起動
    app.listen(PORT, async () => {
      console.log(`店側アプリケーションが起動しました - ポート: ${PORT}`)
      console.log(`ウェブUIは http://localhost:${PORT}/ で利用可能です`)

      // 静的ファイル配信ディレクトリの存在を確認
      const publicDirExists = fs.existsSync(PUBLIC_DIR)
      console.log(
        `静的ファイル配信ディレクトリ: ${PUBLIC_DIR} (${
          publicDirExists ? 'ok' : 'ng'
        })`
      )

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
