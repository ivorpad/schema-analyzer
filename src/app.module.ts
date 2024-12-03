import { Module } from '@nestjs/common';
import { SchemaAnalyzerCommand } from './schema-analyzer/schema-analyzer.command';

@Module({
  imports: [],
  providers: [SchemaAnalyzerCommand],
})
export class AppModule {}