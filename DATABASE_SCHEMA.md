# Database Schema: Smart Maintenance Assets Assistant

This application uses a star schema approach to maintain clear separation between asset metadata and the immutable service history.

## Entities (Drizzle ORM Dialect)

```typescript
import { pgTable, serial, text, integer, timestamp, varchar, doublePrecision } from 'drizzle-orm/pg-core';

// dim_assets: Core asset metadata
export const assets = pgTable('dim_assets', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(), // e.g., "Daily Scooter", "Home Appliance"
  createdAt: timestamp('created_at').defaultNow(),
});

// dim_components: Parts/components belonging to an asset
export const components = pgTable('dim_components', {
  id: serial('id').primaryKey(),
  assetId: integer('asset_id').references(() => assets.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  metricType: varchar('metric_type', { length: 50 }).notNull(), // KM, Cycles, etc.
  trackingMode: varchar('tracking_mode', { length: 50 }).notNull(), // AUTO_EWMA or MANUAL_STATIC
  
  // Rules
  staticIntervalUsage: integer('static_interval_usage'), // e.g., 1000 KM
  staticIntervalTime: integer('static_interval_time'),  // e.g., 90 Days
  
  // Predictive State
  currentPredictedInterval: doublePrecision('current_predicted_interval'),
  
  // Current stats since last service
  currentAccumulatedUsage: integer('current_accumulated_usage').default(0).notNull(),
  lastServiceDate: timestamp('last_service_date').defaultNow().notNull(),
});

// fact_service_logs: Immutable service history
export const serviceLogs = pgTable('fact_service_logs', {
  id: serial('id').primaryKey(),
  componentId: integer('component_id').references(() => components.id, { onDelete: 'cascade' }).notNull(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  actualMetricValue: integer('actual_metric_value').notNull(), // Value logged at time of service
  notes: text('notes'),
});
```

## Logic Invariants

1. **Immutable History**: `fact_service_logs` is append-only. Deleting a log is forbidden; only corrections via new entries or logical deletion (not implemented in MVP) are allowed.
2. **Maintenance Mode A (EWMA)**:
   - When a service is logged, the system calculates:
     `new_predicted = (0.3 * actual_usage) + (0.7 * old_predicted)`
   - `currentAccumulatedUsage` resets to 0.
3. **Maintenance Mode B (Manual)**:
   - Status = `max(accumulated_usage / static_usage, days_since_last / static_time)`
