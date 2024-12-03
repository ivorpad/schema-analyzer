import { Command, CommandRunner, Option } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { SchemaAnalyzerService } from './schema-analyzer.service';

@Injectable()
@Command({
  name: 'analyze-schema',
  description: 'Analyze a PostgreSQL database schema',
})
export class SchemaAnalyzerCommand extends CommandRunner {
  constructor(private readonly schemaAnalyzerService: SchemaAnalyzerService) {
    super();
  }

  async run(
    passedParams: string[],
    options: Record<string, any>,
  ): Promise<void> {
    console.log('Starting schema analysis...');
    const { uri, schema, llmtxt } = options;
    console.log(`Analyzing schema: ${schema}`);

    this.schemaAnalyzerService.configure(uri, llmtxt);

    try {
      if (llmtxt) {
        const filePath = await this.schemaAnalyzerService.generateLLMsTxt();
        console.log(`\nLLMs analysis saved to: ${filePath}`);
      } else {
        const guide = await this.schemaAnalyzerService.generateInsertionGuide();
        console.log('\n=== Schema Analysis Report ===\n');
        console.log(guide);
      }
    } catch (error) {
      console.error('Error during schema analysis:', error.message);
    }
  }

  @Option({
    flags: '-s, --schema <schema>',
    description: 'Database schema to analyze',
    defaultValue: 'public',
  })
  parseSchema(val: string): string {
    return val;
  }

  @Option({
    flags: '--llmtxt',
    description: 'Generate LLMs-friendly text output',
    defaultValue: false,
  })
  parseLLMsTxt(): boolean {
    return true;
  }

  @Option({
    flags: '-u, --uri <uri>',
    description: 'Database connection URI',
  })
  parseUri(val: string): string {
    return val;
  }
}
