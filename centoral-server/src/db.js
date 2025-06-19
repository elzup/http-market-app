/**
 * db.js - データベースアクセスモジュール
 *
 * このモジュールは、JSONファイルの読み書きを抽象化し、
 * アプリケーション全体でファイルI/Oを一元管理します。
 *
 * 仕様書「7.b. ファイルI/O分離」に基づいて実装されています。
 */

import { readFile, writeFile } from 'node:fs/promises'

/**
 * 指定されたパスからJSONファイルを読み込む
 *
 * @param {string} path - 読み込むJSONファイルのパス
 * @returns {Promise<Object>} - パースされたJSONオブジェクト
 * @throws {Error} - ファイルが存在しない場合やJSONパースエラーの場合
 */
export const readJSON = async (path) => {
  try {
    const data = await readFile(path, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`ファイルが見つかりません: ${path}`)
    } else if (error instanceof SyntaxError) {
      throw new Error(`JSONパースエラー: ${path} - ${error.message}`)
    }
    throw error
  }
}

/**
 * 指定されたパスにJSONデータを書き込む
 *
 * @param {string} path - 書き込み先のファイルパス
 * @param {Object} data - 書き込むデータオブジェクト
 * @returns {Promise<void>} - 書き込み完了後に解決するPromise
 * @throws {Error} - 書き込みエラーの場合
 */
export const writeJSON = async (path, data) => {
  try {
    await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
  } catch (error) {
    throw new Error(`ファイル書き込みエラー: ${path} - ${error.message}`)
  }
}
