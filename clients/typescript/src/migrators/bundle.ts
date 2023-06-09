import { Migration, MigrationRecord, Migrator, MigratorOptions } from './index'
import { DatabaseAdapter } from '../electric/adapter'
import { overrideDefined } from '../util/options'
import { data as baseMigration } from './schema'
import Log from 'loglevel'

const DEFAULTS: MigratorOptions = {
  tableName: '_electric_migrations',
}

const VALID_NAME_EXP = new RegExp('^[a-z0-9_]+$', 'i')
const VALID_SHA256_EXP = new RegExp('^[a-z0-9]{64}$')

export class BundleMigrator implements Migrator {
  adapter: DatabaseAdapter
  migrations: Migration[]

  tableName: string

  constructor(
    adapter: DatabaseAdapter,
    migrations: Migration[] = [],
    tableName?: string
  ) {
    const overrides = { tableName: tableName }
    const opts = overrideDefined(DEFAULTS, overrides) as MigratorOptions

    this.adapter = adapter
    this.migrations = [...baseMigration.migrations, ...migrations]
    this.tableName = opts.tableName
  }

  async up(): Promise<number> {
    const existing = await this.queryApplied()
    const unapplied = await this.validateApplied(this.migrations, existing)

    let migration: Migration
    for (let i = 0; i < unapplied.length; i++) {
      migration = unapplied[i]
      Log.info(`applying migration: ${migration.name} ${migration.sha256}`)
      await this.apply(migration)
    }

    return unapplied.length
  }

  async queryApplied(): Promise<MigrationRecord[]> {
    // If this is the first time we're running migrations, then the
    // migrations table won't exist.
    const tableExists = `
      SELECT count(name) as numTables FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
    `
    const [{ numTables }] = await this.adapter.query({
      sql: tableExists,
      args: [this.tableName],
    })
    if (numTables == 0) {
      return []
    }

    // The migrations table exists, so let's query the name and hash of
    // the previously applied migrations.
    const existingRecords = `
      SELECT name, sha256 FROM ${this.tableName}
        ORDER BY id ASC
    `
    const rows = await this.adapter.query({ sql: existingRecords })
    return rows as unknown as MigrationRecord[]
  }

  async validateApplied(migrations: Migration[], existing: MigrationRecord[]) {
    // First we validate that the existing records are the first migrations.
    existing.forEach(({ name, sha256 }, i) => {
      const migration = migrations[i]

      if (migration.name !== name) {
        throw new Error(
          `Migrations cannot be altered once applied: expecting ${name} at index ${i}.`
        )
      }

      if (migration.sha256 !== sha256) {
        throw new Error(
          `Migrations cannot be altered once applied: expecting ${name} to have sha256 of ${sha256}`
        )
      }
    })

    // Then we can confidently slice and return the non-existing.
    return migrations.slice(existing.length)
  }

  async apply({ satellite_body, name, sha256 }: Migration): Promise<void> {
    if (!VALID_NAME_EXP.test(name)) {
      throw new Error(`Invalid migration name, must match ${VALID_NAME_EXP}`)
    }

    if (!VALID_SHA256_EXP.test(sha256)) {
      throw new Error(
        `Invalid migration sha256, must match ${VALID_SHA256_EXP}`
      )
    }

    const applied = `INSERT INTO ${this.tableName}
        ('name', 'sha256', 'applied_at') VALUES (?, ?, ?)
        `

    await this.adapter.runInTransaction(
      ...(satellite_body as unknown as string[]).map((sql) => ({ sql })),
      { sql: applied, args: [name, sha256, Date.now()] }
    )
  }
}
