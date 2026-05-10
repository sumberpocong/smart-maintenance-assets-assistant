import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { TrackingMode, Asset, Component, ServiceLog, UseLevelLog } from "./src/types.ts";
import { calculateNextEWMA } from "./src/lib/logic.ts";
import { storage } from "./src/storage.ts";

function newId(): string {
  return crypto.randomUUID();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: "20mb" }));

  // API Routes
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      const { category } = req.body;
      if (category) {
        await storage.addCategory(category);
      }
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: "Failed to add category" });
    }
  });

  // AI Suggest Components (Dictionary-based with Gemini fallback)
  app.post("/api/ai/suggest-components", async (req, res) => {
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

      // Fall back to Gemini if dictionary misses and key is configured
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

  // AI Predict Cost
  app.post("/api/ai/predict-cost", async (req, res) => {
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

  // AI Scan Asset from Image
  app.post("/api/ai/scan-asset", async (req, res) => {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: "AI features require GEMINI_API_KEY" });
    }
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64 || typeof imageBase64 !== "string") {
        return res.status(400).json({ error: "No image provided" });
      }

      // Base64 string from client is usually data:image/jpeg;base64,...
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

  app.get("/api/uselevellogs/:assetId", async (req, res) => {
    try {
      const { assetId } = req.params;
      const logs = await storage.getUseLevelLogs(assetId);
      res.json(logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/uselevellogs", async (_req, res) => {
    try {
      const logs = await storage.getUseLevelLogs();
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/assets", async (_req, res) => {
    try {
      const assets = await storage.getAssets();
      res.json(assets);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/assets", async (req, res) => {
    try {
      const { name, category, description, purchaseDate, odometer, useLevel } = req.body;
      if (!name || !category) {
        return res.status(400).json({ error: "name and category are required" });
      }
      const newAsset: Asset = {
        id: newId(),
        name,
        category,
        description,
        purchaseDate,
        odometer: odometer !== undefined ? parseFloat(odometer) : undefined,
        useLevel: useLevel || 'NORMAL'
      };
      
      await storage.addAsset(newAsset);
      
      await storage.addUseLevelLog({
        id: newId(),
        assetId: newAsset.id,
        oldUseLevel: undefined,
        newUseLevel: newAsset.useLevel,
        timestamp: new Date().toISOString()
      });
      
      res.json(newAsset);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/assets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, category, description, purchaseDate, odometer, useLevel } = req.body;
      
      const oldAsset = await storage.getAsset(id);
      if (!oldAsset) return res.status(404).json({ error: "Asset not found" });

      if (oldAsset.useLevel !== useLevel && useLevel) {
        await storage.addUseLevelLog({
          id: newId(),
          assetId: id,
          oldUseLevel: oldAsset.useLevel,
          newUseLevel: useLevel,
          timestamp: new Date().toISOString()
        });
      }
      
      const updatedAsset = { ...oldAsset, name, category, description, purchaseDate, odometer, useLevel };
      await storage.updateAsset(id, updatedAsset);
      res.json(updatedAsset);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/assets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAsset(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/components", async (_req, res) => {
    try {
      const components = await storage.getComponents();
      res.json(components);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/components", async (req, res) => {
    try {
      const { assetId, name, metricType, trackingMode, staticIntervalUsage, staticIntervalTime, useLevel, estimatedCost, purchaseDate } = req.body;
      if (!assetId || !name) {
        return res.status(400).json({ error: "assetId and name are required" });
      }
      const newComponent: Component & { useLevel?: string } = {
        id: newId(),
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
      
      await storage.addComponent(newComponent);
      res.json(newComponent);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/components/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, staticIntervalUsage, staticIntervalTime, trackingMode } = req.body;
      
      const comp = await storage.getComponent(id);
      if (!comp) return res.status(404).json({ error: "Component not found" });

      const updates: Partial<Component> = {};
      if (name !== undefined) updates.name = name;
      if (staticIntervalUsage !== undefined) updates.staticIntervalUsage = staticIntervalUsage ? parseInt(staticIntervalUsage) : undefined;
      if (staticIntervalTime !== undefined) updates.staticIntervalTime = staticIntervalTime ? parseInt(staticIntervalTime) : undefined;
      if (trackingMode !== undefined) updates.trackingMode = trackingMode;
      
      await storage.updateComponent(id, updates);
      
      // Fetch updated component for response
      const updatedComp = await storage.getComponent(id);
      res.json(updatedComp);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/components/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteComponent(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/logs", async (_req, res) => {
    try {
      const logs = await storage.getLogs();
      res.json(logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/logs/:componentId", async (req, res) => {
    try {
      const logs = await storage.getLogs(req.params.componentId);
      res.json(logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/service", async (req, res) => {
    try {
      const { componentId, metricValue, notes, cost } = req.body;
      const component = await storage.getComponent(componentId);
      if (!component) return res.status(404).json({ error: "Component not found" });

      const actualUsage = component.currentAccumulatedUsage;
      const usedValue = metricValue != null ? Number(metricValue) : actualUsage;

      const newLog: ServiceLog = {
        id: newId(),
        componentId,
        timestamp: new Date().toISOString(),
        actualMetricValue: usedValue,
        notes,
        cost: cost != null ? parseFloat(cost) : undefined
      };
      
      await storage.addLog(newLog);

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
      
      await storage.updateComponent(componentId, updates);
      
      const updatedComponent = await storage.getComponent(componentId);

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
