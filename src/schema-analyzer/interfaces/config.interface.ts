export interface DatabaseConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  ssl?: {
    rejectUnauthorized: boolean;
    checkServerIdentity: () => undefined;
  };
}

export interface SchemaAnalyzerConfig extends DatabaseConfig {
  llmtxt?: boolean;
}

export interface ParsedUri extends DatabaseConfig {
  // Additional URI-specific fields can be added here
} 