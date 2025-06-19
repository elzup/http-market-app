/**
 * マーケットアプリケーション フロントエンド (React版)
 *
 * このスクリプトは以下の機能を提供します：
 * 1. マーケット情報の取得と表示
 * 2. 商品購入機能
 * 3. 自動更新機能
 */

// マーケットカードコンポーネント
function MarketCard({ market, onSelect }) {
  const statusClass =
    market.status === 'ONLINE'
      ? 'status-online'
      : market.status === 'OFFLINE'
      ? 'status-offline'
      : 'status-unknown'

  const handleClick = () => {
    if (market.status === 'ONLINE') {
      onSelect(market)
    }
  }

  return (
    <div
      className={`card market-card mb-3 ${
        market.status !== 'ONLINE' ? 'opacity-50' : ''
      }`}
      onClick={handleClick}
    >
      <div className="card-body">
        <div className="d-flex align-items-center mb-3">
          <div className="me-3">
            <svg
              width="50"
              height="50"
              data-jdenticon-value={market.address || ''}
            ></svg>
          </div>
          <div>
            <h5 className="card-title mb-1">{market.product}</h5>
            <h6 className="card-subtitle text-muted">{market.price}円</h6>
          </div>
        </div>
        <p className="card-text mb-1">アドレス: {market.address}</p>
        <p className="card-text">
          状態: <span className={`status-indicator ${statusClass}`}></span>
          {market.status}
        </p>
      </div>
    </div>
  )
}

// 購入フォームコンポーネント
function PurchaseForm({ market, onCancel, onPurchase }) {
  const [quantity, setQuantity] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(false)

  const totalPrice = market ? market.price * quantity : 0

  const handleQuantityChange = (e) => {
    const value = parseInt(e.target.value) || 0
    setQuantity(value > 0 ? value : 1)
  }

  const handlePurchase = async () => {
    if (!market || quantity <= 0) return

    setIsLoading(true)

    try {
      const response = await fetch(`http://${market.address}/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product: market.product,
          qty: quantity,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        onPurchase(true, '購入が完了しました！', {
          product: result.product,
          qty: result.qty,
          totalPrice: result.totalPrice,
          tradeId: result.tradeId,
        })
      } else {
        onPurchase(false, '購入に失敗しました。', {
          error: result.error || '不明なエラー',
        })
      }
    } catch (error) {
      console.error('購入処理中にエラーが発生しました:', error)
      onPurchase(false, '購入処理中にエラーが発生しました。', {
        error: error.message,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        <h5 className="mb-0">商品購入</h5>
      </div>
      <div className="card-body">
        <div className="row mb-4">
          <div className="col-md-4 text-center">
            <svg
              width="100"
              height="100"
              data-jdenticon-value={market.address || ''}
            ></svg>
          </div>
          <div className="col-md-8">
            <h4>{market.product}</h4>
            <p className="mb-1">価格: {market.price}円</p>
            <p className="mb-1">アドレス: {market.address}</p>
            <p>
              状態: <span className="status-indicator status-online"></span>
              {market.status}
            </p>
          </div>
        </div>

        <div className="row align-items-end">
          <div className="col-md-4 mb-3">
            <label htmlFor="quantity" className="form-label">
              購入数量:
            </label>
            <input
              type="number"
              className="form-control"
              id="quantity"
              min="1"
              value={quantity}
              onChange={handleQuantityChange}
            />
          </div>
          <div className="col-md-4 mb-3">
            <p className="mb-0">
              <strong>合計金額: {totalPrice}円</strong>
            </p>
          </div>
          <div className="col-md-4 mb-3">
            <div className="d-grid gap-2">
              <button
                className="btn btn-success"
                onClick={handlePurchase}
                disabled={isLoading}
              >
                {isLoading ? '処理中...' : '購入する'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="card-footer">
        <button className="btn btn-secondary" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </div>
  )
}

// 結果表示コンポーネント
function ResultDisplay({ success, message, details, onClose }) {
  const cardClass = success ? 'border-success' : 'border-danger'
  const headerClass = success ? 'bg-success' : 'bg-danger'

  return (
    <div className={`card ${cardClass} mb-4`}>
      <div className={`card-header ${headerClass} text-white`}>
        <h5 className="mb-0">{success ? '購入完了' : 'エラー'}</h5>
      </div>
      <div className="card-body">
        <h4 className="card-title">{message}</h4>

        {success ? (
          <div className="alert alert-success mt-3">
            <p className="mb-1">商品: {details.product}</p>
            <p className="mb-1">数量: {details.qty}</p>
            <p className="mb-1">合計金額: {details.totalPrice}円</p>
            <p className="mb-0">取引ID: {details.tradeId}</p>
          </div>
        ) : (
          <div className="alert alert-danger mt-3">
            <p className="mb-0">エラー: {details.error}</p>
          </div>
        )}
      </div>
      <div className="card-footer">
        <button className="btn btn-primary" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  )
}

// メインアプリケーションコンポーネント
function App() {
  const [markets, setMarkets] = React.useState([])
  const [selectedMarket, setSelectedMarket] = React.useState(null)
  const [lastUpdated, setLastUpdated] = React.useState(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [purchaseResult, setPurchaseResult] = React.useState(null)

  // マーケット情報を取得する
  const fetchMarkets = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/markets')
      if (!response.ok) {
        throw new Error(`サーバーエラー: ${response.status}`)
      }

      const data = await response.json()
      setMarkets(data)
      setLastUpdated(new Date())
    } catch (error) {
      console.error('マーケット情報の取得に失敗しました:', error)
      setError(`マーケット情報の取得に失敗しました: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // マーケットを選択する
  const handleSelectMarket = (market) => {
    setSelectedMarket(market)
    setPurchaseResult(null)

    // スクロール
    setTimeout(() => {
      const element = document.getElementById('purchase-section')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    }, 100)
  }

  // 購入をキャンセルする
  const handleCancelPurchase = () => {
    setSelectedMarket(null)
  }

  // 購入結果を処理する
  const handlePurchaseResult = (success, message, details) => {
    setPurchaseResult({ success, message, details })
    setSelectedMarket(null)

    // 購入成功時はマーケット情報を更新
    if (success) {
      fetchMarkets()
    }

    // スクロール
    setTimeout(() => {
      const element = document.getElementById('result-section')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    }, 100)
  }

  // 結果表示を閉じる
  const handleCloseResult = () => {
    setPurchaseResult(null)
  }

  // コンポーネントがマウントされたときにマーケット情報を取得
  React.useEffect(() => {
    fetchMarkets()

    // 15秒ごとに自動更新
    const intervalId = setInterval(fetchMarkets, 15000)

    // クリーンアップ関数
    return () => clearInterval(intervalId)
  }, [])

  // Jdenticonを更新
  React.useEffect(() => {
    // DOMが完全に更新された後にJdenticonを更新
    setTimeout(() => {
      if (window.jdenticon) {
        try {
          window.jdenticon.update()
        } catch (error) {
          console.error('Jdenticon更新エラー:', error)
        }
      }
    }, 100)
  }, [markets, selectedMarket, purchaseResult])

  return (
    <div className="container py-4">
      <header className="pb-3 mb-4 border-bottom">
        <h1 className="display-5 fw-bold">マーケット情報</h1>
      </header>

      <section className="mb-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2>マーケット一覧</h2>
          <div>
            <button
              className="btn btn-primary me-2"
              onClick={fetchMarkets}
              disabled={isLoading}
            >
              {isLoading ? '更新中...' : '更新'}
            </button>
            {lastUpdated && (
              <small className="text-muted">
                最終更新: {lastUpdated.toLocaleTimeString('ja-JP')}
              </small>
            )}
          </div>
        </div>

        {error ? (
          <div className="alert alert-danger">{error}</div>
        ) : markets.length === 0 ? (
          <div className="alert alert-info">
            登録されているマーケットはありません。
          </div>
        ) : (
          <div className="row">
            {markets.map((market, index) => (
              <div className="col-md-6 col-lg-4" key={market.address || index}>
                <MarketCard market={market} onSelect={handleSelectMarket} />
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedMarket && (
        <section id="purchase-section" className="mb-4">
          <PurchaseForm
            market={selectedMarket}
            onCancel={handleCancelPurchase}
            onPurchase={handlePurchaseResult}
          />
        </section>
      )}

      {purchaseResult && (
        <section id="result-section" className="mb-4">
          <ResultDisplay
            success={purchaseResult.success}
            message={purchaseResult.message}
            details={purchaseResult.details}
            onClose={handleCloseResult}
          />
        </section>
      )}

      <footer className="pt-3 mt-4 text-muted border-top">
        マーケットアプリケーション &copy; 2025
      </footer>
    </div>
  )
}

// アプリケーションをレンダリング
const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(<App />)
