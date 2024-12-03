import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Table } from '../types/schema-analyzer.types';

@Injectable()
export class OutputService {
  async saveAnalysisToFile(
    dbName: string,
    tables: Table[],
    insertionOrder: string[],
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `db-analysis-${dbName}-${timestamp}.txt`;

    let content = `Database Analysis for ${dbName}\n`;
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

    await fs.promises.writeFile(fileName, content);
  }

  async generateLLMsTxt(
    dbName: string,
    tables: Table[],
    outputPath: string = '.',
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `llmstxt-${dbName}-${timestamp}.txt`;
    const filePath = path.join(outputPath, fileName);

    let content = `# ${dbName} Database Schema\n\n`;

    // Summary
    content += `> This database contains ${tables.length} tables with ${tables.reduce(
      (acc, table) => acc + table.foreign_keys.length,
      0,
    )} relationships.\n\n`;

    // Core Tables Section
    content += `## Core Tables\n\n`;
    const coreTables = tables.filter(table => table.foreign_keys.length > 0);
    for (const table of coreTables) {
      content += `- ${table.name}: ${this.generateTableSummary(table)}\n`;
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
      content += `### ${table.name}\n`;
      content += `Primary key: ${table.primary_key.join(', ') || 'None'}\n\n`;

      content += `Columns:\n`;
      table.columns.forEach((col) => {
        content += `- ${col.name} (${col.type})${col.nullable ? '' : ' NOT NULL'}${
          col.default_value ? ` DEFAULT ${col.default_value}` : ''
        }\n`;
      });

      if (table.check_constraints.length > 0 || table.unique_constraints.length > 0) {
        content += `\nConstraints:\n`;
        if (table.unique_constraints.length > 0) {
          content += `- Unique: ${table.unique_constraints
            .map((uc) => uc.columns.join(', '))
            .join('; ')}\n`;
        }
        if (table.check_constraints.length > 0) {
          content += `- Checks: ${table.check_constraints
            .map((cc) => cc.definition)
            .join('; ')}\n`;
        }
      }

      content += '\n';
    }

    await fs.promises.writeFile(filePath, content);
    return filePath;
  }

  private generateTableSummary(table: Table): string {
    const pkStr = table.primary_key.length > 0 ? `PK(${table.primary_key.join(', ')})` : '';
    const referencedBy = table.foreign_keys.length;
    const referencesStr = referencedBy > 0 ? `Referenced by ${referencedBy} tables` : '';

    return [pkStr, referencesStr].filter((s) => s.length > 0).join(', ');
  }
}