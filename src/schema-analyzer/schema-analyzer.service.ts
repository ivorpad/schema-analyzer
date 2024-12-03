import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import {
  ParsedUri,
  SchemaAnalyzerConfig,
  Table,
} from './types/schema-analyzer.types';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class SchemaAnalyzerService {
  private pool: Pool;
  private dbName: string;
  private llmtxt: boolean;

  configure(config: SchemaAnalyzerConfig, llmtxt: boolean) {
    this.llmtxt = llmtxt;
    if (typeof config === 'string') {
      const parsedConfig = this.parseConnectionUri(config);
      this.pool = new Pool(parsedConfig);
      this.dbName = parsedConfig.database;
    } else {
      const sslConfig = {
        ...config,
        ssl: {
          rejectUnauthorized: false,
          checkServerIdentity: () => undefined
        }
      };
      this.pool = new Pool(sslConfig);
      this.dbName = config.database || 'unnamed_db';
    }
  }

  async analyze(schema = 'public'): Promise<
    | {
        tables: Table[];
        insertionOrder: string[];
      }
    | {
        tables: Table[];
      }
  > {
    const tables = await this.getTables(schema);

    // Generate and save analysis to file
    if (!this.llmtxt) {
      const insertionOrder = this.determineInsertionOrder(tables);
      await this.saveAnalysisToFile(tables, insertionOrder);

      return { tables, insertionOrder };
    }

    return { tables };
  }

  private async saveAnalysisToFile(
    tables: Table[],
    insertionOrder: string[],
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `db-analysis-${this.dbName}-${timestamp}.txt`;

    let content = `Database Analysis for ${this.dbName}\n`;
    content += `Generated at: ${new Date().toISOString()}\n\n`;

    // Tables Summary
    content += `=== Tables Summary ===\n`;
    content += `Total tables: ${tables.length}\n\n`;

    // Insertion Order
    content += `=== Insertion Order ===\n`;
    insertionOrder.forEach((table, index) => {
      content += `${index + 1}. ${table}\n`;
    });
    content += '\n';

    // Detailed Table Information
    content += `=== Table Details ===\n\n`;
    for (const table of tables) {
      content += `Table: ${table.name}\n`;
      content += `Schema: ${table.schema}\n`;

      // Primary Key
      if (table.primary_key.length > 0) {
        content += `Primary Key: ${table.primary_key.join(', ')}\n`;
      }

      // Columns
      content += `Columns:\n`;
      table.columns.forEach((col) => {
        content += `  - ${col.name} (${col.type})${col.nullable ? '' : ' NOT NULL'}${
          col.default_value ? ` DEFAULT ${col.default_value}` : ''
        }\n`;
      });

      // Foreign Keys
      if (table.foreign_keys.length > 0) {
        content += `Foreign Keys:\n`;
        table.foreign_keys.forEach((fk) => {
          content += `  - ${fk.column} -> ${fk.referenced_table}.${fk.referenced_column}\n`;
        });
      }

      // Unique Constraints
      if (table.unique_constraints.length > 0) {
        content += `Unique Constraints:\n`;
        table.unique_constraints.forEach((uc) => {
          content += `  - ${uc.columns.join(', ')}\n`;
        });
      }

      // Check Constraints
      if (table.check_constraints.length > 0) {
        content += `Check Constraints:\n`;
        table.check_constraints.forEach((cc) => {
          content += `  - ${cc.definition}\n`;
        });
      }

      content += '\n';
    }

    // Dependencies Graph
    content += `=== Dependencies ===\n`;
    tables.forEach((table) => {
      if (table.depends_on.length > 0) {
        content += `${table.name} depends on: ${table.depends_on.join(', ')}\n`;
      }
    });

    try {
      await fs.promises.writeFile(fileName, content);
      console.log(`Analysis saved to ${fileName}`);
    } catch (error) {
      console.error('Error saving analysis:', error);
      throw error;
    }
  }

  private async getTables(schema: string): Promise<Table[]> {
    const client = await this.pool.connect();
    try {
      // Get all tables
      const tableQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = $1 
        AND table_type = 'BASE TABLE'
      `;
      const { rows: tables } = await client.query(tableQuery, [schema]);

      const result: Table[] = [];

      for (const { table_name } of tables) {
        // Get columns and their basic properties
        const columnsQuery = `
          SELECT 
            c.column_name, 
            c.data_type,
            c.is_nullable,
            c.column_default,
            c.character_maximum_length,
            c.numeric_precision,
            c.numeric_scale
          FROM information_schema.columns c
          WHERE c.table_schema = $1 
          AND c.table_name = $2
          ORDER BY c.ordinal_position;
        `;
        const { rows: columns } = await client.query(columnsQuery, [
          schema,
          table_name,
        ]);

        // Get primary key
        const pkQuery = `
          SELECT c.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.constraint_column_usage AS ccu 
            ON ccu.constraint_name = tc.constraint_name
          JOIN information_schema.columns AS c 
            ON c.table_name = tc.table_name 
            AND c.column_name = ccu.column_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2;
        `;
        const { rows: pks } = await client.query(pkQuery, [schema, table_name]);

        // Get foreign keys
        const fkQuery = `
          SELECT
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            rc.update_rule,
            rc.delete_rule
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
          JOIN information_schema.referential_constraints AS rc
            ON rc.constraint_name = tc.constraint_name
          WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2;
        `;
        const { rows: fks } = await client.query(fkQuery, [schema, table_name]);

        // Get unique constraints
        const uniqueQuery = `
          SELECT 
            tc.constraint_name,
            array_agg(kcu.column_name) as columns
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu 
            ON kcu.constraint_name = tc.constraint_name
            AND kcu.table_schema = tc.table_schema
            AND kcu.table_name = tc.table_name
          WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_schema = $1
          AND tc.table_name = $2
          GROUP BY tc.constraint_name;
        `;
        const { rows: uniques } = await client.query(uniqueQuery, [
          schema,
          table_name,
        ]);

        // Get check constraints
        const checkQuery = `
          SELECT 
            tc.constraint_name,
            cc.check_clause as definition
          FROM information_schema.table_constraints tc
          JOIN information_schema.check_constraints cc
            ON cc.constraint_name = tc.constraint_name
            AND cc.constraint_schema = tc.constraint_schema
          WHERE tc.table_schema = $1
          AND tc.table_name = $2
          AND tc.constraint_type = 'CHECK';
        `;
        const { rows: checks } = await client.query(checkQuery, [
          schema,
          table_name,
        ]);

        const tableInfo: Table = {
          name: table_name,
          schema,
          columns: columns.map((col) => ({
            name: col.column_name,
            type: this.getFullType(col),
            nullable: col.is_nullable === 'YES',
            default_value: col.column_default,
            constraints: [],
          })),
          primary_key: pks.map((pk) => pk.column_name),
          foreign_keys: fks.map((fk) => ({
            column: fk.column_name,
            referenced_table: fk.foreign_table_name,
            referenced_column: fk.foreign_column_name,
            update_rule: fk.update_rule,
            delete_rule: fk.delete_rule,
          })),
          unique_constraints: uniques.map((u) => ({
            name: u.constraint_name,
            columns: u.columns,
          })),
          check_constraints: checks.map((c) => ({
            name: c.constraint_name,
            definition: c.definition,
          })),
          depends_on: fks.map((fk) => fk.foreign_table_name),
        };

        result.push(tableInfo);
      }

      return result;
    } finally {
      client.release();
    }
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

  private determineInsertionOrder(tables: Table[]): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (tableName: string) => {
      if (visited.has(tableName)) return;
      if (visiting.has(tableName)) {
        throw new Error(
          `Circular dependency detected involving table: ${tableName}`,
        );
      }

      visiting.add(tableName);

      const table = tables.find((t) => t.name === tableName);
      if (table) {
        for (const dep of table.depends_on) {
          visit(dep);
        }
      }

      visiting.delete(tableName);
      visited.add(tableName);
      order.push(tableName);
    };

    // Visit all tables to build the dependency order
    tables.forEach((table) => {
      if (!visited.has(table.name)) {
        visit(table.name);
      }
    });

    return order;
  }

  async generateInsertionGuide(): Promise<string> {
    const { tables, insertionOrder } = (await this.analyze()) as {
      tables: Table[];
      insertionOrder: string[];
    };

    let guide = '# Database Insertion Guide\n\n';

    guide += '## Insertion Order\n';
    guide +=
      'Tables must be populated in the following order to satisfy dependencies:\n\n';
    insertionOrder.forEach((table, index) => {
      guide += `${index + 1}. ${table}\n`;
    });

    guide += '\n## Table Details\n';
    for (const tableName of insertionOrder) {
      const table = tables.find((t) => t.name === tableName)!;

      guide += `\n### ${table.name}\n`;

      if (table.depends_on.length > 0) {
        guide += '\nDependencies:\n';
        table.depends_on.forEach((dep) => {
          guide += `- Requires ${dep} to be populated first\n`;
        });
      }

      guide += '\nRequired columns:\n';
      table.columns
        .filter((col) => !col.nullable && col.default_value === null)
        .forEach((col) => {
          guide += `- ${col.name} (${col.type})\n`;
        });

      if (table.unique_constraints.length > 0) {
        guide += '\nUnique constraints:\n';
        table.unique_constraints.forEach((uc) => {
          guide += `- ${uc.columns.join(', ')}\n`;
        });
      }

      if (table.check_constraints.length > 0) {
        guide += '\nCheck constraints:\n';
        table.check_constraints.forEach((cc) => {
          guide += `- ${cc.definition}\n`;
        });
      }
    }

    return guide;
  }

  async generateLLMsTxt(outputPath: string = '.'): Promise<string> {
    const { tables } = await this.analyze();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `llmstxt-${this.dbName}-${timestamp}.txt`;
    const filePath = path.join(outputPath, fileName);

    let content = `# ${this.dbName} Database Schema\n\n`;

    // Summary
    content += `> This database contains ${tables.length} tables with ${tables.reduce(
      (acc, table) => acc + table.foreign_keys.length,
      0,
    )} relationships.\n\n`;

    // Core Tables Section
    content += `## Core Tables\n\n`;
    const coreTables = await this.identifyCoreTables(tables);
    for (const table of coreTables) {
      content += `- ${table.name}: ${await this.generateTableSummary(table)}\n`;
    }

    // Relationships Section
    content += `\n## Table Relationships\n\n`;
    tables.forEach((table) => {
      if (table.foreign_keys.length > 0) {
        content += `- ${table.name} depends on: ${table.foreign_keys
          .map(
            (fk) =>
              `${fk.referenced_table} (${fk.column} -> ${fk.referenced_column}) [${fk.delete_rule}]`,
          )
          .join(', ')}\n`;
      }
    });

    // Detailed Table Overview
    content += `\n## Table Details\n\n`;
    for (const table of tables) {
      const enhancedInfo = await this.getEnhancedTableInfo(
        table.schema,
        table.name,
      );

      content += `### ${table.name}\n`;
      if (enhancedInfo.comments.table) {
        content += `Description: ${enhancedInfo.comments.table}\n\n`;
      }

      content += `Primary key: ${table.primary_key.join(', ') || 'None'}\n\n`;

      // Columns with enhanced information
      content += `Columns:\n`;
      table.columns.forEach((col) => {
        const colInfo = enhancedInfo.comments.columns.find(
          (c) => c.column_name === col.name,
        );
        content += `- ${col.name} (${col.type})${col.nullable ? '' : ' NOT NULL'}${
          col.default_value ? ` DEFAULT ${col.default_value}` : ''
        }`;
        if (colInfo?.column_comment) {
          content += ` // ${colInfo.column_comment}`;
        }
        if (colInfo?.enum_values) {
          // Handle both string array and string representation of array
          const enumValues = Array.isArray(colInfo.enum_values)
            ? colInfo.enum_values
            : colInfo.enum_values.replace(/[{"}]/g, '').split(',');
          content += `\n  Allowed values: ${enumValues.join(', ')}`;
        }
        content += '\n';
      });

      // Constraints
      if (
        table.check_constraints.length > 0 ||
        table.unique_constraints.length > 0
      ) {
        content += `\nConstraints:\n`;
        if (table.unique_constraints.length > 0) {
          content += `- Unique: ${table.unique_constraints.map((uc) => uc.columns.join(', ')).join('; ')}\n`;
        }
        if (table.check_constraints.length > 0) {
          content += `- Checks: ${table.check_constraints.map((cc) => cc.definition).join('; ')}\n`;
        }
      }

      // Triggers
      if (enhancedInfo.triggers.length > 0) {
        content += `\nTriggers:\n`;
        enhancedInfo.triggers.forEach((trigger) => {
          content += `- ${trigger.trigger_name}: ${trigger.trigger_definition}\n`;
        });
      }

      content += '\n';
    }

    try {
      await fs.promises.writeFile(filePath, content);
      return filePath;
    } catch (error) {
      console.error('Error saving analysis:', error);
      throw error;
    }
  }

  private async getEnhancedTableInfo(schema: string, table_name: string) {
    const client = await this.pool.connect();
    try {
      // Get table comments - using quoted identifiers
      const tableCommentQuery = `
        SELECT obj_description(c.oid) as table_comment
        FROM pg_class c
        WHERE c.relname = $1 
        AND c.relnamespace = (
          SELECT oid 
          FROM pg_namespace 
          WHERE nspname = $2
        )
      `;

      // Get column comments - using quoted table name
      const columnCommentsQuery = `
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
      `;

      // Get triggers - using exact table name
      const triggersQuery = `
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
      `;

      const [tableComment, columnComments, triggers] = await Promise.all([
        client.query(tableCommentQuery, [table_name, schema]),
        client.query(columnCommentsQuery, [table_name, schema]),
        client.query(triggersQuery, [table_name, schema]),
      ]);

      return {
        comments: {
          table: tableComment.rows[0]?.table_comment,
          columns: columnComments.rows,
        },
        triggers: triggers.rows,
        enums: columnComments.rows
          .filter((row) => row.enum_values)
          .map((row) => ({
            column: row.column_name,
            values: row.enum_values,
          })),
      };
    } finally {
      client.release();
    }
  }

  private async identifyCoreTables(tables: Table[]): Promise<Table[]> {
    const referenceCount = new Map<string, number>();

    await Promise.all(
      tables.map(async (table) => {
        const references = await this.getTableReferences(table.name);
        referenceCount.set(table.name, references.length);
      }),
    );

    return tables
      .filter((table) => (referenceCount.get(table.name) || 0) > 0)
      .sort(
        (a, b) =>
          (referenceCount.get(b.name) || 0) - (referenceCount.get(a.name) || 0),
      );
  }

  private async generateTableSummary(table: Table): Promise<string> {
    const pkStr =
      table.primary_key.length > 0 ? `PK(${table.primary_key.join(', ')})` : '';
    const referencedBy = await this.getTableReferences(table.name);
    const referencesStr =
      referencedBy.length > 0
        ? `Referenced by ${referencedBy.length} tables`
        : '';

    return [pkStr, referencesStr].filter((s) => s.length > 0).join(', ');
  }

  private async getTableReferences(tableName: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ table_name: string }>(
      `
      SELECT DISTINCT cl.relname AS table_name
      FROM pg_constraint co
      JOIN pg_class cl ON cl.oid = co.conrelid
      WHERE co.confrelid = (
        SELECT oid 
        FROM pg_class 
        WHERE relname = $1
        AND relkind = 'r'
      )
      AND co.contype = 'f'
    `,
      [tableName],
    );

    return rows.map((row) => row.table_name);
  }

  private noop(input: any) {
    input;
    return;
  }

  private parseConnectionUri(uri: string): ParsedUri {
    try {
      // Handle both postgresql:// and postgres:// prefixes
      const cleanUri = uri.replace(/^postgres(ql)?:\/\//, '');

      // Extract authentication and host info
      const [authHostPath, ...queryParts] = cleanUri.split('?');
      this.noop(queryParts);
      const [authHost, path] = authHostPath.split('/');

      let auth: string | undefined;
      let host: string;

      if (authHost.includes('@')) {
        [auth, host] = authHost.split('@');
      } else {
        host = authHost;
      }

      // Parse host and port
      const [hostname, port] = host.split(':');

      // Parse authentication if present
      let user = '',
        password = '';
      if (auth) {
        // Find the first colon to split user and password correctly
        const colonIndex = auth.indexOf(':');
        user = auth.substring(0, colonIndex);
        // Take the rest as password to preserve any colons in it
        password = auth.substring(colonIndex + 1);
      }

      // Create config with encoded components
      const config: ParsedUri = {
        host: hostname,
        database: path,
        user,
        password, // Keep password as-is
      };

      if (port) {
        config.port = parseInt(port, 10);
      }

      // Add SSL config for AWS RDS
      config.ssl = {
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined
      };

      return config;
    } catch (error) {
      throw new Error(`Invalid connection URI: ${error.message}`);
    }
  }
}
