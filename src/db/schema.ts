import { pgTable, varchar, text, integer, doublePrecision } from 'drizzle-orm/pg-core';

// 1. global_asset_catalog: Universal directory of standard models to solve the "Same Machine" problem
export const globalAssetCatalog = pgTable('global_asset_catalog', {
  modelId: varchar('model_id', { length: 255 }).primaryKey(), // e.g. "honda_civic_2020", "lg_dual_inverter_ac"
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  averageLifespanUsage: integer('average_lifespan_usage'), // in default metric (e.g. KM)
  averageLifespanTime: integer('average_lifespan_time'),   // in days
  notes: text('notes'),
});

// 2. user_categories: Stores custom user-defined categories
export const userCategories = pgTable('user_categories', {
  id: varchar('id', { length: 100 }).primaryKey(),
  userId: varchar('user_id', { length: 100 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
});

// 3. assets (dim_assets): Asset metadata
export const assets = pgTable('assets', {
  id: varchar('id', { length: 100 }).primaryKey(),
  userId: varchar('user_id', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  description: text('description'),
  purchaseDate: varchar('purchase_date', { length: 100 }), // ISO string
  odometer: doublePrecision('odometer'),
  useLevel: varchar('use_level', { length: 50 }).default('NORMAL').notNull(), // LEISURE | NORMAL | HEAVY | EXTREME
  imageUrl: varchar('image_url', { length: 500 }),
  globalModelId: varchar('global_model_id', { length: 255 }).references(() => globalAssetCatalog.modelId),
});

// 4. components (dim_components): Sub-parts belonging to assets
export const components = pgTable('components', {
  id: varchar('id', { length: 100 }).primaryKey(),
  userId: varchar('user_id', { length: 100 }).notNull(),
  assetId: varchar('asset_id', { length: 100 }).references(() => assets.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  metricType: varchar('metric_type', { length: 50 }).notNull(), // KM, Days, Hours
  trackingMode: varchar('tracking_mode', { length: 50 }).notNull(), // AUTO_EWMA | MANUAL_STATIC
  staticIntervalUsage: integer('static_interval_usage'),
  staticIntervalTime: integer('static_interval_time'),
  currentPredictedInterval: doublePrecision('current_predicted_interval'),
  currentAccumulatedUsage: integer('current_accumulated_usage').default(0).notNull(),
  lastServiceDate: varchar('last_service_date', { length: 100 }).notNull(), // ISO string
  useLevel: varchar('use_level', { length: 50 }), // LOW | MODERATE | HIGH | EXTREME
  estimatedCost: doublePrecision('estimated_cost'),
  purchaseDate: varchar('purchase_date', { length: 100 }), // ISO string
  predictionModelVersion: varchar('prediction_model_version', { length: 50 }).default('v1_ewma').notNull(), // Decouple algorithms
});

// 5. service_logs (fact_service_logs): Immutable maintenance history
export const serviceLogs = pgTable('service_logs', {
  id: varchar('id', { length: 100 }).primaryKey(),
  userId: varchar('user_id', { length: 100 }).notNull(),
  componentId: varchar('component_id', { length: 100 }).references(() => components.id, { onDelete: 'cascade' }).notNull(),
  timestamp: varchar('timestamp', { length: 100 }).notNull(), // ISO string
  actualMetricValue: integer('actual_metric_value').notNull(),
  notes: text('notes'),
  cost: doublePrecision('cost'),
  useLevelAtService: varchar('use_level_at_service', { length: 50 }), // Stores raw features for ML
});

// 6. use_level_logs: History of asset usage level changes
export const useLevelLogs = pgTable('use_level_logs', {
  id: varchar('id', { length: 100 }).primaryKey(),
  userId: varchar('user_id', { length: 100 }).notNull(),
  assetId: varchar('asset_id', { length: 100 }).references(() => assets.id, { onDelete: 'cascade' }).notNull(),
  oldUseLevel: varchar('old_use_level', { length: 50 }),
  newUseLevel: varchar('new_use_level', { length: 50 }),
  timestamp: varchar('timestamp', { length: 100 }).notNull(), // ISO string
});
