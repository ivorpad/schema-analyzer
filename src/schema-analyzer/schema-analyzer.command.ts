import { Command, CommandRunner, Option } from 'nest-commander';
import { AnalyzerService } from './services/analyzer.service';

interface SchemaAnalyzerOptions {
  uri?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  schema?: string;
  llmtxt?: boolean;
  outputPath?: string;
}

@Command({
  name: 'analyze',
  description: 'Analyze database schema',
})
export class SchemaAnalyzerCommand extends CommandRunner {
  constructor(private readonly analyzerService: AnalyzerService) {
    super();
  }

  async run(
    passedParams: string[],
    options: SchemaAnalyzerOptions,
  ): Promise<void> {
    try {
      const config = this.parseConfig(options);

      if (options.llmtxt) {
        const outputPath = await this.analyzerService.generateLLMsTxt(config, options.outputPath);
        console.log(`LLMs text generated at: ${outputPath}`);
      } else {
        const guide = await this.analyzerService.generateInsertionGuide(config);
        console.log(guide);
      }
    } catch (error) {
      console.error('Error analyzing schema:', error.message);
      process.exit(1);
    }
  }

  @Option({
    flags: '-u, --uri [string]',
    description: 'Database connection URI',
  })
  parseUri(val: string): string {
    return val;
  }

  @Option({
    flags: '-h, --host [string]',
    description: 'Database host',
  })
  parseHost(val: string): string {
    return val;
  }

  @Option({
    flags: '-p, --port [number]',
    description: 'Database port',
  })
  parsePort(val: string): number {
    return Number(val);
  }

  @Option({
    flags: '-d, --database [string]',
    description: 'Database name',
  })
  parseDatabase(val: string): string {
    return val;
  }

  @Option({
    flags: '--user [string]',
    description: 'Database user',
  })
  parseUser(val: string): string {
    return val;
  }

  @Option({
    flags: '--password [string]',
    description: 'Database password',
  })
  parsePassword(val: string): string {
    return val;
  }

  @Option({
    flags: '-s, --schema [string]',
    description: 'Database schema (default: public)',
  })
  parseSchema(val: string): string {
    return val;
  }

  @Option({
    flags: '--llmtxt',
    description: 'Generate LLMs-friendly text output',
  })
  parseLlmtxt(): boolean {
    return true;
  }

  @Option({
    flags: '-o, --output-path [string]',
    description: 'Output path for generated files',
  })
  parseOutputPath(val: string): string {
    return val;
  }

  private parseConfig(options: SchemaAnalyzerOptions) {
    if (options.uri) {
      return {
        uri: options.uri,
        schema: options.schema || 'public',
        llmtxt: options.llmtxt || false,
        ssl: {
          rejectUnauthorized: false,
          checkServerIdentity: () => undefined
        }
      };
    }

    if (!options.host || !options.database || !options.user || !options.password) {
      throw new Error(
        'Must provide either connection URI or host, database, user, and password',
      );
    }

    return {
      host: options.host,
      port: options.port || 5432,
      database: options.database,
      user: options.user,
      password: options.password,
      schema: options.schema || 'public',
      llmtxt: options.llmtxt || false,
      ssl: {
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined
      }
    };
  }
}
