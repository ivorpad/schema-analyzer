#!/usr/bin/env node

import { CommandFactory } from 'nest-commander';
import { SchemaAnalyzerModule } from './schema-analyzer/schema-analyzer.module';

async function bootstrap() {
  await CommandFactory.run(SchemaAnalyzerModule);
}

bootstrap();