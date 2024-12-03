export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  default_value: string | null;
  constraints: string[];
}

export interface ForeignKey {
  column: string;
  referenced_table: string;
  referenced_column: string;
  update_rule: string;
  delete_rule: string;
}

export interface UniqueConstraint {
  name: string;
  columns: string[];
}

export interface CheckConstraint {
  name: string;
  definition: string;
}

export interface Table {
  name: string;
  schema: string;
  columns: Column[];
  primary_key: string[];
  foreign_keys: ForeignKey[];
  unique_constraints: UniqueConstraint[];
  check_constraints: CheckConstraint[];
  depends_on: string[];
}

export interface TableAnalysis {
  tables: Table[];
  insertionOrder?: string[];
} 