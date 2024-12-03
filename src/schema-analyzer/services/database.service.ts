import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { QUERIES } from '../constants/query-templates';
import { Table, Column, SchemaAnalyzerConfig } from '../types/schema-analyzer.types';

@Injectable()
export class DatabaseService {
  private pool: Pool;
  private dbName: string;

  async connect(config: SchemaAnalyzerConfig) {
    if ('uri' in config) {
      // For URI connections
      this.pool = new Pool({
        connectionString: config.uri,
        ssl: config.ssl
      });
      
      try {
        // Safely extract database name from URI
        const url = new URL(config.uri.replace('postgresql://', 'http://'));
        this.dbName = url.pathname.split('/')[1]?.split('?')[0] || 'unknown_db';
      } catch (error) {
        console.warn('Could not parse database name from URI, using fallback');
        this.dbName = 'unknown_db';
      }
    } else {
      // For individual parameter connections
      this.pool = new Pool({
        ...config,
        ssl: config.ssl
      });
      this.dbName = config.database;
    }
    
    // Test the connection
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      console.log('Database connection test successful');
    } finally {
      client.release();
    }
    
    return this.dbName;
  }

  async getTables(schema: string): Promise<Table[]> {
    const client = await this.pool.connect();
    try {
      console.log(`Querying tables in schema: ${schema}`);
      const { rows: tables } = await client.query(QUERIES.GET_TABLES, [schema]);
      console.log('Raw tables result:', tables);

      const result: Table[] = [];

      for (const { table_name } of tables) {
        console.log(`Processing table: ${table_name}`);
        const [columns, pks, fks, uniques, checks] = await Promise.all([
          client.query(QUERIES.GET_COLUMNS, [schema, table_name]),
          client.query(QUERIES.GET_PRIMARY_KEYS, [schema, table_name]),
          client.query(QUERIES.GET_FOREIGN_KEYS, [schema, table_name]),
          client.query(QUERIES.GET_UNIQUE_CONSTRAINTS, [schema, table_name]),
          client.query(QUERIES.GET_CHECK_CONSTRAINTS, [schema, table_name])
        ]);

        const tableInfo: Table = {
          name: table_name,
          schema,
          columns: this.mapColumns(columns.rows),
          primary_key: pks.rows.map(pk => pk.column_name),
          foreign_keys: fks.rows,
          unique_constraints: uniques.rows,
          check_constraints: checks.rows,
          depends_on: fks.rows.map(fk => fk.foreign_table_name)
        };

        result.push(tableInfo);
      }

      console.log(`Processed ${result.length} tables`);
      return result;
    } catch (error) {
      console.error('Error getting tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  private mapColumns(columns: any[]): Column[] {
    return columns.map(col => ({
      name: col.column_name,
      type: this.getFullType(col),
      nullable: col.is_nullable === 'YES',
      default_value: col.column_default,
      constraints: []
    }));
  }

  private getFullType(column: any): string {
    let type = column.data_type.toUpperCase();

    if (column.character_maximum_length) {
      type += `(${column.character_maximum_length})`;
    } else if (column.numeric_precision) {
      type += `(${column.numeric_precision},${column.numeric_scale})`;
    }

    return type;
  }

  async getTableReferences(tableName: string): Promise<string[]> {
    const { rows } = await this.pool.query(QUERIES.GET_TABLE_REFERENCES, [tableName]);
    return rows.map(row => row.table_name);
  }

  async getEnhancedTableInfo(schema: string, table_name: string) {
    const client = await this.pool.connect();
    try {
      const [tableComment, columnComments, triggers] = await Promise.all([
        client.query(`
          SELECT obj_description(c.oid) as table_comment
          FROM pg_class c
          WHERE c.relname = $1 
          AND c.relnamespace = (
            SELECT oid 
            FROM pg_namespace 
            WHERE nspname = $2
          )
        `, [table_name, schema]),
        client.query(`
          SELECT 
            a.attname as column_name,
            pg_get_expr(d.adbin, d.adrelid) AS default_value,
            col_description(a.attrelid, a.attnum) as column_comment,
            t.typname as base_type,
            CASE WHEN t.typtype = 'e' THEN
              (SELECT array_agg(e.enumlabel) 
               FROM pg_enum e 
               WHERE e.enumtypid = t.oid)
            ELSE NULL END as enum_values
          FROM pg_class c
          JOIN pg_attribute a ON c.oid = a.attrelid
          LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
          JOIN pg_type t ON a.atttypid = t.oid
          WHERE c.relname = $1
          AND c.relnamespace = (
            SELECT oid 
            FROM pg_namespace 
            WHERE nspname = $2
          )
          AND a.attnum > 0
          AND NOT a.attisdropped
        `, [table_name, schema]),
        client.query(`
          SELECT 
            t.tgname as trigger_name,
            pg_get_triggerdef(t.oid, true) as trigger_definition
          FROM pg_trigger t
          JOIN pg_class c ON t.tgrelid = c.oid
          WHERE c.relname = $1
          AND c.relnamespace = (
            SELECT oid 
            FROM pg_namespace 
            WHERE nspname = $2
          )
          AND NOT t.tgisinternal
        `, [table_name, schema])
      ]);

      return {
        comments: {
          table: tableComment.rows[0]?.table_comment,
          columns: columnComments.rows
        },
        triggers: triggers.rows
      };
    } finally {
      client.release();
    }
  }
} 