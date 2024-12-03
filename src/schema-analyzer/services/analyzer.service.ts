import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { OutputService } from './output.service';
import { SchemaAnalyzerConfig, Table } from '../types/schema-analyzer.types';

@Injectable()
export class AnalyzerService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly outputService: OutputService,
  ) {}

  async analyze(config: SchemaAnalyzerConfig, schema = 'public'): Promise<{
    tables: Table[];
    insertionOrder?: string[];
    dbName: string;
  }> {
    console.log('Connecting to database with config:', {
      ...config,
      password: '***',
      uri: '***'
    });
    
    const dbName = await this.databaseService.connect(config);
    console.log('Connected to database');
    
    const tables = await this.databaseService.getTables(config.schema || schema);
    console.log(`Found ${tables.length} tables in schema ${config.schema || schema}`);

    if (!config.llmtxt) {
      const insertionOrder = this.determineInsertionOrder(tables);
      await this.outputService.saveAnalysisToFile(dbName, tables, insertionOrder);
      return { tables, insertionOrder, dbName };
    }

    return { tables, dbName };
  }

  async generateInsertionGuide(config: SchemaAnalyzerConfig): Promise<string> {
    const { tables, insertionOrder, dbName } = await this.analyze({ ...config, llmtxt: false });

    let guide = `# Database Insertion Guide for ${dbName}\n\n`;

    guide += '## Insertion Order\n';
    guide += 'Tables must be populated in the following order to satisfy dependencies:\n\n';
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

  async generateLLMsTxt(config: SchemaAnalyzerConfig, outputPath: string = '.'): Promise<string> {
    const { tables, dbName } = await this.analyze(config);
    return this.outputService.generateLLMsTxt(dbName, tables, outputPath);
  }

  private determineInsertionOrder(tables: Table[]): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (tableName: string) => {
      if (visited.has(tableName)) return;
      if (visiting.has(tableName)) {
        throw new Error(`Circular dependency detected involving table: ${tableName}`);
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

    tables.forEach((table) => {
      if (!visited.has(table.name)) {
        visit(table.name);
      }
    });

    return order;
  }
} 