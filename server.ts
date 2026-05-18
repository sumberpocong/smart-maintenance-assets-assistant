import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { TrackingMode, Asset, Component, ServiceLog, UseLevelLog } from "./src/types.ts";
import { calculateNextEWMA } from "./src/lib/logic.ts";
import { storage } from "./src/storage.ts";
import admin from 'firebase-admin';
import rateLimit from 'express-rate-limit';

// --- Initialization ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
        admin.initializeApp({
            credential: admin.credential.applicationDefault()
        });
        console.log("Firebase Admin initialized successfully.");
    } catch (err) {
        console.error("Firebase Admin init error:", err);
    }
} else {
    console.warn("GOOGLE_APPLICATION_CREDENTIALS not set. Auth middleware will fail.");
}

// Initialize AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

function newId(): string {
  return crypto.randomUUID();
}

// --- Middleware ---

const authMiddleware = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const token = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.uid = decodedToken.uid;
        req.email = decodedToken.email;
        next();
    } catch (err) {
        console.error("Auth Error:", err);
        res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." }
});

// Audit Logger Helper
const auditLog = (uid: string, action: string, resourceId: string, metadata: any = {}) => {
    console.log(`[AUDIT] ${new Date().toISOString()} | User: ${uid} | Action: ${action} | Resource: ${resourceId} |`, metadata);
};

// --- Server Startup ---

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: "20mb" }));

  // Apply Auth Middleware and Rate Limiter to all API routes
  app.use("/api/*", apiLimiter);
  app.use("/api/*", authMiddleware);

  // ── API Routes ──────────────────────────────────────────────────────────

  app.get("/api/categories", async (req: any, res) => {
    try {
      const categories = await storage.getCategories(req.uid);
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", async (req: any, res) => {
    try {
      const { category } = req.body;
      if (category) {
        await storage.addCategory(req.uid, category);
        auditLog(req.uid, 'CREATE_CATEGORY', category);
      }
      const categories = await storage.getCategories(req.uid);
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to add category" });
    }
  });

  app.post("/api/ai/suggest-components", async (req: any, res) => {
    const { name, category } = req.body;
    try {
      const db: Record<string, any[]> = {
        "motorcycle (manual)": [
          { name: "Engine Oil", metricType: "KM", suggestedIntervalUsage: 2000, suggestedIntervalTime: undefined, estimatedCost: 15 },
          { name: "Chain Clean & Lube", metricType: "KM", suggestedIntervalUsage: 500, suggestedIntervalTime: undefined, estimatedCost: 5 },
          { name: "Spark Plug", metricType: "KM", suggestedIntervalUsage: 8000, suggestedIntervalTime: undefined, estimatedCost: 8 },
          { name: "Air Filter", metricType: "KM", suggestedIntervalUsage: 10000, suggestedIntervalTime: undefined, estimatedCost: 12 },
        ],
        "motorcycle (matic)": [
          { name: "Engine Oil", metricType: "KM", suggestedIntervalUsage: 2000, suggestedIntervalTime: undefined, estimatedCost: 15 },
          { name: "Gear Oil (Oli Gardan)", metricType: "KM", suggestedIntervalUsage: 8000, suggestedIntervalTime: undefined, estimatedCost: 10 },
          { name: "CVT Belt", metricType: "KM", suggestedIntervalUsage: 20000, suggestedIntervalTime: undefined, estimatedCost: 35 },
          { name: "CVT Roller", metricType: "KM", suggestedIntervalUsage: 20000, suggestedIntervalTime: undefined, estimatedCost: 20 },
          { name: "Air Filter", metricType: "KM", suggestedIntervalUsage: 8000, suggestedIntervalTime: undefined, estimatedCost: 10 },
        ],
        "car": [
          { name: "Engine Oil", metricType: "KM", suggestedIntervalUsage: 10000, suggestedIntervalTime: 180, estimatedCost: 60 },
          { name: "Air Filter", metricType: "KM", suggestedIntervalUsage: 20000, suggestedIntervalTime: undefined, estimatedCost: 20 },
          { name: "Brake Pads", metricType: "KM", suggestedIntervalUsage: 40000, suggestedIntervalTime: undefined, estimatedCost: 100 },
          { name: "Tire Rotation", metricType: "KM", suggestedIntervalUsage: 10000, suggestedIntervalTime: undefined, estimatedCost: 20 },
        ],
        "ac": [
          { name: "Filter Clean", metricType: "Days", suggestedIntervalUsage: undefined, suggestedIntervalTime: 60, estimatedCost: 0 },
          { name: "Deep Clean / Freon Check", metricType: "Days", suggestedIntervalUsage: undefined, suggestedIntervalTime: 180, estimatedCost: 40 },
        ],
      };

      const searchStr = `${name} ${category}`.toLowerCase();
      let suggestions: any[] = [];
      if (searchStr.includes("matic") || searchStr.includes("scooter") || searchStr.includes("motorcycle (matic)")) {
        suggestions = db["motorcycle (matic)"];
      } else if (searchStr.includes("motor") || searchStr.includes("bike") || searchStr.includes("motorcycle") || searchStr.includes("manual") || searchStr.includes("motorcycle (manual)")) {
        suggestions = db["motorcycle (manual)"];
      } else if (searchStr.includes("car") || searchStr.includes("vehicle") || searchStr.includes("automotive")) {
        suggestions = db["car"];
      } else if (searchStr.includes("ac") || searchStr.includes("aircon") || searchStr.includes("conditioner") || searchStr.includes("hvac")) {
        suggestions = db["ac"];
      }

      if (suggestions.length === 0 && process.env.GEMINI_API_KEY) {
        const prompt = `You are a maintenance expert. For an asset named "${name}" in category "${category}", list 3-5 common maintenance items as a JSON array.
Each item must have: name (string), metricType ("KM", "Days", or "Hours"), suggestedIntervalUsage (number or null), suggestedIntervalTime (number in days or null), estimatedCost (number in USD).
Return ONLY the JSON array, no markdown.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        suggestions = JSON.parse(text);
      }

      res.json(suggestions || []);
    } catch (error) {
      console.error("Component Suggestion Error:", error);
      res.status(500).json({ error: "Failed to get suggestions" });
    }
  });

  app.post("/api/ai/predict-cost", async (req: any, res) => {
    const { componentName, history } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "AI features require GEMINI_API_KEY" });
    }
    try {
      const prompt = `Based on the maintenance history for "${componentName}": ${JSON.stringify(history)}.
Predict the expected cost for the next service in the same currency. Return only the number, no text.`;
      const result = await model.generateContent(prompt);
      const cost = parseFloat(result.response.text().trim());
      res.json({ predictedCost: isNaN(cost) ? null : cost });
    } catch (error) {
      res.status(500).json({ error: "Failed to predict cost" });
    }
  });

  app.post("/api/ai/scan-asset", async (req: any, res) => {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "AI features require GEMINI_API_KEY" });
    }
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64 || typeof imageBase64 !== "string") {
        return res.status(400).json({ error: "No image provided" });
      }

      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const prompt = `Act as a specialized Fixed Asset Clerk. Analyze the attached image.
Goal: Identify the item and categorize it for a maintenance tracking system.
Constraint: Return ONLY a valid JSON object. Do not include markdown formatting or prose.
JSON Schema:
{
"asset_name": "Specific model or name",
"category": "Must be one of: [Motorcycle (Manual), Motorcycle (Matic), Vehicle, Electronics, IT Equipment, HVAC, Home Appliance, Heavy Machinery]",
"description": "A 1-sentence technical summary",
"suggested_maintenance": ["Item 1", "Item 2"]
}
If the product has a visible barcode or brand name, prioritize that for the asset_name.`;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: "image/jpeg"
          }
        }
      ]);

      const response = await result.response;
      let text = response.text().trim();
      text = text.replace(/```json|```/g, "").trim();
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("AI Asset Scan Error:", error);
      res.status(500).json({ error: "Failed to scan asset from image" });
    }
  });

  // ── CRUD Routes ──────────────────────────────────────────────────────────

  app.get("/api/uselevellogs/:assetId", async (req: any, res) => {
    try {
      const { assetId } = req.params;
      const logs = await storage.getUseLevelLogs(req.uid, assetId);
      res.json(logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/uselevellogs", async (req: any, res) => {
    try {
      const logs = await storage.getUseLevelLogs(req.uid);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/assets", async (req: any, res) => {
    try {
      const assets = await storage.getAssets(req.uid);
      res.json(assets);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/assets", async (req: any, res) => {
    try {
      const { name, category, description, purchaseDate, odometer, useLevel } = req.body;
      if (!name || !category) {
        return res.status(400).json({ error: "name and category are required" });
      }
      const newAsset: Asset = {
        id: newId(),
        userId: req.uid,
        name,
        category,
        description,
        purchaseDate,
        odometer: odometer !== undefined ? parseFloat(odometer) : undefined,
        useLevel: useLevel || 'NORMAL'
      };
      
      await storage.addAsset(req.uid, newAsset);
      
      const logId = newId();
      await storage.addUseLevelLog(req.uid, {
        id: logId,
        userId: req.uid,
        assetId: newAsset.id,
        oldUseLevel: undefined,
        newUseLevel: newAsset.useLevel,
        timestamp: new Date().toISOString()
      });
      
      auditLog(req.uid, 'CREATE_ASSET', newAsset.id, { name });
      res.json(newAsset);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/assets/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const { name, category, description, purchaseDate, odometer, useLevel } = req.body;
      
      const oldAsset = await storage.getAsset(req.uid, id);
      if (!oldAsset) return res.status(404).json({ error: "Asset not found" });

      if (oldAsset.useLevel !== useLevel && useLevel) {
        await storage.addUseLevelLog(req.uid, {
          id: newId(),
          userId: req.uid,
          assetId: id,
          oldUseLevel: oldAsset.useLevel,
          newUseLevel: useLevel,
          timestamp: new Date().toISOString()
        });
      }
      
      const updatedAsset = { ...oldAsset, name, category, description, purchaseDate, odometer, useLevel, userId: req.uid };
      await storage.updateAsset(req.uid, id, updatedAsset);
      auditLog(req.uid, 'UPDATE_ASSET', id);
      res.json(updatedAsset);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/assets/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAsset(req.uid, id);
      auditLog(req.uid, 'DELETE_ASSET', id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/components", async (req: any, res) => {
    try {
      const components = await storage.getComponents(req.uid);
      res.json(components);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/components", async (req: any, res) => {
    try {
      const { assetId, name, metricType, trackingMode, staticIntervalUsage, staticIntervalTime, useLevel, estimatedCost, purchaseDate } = req.body;
      if (!assetId || !name) {
        return res.status(400).json({ error: "assetId and name are required" });
      }

      // Verify asset ownership
      const asset = await storage.getAsset(req.uid, assetId);
      if (!asset) return res.status(403).json({ error: "Unauthorized: Asset not found or not yours" });

      const newComponent: Component & { useLevel?: string } = {
        id: newId(),
        userId: req.uid,
        assetId,
        name,
        metricType,
        trackingMode,
        staticIntervalUsage: staticIntervalUsage ? parseInt(staticIntervalUsage) : undefined,
        staticIntervalTime: staticIntervalTime ? parseInt(staticIntervalTime) : undefined,
        currentPredictedInterval: trackingMode === TrackingMode.AUTO_EWMA ? 1000 : undefined,
        currentAccumulatedUsage: 0,
        lastServiceDate: new Date().toISOString(),
        useLevel,
        estimatedCost: estimatedCost ? parseFloat(estimatedCost) : undefined,
        purchaseDate
      };
      
      await storage.addComponent(req.uid, newComponent);
      auditLog(req.uid, 'CREATE_COMPONENT', newComponent.id, { assetId, name });
      res.json(newComponent);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/components/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const { name, staticIntervalUsage, staticIntervalTime, trackingMode } = req.body;
      
      const comp = await storage.getComponent(req.uid, id);
      if (!comp) return res.status(404).json({ error: "Component not found" });

      const updates: Partial<Component> = {};
      if (name !== undefined) updates.name = name;
      if (staticIntervalUsage !== undefined) updates.staticIntervalUsage = staticIntervalUsage ? parseInt(staticIntervalUsage) : undefined;
      if (staticIntervalTime !== undefined) updates.staticIntervalTime = staticIntervalTime ? parseInt(staticIntervalTime) : undefined;
      if (trackingMode !== undefined) updates.trackingMode = trackingMode;
      
      await storage.updateComponent(req.uid, id, updates);
      auditLog(req.uid, 'UPDATE_COMPONENT', id);
      
      const updatedComp = await storage.getComponent(req.uid, id);
      res.json(updatedComp);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/components/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteComponent(req.uid, id);
      auditLog(req.uid, 'DELETE_COMPONENT', id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/logs", async (req: any, res) => {
    try {
      const logs = await storage.getLogs(req.uid);
      res.json(logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/logs/:componentId", async (req: any, res) => {
    try {
      const logs = await storage.getLogs(req.uid, req.params.componentId);
      res.json(logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/service", async (req: any, res) => {
    try {
      const { componentId, metricValue, notes, cost } = req.body;
      const component = await storage.getComponent(req.uid, componentId);
      if (!component) return res.status(404).json({ error: "Component not found" });

      const actualUsage = component.currentAccumulatedUsage;
      const usedValue = metricValue != null ? Number(metricValue) : actualUsage;

      const newLog: ServiceLog = {
        id: newId(),
        userId: req.uid,
        componentId,
        timestamp: new Date().toISOString(),
        actualMetricValue: usedValue,
        notes,
        cost: cost != null ? parseFloat(cost) : undefined
      };
      
      await storage.addLog(req.uid, newLog);

      const updates: Partial<Component> = {
        currentAccumulatedUsage: 0,
        lastServiceDate: new Date().toISOString()
      };

      if (component.trackingMode === TrackingMode.AUTO_EWMA && usedValue > 0) {
        const oldPredicted = component.currentPredictedInterval || 1000;
        updates.currentPredictedInterval = calculateNextEWMA(usedValue, oldPredicted);
      }

      if (cost != null) {
        updates.estimatedCost = parseFloat(cost);
      }
      
      await storage.updateComponent(req.uid, componentId, updates);
      auditLog(req.uid, 'LOG_SERVICE', componentId, { logId: newLog.id });
      
      const updatedComponent = await storage.getComponent(req.uid, componentId);
      res.json({ success: true, component: updatedComponent, log: newLog });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Using Database: ${process.env.USE_FIRESTORE === 'true' ? 'Firestore' : 'Local JSON File'}`);
  });
}

startServer();
