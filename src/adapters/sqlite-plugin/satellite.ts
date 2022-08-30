import { AnyFunction, BindParams, Row } from '../../util/types'
import { SQLitePlugin, SQLitePluginTransaction } from './index'
import { ensurePromise } from './promise'
import { ExecutionResult, rowsFromResults } from './results'

export abstract class SQLitePluginSatelliteClient {
  db: SQLitePlugin
  promisesEnabled: boolean

  constructor(db: SQLitePlugin) {
    this.db = db
    this.promisesEnabled = false
  }

  exec(sql: string): Promise<void> {
    return new Promise((resolve: AnyFunction, reject: AnyFunction) => {
      const success = ([_tx, _results]: ExecutionResult) => {
        resolve()
      }
      const error = (err: any) => reject(err)
      const txFn = (tx: SQLitePluginTransaction) => tx.executeSql(sql)

      this._transaction(txFn, success, error)
    })
  }

  select(sql: string, bindParams: BindParams = []): Promise<Row[]> {
    return new Promise((resolve: AnyFunction, reject: AnyFunction) => {
      const success = ([_tx, results]: ExecutionResult) => {
        resolve(rowsFromResults(results))
      }
      const error = (err: any) => reject(err)
      const txFn = (tx: SQLitePluginTransaction) => tx.executeSql(sql, bindParams)

      this._readTransaction(txFn, success, error)
    })
  }

  _transaction(txFn: AnyFunction, success: AnyFunction, error: AnyFunction, readOnly: boolean = false): void {
    const run = readOnly ? this.db.readTransaction : this.db.transaction

    if (this.promisesEnabled) {
      ensurePromise(run(txFn)).then(success).catch(error)
    }
    else { // The callback args are reversed!
      run(txFn, error, success)
    }
  }

  _readTransaction(txFn: AnyFunction, success: AnyFunction, error: AnyFunction): void {
    this._transaction(txFn, success, error, true)
  }
}
