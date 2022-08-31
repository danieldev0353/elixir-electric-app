// N.b.: importing this module is an entrypoint that imports the better-sqlite3
// environment dependencies. Specifically the node filesystem.
import { DbName } from '../../util/types'

import { DEFAULTS } from '../../electric/config'
import {
  ElectricNamespace,
  ElectrifyOptions,
  electrify as baseElectrify
} from '../../electric/index'

import { NodeFilesystem } from '../../filesystems/node'
import { EmitCommitNotifier } from '../../notifiers/emit'
import { globalRegistry } from '../../satellite/registry'

import { Database, ElectricDatabase } from './database'
import { QueryAdapter } from './query'
import { SatelliteDatabaseAdapter } from './satellite'

export const electrify = (db: Database, opts: ElectrifyOptions = {}): Promise<Database> => {
  const dbName: DbName = db.name
  const defaultNamespace = opts.defaultNamespace || DEFAULTS.namespace

  const commitNotifier = opts.commitNotifier || new EmitCommitNotifier(dbName)
  const fs = opts.filesystem || new NodeFilesystem()
  const queryAdapter = opts.queryAdapter || new QueryAdapter(db, defaultNamespace)
  const satelliteDbAdapter = opts.satelliteDbAdapter || new SatelliteDatabaseAdapter(db)
  const satelliteRegistry = opts.satelliteRegistry || globalRegistry

  const namespace = new ElectricNamespace(commitNotifier, queryAdapter)
  const electric = new ElectricDatabase(db, namespace)

  return baseElectrify(dbName, db, electric, fs, satelliteDbAdapter, satelliteRegistry)
}
