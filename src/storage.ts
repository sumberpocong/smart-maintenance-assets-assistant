import fs from 'node:fs';
import path from 'node:path';
import { Asset, Component, ServiceLog, UseLevelLog } from './types.ts';
import { Firestore } from '@google-cloud/firestore';

export interface DbData {
  assets: Asset[];
  components: (Component & { useLevel?: string })[];
  logs: ServiceLog[];
  useLevelLogs: UseLevelLog[];
  categories: string[];
}

export interface StorageRepository {
  getCategories(): Promise<string[]>;
  addCategory(category: string): Promise<void>;

  getAssets(): Promise<Asset[]>;
  getAsset(id: string): Promise<Asset | null>;
  addAsset(asset: Asset): Promise<void>;
  updateAsset(id: string, asset: Asset): Promise<void>;
  deleteAsset(id: string): Promise<void>;

  getComponents(): Promise<(Component & { useLevel?: string })[]>;
  getComponent(id: string): Promise<(Component & { useLevel?: string }) | null>;
  addComponent(component: Component & { useLevel?: string }): Promise<void>;
  updateComponent(id: string, component: Partial<Component>): Promise<void>;
  deleteComponent(id: string): Promise<void>;

  getLogs(componentId?: string): Promise<ServiceLog[]>;
  addLog(log: ServiceLog): Promise<void>;

  getUseLevelLogs(assetId?: string): Promise<UseLevelLog[]>;
  addUseLevelLog(log: UseLevelLog): Promise<void>;
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
          categories: parsed.categories?.length ? parsed.categories : [...DEFAULT_CATEGORIES],
        };
      }
    } catch (err) {
      console.error('[storage] Failed to read db, starting fresh:', err);
    }
    return { assets: [], components: [], logs: [], useLevelLogs: [], categories: [...DEFAULT_CATEGORIES] };
  }

  private async writeDb(data: DbData): Promise<void> {
    const tmp = this.dbPath + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.promises.rename(tmp, this.dbPath);
  }

  async getCategories(): Promise<string[]> {
    const db = await this.readDb();
    return db.categories;
  }

  async addCategory(category: string): Promise<void> {
    const db = await this.readDb();
    if (!db.categories.includes(category)) {
      db.categories.push(category);
      await this.writeDb(db);
    }
  }

  async getAssets(): Promise<Asset[]> {
    const db = await this.readDb();
    return db.assets;
  }

  async getAsset(id: string): Promise<Asset | null> {
    const db = await this.readDb();
    return db.assets.find(a => a.id === id) || null;
  }

  async addAsset(asset: Asset): Promise<void> {
    const db = await this.readDb();
    db.assets.push(asset);
    await this.writeDb(db);
  }

  async updateAsset(id: string, asset: Asset): Promise<void> {
    const db = await this.readDb();
    const index = db.assets.findIndex(a => a.id === id);
    if (index !== -1) {
      db.assets[index] = asset;
      await this.writeDb(db);
    }
  }

  async deleteAsset(id: string): Promise<void> {
    const db = await this.readDb();
    db.assets = db.assets.filter(a => a.id !== id);
    db.components = db.components.filter(c => c.assetId !== id);
    await this.writeDb(db);
  }

  async getComponents(): Promise<(Component & { useLevel?: string })[]> {
    const db = await this.readDb();
    return db.components;
  }

  async getComponent(id: string): Promise<(Component & { useLevel?: string }) | null> {
    const db = await this.readDb();
    return db.components.find(c => c.id === id) || null;
  }

  async addComponent(component: Component & { useLevel?: string }): Promise<void> {
    const db = await this.readDb();
    db.components.push(component);
    await this.writeDb(db);
  }

  async updateComponent(id: string, componentUpdate: Partial<Component>): Promise<void> {
    const db = await this.readDb();
    const index = db.components.findIndex(c => c.id === id);
    if (index !== -1) {
      db.components[index] = { ...db.components[index], ...componentUpdate };
      await this.writeDb(db);
    }
  }

  async deleteComponent(id: string): Promise<void> {
    const db = await this.readDb();
    db.components = db.components.filter(c => c.id !== id);
    await this.writeDb(db);
  }

  async getLogs(componentId?: string): Promise<ServiceLog[]> {
    const db = await this.readDb();
    if (componentId) {
      return db.logs.filter(l => l.componentId === componentId);
    }
    return db.logs;
  }

  async addLog(log: ServiceLog): Promise<void> {
    const db = await this.readDb();
    db.logs.push(log);
    await this.writeDb(db);
  }

  async getUseLevelLogs(assetId?: string): Promise<UseLevelLog[]> {
    const db = await this.readDb();
    if (assetId) {
      return db.useLevelLogs.filter(l => l.assetId === assetId);
    }
    return db.useLevelLogs;
  }

  async addUseLevelLog(log: UseLevelLog): Promise<void> {
    const db = await this.readDb();
    db.useLevelLogs.push(log);
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

  async getCategories(): Promise<string[]> {
    const doc = await this.db.collection('config').doc('categories').get();
    if (!doc.exists) {
      await this.db.collection('config').doc('categories').set({ list: DEFAULT_CATEGORIES });
      return DEFAULT_CATEGORIES;
    }
    return doc.data()?.list || [];
  }

  async addCategory(category: string): Promise<void> {
    const categories = await this.getCategories();
    if (!categories.includes(category)) {
      categories.push(category);
      await this.db.collection('config').doc('categories').set({ list: categories });
    }
  }

  async getAssets(): Promise<Asset[]> {
    const snapshot = await this.db.collection('assets').get();
    return snapshot.docs.map(doc => doc.data() as Asset);
  }

  async getAsset(id: string): Promise<Asset | null> {
    const doc = await this.db.collection('assets').doc(id).get();
    return doc.exists ? (doc.data() as Asset) : null;
  }

  async addAsset(asset: Asset): Promise<void> {
    await this.db.collection('assets').doc(asset.id).set(asset);
  }

  async updateAsset(id: string, asset: Asset): Promise<void> {
    await this.db.collection('assets').doc(id).set(asset, { merge: true });
  }

  async deleteAsset(id: string): Promise<void> {
    await this.db.collection('assets').doc(id).delete();
    
    // Also delete associated components
    const componentsSnapshot = await this.db.collection('components').where('assetId', '==', id).get();
    const batch = this.db.batch();
    componentsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }

  async getComponents(): Promise<(Component & { useLevel?: string })[]> {
    const snapshot = await this.db.collection('components').get();
    return snapshot.docs.map(doc => doc.data() as (Component & { useLevel?: string }));
  }

  async getComponent(id: string): Promise<(Component & { useLevel?: string }) | null> {
    const doc = await this.db.collection('components').doc(id).get();
    return doc.exists ? (doc.data() as (Component & { useLevel?: string })) : null;
  }

  async addComponent(component: Component & { useLevel?: string }): Promise<void> {
    await this.db.collection('components').doc(component.id).set(component);
  }

  async updateComponent(id: string, componentUpdate: Partial<Component>): Promise<void> {
    await this.db.collection('components').doc(id).set(componentUpdate, { merge: true });
  }

  async deleteComponent(id: string): Promise<void> {
    await this.db.collection('components').doc(id).delete();
  }

  async getLogs(componentId?: string): Promise<ServiceLog[]> {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db.collection('logs');
    if (componentId) {
      query = query.where('componentId', '==', componentId);
    }
    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as ServiceLog);
  }

  async addLog(log: ServiceLog): Promise<void> {
    await this.db.collection('logs').doc(log.id).set(log);
  }

  async getUseLevelLogs(assetId?: string): Promise<UseLevelLog[]> {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db.collection('useLevelLogs');
    if (assetId) {
      query = query.where('assetId', '==', assetId);
    }
    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as UseLevelLog);
  }

  async addUseLevelLog(log: UseLevelLog): Promise<void> {
    await this.db.collection('useLevelLogs').doc(log.id).set(log);
  }
}

// Export the selected repository based on environment
export const storage: StorageRepository = process.env.USE_FIRESTORE === 'true' 
  ? new FirestoreRepository() 
  : new JsonRepository();
