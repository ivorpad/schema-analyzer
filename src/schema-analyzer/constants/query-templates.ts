export const QUERIES = {
  GET_TABLES: `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = $1 
    AND table_type = 'BASE TABLE'
  `,
  GET_COLUMNS: `
    SELECT 
      c.column_name, 
      c.data_type,
      c.is_nullable,
      c.column_default,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale
    FROM information_schema.columns c
    WHERE c.table_schema = $1 
    AND c.table_name = $2
    ORDER BY c.ordinal_position;
  `,
  GET_PRIMARY_KEYS: `
    SELECT c.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage AS ccu 
      ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.columns AS c 
      ON c.table_name = tc.table_name 
      AND c.column_name = ccu.column_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = $1
    AND tc.table_name = $2;
  `,
  GET_FOREIGN_KEYS: `
    SELECT
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.update_rule,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = $1
    AND tc.table_name = $2;
  `,
  GET_UNIQUE_CONSTRAINTS: `
    SELECT 
      tc.constraint_name,
      array_agg(kcu.column_name) as columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
      AND kcu.table_name = tc.table_name
    WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = $1
    AND tc.table_name = $2
    GROUP BY tc.constraint_name;
  `,
  GET_CHECK_CONSTRAINTS: `
    SELECT 
      tc.constraint_name,
      cc.check_clause as definition
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
      ON cc.constraint_name = tc.constraint_name
      AND cc.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = $1
    AND tc.table_name = $2
    AND tc.constraint_type = 'CHECK';
  `,
  GET_TABLE_REFERENCES: `
    SELECT DISTINCT cl.relname AS table_name
    FROM pg_constraint co
    JOIN pg_class cl ON cl.oid = co.conrelid
    WHERE co.confrelid = (
      SELECT oid 
      FROM pg_class 
      WHERE relname = $1
      AND relkind = 'r'
    )
    AND co.contype = 'f'
  `
}; 