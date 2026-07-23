---
name: Supabase v2 Database type requirements
description: What the Database type must include for Supabase v2.57+ to properly type table operations; missing Relationships causes never type.
---

## Rule
Every table in `Database["public"]["Tables"]` MUST include `Relationships: []` (or an actual array of `GenericRelationship`). If this field is missing, `SupabaseClient<Database>.from('tableName')` returns `never` for all operations.

`Database["public"]` must also satisfy `GenericSchema`, which requires:
- `Tables: Record<string, GenericTable>` (GenericTable needs Row, Insert, Update, Relationships)
- `Views: Record<string, GenericView>` (can be `Record<string, never>` or `{}`)
- `Functions: Record<string, GenericFunction>` (needed for typed RPC calls)

**Why:** Supabase v2 SupabaseClient generic does: `Schema extends Database[SchemaName] extends GenericSchema ? Database[SchemaName] : never`. If Database["public"] doesn't satisfy GenericSchema, Schema = never, making all .from() operations return never.

**How to apply:** Always add `Relationships: [];` to every table definition in database.ts. RPC functions without entries in `Functions` section will have `undefined` as their arg type, causing TypeScript errors.
