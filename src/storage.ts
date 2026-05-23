import fs from 'node:fs';
import path from 'node:path';
import { Asset, Component, ServiceLog, UseLevelLog } from './types.ts';
import { Firestore } from '@google-cloud/firestore';
import { db } from './db/index.ts';
import { 
  assets as assetsTable, 
  components as componentsTable, 
  serviceLogs as serviceLogsTable, 
  useLevelLogs as useLevelLogsTable, 
  userCategories as userCategoriesTable,
  globalAssetCatalog as globalAssetCatalogTable
} from './db/schema.ts';
import { eq, and } from 'drizzle-orm';


export interface DbData {
  assets: Asset[];
  components: (Component & { useLevel?: string })[];
  logs: ServiceLog[];
  useLevelLogs: UseLevelLog[];
  categories: string[];
  userCategories?: Record<string, string[]>;
}

export interface StorageRepository {
  getCategories(userId: string): Promise<string[]>;
  addCategory(userId: string, category: string): Promise<void>;

  getAssets(userId: string): Promise<Asset[]>;
  getAsset(userId: string, id: string): Promise<Asset | null>;
  addAsset(userId: string, asset: Asset): Promise<void>;
  updateAsset(userId: string, id: string, asset: Asset): Promise<void>;
  deleteAsset(userId: string, id: string): Promise<void>;

  getComponents(userId: string): Promise<(Component & { useLevel?: string })[]>;
  getComponent(userId: string, id: string): Promise<(Component & { useLevel?: string }) | null>;
  addComponent(userId: string, component: Component & { useLevel?: string }): Promise<void>;
  updateComponent(userId: string, id: string, component: Partial<Component>): Promise<void>;
  deleteComponent(userId: string, id: string): Promise<void>;

  getLogs(userId: string, componentId?: string): Promise<ServiceLog[]>;
  addLog(userId: string, log: ServiceLog): Promise<void>;

  getUseLevelLogs(userId: string, assetId?: string): Promise<UseLevelLog[]>;
  addUseLevelLog(userId: string, log: UseLevelLog): Promise<void>;

  // Global taxonomy catalog helpers
  getOrCreateGlobalAssetCatalog?(item: {
    modelId: string;
    name: string;
    category: string;
    averageLifespanUsage?: number | null;
    averageLifespanTime?: number | null;
    notes?: string | null;
  }): Promise<void>;
  getGlobalAssetCatalogItem?(modelId: string): Promise<any | null>;
}

const DEFAULT_CATEGORIES = [
  'Electronics',
  'Heavy Machinery',
  'Home Appliance',
  'HVAC',
  'IT Equipment',
  'Motorcycle (Manual)',
  'Motorcycle (Matic)',
  'Vehicle',
  'Other',
];

// --- JSON Repository (For Local Development) ---
export class JsonRepository implements StorageRepository {
  private dbPath: string;

  constructor() {
    this.dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'db.json');
    this.ensureDir(this.dbPath);
  }

  private ensureDir(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private async readDb(): Promise<DbData> {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = await fs.promises.readFile(this.dbPath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<DbData>;
        return {
          assets: parsed.assets ?? [],
          components: parsed.components ?? [],
          logs: parsed.logs ?? [],
          useLevelLogs: parsed.useLevelLogs ?? [],
          categories: parsed.categories ?? [],
        };
      }
    } catch (err) {
      console.error('[storage] Failed to read db, starting fresh:', err);
    }
    return { assets: [], components: [], logs: [], useLevelLogs: [], categories: [] };
  }

  private async writeDb(data: DbData): Promise<void> {
    const tmp = this.dbPath + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmp, this.dbPath);
  }

  private cleanCategories(cats: string[]): string[] {
    const mapping: Record<string, string> = {
      'Automotive': 'Vehicle',
      'Car (Manual)': 'Vehicle',
      'Car (Matic)': 'Vehicle',
      'Car': 'Vehicle',
      'Motor': 'Motorcycle (Manual)',
      'Motor (Manual)': 'Motorcycle (Manual)',
      'Motor (Matic)': 'Motorcycle (Matic)',
      'Performance Motorcycle': 'Motorcycle (Manual)',
      'Climate Control': 'HVAC',
    };

    const cleaned = cats.map(c => mapping[c] || c);
    const unique = Array.from(new Set([...cleaned, ...DEFAULT_CATEGORIES]));
    
    const filtered = unique.filter(c => !Object.keys(mapping).includes(c));

    return filtered.sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });
  }

  async getCategories(userId: string): Promise<string[]> {
    const db = await this.readDb();
    const userCats = db.userCategories?.[userId] || [];
    return this.cleanCategories([...(db.categories || []), ...userCats]);
  }

  async addCategory(userId: string, category: string): Promise<void> {
    const db = await this.readDb();
    if (!db.userCategories) db.userCategories = {};
    const current = db.userCategories[userId] || [];
    if (!current.includes(category)) {
      db.userCategories[userId] = [...current, category];
      await this.writeDb(db);
    }
  }

  async getAssets(userId: string): Promise<Asset[]> {
    const db = await this.readDb();
    let userAssets = db.assets.filter(a => a.userId === userId);
    
    // Auto-seed demo assets if none exist
    if (userAssets.length === 0) {
      const demoAssets: Asset[] = [
        {
          id: 'demo-supra-' + userId,
          userId,
          name: 'Honda Supra X 125',
          category: 'Motorcycle (Manual)',
          description: 'Daily commuter bike',
          imageUrl: '/images/supra_x_125.png',
          useLevel: 'NORMAL',
          purchaseDate: new Date().toISOString()
        },
        {
          id: 'demo-ac-' + userId,
          userId,
          name: 'LG Dual Inverter AC',
          category: 'HVAC',
          description: 'Living Room AC',
          imageUrl: '/images/air_conditioner.png',
          useLevel: 'NORMAL',
          purchaseDate: new Date().toISOString()
        }
      ];
      db.assets.push(...demoAssets);
      await this.writeDb(db);
      userAssets = demoAssets;
    }
    
    return userAssets;
  }

  async getAsset(userId: string, id: string): Promise<Asset | null> {
    const db = await this.readDb();
    return db.assets.find(a => a.id === id && a.userId === userId) || null;
  }

  async addAsset(userId: string, asset: Asset): Promise<void> {
    const db = await this.readDb();
    db.assets.push({ ...asset, userId });
    await this.writeDb(db);
  }

  async updateAsset(userId: string, id: string, asset: Asset): Promise<void> {
    const db = await this.readDb();
    const index = db.assets.findIndex(a => a.id === id && a.userId === userId);
    if (index !== -1) {
      db.assets[index] = { ...asset, userId };
      await this.writeDb(db);
    }
  }

  async deleteAsset(userId: string, id: string): Promise<void> {
    const db = await this.readDb();
    db.assets = db.assets.filter(a => !(a.id === id && a.userId === userId));
    db.components = db.components.filter(c => c.assetId !== id); // Cascading delete
    await this.writeDb(db);
  }

  async getComponents(userId: string): Promise<(Component & { useLevel?: string })[]> {
    const db = await this.readDb();
    return db.components.filter(c => c.userId === userId);
  }

  async getComponent(userId: string, id: string): Promise<(Component & { useLevel?: string }) | null> {
    const db = await this.readDb();
    return db.components.find(c => c.id === id && c.userId === userId) || null;
  }

  async addComponent(userId: string, component: Component & { useLevel?: string }): Promise<void> {
    const db = await this.readDb();
    db.components.push({ ...component, userId });
    await this.writeDb(db);
  }

  async updateComponent(userId: string, id: string, componentUpdate: Partial<Component>): Promise<void> {
    const db = await this.readDb();
    const index = db.components.findIndex(c => c.id === id && c.userId === userId);
    if (index !== -1) {
      db.components[index] = { ...db.components[index], ...componentUpdate, userId };
      await this.writeDb(db);
    }
  }

  async deleteComponent(userId: string, id: string): Promise<void> {
    const db = await this.readDb();
    db.components = db.components.filter(c => !(c.id === id && c.userId === userId));
    await this.writeDb(db);
  }

  async getLogs(userId: string, componentId?: string): Promise<ServiceLog[]> {
    const db = await this.readDb();
    let userLogs = db.logs.filter(l => l.userId === userId);
    if (componentId) {
      return userLogs.filter(l => l.componentId === componentId);
    }
    return userLogs;
  }

  async addLog(userId: string, log: ServiceLog): Promise<void> {
    const db = await this.readDb();
    db.logs.push({ ...log, userId });
    await this.writeDb(db);
  }

  async getUseLevelLogs(userId: string, assetId?: string): Promise<UseLevelLog[]> {
    const db = await this.readDb();
    let userLogs = db.useLevelLogs.filter(l => l.userId === userId);
    if (assetId) {
      return userLogs.filter(l => l.assetId === assetId);
    }
    return userLogs;
  }

  async addUseLevelLog(userId: string, log: UseLevelLog): Promise<void> {
    const db = await this.readDb();
    db.useLevelLogs.push({ ...log, userId });
    await this.writeDb(db);
  }
}

// --- Firestore Repository (For Production) ---
export class FirestoreRepository implements StorageRepository {
  private db: Firestore;

  constructor() {
    this.db = new Firestore({
      databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)'
    });
  }

  private cleanCategories(cats: string[]): string[] {
    const mapping: Record<string, string> = {
      'Automotive': 'Vehicle',
      'Car (Manual)': 'Vehicle',
      'Car (Matic)': 'Vehicle',
      'Car': 'Vehicle',
      'Motor': 'Motorcycle (Manual)',
      'Motor (Manual)': 'Motorcycle (Manual)',
      'Motor (Matic)': 'Motorcycle (Matic)',
      'Performance Motorcycle': 'Motorcycle (Manual)',
      'Climate Control': 'HVAC',
    };

    const cleaned = cats.map(c => mapping[c] || c);
    const unique = Array.from(new Set([...cleaned, ...DEFAULT_CATEGORIES]));
    
    const filtered = unique.filter(c => !Object.keys(mapping).includes(c));

    return filtered.sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });
  }

  async getCategories(userId: string): Promise<string[]> {
    const doc = await this.db.collection('userProfiles').doc(userId).get();
    let list = doc.exists ? (doc.data()?.customCategories || []) : [];
    return this.cleanCategories(list);
  }

  async addCategory(userId: string, category: string): Promise<void> {
    const docRef = this.db.collection('userProfiles').doc(userId);
    const doc = await docRef.get();
    let list = doc.exists ? (doc.data()?.customCategories || []) : [];
    if (!list.includes(category)) {
      list.push(category);
      await docRef.set({ customCategories: list }, { merge: true });
    }
  }

  async getAssets(userId: string): Promise<Asset[]> {
    const snapshot = await this.db.collection('assets').where('userId', '==', userId).get();
    let userAssets = snapshot.docs.map(doc => doc.data() as Asset);
    
    // Auto-seed demo assets if none exist
    if (userAssets.length === 0) {
      const demoAssets: Asset[] = [
        {
          id: 'demo-supra-' + userId,
          userId,
          name: 'Honda Supra X 125',
          category: 'Motorcycle (Manual)',
          description: 'Daily commuter bike',
          imageUrl: '/images/supra_x_125.png',
          useLevel: 'NORMAL',
          purchaseDate: new Date().toISOString()
        },
        {
          id: 'demo-ac-' + userId,
          userId,
          name: 'LG Dual Inverter AC',
          category: 'HVAC',
          description: 'Living Room AC',
          imageUrl: '/images/air_conditioner.png',
          useLevel: 'NORMAL',
          purchaseDate: new Date().toISOString()
        }
      ];
      
      const batch = this.db.batch();
      demoAssets.forEach(asset => {
        batch.set(this.db.collection('assets').doc(asset.id), asset);
      });
      await batch.commit();
      
      userAssets = demoAssets;
    }
    
    return userAssets;
  }

  async getAsset(userId: string, id: string): Promise<Asset | null> {
    const doc = await this.db.collection('assets').doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as Asset;
    return data.userId === userId ? data : null;
  }

  async addAsset(userId: string, asset: Asset): Promise<void> {
    await this.db.collection('assets').doc(asset.id).set({ ...asset, userId });
  }

  async updateAsset(userId: string, id: string, asset: Asset): Promise<void> {
    // Check ownership first
    const existing = await this.getAsset(userId, id);
    if (!existing) return;
    await this.db.collection('assets').doc(id).set({ ...asset, userId }, { merge: true });
  }

  async deleteAsset(userId: string, id: string): Promise<void> {
    const existing = await this.getAsset(userId, id);
    if (!existing) return;

    await this.db.collection('assets').doc(id).delete();
    
    // Also delete associated components (cascading)
    const componentsSnapshot = await this.db.collection('components').where('userId', '==', userId).where('assetId', '==', id).get();
    const batch = this.db.batch();
    componentsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }

  async getComponents(userId: string): Promise<(Component & { useLevel?: string })[]> {
    const snapshot = await this.db.collection('components').where('userId', '==', userId).get();
    return snapshot.docs.map(doc => doc.data() as (Component & { useLevel?: string }));
  }

  async getComponent(userId: string, id: string): Promise<(Component & { useLevel?: string }) | null> {
    const doc = await this.db.collection('components').doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as (Component & { useLevel?: string });
    return data.userId === userId ? data : null;
  }

  async addComponent(userId: string, component: Component & { useLevel?: string }): Promise<void> {
    await this.db.collection('components').doc(component.id).set({ ...component, userId });
  }

  async updateComponent(userId: string, id: string, componentUpdate: Partial<Component>): Promise<void> {
    const existing = await this.getComponent(userId, id);
    if (!existing) return;
    await this.db.collection('components').doc(id).set({ ...componentUpdate, userId }, { merge: true });
  }

  async deleteComponent(userId: string, id: string): Promise<void> {
    const existing = await this.getComponent(userId, id);
    if (!existing) return;
    await this.db.collection('components').doc(id).delete();
  }

  async getLogs(userId: string, componentId?: string): Promise<ServiceLog[]> {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db.collection('logs').where('userId', '==', userId);
    if (componentId) {
      query = query.where('componentId', '==', componentId);
    }
    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as ServiceLog);
  }

  async addLog(userId: string, log: ServiceLog): Promise<void> {
    await this.db.collection('logs').doc(log.id).set({ ...log, userId });
  }

  async getUseLevelLogs(userId: string, assetId?: string): Promise<UseLevelLog[]> {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db.collection('useLevelLogs').where('userId', '==', userId);
    if (assetId) {
      query = query.where('assetId', '==', assetId);
    }
    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as UseLevelLog);
  }

  async addUseLevelLog(userId: string, log: UseLevelLog): Promise<void> {
    await this.db.collection('useLevelLogs').doc(log.id).set({ ...log, userId });
  }
}

// --- PostgreSQL Repository (B2B Scalable & Production-Ready) ---
export class PostgresRepository implements StorageRepository {
  private cleanCategories(cats: string[]): string[] {
    const mapping: Record<string, string> = {
      'Automotive': 'Vehicle',
      'Car (Manual)': 'Vehicle',
      'Car (Matic)': 'Vehicle',
      'Car': 'Vehicle',
      'Motor': 'Motorcycle (Manual)',
      'Motor (Manual)': 'Motorcycle (Manual)',
      'Motor (Matic)': 'Motorcycle (Matic)',
      'Performance Motorcycle': 'Motorcycle (Manual)',
      'Climate Control': 'HVAC',
    };

    const cleaned = cats.map(c => mapping[c] || c);
    const unique = Array.from(new Set([...cleaned, ...DEFAULT_CATEGORIES]));
    const filtered = unique.filter(c => !Object.keys(mapping).includes(c));

    return filtered.sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });
  }

  async getCategories(userId: string): Promise<string[]> {
    const rows = await db.select().from(userCategoriesTable).where(eq(userCategoriesTable.userId, userId));
    const list = rows.map(r => r.category);
    return this.cleanCategories(list);
  }

  async addCategory(userId: string, category: string): Promise<void> {
    const existing = await db.select().from(userCategoriesTable).where(
      and(eq(userCategoriesTable.userId, userId), eq(userCategoriesTable.category, category))
    );
    if (existing.length === 0) {
      await db.insert(userCategoriesTable).values({
        id: crypto.randomUUID(),
        userId,
        category
      });
    }
  }

  async getAssets(userId: string): Promise<Asset[]> {
    const rows = await db.select().from(assetsTable).where(eq(assetsTable.userId, userId));
    
    // Auto-seed demo assets if none exist (mirroring Firestore & Json behavior)
    if (rows.length === 0) {
      const demoAssets: Asset[] = [
        {
          id: 'demo-supra-' + userId,
          userId,
          name: 'Honda Supra X 125',
          category: 'Motorcycle (Manual)',
          description: 'Daily commuter bike',
          imageUrl: '/images/supra_x_125.png',
          useLevel: 'NORMAL',
          purchaseDate: new Date().toISOString()
        },
        {
          id: 'demo-ac-' + userId,
          userId,
          name: 'LG Dual Inverter AC',
          category: 'HVAC',
          description: 'Living Room AC',
          imageUrl: '/images/air_conditioner.png',
          useLevel: 'NORMAL',
          purchaseDate: new Date().toISOString()
        }
      ];
      
      for (const asset of demoAssets) {
        await db.insert(assetsTable).values({
          id: asset.id,
          userId: asset.userId,
          name: asset.name,
          category: asset.category,
          description: asset.description,
          imageUrl: asset.imageUrl,
          useLevel: asset.useLevel || 'NORMAL',
          purchaseDate: asset.purchaseDate
        });
      }
      return demoAssets;
    }
    
    return rows as Asset[];
  }

  async getAsset(userId: string, id: string): Promise<Asset | null> {
    const rows = await db.select().from(assetsTable).where(
      and(eq(assetsTable.id, id), eq(assetsTable.userId, userId))
    );
    return rows.length > 0 ? (rows[0] as Asset) : null;
  }

  async addAsset(userId: string, asset: Asset): Promise<void> {
    await db.insert(assetsTable).values({
      id: asset.id,
      userId,
      name: asset.name,
      category: asset.category,
      description: asset.description || null,
      purchaseDate: asset.purchaseDate || null,
      odometer: asset.odometer || null,
      useLevel: asset.useLevel || 'NORMAL',
      imageUrl: asset.imageUrl || null,
      globalModelId: (asset as any).globalModelId || null
    });
  }

  async updateAsset(userId: string, id: string, asset: Asset): Promise<void> {
    await db.update(assetsTable).set({
      name: asset.name,
      category: asset.category,
      description: asset.description || null,
      purchaseDate: asset.purchaseDate || null,
      odometer: asset.odometer || null,
      useLevel: asset.useLevel || 'NORMAL',
      imageUrl: asset.imageUrl || null,
      globalModelId: (asset as any).globalModelId || null
    }).where(and(eq(assetsTable.id, id), eq(assetsTable.userId, userId)));
  }

  async deleteAsset(userId: string, id: string): Promise<void> {
    // Relying on CASCADE DELETE setup for components, service logs and use level logs
    await db.delete(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.userId, userId)));
  }

  async getComponents(userId: string): Promise<(Component & { useLevel?: string })[]> {
    const rows = await db.select().from(componentsTable).where(eq(componentsTable.userId, userId));
    return rows as (Component & { useLevel?: string })[];
  }

  async getComponent(userId: string, id: string): Promise<(Component & { useLevel?: string }) | null> {
    const rows = await db.select().from(componentsTable).where(
      and(eq(componentsTable.id, id), eq(componentsTable.userId, userId))
    );
    return rows.length > 0 ? (rows[0] as (Component & { useLevel?: string })) : null;
  }

  async addComponent(userId: string, component: Component & { useLevel?: string }): Promise<void> {
    await db.insert(componentsTable).values({
      id: component.id,
      userId,
      assetId: component.assetId,
      name: component.name,
      metricType: component.metricType,
      trackingMode: component.trackingMode,
      staticIntervalUsage: component.staticIntervalUsage || null,
      staticIntervalTime: component.staticIntervalTime || null,
      currentPredictedInterval: component.currentPredictedInterval || null,
      currentAccumulatedUsage: component.currentAccumulatedUsage ?? 0,
      lastServiceDate: component.lastServiceDate,
      useLevel: component.useLevel || null,
      estimatedCost: component.estimatedCost || null,
      purchaseDate: component.purchaseDate || null,
      predictionModelVersion: (component as any).predictionModelVersion || 'v1_ewma'
    });
  }

  async updateComponent(userId: string, id: string, componentUpdate: Partial<Component>): Promise<void> {
    await db.update(componentsTable).set({
      ...componentUpdate,
      userId // enforce safety
    }).where(and(eq(componentsTable.id, id), eq(componentsTable.userId, userId)));
  }

  async deleteComponent(userId: string, id: string): Promise<void> {
    await db.delete(componentsTable).where(and(eq(componentsTable.id, id), eq(componentsTable.userId, userId)));
  }

  async getLogs(userId: string, componentId?: string): Promise<ServiceLog[]> {
    if (componentId) {
      const rows = await db.select().from(serviceLogsTable).where(
        and(eq(serviceLogsTable.userId, userId), eq(serviceLogsTable.componentId, componentId))
      );
      return rows as ServiceLog[];
    }
    const rows = await db.select().from(serviceLogsTable).where(eq(serviceLogsTable.userId, userId));
    return rows as ServiceLog[];
  }

  async addLog(userId: string, log: ServiceLog): Promise<void> {
    await db.insert(serviceLogsTable).values({
      id: log.id,
      userId,
      componentId: log.componentId,
      timestamp: log.timestamp,
      actualMetricValue: log.actualMetricValue,
      notes: log.notes || null,
      cost: log.cost || null,
      useLevelAtService: (log as any).useLevelAtService || null
    });
  }

  async getUseLevelLogs(userId: string, assetId?: string): Promise<UseLevelLog[]> {
    if (assetId) {
      const rows = await db.select().from(useLevelLogsTable).where(
        and(eq(useLevelLogsTable.userId, userId), eq(useLevelLogsTable.assetId, assetId))
      );
      return rows as UseLevelLog[];
    }
    const rows = await db.select().from(useLevelLogsTable).where(eq(useLevelLogsTable.userId, userId));
    return rows as UseLevelLog[];
  }

  async addUseLevelLog(userId: string, log: UseLevelLog): Promise<void> {
    await db.insert(useLevelLogsTable).values({
      id: log.id,
      userId,
      assetId: log.assetId,
      oldUseLevel: log.oldUseLevel || null,
      newUseLevel: log.newUseLevel || null,
      timestamp: log.timestamp
    });
  }

  // Same Machine Taxonomy Helpers
  async getOrCreateGlobalAssetCatalog(item: {
    modelId: string;
    name: string;
    category: string;
    averageLifespanUsage?: number | null;
    averageLifespanTime?: number | null;
    notes?: string | null;
  }): Promise<void> {
    const existing = await db.select().from(globalAssetCatalogTable).where(eq(globalAssetCatalogTable.modelId, item.modelId));
    if (existing.length === 0) {
      await db.insert(globalAssetCatalogTable).values({
        modelId: item.modelId,
        name: item.name,
        category: item.category,
        averageLifespanUsage: item.averageLifespanUsage || null,
        averageLifespanTime: item.averageLifespanTime || null,
        notes: item.notes || null
      });
    }
  }

  async getGlobalAssetCatalogItem(modelId: string): Promise<any | null> {
    const rows = await db.select().from(globalAssetCatalogTable).where(eq(globalAssetCatalogTable.modelId, modelId));
    return rows.length > 0 ? rows[0] : null;
  }
}

// Export the selected repository based on environment
export const storage: StorageRepository = process.env.DATABASE_URL 
  ? new PostgresRepository() 
  : (process.env.USE_FIRESTORE === 'true' ? new FirestoreRepository() : new JsonRepository());

