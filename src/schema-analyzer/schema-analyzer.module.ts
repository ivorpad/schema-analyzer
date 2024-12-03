import { Module } from '@nestjs/common';
import { SchemaAnalyzerCommand } from './schema-analyzer.command';
import { DatabaseService } from './services/database.service';
import { OutputService } from './services/output.service';
import { AnalyzerService } from './services/analyzer.service';

@Module({
  providers: [
    SchemaAnalyzerCommand,
    DatabaseService,
    OutputService,
    AnalyzerService,
  ],
})
export class SchemaAnalyzerModule {} 