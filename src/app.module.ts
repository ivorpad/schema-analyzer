import { Module } from '@nestjs/common';
import { SchemaAnalyzerCommand } from './schema-analyzer/schema-analyzer.command';
import { SchemaAnalyzerService } from './schema-analyzer/schema-analyzer.service';

@Module({
  providers: [SchemaAnalyzerService, SchemaAnalyzerCommand],
})
export class AppModule {}