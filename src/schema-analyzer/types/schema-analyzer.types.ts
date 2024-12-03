import { PoolConfig } from 'pg';

export interface ColumnConstraint {
  name: string;
  type: 'CHECK' | 'UNIQUE' | 'NOT NULL' | 'DEFAULT' | 'FOREIGN KEY';
  definition?: string;
  referenced_table?: string;
  referenced_column?: string;
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default_value: string | null;
  constraints: ColumnConstraint[];
}

export interface Table {
  name: string;
  schema: string;
  columns: Column[];
  primary_key: string[];
  foreign_keys: {
    column: string;
    referenced_table: string;
    referenced_column: string;
    update_rule: string;
    delete_rule: string;
  }[];
  unique_constraints: {
    name: string;
    columns: string[];
  }[];
  check_constraints: {
    name: string;
    definition: string;
  }[];
  depends_on: string[];  // Tables that must be populated first
}

export interface ParsedUri {
  host: string;
  database: string;
  user: string;
  password: string;
  port?: number;
  ssl?: boolean | {
    rejectUnauthorized: boolean;
    checkServerIdentity?: () => undefined;
  };
}

export type SchemaAnalyzerConfig = string | PoolConfig;

export interface SchemaCommandOptions {
  uri: string;
  schema: string;
  outputPath?: string;
  llmtxt?: boolean;
}

export interface ColumnComment {
  column_name: string;
  default_value: string | null;
  column_comment: string | null;
  base_type: string;
  enum_values: string[] | null;
}