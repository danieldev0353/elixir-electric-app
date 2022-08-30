import { DbNamespace } from '../../util/types'
import { QueryAdapter as QueryAdapterInterface } from '../../query-adapters/index'
import { SQLitePluginQueryAdapter } from '../sqlite-plugin/query'
import { Database } from './database'

export class QueryAdapter extends SQLitePluginQueryAdapter implements QueryAdapterInterface {
  db: Database

  constructor(db: Database, defaultNamespace: DbNamespace) {
    super(db, defaultNamespace)

    this.db = db
  }
}
