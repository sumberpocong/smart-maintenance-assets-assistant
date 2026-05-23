/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Zap, 
  Settings, 
  ClipboardList, 
  CheckCircle, 
  Plus, 
  Calendar, 
  Clock, 
  ChevronRight,
  Bike,
  Wind,
  History,
  AlertCircle,
  Bell,
  Trash2,
  RotateCcw,
  X,
  DollarSign,
  Box,
  ChevronDown,
  Filter,
  Check,
  Home,
  Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Asset, 
  Component, 
  TrackingMode, 
  UrgencyState,
  AppNotification,
  ServiceLog,
  UseLevel,
  UseLevelLog
} from './types';
import { calculateMaintenanceStatus } from './lib/logic';
import { auth, googleProvider } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';

const isVehicle = (category: string, name: string): boolean => {
  const c = category.toLowerCase();
  const n = name.toLowerCase();
  const keywords = ['motor', 'car', 'vehicle', 'bike', 'scooter', 'matic', 'manual'];
  return keywords.some(kw => c.includes(kw)) || keywords.some(kw => n.includes(kw));
};

export default function App() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [isLogging, setIsLogging] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [metricValue, setMetricValue] = useState("");
  const [costValue, setCostValue] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'status' | 'assets' | 'settings'>('home');
  const [showLogsInStatus, setShowLogsInStatus] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);
  const [logs, setLogs] = useState<ServiceLog[]>([]);
  const [useLevelLogs, setUseLevelLogs] = useState<UseLevelLog[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // Asset sorting and filtering
  const [assetSortBy, setAssetSortBy] = useState<'name' | 'category' | 'purchaseDate'>('name');
  const [assetSortOrder, setAssetSortOrder] = useState<'asc' | 'desc'>('asc');

  // New states for adding assets/components
  const [isAddingAsset, setIsAddingAsset] = useState(false);
  const [isScanningAsset, setIsScanningAsset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditingAsset, setIsEditingAsset] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [isAddingComponent, setIsAddingComponent] = useState(false);
  const [isEditingComponent, setIsEditingComponent] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [newAssetForm, setNewAssetForm] = useState<{ name: string; category: string; description: string; purchaseDate: string; odometer: string; useLevel: UseLevel }>({ name: '', category: '', description: '', purchaseDate: '', odometer: '', useLevel: 'NORMAL' });
  const [editAssetForm, setEditAssetForm] = useState<{ name: string; category: string; description: string; purchaseDate: string; odometer: string; useLevel: UseLevel }>({ name: '', category: '', description: '', purchaseDate: '', odometer: '', useLevel: 'NORMAL' });
  const [newCompForm, setNewCompForm] = useState({ 
    assetId: '', 
    name: '', 
    metricType: 'KM', 
    staticIntervalUsage: '', 
    staticIntervalTime: '',
    useLevel: 'MODERATE' as const,
    purchaseDate: ''
  });
  const [editCompForm, setEditCompForm] = useState({
    name: '',
    staticIntervalUsage: '',
    staticIntervalTime: ''
  });

  const [inlineEditingCompId, setInlineEditingCompId] = useState<string | null>(null);
  const [inlineEditForm, setInlineEditForm] = useState({ staticIntervalUsage: '', staticIntervalTime: '' });
  const [undoStack, setUndoStack] = useState<{ type: 'asset' | 'component', data: any, childComponents?: any[] } | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isPredictingCost, setIsPredictingCost] = useState(false);
  const [predictedCost, setPredictedCost] = useState<number | null>(null);
  const [predictionCompId, setPredictionCompId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<'Rp' | '$' | '€' | '£'>('Rp');
  const [language, setLanguage] = useState<'en' | 'id'>('en');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [exchangeRate, setExchangeRate] = useState<number>(15000); // 1 USD = 15000 IDR
  const [isGlobalServiceModalOpen, setIsGlobalServiceModalOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isStopTrackingModalOpen, setIsStopTrackingModalOpen] = useState(false);
  const [stopTrackingAssetId, setStopTrackingAssetId] = useState<string>('');
  const [stopTrackingReason, setStopTrackingReason] = useState<'SOLD' | 'BROKEN' | 'UNUSED'>('SOLD');
  const [hasShownGamePopup, setHasShownGamePopup] = useState(false);
  const [globalServiceAssetId, setGlobalServiceAssetId] = useState<string>('');
  const [globalServiceComponentId, setGlobalServiceComponentId] = useState<string>('');
  const [globalServiceNewComponentName, setGlobalServiceNewComponentName] = useState('');
  const [globalServiceNewComponentType, setGlobalServiceNewComponentType] = useState('KM');
  const [globalServiceMetricValue, setGlobalServiceMetricValue] = useState('');
  const [globalServiceCostValue, setGlobalServiceCostValue] = useState('');
  const [globalServiceLogNotes, setGlobalServiceLogNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [inputModal, setInputModal] = useState<{ open: boolean; title: string; placeholder: string; onConfirm: (val: string) => void } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);

  // Auth Listener
  useEffect(() => {
    if (!auth) {
      console.warn("Firebase Auth is not initialized.");
      setAuthLoading(false);
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const token = await currentUser.getIdToken();
        setIdToken(token);
      } else {
        setIdToken(null);
        setLoading(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Authenticated Fetch Helper
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = user ? await user.getIdToken() : null;
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    return fetch(url, { ...options, headers });
  };

  const handleLogin = async () => {
    try {
      if (!auth || !googleProvider) {
        alert("Authentication is currently unavailable. Bypassing to Guest Mode instead.");
        handleGuestLogin();
        return;
      }
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login failed:", err);
      // Automatically prompt to use Guest Mode if Google Auth popup fails or gets closed
      if (confirm("Google Sign-In popup was closed or failed (possibly because this domain is not yet added to your Firebase Authorized Domains list). Would you like to continue as a Guest instead?")) {
        handleGuestLogin();
      }
    }
  };

  const handleGuestLogin = () => {
    const guestUser = {
      uid: 'guest-user',
      displayName: 'Guest Member',
      email: 'guest@smartmaintenance.local',
      photoURL: null,
      getIdToken: async () => 'guest-token'
    } as any;
    setUser(guestUser);
  };

  const handleLogout = async () => {
    try {
      if (!auth || user?.uid === 'guest-user') {
        setUser(null);
        setAssets([]);
        setComponents([]);
        setLogs([]);
        setActiveTab('home');
        return;
      }
      await signOut(auth);
      setAssets([]);
      setComponents([]);
      setLogs([]);
      setActiveTab('home');
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const formatCurrency = (val: number | undefined | null) => {
    if (val === null || val === undefined || isNaN(val)) return '?';
    const num = currency !== 'Rp' ? val / exchangeRate : val;
    return `${currency}${currency !== 'Rp' ? num.toFixed(2) : Math.round(num).toLocaleString()}`;
  };

  const fetchAiSuggestions = async (asset: { name: string, category: string, description: string }) => {
    setIsSuggesting(true);
    try {
      const res = await authFetch('/api/ai/suggest-components', {
        method: 'POST',
        body: JSON.stringify(asset)
      });
      const data = await res.json();
      setAiSuggestions(data);
    } catch (err) {
      console.error("AI Suggestion Error:", err);
    } finally {
      setIsSuggesting(false);
    }
  };

  const fetchCostPrediction = async (componentId: string) => {
    const comp = components.find(c => c.id === componentId);
    const history = logs.filter(l => l.componentId === componentId);
    if (!comp || history.length === 0) return;

    setIsPredictingCost(true);
    setPredictionCompId(componentId);
    try {
      const res = await authFetch('/api/ai/predict-cost', {
        method: 'POST',
        body: JSON.stringify({
          componentName: comp.name,
          history: history.map(l => ({ cost: l.cost, date: l.timestamp }))
        })
      });
      const data = await res.json();
      setPredictedCost(data.predictedCost);
    } catch (err) {
      console.error("AI Cost Prediction Error:", err);
    } finally {
      setIsPredictingCost(false);
    }
  };

  const categories = useMemo(() => {
    return Array.from(new Set(assets.map(a => a.category)));
  }, [assets]);

  const [predefinedCategories, setPredefinedCategories] = useState<string[]>([]);

  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      const categoryMatch = selectedCategories.length === 0 || selectedCategories.includes(a.category);
      const assetMatch = selectedAssetIds.length === 0 || selectedAssetIds.includes(a.id);
      return categoryMatch && assetMatch;
    });
  }, [assets, selectedCategories, selectedAssetIds]);

  const availableAssetsForFilter = useMemo(() => {
    // Assets available to select in the asset dropdown based on current category filter
    if (selectedCategories.length === 0) return assets;
    return assets.filter(a => selectedCategories.includes(a.category));
  }, [assets, selectedCategories]);

  const componentsWithStatus = useMemo(() => {
    return components.map(c => ({
      ...c,
      status: calculateMaintenanceStatus(
        c.trackingMode,
        c.currentAccumulatedUsage,
        c.staticIntervalUsage || 1000,
        new Date(c.lastServiceDate),
        c.staticIntervalTime || 0,
        c.currentPredictedInterval
      )
    }));
  }, [components]);

  const stats = useMemo(() => {
    const relevantAssets = filteredAssets;
    const relevantAssetIds = new Set(relevantAssets.map(a => a.id));
    const relevantComponents = components.filter(c => relevantAssetIds.has(c.assetId));
    
    const componentStats = componentsWithStatus.filter(c => relevantAssetIds.has(c.assetId));

    const totalSpent = logs
      .filter(l => {
        const comp = components.find(c => c.id === l.componentId);
        return comp && relevantAssetIds.has(comp.assetId);
      })
      .reduce((sum, l) => sum + (l.cost || 0), 0);

    const pendingMaintenance = componentStats.filter(c => c.status.urgency !== UrgencyState.HEALTHY);
    const predictedCost = pendingMaintenance.reduce((sum, c) => sum + (c.estimatedCost || 0), 0);

    return {
      totalAssets: relevantAssets.length,
      totalComponents: relevantComponents.length,
      urgentCount: pendingMaintenance.length,
      totalSpent,
      predictedCost
    };
  }, [filteredAssets, components, logs, componentsWithStatus]);

  const sortedComponents = useMemo(() => {
    const relevantAssetIds = new Set(filteredAssets.map(a => a.id));
    return componentsWithStatus
      .filter(c => relevantAssetIds.has(c.assetId))
      .sort((a, b) => {
      // Bubbling logic: Critical > Upcoming > Healthy
      const priority = {
        [UrgencyState.CRITICAL]: 0,
        [UrgencyState.UPCOMING]: 1,
        [UrgencyState.HEALTHY]: 2
      };
      return priority[a.status.urgency] - priority[b.status.urgency] || b.status.percentage - a.status.percentage;
    });
  }, [components]);

  const filteredAndSortedAssetsList = useMemo(() => {
    let result = assets;
    result = [...result].sort((a, b) => {
      let valA: any, valB: any;
      if (assetSortBy === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (assetSortBy === 'category') {
        valA = a.category.toLowerCase();
        valB = b.category.toLowerCase();
      } else if (assetSortBy === 'purchaseDate') {
        valA = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
        valB = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
      } else {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      }
      
      if (valA < valB) return assetSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return assetSortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [assets, assetSortBy, assetSortOrder]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
  // Game popup removed per Priority 10.
  }, [sortedComponents, hasShownGamePopup]);

  useEffect(() => {
    // Generate notifications based on component status
    const newNotifications: AppNotification[] = [];
    sortedComponents.forEach(comp => {
      if (comp.status.urgency === UrgencyState.CRITICAL) {
        newNotifications.push({
          id: `crit-${comp.id}`,
          title: 'Critical Maintenance',
          message: `${comp.name} is overdue for service!`,
          type: 'error',
          timestamp: new Date().toISOString(),
          read: false,
          componentId: comp.id
        });
      } else if (comp.status.urgency === UrgencyState.UPCOMING) {
        newNotifications.push({
          id: `upc-${comp.id}`,
          title: 'Upcoming Service',
          message: `${comp.name} maintenance is approaching soon.`,
          type: 'warning',
          timestamp: new Date().toISOString(),
          read: false,
          componentId: comp.id
        });
      }
    });

    if (newNotifications.length > 0) {
      setNotifications(prev => {
        // Simple deduplication by title/component
        const existing = new Set(prev.map(n => `${n.title}-${n.componentId}`));
        const toAdd = newNotifications.filter(n => !existing.has(`${n.title}-${n.componentId}`));
        return [...toAdd, ...prev].slice(0, 50); // Keep last 50
      });
    }
  }, [sortedComponents]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    async function fetchData() {
      try {
        const [assetsRes, compRes, logsRes, catRes, useLevelLogsRes] = await Promise.all([
          authFetch('/api/assets'),
          authFetch('/api/components'),
          authFetch('/api/logs'),
          authFetch('/api/categories'),
          authFetch('/api/uselevellogs')
        ]);
        const assetsData = await assetsRes.json();
        const compData = await compRes.json();
        const logsData = await logsRes.json();
        const catData = await catRes.json();
        const useLevelLogsData = await useLevelLogsRes.json();
        setAssets(assetsData);
        setComponents(compData);
        setLogs(logsData);
        setPredefinedCategories(catData);
        setUseLevelLogs(useLevelLogsData || []);
      } catch (err) {
        console.error("Failed to fetch data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user]);

  const handleService = async () => {
    if (!selectedComponent) return;
    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/service', {
        method: 'POST',
        body: JSON.stringify({
          componentId: selectedComponent.id,
          metricValue: metricValue ? parseInt(metricValue) : undefined,
          notes: logNotes || "Manual service logged via dashboard",
          cost: costValue ? (currency === '$' ? parseFloat(costValue) * exchangeRate : parseFloat(costValue)) : undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        setComponents(prev => prev.map(c => c.id === data.component.id ? data.component : c));
        setLogs(prev => [data.log, ...prev]);
        setIsLogging(false);
        setSelectedComponent(null);
        setMetricValue("");
        setCostValue("");
        setLogNotes("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGlobalService = async () => {
    if (!globalServiceAssetId || !globalServiceComponentId) return;

    try {
      let targetComponentId = globalServiceComponentId;
      if (globalServiceComponentId === 'NEW') {
          if (!globalServiceNewComponentName) return;
          // Create component first
          const compRes = await authFetch('/api/components', {
              method: 'POST',
              body: JSON.stringify({
                  assetId: globalServiceAssetId,
                  name: globalServiceNewComponentName,
                  metricType: globalServiceNewComponentType,
                  trackingMode: TrackingMode.MANUAL_STATIC,
                  useLevel: 'MODERATE'
              })
          });
          const newComp = await compRes.json();
          setComponents(prev => [...prev, newComp]);
          targetComponentId = newComp.id;
      }

      const res = await authFetch('/api/service', {
        method: 'POST',
        body: JSON.stringify({
          componentId: targetComponentId,
          metricValue: globalServiceMetricValue ? parseInt(globalServiceMetricValue) : undefined,
          notes: globalServiceLogNotes || "Manual service logged via dashboard",
          cost: globalServiceCostValue ? (currency === '$' ? parseFloat(globalServiceCostValue) * exchangeRate : parseFloat(globalServiceCostValue)) : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setComponents(prev => prev.map(c => c.id === data.component.id ? data.component : c));
        setLogs(prev => [data.log, ...prev]);
        setIsGlobalServiceModalOpen(false);
        setGlobalServiceAssetId('');
        setGlobalServiceComponentId('');
        setGlobalServiceNewComponentName('');
        setGlobalServiceMetricValue('');
        setGlobalServiceCostValue('');
        setGlobalServiceLogNotes('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopTracking = async () => {
    if (!stopTrackingAssetId) return;
    try {
      const res = await authFetch(`/api/assets/${stopTrackingAssetId}`, {
        method: 'DELETE',
        // note: our simple backend just deletes it, but we could pass reason if we wanted
        body: JSON.stringify({ reason: stopTrackingReason })
      });
      if (res.ok) {
        setAssets(prev => prev.filter(a => a.id !== stopTrackingAssetId));
        setComponents(prev => prev.filter(c => c.assetId !== stopTrackingAssetId));
        setIsStopTrackingModalOpen(false);
        setStopTrackingAssetId('');
      } else {
        console.error("Failed to stop tracking.");
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert("Image is too large. Please select an image under 10MB.");
      return;
    }

    setIsScanningAsset(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        try {
          const res = await authFetch('/api/ai/scan-asset', {
            method: 'POST',
            body: JSON.stringify({ imageBase64: base64data })
          });
          
          if (!res.ok) throw new Error('Failed to scan image');
          
          const data = await res.json();
          if (data) {
            setNewAssetForm(prev => ({ 
              ...prev, 
              name: data.asset_name || data.name || prev.name, 
              category: data.category || prev.category, 
              description: data.description || prev.description 
            }));
            
            if (data.suggested_maintenance && Array.isArray(data.suggested_maintenance)) {
              setAiSuggestions(data.suggested_maintenance.map((m: string) => ({
                name: m,
                metricType: 'Days',
                suggestedIntervalTime: 365,
                estimatedCost: 0
              })));
            }

            // Add to predefined categories if it's new
            if (data.category && !predefinedCategories.includes(data.category)) {
              setPredefinedCategories(prev => [...prev, data.category]);
            }
          }
        } catch (err) {
          console.error("Error scanning asset:", err);
          alert("Failed to extract details from the image. Please try again or enter manually.");
        } finally {
          setIsScanningAsset(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error(e);
      setIsScanningAsset(false);
    }
  };

  const handleAddAsset = async () => {
    if (!newAssetForm.name) return;
    if (isVehicle(newAssetForm.category, newAssetForm.name) && !newAssetForm.odometer) {
      alert("Odometer reading is required for vehicles.");
      return;
    }
    try {
      const res = await authFetch('/api/assets', {
        method: 'POST',
        body: JSON.stringify({ ...newAssetForm, odometer: newAssetForm.odometer ? parseFloat(newAssetForm.odometer) : undefined })
      });
      const data = await res.json();
      setAssets(prev => [...prev, data]);
      
      const useLevelLogsRes = await authFetch('/api/uselevellogs');
      const useLevelLogsData = await useLevelLogsRes.json();
      setUseLevelLogs(useLevelLogsData || []);
      
      setIsAddingAsset(false);
      setNewAssetForm({ name: '', category: '', description: '', purchaseDate: '', odometer: '', useLevel: 'NORMAL' });
    } catch (err) { console.error(err); }
  };

  const handleUpdateAsset = async () => {
    if (!editingAsset || !editAssetForm.name) return;
    if (isVehicle(editAssetForm.category, editAssetForm.name) && !editAssetForm.odometer) {
      alert("Odometer reading is required for vehicles.");
      return;
    }
    try {
      const res = await authFetch(`/api/assets/${editingAsset.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...editAssetForm, odometer: editAssetForm.odometer ? parseFloat(editAssetForm.odometer) : undefined })
      });
      const data = await res.json();
      setAssets(prev => prev.map(a => a.id === data.id ? data : a));
      
      const useLevelLogsRes = await authFetch('/api/uselevellogs');
      const useLevelLogsData = await useLevelLogsRes.json();
      setUseLevelLogs(useLevelLogsData || []);
      
      setIsEditingAsset(false);
      setEditingAsset(null);
    } catch (err) { console.error(err); }
  };

  const handleUpdateComponent = async () => {
    if (!editingComponent || !editCompForm.name) return;
    // Determine the tracking mode. If intervals are blank and tracking mode is currently manual, it'll need EWMA (or we just disable)
    // Actually, we can just send the data, and if they omit usage/time, we can let user use AUTO_EWMA
    const isSmartTrack = !editCompForm.staticIntervalUsage && !editCompForm.staticIntervalTime;
    try {
      const res = await authFetch(`/api/components/${editingComponent.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...editCompForm,
          trackingMode: isSmartTrack ? TrackingMode.AUTO_EWMA : TrackingMode.MANUAL_STATIC
        })
      });
      const data = await res.json();
      setComponents(prev => prev.map(c => c.id === data.id ? data : c));
      setIsEditingComponent(false);
      setEditingComponent(null);
    } catch (err) { console.error(err); }
  };

  const handleInlineUpdateComponent = async (comp: Component) => {
    try {
      const isSmartTrack = !inlineEditForm.staticIntervalUsage && !inlineEditForm.staticIntervalTime;
      const res = await authFetch(`/api/components/${comp.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: comp.name,
          staticIntervalUsage: inlineEditForm.staticIntervalUsage,
          staticIntervalTime: inlineEditForm.staticIntervalTime,
          trackingMode: isSmartTrack ? TrackingMode.AUTO_EWMA : TrackingMode.MANUAL_STATIC
        })
      });
      const data = await res.json();
      setComponents(prev => prev.map(c => c.id === data.id ? data : c));
      setInlineEditingCompId(null);
    } catch (err) { console.error(err); }
  };

  const handleAddSuggestedComponent = async (assetId: string, suggestion: any) => {
    try {
      await authFetch('/api/components', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          name: suggestion.name,
          metricType: suggestion.metricType,
          trackingMode: TrackingMode.AUTO_EWMA,
          staticIntervalUsage: suggestion.suggestedIntervalUsage,
          staticIntervalTime: suggestion.suggestedIntervalTime,
          estimatedCost: suggestion.estimatedCost
        })
      });
      // Refresh components
      const res = await authFetch('/api/components');
      const data = await res.json();
      setComponents(data);
    } catch (err) {
      console.error("Failed to add suggested component", err);
    }
  };

  const handleCreateAssetWithSuggestions = async () => {
    if (!newAssetForm.name) return;
    try {
      const res = await authFetch('/api/assets', {
        method: 'POST',
        body: JSON.stringify({ ...newAssetForm, odometer: newAssetForm.odometer ? parseFloat(newAssetForm.odometer) : undefined })
      });
      const asset = await res.json();
      setAssets(prev => [...prev, asset]);
      
      // Add all suggestions
      for (const suggestion of aiSuggestions) {
        await handleAddSuggestedComponent(asset.id, suggestion);
      }

      setIsAddingAsset(false);
      setNewAssetForm({ name: '', category: '', description: '', purchaseDate: '', odometer: '', useLevel: 'NORMAL' });
      setAiSuggestions([]);
    } catch (err) { console.error(err); }
  };

  const handleDeleteAsset = async (id: string) => {
    const assetToRemove = assets.find(a => a.id === id);
    if (!assetToRemove) return;
    
    // Save to undo stack
    const childComps = components.filter(c => c.assetId === id);
    setUndoStack({ type: 'asset', data: assetToRemove, childComponents: childComps });
    
    try {
      await authFetch(`/api/assets/${id}`, { method: 'DELETE' });
      setAssets(prev => prev.filter(a => a.id !== id));
      setComponents(prev => prev.filter(c => c.assetId !== id));
      setShowUndo(true);
      setTimeout(() => setShowUndo(false), 5000);
    } catch (err) { console.error(err); }
  };

  const handleDeleteComponent = async (id: string) => {
    const compToRemove = components.find(c => c.id === id);
    if (!compToRemove) return;

    setUndoStack({ type: 'component', data: compToRemove });
    
    try {
      await authFetch(`/api/components/${id}`, { method: 'DELETE' });
      setComponents(prev => prev.filter(c => c.id !== id));
      setShowUndo(true);
      setTimeout(() => setShowUndo(false), 5000);
    } catch (err) { console.error(err); }
  };

  const handleUndo = async () => {
    if (!undoStack) return;

    try {
      if (undoStack.type === 'asset') {
        const res = await authFetch('/api/assets', {
          method: 'POST',
          body: JSON.stringify(undoStack.data)
        });
        const restoredAsset = await res.json();
        setAssets(prev => [...prev, restoredAsset]);
        
        // Restore child components
        if (undoStack.childComponents) {
          for (const comp of undoStack.childComponents) {
            await authFetch('/api/components', {
              method: 'POST',
              body: JSON.stringify(comp)
            });
          }
          const compRes = await authFetch('/api/components');
          const compData = await compRes.json();
          setComponents(compData);
        }
      } else {
        await authFetch('/api/components', {
          method: 'POST',
          body: JSON.stringify(undoStack.data)
        });
        const compRes = await authFetch('/api/components');
        const compData = await compRes.json();
        setComponents(compData);
      }
      setShowUndo(false);
      setUndoStack(null);
    } catch (err) { console.error(err); }
  };

  const handleAddComponent = async () => {
    if (!newCompForm.name || !newCompForm.assetId) return;
    
    // Logic: If no usage/time interval is input, use AUTO_EWMA (Smart Track)
    const isSmartTrack = !newCompForm.staticIntervalUsage && !newCompForm.staticIntervalTime;
    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/components', {
        method: 'POST',
        body: JSON.stringify({
          ...newCompForm,
          staticIntervalUsage: newCompForm.staticIntervalUsage ? parseInt(newCompForm.staticIntervalUsage) : undefined,
          staticIntervalTime: newCompForm.staticIntervalTime ? parseInt(newCompForm.staticIntervalTime) : undefined,
          trackingMode: TrackingMode.MANUAL_STATIC, // default for manual add
          lastServiceDate: new Date().toISOString(),
          currentAccumulatedUsage: isVehicle(assets.find(a => a.id === newCompForm.assetId)?.category || '', assets.find(a => a.id === newCompForm.assetId)?.name || '') ? (assets.find(a => a.id === newCompForm.assetId)?.odometer || 0) : 0
        })
      });
      const data = await res.json();
      setComponents(prev => [...prev, data]);
      setIsAddingComponent(false);
      setNewCompForm({ 
        assetId: '', 
        name: '', 
        metricType: 'KM', 
        staticIntervalUsage: '', 
        staticIntervalTime: '',
        useLevel: 'MODERATE',
        purchaseDate: ''
      });
    } catch (err) { console.error(err); }
    finally { setIsSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg text-app-ink flex items-center justify-center">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }} 
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <img 
            src="/images/rabet_logo_transparent_192px.png" 
            alt="Rabet Logo" 
            className="w-16 h-16 object-contain" 
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex bg-app-bg min-h-screen text-app-ink font-sans">


      {/* Main Content Area */}
      {authLoading ? (
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <RotateCcw className="w-8 h-8 text-app-smart animate-spin" />
        </div>
      ) : !user ? (
        <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-neutral-950">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white dark:bg-neutral-900 p-8 rounded-[2.5rem] shadow-shadow-enterprise-lg text-center border border-slate-100 dark:border-neutral-800"
          >
            {!auth && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/30 rounded-2xl flex gap-3 text-left">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-1">Firebase Credentials Missing</h3>
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    This build is missing Firebase secrets. The app is running in safe mode. Auth & Firestore API features are disabled. Please set VITE_FIREBASE_* secrets on your repository.
                  </p>
                </div>
              </div>
            )}
            <div className="flex justify-center mb-8">
              <img 
                src="/images/rabet_logo_transparent_256px.png" 
                alt="Smart Maintenance Logo" 
                className="w-28 h-auto object-contain drop-shadow-md" 
              />
            </div>
            <h1 className="text-2xl font-black text-app-ink dark:text-white uppercase tracking-tight mb-2">Smart Maintenance</h1>
            <p className="text-app-muted dark:text-neutral-400 font-medium mb-10 leading-relaxed px-4">
              Your intelligent infrastructure companion. Sign in to manage your assets securely.
            </p>
            <div className="space-y-3">
              <button 
                onClick={handleLogin}
                className="w-full py-4 bg-app-ink dark:bg-white dark:text-black text-white font-black rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl hover:opacity-90 cursor-pointer"
              >
                <LogIn className="w-5 h-5" />
                SIGN IN WITH GOOGLE
              </button>
              
              <button 
                onClick={handleGuestLogin}
                className="w-full py-4 bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700/80 text-app-ink dark:text-white font-black rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all border border-slate-200/50 dark:border-neutral-700/50 cursor-pointer"
              >
                <UserIcon className="w-5 h-5 text-slate-500 dark:text-neutral-400" />
                CONTINUE AS GUEST / DEMO MODE
              </button>
            </div>
            <p className="mt-8 text-[10px] font-black text-slate-300 dark:text-neutral-600 uppercase tracking-[0.2em]">Enterprise Isolation Active</p>
          </motion.div>
        </div>
      ) : (
        <>
          {/* Desktop Sidebar Navigation for B2B Fleet Managers */}
          <div className="hidden lg:flex flex-col w-72 bg-slate-900 text-white p-6 border-r border-slate-800 shrink-0 select-none">
            <div className="flex items-center gap-3 mb-10">
              <img 
                src="/images/rabet_logo_transparent_192px.png" 
                alt="Rabet Logo" 
                className="h-10 w-auto object-contain brightness-0 invert" 
              />
              <div className="flex flex-col">
                <span className="font-extrabold tracking-tight text-xl text-white">RABET</span>
                <span className="text-[10px] font-bold text-app-smart uppercase tracking-widest">B2B Fleet Panel</span>
              </div>
            </div>

            <nav className="space-y-2 flex-1">
              {[
                { id: 'home', label: 'Dashboard', icon: Home },
                { id: 'status', label: 'Component Status', icon: ClipboardList },
                { id: 'assets', label: 'Fleet Assets', icon: Box },
                { id: 'settings', label: 'System Settings', icon: Settings },
              ].map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer ${isActive ? 'bg-app-smart text-white shadow-lg shadow-app-smart/30' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'}`}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Quick Stats Widget in Sidebar */}
            <div className="mt-auto bg-slate-800/40 border border-slate-700/30 rounded-2xl p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fleet Status</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${stats.urgentCount > 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                  {stats.urgentCount > 0 ? 'Attention Required' : 'All Healthy'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800/50 rounded-xl p-2.5 text-center border border-slate-700/20">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Assets</span>
                  <span className="text-lg font-black text-white block mt-0.5">{stats.totalAssets}</span>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-2.5 text-center border border-slate-700/20">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Urgent</span>
                  <span className={`text-lg font-black block mt-0.5 ${stats.urgentCount > 0 ? 'text-red-400' : 'text-white'}`}>{stats.urgentCount}</span>
                </div>
              </div>
            </div>
          </div>

          <main className="flex-1 flex flex-col items-center justify-center lg:py-8 w-full min-h-screen">
        
        {/* Mobile Viewport Simulation */}
        <div className="relative bg-white dark:bg-neutral-900 lg:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.2)] lg:rounded-[3rem] flex flex-col w-full h-screen lg:h-[90vh] max-w-[420px] lg:border-8 lg:border-slate-100/80 dark:lg:border-neutral-800 overflow-hidden ring-1 ring-slate-900/5 dark:ring-white/5">
          {activeTab === 'home' && sortedComponents.filter(c => c.status.urgency !== UrgencyState.HEALTHY).length > 0 && (
             <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_80px_rgba(239,68,68,0.3)] z-50 rounded-[32px]" />
          )}
          <header className="px-6 pt-10 pb-4 sticky top-0 bg-transparent backdrop-blur-sm z-10 border-b border-transparent">
            <div className="flex justify-between items-start mb-1 relative z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <img 
                    src="/images/rabet_logo_transparent_192px.png" 
                    alt="Rabet Logo" 
                    className="h-8 w-auto object-contain dark:brightness-0 dark:invert" 
                  />
                </div>
                <p className="text-app-muted dark:text-neutral-400 text-xs font-medium lowercase">
                  {componentsWithStatus.filter(c => c.status.urgency !== UrgencyState.HEALTHY).length} {language === 'en' ? 'urgent tasks' : 'tugas mendesak'}
                </p>
              </div>
              <div className="flex gap-2">
                {activeTab === 'home' && sortedComponents.filter(c => c.status.urgency !== UrgencyState.HEALTHY).length > 0 && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setActiveTab('status')}
                    className="flex items-center justify-center w-10 h-10 bg-black/90 border border-red-500/50 rounded-full shadow-[0_0_15px_rgba(220,38,38,0.5)] relative hover:bg-black transition-colors"
                  >
                    <AlertCircle className="w-5 h-5 text-red-500 animate-pulse" />
                  </motion.button>
                )}
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsNotificationsOpen(true)}
                  className="w-10 h-10 bg-slate-50 dark:bg-neutral-800/80 rounded-full text-app-muted border border-slate-100 dark:border-neutral-700/50 flex items-center justify-center relative active:scale-95 shadow-sm"
                >
                  <Bell className="w-5 h-5 text-app-muted" />
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-app-critical rounded-full" />
                  )}
                </motion.button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 pb-32">
            {activeTab === 'home' ? (
              <div className="space-y-6 pt-4">
                {/* Maintenance Pulse */}
                <div className="space-y-2">
                  <h4 className="text-[9px] font-extrabold text-app-muted uppercase tracking-[0.2em] pl-1">
                    MAINTENANCE PULSE
                  </h4>
                  <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="enterprise-card p-5 bg-neutral-900 border border-slate-100/10 rounded-2xl flex flex-col gap-3 shadow-md"
                  >
                     <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white dark:bg-neutral-800 rounded-xl flex items-center justify-center shadow-sm border border-slate-100 dark:border-neutral-700/50">
                            <img 
                              src="/images/rabet_logo_transparent_192px.png" 
                              alt="Rabet Logo" 
                              className="w-6 h-6 object-contain" 
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 text-[9px] font-bold w-fit mb-0.5">
                              <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
                              <span>{(stats.urgentCount === 0 ? 100 : Math.max(0, 100 - (stats.urgentCount * 15)))}% stable</span>
                            </div>
                            <p className="text-sm font-bold text-[#ffffff] leading-tight">Infrastructure health</p>
                          </div>
                        </div>
                     </div>
                     <p className="text-xs text-app-muted font-medium leading-relaxed pl-1">
                       Tracking <span className="text-app-smart font-semibold">{stats.totalComponents} components</span> · Smart Calibration active
                     </p>
                  </motion.div>
                </div>

                {/* Expenditure Overview */}
                <div className="space-y-2">
                  <h4 className="text-[9px] font-extrabold text-app-muted uppercase tracking-[0.2em] pl-1">
                    EXPENDITURE OVERVIEW
                  </h4>
                  <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-neutral-900 border border-slate-100/10 p-5 rounded-2xl shadow-md flex flex-col relative overflow-hidden group"
                  >
                      <div className="grid grid-cols-2 gap-4 relative z-10">
                        <div className="space-y-1">
                          <p className="text-[9px] font-extrabold text-app-muted uppercase tracking-widest pl-0.5">INVESTED</p>
                          <div className="flex items-baseline">
                            <span className="text-2xl font-extrabold text-[#ffffff] tracking-tight">{formatCurrency(stats.totalSpent)}</span>
                          </div>
                        </div>
                        <div className="space-y-1 text-right">
                          <p className="text-[9px] font-extrabold text-app-muted uppercase tracking-widest pr-0.5">PROJECTED</p>
                          <div className="flex items-baseline justify-end">
                            <span className="text-2xl font-extrabold text-app-smart tracking-tight">{formatCurrency(stats.predictedCost)}</span>
                          </div>
                        </div>
                      </div>
      
                      <div className="mt-4 pt-4 border-t border-slate-100/10 flex justify-between items-center relative z-10 text-xs">
                          <p className="text-[10px] font-extrabold text-app-muted uppercase tracking-widest pl-0.5">
                            Ratio: {stats.totalSpent > 0 ? ((stats.predictedCost || 0) / stats.totalSpent * 100).toFixed(0) : 0}%
                          </p>
                          <div className="px-2 py-0.5 bg-blue-500/10 rounded border border-blue-500/20 text-[9px] font-extrabold text-app-smart uppercase tracking-widest">
                            IDR
                          </div>
                      </div>
                  </motion.div>
                </div>

                {/* Infrastructure Stats Grid */}
                <div className="space-y-2">
                  <h4 className="text-[9px] font-extrabold text-app-muted uppercase tracking-[0.2em] pl-1">
                    INFRASTRUCTURE STATS
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="enterprise-card p-5 bg-neutral-900 border border-slate-100/10 rounded-2xl flex flex-col justify-between h-28 group transition-all"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-slate-800/80 rounded-xl">
                          <Box className="w-4 h-4 text-app-muted" />
                        </div>
                        <p className="text-[8px] font-extrabold text-app-muted uppercase tracking-widest text-right">MANAGED<br/>ASSETS</p>
                      </div>
                      <div className="pl-0.5">
                        <p className="text-2xl font-extrabold text-[#ffffff] leading-none mb-1">{stats.totalAssets}</p>
                        <p className="text-[9px] font-bold text-app-muted uppercase tracking-wider">items tracked</p>
                      </div>
                    </motion.div>

                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      onClick={() => setActiveTab('status')}
                      className="enterprise-card p-5 bg-neutral-900 border border-slate-100/10 rounded-2xl flex flex-col justify-between h-28 group cursor-pointer active:scale-95 transition-all"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-slate-800/80 rounded-xl">
                          <AlertCircle className="w-4 h-4 text-app-muted" />
                        </div>
                        <p className="text-[8px] font-extrabold text-app-muted uppercase tracking-widest text-right">ATTENTION<br/>REQUIRED</p>
                      </div>
                      <div className="pl-0.5">
                        <p className="text-2xl font-extrabold text-[#ffffff] leading-none mb-1">{stats.urgentCount}</p>
                        <p className="text-[9px] font-bold text-app-muted uppercase tracking-wider">open tasks</p>
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Info banner when no assets are added yet */}
                {stats.totalAssets === 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2.5 p-3.5 bg-neutral-900/60 border border-slate-100/5 rounded-xl text-[11px] text-app-muted pl-4"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-app-muted shrink-0" />
                    <span>No assets added yet. Go to Assets to get started.</span>
                  </motion.div>
                )}

              </div>
            ) : activeTab === 'status' ? (
              <div className="space-y-6 pt-4 pb-12">
                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-2xl border border-slate-100">
                  <button 
                    onClick={() => setShowLogsInStatus(false)}
                    className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${!showLogsInStatus ? 'bg-white shadow-sm text-app-ink ring-1 ring-slate-200' : 'text-app-muted hover:text-app-ink'}`}
                  >
                    Maintenance
                  </button>
                  <button 
                    onClick={() => setShowLogsInStatus(true)}
                    className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${showLogsInStatus ? 'bg-white shadow-sm text-app-ink ring-1 ring-slate-200' : 'text-app-muted hover:text-app-ink'}`}
                  >
                    Service Logs
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Category Dropdown */}
                  <div className="relative w-full">
                    <button 
                      onClick={() => {
                        setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                        setIsAssetDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 bg-white border rounded-2xl transition-all active:scale-[0.98] ${isCategoryDropdownOpen ? 'border-app-ink ring-2 ring-slate-100' : 'border-slate-100 shadow-sm'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Filter className="w-3.5 h-3.5 text-app-muted" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-ink">
                          {selectedCategories.length === 0 ? 'All Categories' : `${selectedCategories.length} Categories`}
                        </span>
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                      {isCategoryDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsCategoryDropdownOpen(false)} />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute top-12 left-0 right-0 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 py-2 max-h-60 overflow-y-auto"
                          >
                            <button 
                              onClick={() => {
                                setSelectedCategories([]);
                                setIsCategoryDropdownOpen(false);
                              }}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                            >
                              <span className="text-[11px] font-bold text-app-ink">All Categories</span>
                              {selectedCategories.length === 0 && <Check className="w-3.5 h-3.5 text-app-smart" />}
                            </button>
                            <div className="h-px bg-slate-50 my-1" />
                            {categories.map((cat, idx) => (
                              <button 
                                key={`cat-${idx}-${cat}`}
                                onClick={() => {
                                  setSelectedCategories(prev => 
                                    prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                                  );
                                }}
                                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                              >
                                <span className="text-[11px] font-bold text-slate-600">{cat}</span>
                                {selectedCategories.includes(cat) && <Check className="w-3.5 h-3.5 text-app-smart" />}
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Asset Dropdown */}
                  <div className="relative w-full">
                    <button 
                      onClick={() => {
                        setIsAssetDropdownOpen(!isAssetDropdownOpen);
                        setIsCategoryDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 bg-white border rounded-2xl transition-all active:scale-[0.98] ${isAssetDropdownOpen ? 'border-app-ink ring-2 ring-slate-100' : 'border-slate-100 shadow-sm'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Box className="w-3.5 h-3.5 text-app-muted" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-app-ink">
                          {selectedAssetIds.length === 0 ? 'All Assets' : `${selectedAssetIds.length} Assets`}
                        </span>
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isAssetDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                      {isAssetDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsAssetDropdownOpen(false)} />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute top-12 left-0 right-0 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 py-2 max-h-60 overflow-y-auto"
                          >
                            <button 
                              onClick={() => {
                                setSelectedAssetIds([]);
                                setIsAssetDropdownOpen(false);
                              }}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                            >
                              <span className="text-[11px] font-bold text-app-ink">All Assets</span>
                              {selectedAssetIds.length === 0 && <Check className="w-3.5 h-3.5 text-app-smart" />}
                            </button>
                            <div className="h-px bg-slate-50 my-1" />
                            {availableAssetsForFilter.map((asset, idx) => (
                              <button 
                                key={`filter-asset-${asset.id}-${idx}`}
                                onClick={() => {
                                  setSelectedAssetIds(prev => 
                                    prev.includes(asset.id) ? prev.filter(id => id !== asset.id) : [...prev, asset.id]
                                  );
                                }}
                                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                              >
                                <div>
                                  <p className="text-[11px] font-bold text-slate-600">{asset.name}</p>
                                  <p className="text-[10px] text-app-muted uppercase font-bold">{asset.category}</p>
                                </div>
                                {selectedAssetIds.includes(asset.id) && <Check className="w-3.5 h-3.5 text-app-smart" />}
                              </button>
                            ))}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {showLogsInStatus ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-[11px] font-black tracking-[0.2em] uppercase text-app-muted">Recent History</h2>
                    </div>
                    <div className="space-y-1">
                        {logs.length === 0 ? (
                            <p className="text-xs text-app-muted italic py-10 text-center">No service logs found.</p>
                        ) : (
                            logs.map((log, idx) => {
                                const comp = components.find(c => c.id === log.componentId);
                                return (
                                    <div key={`log-item-${log.id}-${idx}`} className="timeline-item">
                                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="p-1.5 bg-slate-50 rounded-lg">
                                                        <Settings className="w-3.5 h-3.5 text-app-ink" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold leading-tight">{comp?.name || 'Unknown'}</p>
                                                        <p className="text-xs text-app-muted font-bold uppercase tracking-wide">
                                                            {assets.find(a => a.id === comp?.assetId)?.name}
                                                        </p>
                                                    </div>
                                                </div>
                                                {log.cost !== undefined && log.cost !== null && <p className="text-[10px] font-black text-app-ink bg-slate-100 px-2 py-0.5 rounded">{formatCurrency(log.cost)}</p>}
                                            </div>
                                            <p className="text-[10px] text-app-muted font-semibold uppercase">{new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                                            <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-2">
                                                <p><span className="font-bold">Metric:</span> {log.actualMetricValue} {comp?.metricType}</p>
                                                {log.notes && <p className="mt-1 font-medium italic opacity-80">"{log.notes}"</p>}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                  </div>
                ) : (
                    sortedComponents.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-100 mt-6">
                        <div className="w-20 h-20 bg-white shadow-sm rounded-3xl flex items-center justify-center mb-6">
                          <ClipboardList className="w-10 h-10 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-black text-app-ink mb-2 uppercase">System Clear</h3>
                        <p className="text-sm text-app-muted font-bold max-w-[240px] leading-relaxed">No active components tracked. Add an asset to start monitoring health.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-center transition-all mt-4">
                            <h2 className="text-[11px] font-black tracking-[0.2em] uppercase text-app-muted shrink-0">
                              System Status
                            </h2>
                            <div className="h-px bg-slate-100 w-full mx-4" />
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="bg-slate-50 p-6 rounded-4xl border border-slate-100 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-bold text-app-muted uppercase tracking-wider mb-1">Logic Engine</p>
                                    <p className="text-xl font-black text-app-ink">Healthy</p>
                                </div>
                                <div className="h-2 w-2 bg-app-healthy rounded-full animate-pulse" />
                            </div>
                        </div>

                        {[UrgencyState.CRITICAL, UrgencyState.UPCOMING, UrgencyState.HEALTHY].map((urgency, i) => {
                            const filtered = sortedComponents.filter(c => c.status.urgency === urgency);
                            if (filtered.length === 0) return null;
                            return (
                                <div key={`urgency-group-${urgency}-${i}`} className="space-y-3">
                                    <h2 className={`text-[11px] font-black tracking-[0.2em] uppercase ${urgency === UrgencyState.CRITICAL ? 'text-app-critical' : urgency === UrgencyState.UPCOMING ? 'text-app-upcoming' : 'text-app-muted'}`}>
                                        {urgency}
                                    </h2>
                                    <div className="space-y-3">
                                        {filtered.map((comp, idx) => (
                                            <ComponentCard 
                                                key={`comp-card-${comp.id}-${idx}`}
                                                component={comp}
                                                assetName={assets.find(a => a.id === comp.assetId)?.name || 'Asset'}
                                                onLog={() => {
                                                    setSelectedComponent(comp);
                                                    setIsLogging(true);
                                                }}
                                                logs={logs}
                                                predictionCompId={predictionCompId}
                                                predictedCost={predictedCost}
                                                fetchCostPrediction={fetchCostPrediction}
                                                formatCurrency={formatCurrency}
                                            />
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        <div className="mt-8 pt-8 border-t border-slate-100 pb-12">
                            <h4 className="text-[11px] font-black text-app-muted uppercase tracking-widest mb-4">Component Insights</h4>
                            <div className="space-y-4">
                                {components.map((comp, cid) => (
                                    <div key={`insight-comp-${comp.id}-${cid}`} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 group hover:border-slate-200 transition-colors">
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-sm tracking-tight text-app-ink">{comp.name}</p>
                                                <button 
                                                    onClick={() => handleDeleteComponent(comp.id)}
                                                    className="p-1 text-slate-300 hover:text-app-critical transition-colors"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                                {comp.purchaseDate && (
                                                    <div className="flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-100/50 px-1.5 py-0.5 rounded">
                                                        <Calendar className="w-2.5 h-2.5" />
                                                        <span>{new Date(comp.purchaseDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${comp.trackingMode === TrackingMode.AUTO_EWMA ? 'badge-smart' : 'badge-manual'}`}>
                                                {comp.trackingMode === TrackingMode.AUTO_EWMA ? 'Smart' : 'Manual'}
                                            </span>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Usage Status</p>
                                                        <p className="text-sm font-black text-app-ink">
                                                            {comp.currentAccumulatedUsage} <span className="text-slate-300 font-medium">/</span> {Math.round(comp.currentPredictedInterval || comp.staticIntervalUsage || 0)}
                                                            <span className="ml-1 text-[10px] text-app-muted font-bold uppercase">{comp.metricType}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Health</p>
                                                    <p className={`text-xs font-bold ${calculateMaintenanceStatus(comp.trackingMode, comp.currentAccumulatedUsage, comp.staticIntervalUsage || 1000, new Date(comp.lastServiceDate), comp.staticIntervalTime || 0, comp.currentPredictedInterval).urgency === UrgencyState.CRITICAL ? 'text-app-critical' : 'text-app-healthy'}`}>
                                                        {calculateMaintenanceStatus(comp.trackingMode, comp.currentAccumulatedUsage, comp.staticIntervalUsage || 1000, new Date(comp.lastServiceDate), comp.staticIntervalTime || 0, comp.currentPredictedInterval).urgency === UrgencyState.CRITICAL ? 'Action Req' : 'Optimal'}
                                                    </p>
                                                </div>
                                            </div>
                                            <StatusBar 
                                                percentage={calculateMaintenanceStatus(comp.trackingMode, comp.currentAccumulatedUsage, comp.staticIntervalUsage || 1000, new Date(comp.lastServiceDate), comp.staticIntervalTime || 0, comp.currentPredictedInterval).percentage} 
                                                theme={calculateMaintenanceStatus(comp.trackingMode, comp.currentAccumulatedUsage, comp.staticIntervalUsage || 1000, new Date(comp.lastServiceDate), comp.staticIntervalTime || 0, comp.currentPredictedInterval).urgency === UrgencyState.CRITICAL ? 'critical' : 'healthy'}
                                            />
                                            <div className="flex justify-between items-center text-[10px]">
                                                <p className="font-bold text-slate-400 uppercase tracking-tighter flex items-center gap-1">
                                                    Cost Estimate
                                                    {logs.some(l => l.componentId === comp.id) && (
                                                        <button onClick={() => fetchCostPrediction(comp.id)} className="hover:text-app-smart transition-colors p-0.5">
                                                            <Zap className="w-2.5 h-2.5 fill-current" />
                                                        </button>
                                                    )}
                                                </p>
                                                <p className="font-black text-app-ink">
                                                    {formatCurrency(comp.estimatedCost)}
                                                    {predictedCost && predictionCompId === comp.id && (
                                                        <span className="ml-1 text-app-smart">(AI: {formatCurrency(predictedCost)})</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                      </>
                    )
                )}
              </div>
            ) : activeTab === 'assets' ? (
                <div className="space-y-6 pt-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-[11px] font-black tracking-[0.2em] uppercase text-app-muted">My Assets</h2>
                  <button 
                    onClick={() => setIsAddingAsset(true)}
                    className="flex items-center gap-1.5 p-1 px-3 bg-app-ink text-white rounded-lg text-[10px] font-black uppercase tracking-wider active:scale-95 transition-transform"
                  >
                    <Plus className="w-3 h-3" /> New Asset
                  </button>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="flex-1 flex gap-2 items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Sort by:</span>
                        <select 
                            value={assetSortBy} 
                            onChange={e => setAssetSortBy(e.target.value as any)}
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none flex-1"
                        >
                            <option value="name">Name</option>
                            <option value="category">Category</option>
                            <option value="purchaseDate">Purchase Date</option>
                        </select>
                        <button 
                            onClick={() => setAssetSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                            className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                        >
                            {assetSortOrder === 'asc' ? <ChevronDown className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 rotate-180" />}
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                  {filteredAndSortedAssetsList.map((asset, idx) => {
                    const assetCompIds = new Set(components.filter(c => c.assetId === asset.id).map(c => c.id));
                    const latestLog = logs.filter(l => assetCompIds.has(l.componentId)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                    return (
                    <div key={`asset-details-${asset.id}-${idx}`} className="bg-slate-50 border border-slate-100 rounded-3xl p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {asset.imageUrl ? (
                            <img src={asset.imageUrl} alt={asset.name} className="w-12 h-12 rounded-xl object-cover shadow-sm border border-slate-100 bg-white p-1" />
                          ) : (
                            <div className="p-2.5 bg-white rounded-xl shadow-sm border border-slate-100 text-app-ink w-12 h-12 flex items-center justify-center">
                              {asset.name.includes('Bike') || asset.name.includes('Ducati') || asset.name.includes('Motor') || asset.name.includes('Supra') ? <Bike className="w-5 h-5" /> : <Wind className="w-5 h-5" />}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-base leading-tight">{asset.name}</h3>
                                <span className="text-[10px] font-bold text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-tighter">ID: {asset.id}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] font-bold text-app-muted uppercase tracking-widest">{asset.category}</p>
                                {asset.useLevel && (
                                    <>
                                        <span className="w-1 h-1 bg-slate-200 rounded-full" />
                                        <p className="text-[10px] font-bold text-slate-400 capitalize">{asset.useLevel.toLowerCase()} Use</p>
                                    </>
                                )}
                                {asset.purchaseDate && (
                                    <>
                                        <span className="w-1 h-1 bg-slate-200 rounded-full" />
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                            <Calendar className="w-2.5 h-2.5" />
                                            <span>{new Date(asset.purchaseDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                                        </div>
                                    </>
                                )}
                                {asset.odometer !== undefined && (
                                    <>
                                        <span className="w-1 h-1 bg-slate-200 rounded-full" />
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                            <span>Odo: {asset.odometer.toLocaleString()} {asset.category.toLowerCase() === 'car' || asset.category.toLowerCase() === 'motorcycle' || asset.category.toLowerCase() === 'motor' ? 'km' : ''}</span>
                                        </div>
                                    </>
                                )}
                                {latestLog && (
                                    <>
                                        <span className="w-1 h-1 bg-slate-200 rounded-full" />
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                            <History className="w-2.5 h-2.5" />
                                            <span>Last: {new Date(latestLog.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => {
                                    setEditingAsset(asset);
                                    setEditAssetForm({ 
                                        name: asset.name, 
                                        category: asset.category, 
                                        description: asset.description || '',
                                        purchaseDate: asset.purchaseDate || '',
                                        odometer: asset.odometer ? String(asset.odometer) : '',
                                        useLevel: asset.useLevel || 'NORMAL'
                                    });
                                    setIsEditingAsset(true);
                                }}
                                className="p-2 bg-white rounded-full border border-slate-200 text-slate-400 hover:text-app-ink transition-colors"
                            >
                                <Settings className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setSelectedAssetId(selectedAssetId === asset.id ? null : asset.id)}
                              className="p-2 bg-white rounded-full border border-slate-200 text-slate-400"
                            >
                              <ChevronRight className={`w-4 h-4 transition-transform ${selectedAssetId === asset.id ? 'rotate-90' : ''}`} />
                            </button>
                        </div>
                      </div>
                      
                      {asset.description && <p className="text-xs text-app-muted leading-relaxed pl-1">{asset.description}</p>}
                      
                      <AnimatePresence>
                        {selectedAssetId === asset.id && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden space-y-2 pt-2 border-t border-slate-200"
                          >
                            <div className="flex justify-between items-center mb-2 mt-2">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest ">Tracked Components</p>
                                <button 
                                    onClick={() => {
                                        setNewCompForm(prev => ({ ...prev, assetId: asset.id }));
                                        setIsAddingComponent(true);
                                    }}
                                    className="text-xs font-black text-app-smart uppercase tracking-widest flex items-center gap-1"
                                >
                                    <Plus className="w-2.5 h-2.5" /> Add
                                </button>
                            </div>
                            {components.filter(c => c.assetId === asset.id).length === 0 ? (
                                <p className="text-[10px] text-slate-400 italic py-2">No components tracked yet.</p>
                            ) : (
                                components.filter(c => c.assetId === asset.id).map((comp, cid) => {
                                  const status = calculateMaintenanceStatus(comp.trackingMode, comp.currentAccumulatedUsage, comp.staticIntervalUsage || 1000, new Date(comp.lastServiceDate), comp.staticIntervalTime || 0, comp.currentPredictedInterval);
                                  return (
                                      <div key={`asset-comp-${comp.id}-${cid}`} className="flex flex-col bg-white p-3 rounded-xl border border-slate-100">
                                        <div className="flex justify-between items-center w-full">
                                          <div>
                                            <div className="flex items-center gap-2 mb-0.5">
                                              <span className={`w-2 h-2 shrink-0 rounded-full ${status.urgency === UrgencyState.CRITICAL ? 'bg-app-critical' : status.urgency === UrgencyState.UPCOMING ? 'bg-app-upcoming' : 'bg-app-healthy'}`} />
                                              <p className="text-xs font-bold text-app-ink">{comp.name}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <p className="text-[10px] text-app-muted uppercase font-bold">{comp.trackingMode === TrackingMode.AUTO_EWMA ? 'Smart' : 'Manual'}</p>
                                              {comp.purchaseDate && (
                                                  <>
                                                      <span className="w-1 h-1 bg-slate-200 rounded-full" />
                                                      <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                                                          <Calendar className="w-2 h-2" />
                                                          <span>{new Date(comp.purchaseDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
                                                      </div>
                                                  </>
                                              )}
                                            </div>
                                            {comp.estimatedCost !== undefined && comp.estimatedCost !== null && (
                                                <p className="text-xs font-black text-app-smart uppercase tracking-tighter flex items-center gap-1 mt-0.5">
                                                    <Zap className="w-2.5 h-2.5 fill-app-smart" /> Est: {formatCurrency(comp.estimatedCost)}
                                                </p>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 w-full max-w-[140px]">
                                            <div className="flex-1">
                                              <div className="flex justify-between items-end mb-1">
                                                <p className="text-xs font-bold text-app-ink leading-tight">
                                                  {comp.currentAccumulatedUsage} / {Math.round(comp.currentPredictedInterval || comp.staticIntervalUsage || 0)}
                                                </p>
                                                <p className="text-[10px] text-app-muted uppercase font-bold">{comp.metricType}</p>
                                              </div>
                                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                <div 
                                                  className="h-full bg-app-smart rounded-full" 
                                                  style={{ width: `${Math.min(status.percentage, 100)}%` }} 
                                                />
                                              </div>
                                            </div>
                                            <button 
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (inlineEditingCompId === comp.id) {
                                                  setInlineEditingCompId(null);
                                                } else {
                                                  setInlineEditingCompId(comp.id);
                                                  setInlineEditForm({
                                                    staticIntervalUsage: comp.staticIntervalUsage ? comp.staticIntervalUsage.toString() : '',
                                                    staticIntervalTime: comp.staticIntervalTime ? comp.staticIntervalTime.toString() : ''
                                                  });
                                                }
                                              }}
                                              className="p-1.5 text-slate-400 hover:text-app-smart transition-colors flex shrink-0"
                                            >
                                              <Settings className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>
                                        
                                        <AnimatePresence>
                                          {inlineEditingCompId === comp.id && (
                                            <motion.div 
                                              initial={{ height: 0, opacity: 0 }}
                                              animate={{ height: 'auto', opacity: 1 }}
                                              exit={{ height: 0, opacity: 0 }}
                                              className="overflow-hidden mt-3"
                                            >
                                              <div className="flex flex-col gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl relative">
                                                <div className="flex gap-3 w-full">
                                                  <label className="flex-1 text-xs font-bold text-slate-500 uppercase flex flex-col gap-1">
                                                    Usage Limit ({comp.metricType})
                                                    <input 
                                                      type="number"
                                                      className="w-full bg-white border border-slate-200 rounded p-2 text-xs text-app-ink"
                                                      value={inlineEditForm.staticIntervalUsage}
                                                      onChange={e => setInlineEditForm({ ...inlineEditForm, staticIntervalUsage: e.target.value })}
                                                      placeholder="e.g. 5000"
                                                    />
                                                  </label>
                                                  <label className="flex-1 text-xs font-bold text-slate-500 uppercase flex flex-col gap-1">
                                                    Days Limit
                                                    <input 
                                                      type="number"
                                                      className="w-full bg-white border border-slate-200 rounded p-2 text-xs text-app-ink"
                                                      value={inlineEditForm.staticIntervalTime}
                                                      onChange={e => setInlineEditForm({ ...inlineEditForm, staticIntervalTime: e.target.value })}
                                                      placeholder="e.g. 180"
                                                    />
                                                  </label>
                                                </div>
                                                <div className="flex justify-end gap-2 mt-1">
                                                  <button onClick={() => setInlineEditingCompId(null)} className="text-[10px] text-slate-500 font-bold px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 transition-colors">Cancel</button>
                                                  <button onClick={() => handleInlineUpdateComponent(comp)} className="text-[10px] text-white font-bold px-4 py-2 rounded-lg bg-app-ink hover:bg-app-smart transition-colors shadow">Save Changes</button>
                                                </div>
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                  )
                                })
                            )}
                            
                            {useLevelLogs.filter(l => l.assetId === asset.id).length > 0 && (
                                <div className="mt-4 pt-4 border-t border-slate-200">
                                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Use Level History</p>
                                  <div className="space-y-2">
                                    {useLevelLogs.filter(l => l.assetId === asset.id).slice(0, 5).map((log, idx) => (
                                      <div key={`use-level-log-${log.id}-${idx}`} className="flex flex-col bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                        <div className="flex justify-between items-center w-full">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-400">
                                              {log.oldUseLevel || 'None'}
                                            </span>
                                            <ChevronRight className="w-3 h-3 text-slate-300" />
                                            <span className="text-[10px] font-black text-app-smart">
                                              {log.newUseLevel}
                                            </span>
                                          </div>
                                          <span className="text-xs font-bold text-slate-400">
                                            {new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )})}
                </div>
              </div>
            ) : activeTab === 'settings' ? (
                <div className="space-y-8 pt-6 pb-12">
                  <div className="flex justify-between items-center transition-all">
                      <h2 className="text-[11px] font-black tracking-[0.2em] uppercase text-app-muted shrink-0">
                        {language === 'en' ? 'System Configuration' : 'Konfigurasi Sistem'}
                      </h2>
                      <div className="h-px bg-slate-100 w-full mx-4" />
                  </div>

                  <div className="bg-white rounded-4xl border border-slate-100 p-6 space-y-6 shadow-sm">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                        {user?.photoURL ? (
                          <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon className="w-6 h-6 text-app-muted" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-app-ink">{user?.displayName || 'Active User'}</p>
                        <p className="text-[10px] text-app-muted font-bold uppercase">{user?.email || 'Connected Account'}</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center justify-center gap-3 p-4 bg-red-50 hover:bg-red-100 rounded-2xl border border-red-100 transition-all font-bold text-sm text-red-600"
                    >
                      <LogOut className="w-5 h-5" />
                      {language === 'en' ? 'Sign Out' : 'Keluar'}
                    </button>
                  </div>

                  <div className="bg-white p-6 rounded-4xl border border-slate-100 space-y-6">
                    <h4 className="text-[10px] font-black text-app-muted uppercase tracking-[0.2em]">{language === 'en' ? 'Display & Preferences' : 'Tampilan & Preferensi'}</h4>
                    <div className="space-y-4">
                      
                      <div className="flex items-center justify-between">
                         <label className="text-sm font-bold text-app-ink">{language === 'en' ? 'Dark Mode' : 'Mode Gelap'}</label>
                         <button 
                            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
                            className={`w-12 h-6 rounded-full transition-colors relative ${theme === 'dark' ? 'bg-app-smart' : 'bg-slate-200'}`}
                         >
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${theme === 'dark' ? 'left-7' : 'left-1'}`} />
                         </button>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                         <label className="text-sm font-bold text-app-ink">{language === 'en' ? 'Language' : 'Bahasa'} ({language.toUpperCase()})</label>
                         <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                           <button 
                             onClick={() => setLanguage('en')}
                             className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${language === 'en' ? 'bg-white shadow-sm text-app-ink' : 'text-slate-400'}`}
                           >
                              EN
                           </button>
                           <button 
                             onClick={() => setLanguage('id')}
                             className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${language === 'id' ? 'bg-white shadow-sm text-app-ink' : 'text-slate-400'}`}
                           >
                              ID
                           </button>
                         </div>
                      </div>

                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-4xl border border-slate-100 space-y-6">
                    <h4 className="text-[10px] font-black text-app-muted uppercase tracking-[0.2em]">{language === 'en' ? 'Currency & Financials' : 'Mata Uang & Keuangan'}</h4>
                    <div className="space-y-4">
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">{language === 'en' ? 'Base Currency' : 'Mata Uang Utama'}</label>
                        <div className="relative">
                            <select 
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value as any)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-app-ink transition-all appearance-none"
                            >
                                <option value="Rp">Rupiah (Rp)</option>
                                <option value="$">US Dollar ($)</option>
                                <option value="€">Euro (€)</option>
                                <option value="£">British Pound (£)</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                      </div>

                      {currency !== 'Rp' && (
                          <div className="space-y-2 pt-2">
                            <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">{currency} {language === 'en' ? 'to Rp Exchange Rate' : 'ke Rp Nilai Tukar'}</label>
                            <input type="number" value={exchangeRate} onChange={e => setExchangeRate(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-app-ink" placeholder="e.g. 15000" />
                            <p className="text-xs text-app-muted italic pl-1">{language === 'en' ? 'Set the rate for conversion when using this currency.' : 'Tentukan nilai tukar untuk konversi saat menggunakan mata uang ini.'}</p>
                          </div>
                      )}

                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-4xl border border-slate-100 space-y-6">
                    <h4 className="text-[10px] font-black text-app-muted uppercase tracking-[0.2em]">{language === 'en' ? 'Data Operations' : 'Operasi Data'}</h4>
                    <div className="space-y-3">
                      <button className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-300 transition-all active:scale-[0.98]">
                        <div className="flex items-center gap-3">
                          <Box className="w-4 h-4 text-app-ink" />
                          <span className="text-xs font-bold text-app-ink">{language === 'en' ? 'Import Equipment (CSV)' : 'Impor Aset (CSV)'}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>
                      <button className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-slate-300 transition-all active:scale-[0.98]">
                        <div className="flex items-center gap-3">
                          <RotateCcw className="w-4 h-4 text-app-ink" />
                          <span className="text-xs font-bold text-app-ink">{language === 'en' ? 'Backup Service Logs' : 'Cadangkan Data Servis'}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>
                  </div>

                  <div className="text-center pb-8 border-t border-slate-50 pt-8 opacity-50">
                    <p className="text-xs font-black text-slate-300 uppercase tracking-[0.3em]">Smart Track Engine v2.5.0</p>
                  </div>
                </div>
            ) : null}
          </div>

          {/* Floating Action Button */}
          {activeTab === 'home' && (
             <div className="absolute bottom-24 right-6 z-20 flex flex-col items-end gap-3">
               <AnimatePresence>
                 {isActionMenuOpen && (
                   <motion.div
                     initial={{ opacity: 0, scale: 0.9, y: 10 }}
                     animate={{ opacity: 1, scale: 1, y: 0 }}
                     exit={{ opacity: 0, scale: 0.9, y: 10 }}
                     transition={{ duration: 0.15 }}
                     className="bg-white rounded-[20px] shadow-xl border border-slate-100 p-2 min-w-[220px] flex flex-col"
                   >
                      <button
                        onClick={() => {
                          setIsActionMenuOpen(false);
                          setIsGlobalServiceModalOpen(true);
                        }}
                        className="text-left px-4 py-3.5 hover:bg-slate-50 transition-colors flex items-center gap-3 rounded-xl font-bold text-sm text-app-ink"
                     >
                       <Settings className="w-4 h-4 text-app-smart" />
                       Manual Service Entry
                     </button>
                     <div className="h-px bg-slate-50 w-full" />
                     <button
                        onClick={() => {
                          setIsActionMenuOpen(false);
                          setIsStopTrackingModalOpen(true);
                        }}
                        className="text-left px-4 py-3.5 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center gap-3 rounded-xl font-bold text-sm text-app-critical"
                     >
                       <Trash2 className="w-4 h-4" />
                       Stop Tracking Asset
                     </button>
                   </motion.div>
                 )}
               </AnimatePresence>
               <button
                  onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}
                  className={`w-14 h-14 bg-app-smart text-white rounded-full shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center ${isActionMenuOpen ? 'rotate-90' : ''}`}
               >
                  <Settings className="w-6 h-6" />
               </button>
             </div>
          )}


          {/* Mobile Nav Bar Simulation */}
          {/* Redesigned Bottom Nav Bar */}
          <nav className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[92%] h-16 glass-nav rounded-3xl flex items-center justify-around px-2 z-40 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
            <NavItem 
                active={activeTab === 'home'} 
                onClick={() => setActiveTab('home')}
                icon={<Home className="w-5 h-5" />} 
                label="Overview" 
            />
            <NavItem 
                active={activeTab === 'status'} 
                onClick={() => setActiveTab('status')}
                icon={<Zap className="w-5 h-5" />} 
                label="Status" 
            />
            <NavItem 
                active={activeTab === 'assets'} 
                onClick={() => setActiveTab('assets')}
                icon={<Box className="w-5 h-5" />} 
                label="Assets" 
            />
            <NavItem 
                active={activeTab === 'settings'} 
                onClick={() => setActiveTab('settings')}
                icon={<Settings className="w-5 h-5" />} 
                label="Settings" 
            />
          </nav>
        </div>

        {/* Bottom spacer for desktop */}
        <div className="h-10 lg:hidden" />
      </main>

      {/* Active Service Modal */}
      <AnimatePresence>
        {isNotificationsOpen && (
          <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 lg:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNotificationsOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="relative bg-white h-full max-w-sm ml-auto w-full p-8 shadow-2xl flex flex-col border-l border-slate-100"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black text-app-ink uppercase tracking-tight">Alerts</h2>
                <button 
                  onClick={() => {
                    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                    setIsNotificationsOpen(false);
                  }} 
                  className="text-xs font-bold text-app-smart uppercase tracking-widest"
                >
                  Mark All Read
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4">
                {notifications.length === 0 ? (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto text-slate-200">
                      <Bell className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-bold text-app-muted uppercase tracking-widest">All caught up!</p>
                  </div>
                ) : (
                  notifications.map((notification, idx) => (
                    <div 
                      key={`notif-${notification.id}-${idx}`} 
                      className={`p-4 rounded-3xl border transition-all ${notification.read ? 'bg-white border-slate-100 opacity-60' : 'bg-slate-50 border-slate-200'}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                         <div className={`w-2 h-2 rounded-full ${notification.type === 'error' ? 'bg-app-critical' : notification.type === 'warning' ? 'bg-app-upcoming' : 'bg-app-smart'}`} />
                         <span className="text-[10px] font-black text-app-muted uppercase tracking-widest">{notification.title}</span>
                      </div>
                      <p className="text-sm font-bold text-app-ink mb-1">{notification.message}</p>
                      <p className="text-xs font-bold text-slate-400 uppercase">{new Date(notification.timestamp).toLocaleTimeString()}</p>
                    </div>
                  ))
                )}
              </div>

              <button 
                onClick={() => setIsNotificationsOpen(false)}
                className="w-full bg-slate-100 text-app-ink font-black py-4 rounded-2xl active:scale-95 transition-all mt-6"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}

        {isAddingAsset && (
          <div className="fixed inset-0 z-70 flex items-end sm:items-center justify-center p-0 lg:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddingAsset(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-3xl p-6 shadow-2xl flex flex-col max-h-[95vh]">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden shrink-0" />
              <div className="flex justify-between items-center mb-5 shrink-0">
                <h2 className="text-xl font-black text-app-ink tracking-tight uppercase">New Asset</h2>
                
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isScanningAsset}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
                >
                  {isScanningAsset ? (
                    <RotateCcw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4" />
                  )}
                  {isScanningAsset ? 'Scanning...' : 'Scan Photo'}
                </button>
              </div>
              
              <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-1 pb-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Name</label>
                  <input value={newAssetForm.name} onChange={e => setNewAssetForm({ ...newAssetForm, name: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-app-ink" placeholder="e.g. My Laptop, Car..." />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center pl-1">
                      <label className="text-[10px] font-black text-app-muted uppercase tracking-widest">Category</label>
                      <button 
                        onClick={() => {
                          setInputModal({
                            open: true,
                            title: 'New Category',
                            placeholder: 'Enter category name...',
                            onConfirm: async (val) => {
                              if (val) {
                                try {
                                  const res = await fetch('/api/categories', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ category: val })
                                  });
                                  const data = await res.json();
                                  setPredefinedCategories(data);
                                  setNewAssetForm({ ...newAssetForm, category: val });
                                } catch (err) { console.error(err); }
                              }
                              setInputModal(null);
                            }
                          });
                        }}
                        className="text-xs font-bold text-app-smart uppercase tracking-widest hover:underline"
                      >
                        + New
                      </button>
                    </div>
                    <div className="relative">
                      <select value={newAssetForm.category} onChange={e => setNewAssetForm({ ...newAssetForm, category: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 pl-2.5 text-xs font-bold focus:outline-none focus:border-app-ink appearance-none pr-8">
                        <option value="">-- Select --</option>
                        {predefinedCategories.map((c, idx) => (
                          <option key={`new-cat-${idx}`} value={c}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1 block pt-0.5">Use Level</label>
                    <div className="relative pt-[2px]">
                      <select value={newAssetForm.useLevel} onChange={e => setNewAssetForm({ ...newAssetForm, useLevel: e.target.value as UseLevel })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-app-ink appearance-none pr-8">
                        <option value="LEISURE">Leisure / Low</option>
                        <option value="NORMAL">Normal Use</option>
                        <option value="HEAVY">Heavy Use</option>
                        <option value="EXTREME">Extreme Use</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Description (Optional)</label>
                  <textarea value={newAssetForm.description} onChange={e => setNewAssetForm({ ...newAssetForm, description: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-app-ink h-16 resize-none custom-scrollbar" placeholder="Brief details about the asset..." />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Purchase Date</label>
                    <input type="date" value={newAssetForm.purchaseDate} onChange={e => setNewAssetForm({ ...newAssetForm, purchaseDate: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-app-ink" />
                  </div>
                  
                  {isVehicle(newAssetForm.category, newAssetForm.name) ? (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-app-smart uppercase tracking-widest pl-1">Odometer (Required)</label>
                      <input type="number" value={newAssetForm.odometer} onChange={e => setNewAssetForm({ ...newAssetForm, odometer: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-app-ink" placeholder="Current..." />
                    </div>
                  ) : <div />}
                </div>

                {newAssetForm.name && newAssetForm.category && aiSuggestions.length === 0 && (
                  <button 
                    onClick={() => fetchAiSuggestions(newAssetForm)} 
                    disabled={isSuggesting}
                    className="w-full bg-blue-50 text-blue-600 font-bold py-3 rounded-xl border border-blue-100 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 mt-2"
                  >
                    {isSuggesting ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-blue-600" />}
                    {isSuggesting ? 'Thinking...' : 'AI: Suggest Maintenance Items'}
                  </button>
                )}

                {aiSuggestions.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center pl-1">
                      <p className="text-[10px] font-black text-app-smart uppercase tracking-widest">AI Recommendations</p>
                      <button onClick={() => setAiSuggestions([])} className="text-[10px] font-bold text-slate-400 hover:text-app-ink">Clear</button>
                    </div>
                    <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                      {aiSuggestions.map((s, i) => (
                        <div key={`ai-sugg-${s.name}-${i}`} className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex justify-between items-center">
                          <div>
                            <p className="text-xs font-bold text-app-ink">{s.name}</p>
                            <p className="text-xs text-app-muted font-bold">Every {s.suggestedIntervalUsage || s.suggestedIntervalTime} • {formatCurrency(s.estimatedCost)}</p>
                          </div>
                          <CheckCircle className="w-4 h-4 text-app-smart" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="pt-4 shrink-0 border-t border-slate-100 mt-2">
                {aiSuggestions.length > 0 ? (
                  <button 
                    onClick={handleCreateAssetWithSuggestions} 
                    disabled={isSubmitting}
                    className="w-full bg-app-ink text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all text-sm disabled:opacity-50"
                  >
                    {isSubmitting ? <RotateCcw className="w-5 h-5 animate-spin mx-auto" /> : 'Create Asset & Add Items'}
                  </button>
                ) : (
                  <button 
                    onClick={handleAddAsset} 
                    disabled={isSubmitting}
                    className="w-full bg-app-ink text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all text-sm disabled:opacity-50"
                  >
                    {isSubmitting ? <RotateCcw className="w-5 h-5 animate-spin mx-auto" /> : 'Create Asset'}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {isEditingAsset && editingAsset && (
          <div className="fixed inset-0 z-70 flex items-end sm:items-center justify-center p-0 lg:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsEditingAsset(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-3xl p-6 shadow-2xl flex flex-col max-h-[95vh]">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden shrink-0" />
              <div className="flex justify-between items-start mb-5 shrink-0">
                <h2 className="text-xl font-black text-app-ink tracking-tight uppercase">Edit Asset</h2>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => {
                            setConfirmModal({
                                open: true,
                                title: 'Delete Asset',
                                message: 'Are you sure you want to delete this asset and all its components?',
                                onConfirm: () => {
                                    handleDeleteAsset(editingAsset.id);
                                    setIsEditingAsset(false);
                                    setConfirmModal(null);
                                }
                            });
                        }}
                        className="p-1.5 bg-rose-50 rounded-lg text-app-critical hover:bg-app-critical hover:text-white transition-all"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">ID: {editingAsset.id}</span>
                </div>
              </div>
              
              <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-1 pb-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Name</label>
                  <input value={editAssetForm.name} onChange={e => setEditAssetForm({ ...editAssetForm, name: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-app-ink" placeholder="Asset Name" />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center pl-1">
                      <label className="text-[10px] font-black text-app-muted uppercase tracking-widest">Category</label>
                      <button 
                        onClick={() => {
                          setInputModal({
                            open: true,
                            title: 'New Category',
                            placeholder: 'Enter category name...',
                            onConfirm: async (val) => {
                              if (val) {
                                try {
                                  const res = await fetch('/api/categories', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ category: val })
                                  });
                                  const data = await res.json();
                                  setPredefinedCategories(data);
                                  setEditAssetForm({ ...editAssetForm, category: val });
                                } catch (err) { console.error(err); }
                              }
                              setInputModal(null);
                            }
                          });
                        }}
                        className="text-xs font-bold text-app-smart uppercase tracking-widest hover:underline"
                      >
                        + Add
                      </button>
                    </div>
                    <div className="relative">
                      <select value={editAssetForm.category} onChange={e => setEditAssetForm({ ...editAssetForm, category: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 pl-2.5 text-xs font-bold focus:outline-none focus:border-app-ink appearance-none pr-8">
                        <option value="">-- Select --</option>
                        {predefinedCategories.map((c, idx) => (
                          <option key={`edit-cat-${idx}`} value={c}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1 block pt-0.5">Use Level</label>
                    <div className="relative pt-[2px]">
                      <select value={editAssetForm.useLevel} onChange={e => setEditAssetForm({ ...editAssetForm, useLevel: e.target.value as UseLevel })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-app-ink appearance-none pr-8">
                        <option value="LEISURE">Leisure / Low</option>
                        <option value="NORMAL">Normal Use</option>
                        <option value="HEAVY">Heavy Use</option>
                        <option value="EXTREME">Extreme Use</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Description</label>
                  <textarea value={editAssetForm.description} onChange={e => setEditAssetForm({ ...editAssetForm, description: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-app-ink h-16 resize-none custom-scrollbar" placeholder="Description..." />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1 pt-1.5">Purchase Date</label>
                    <input type="date" value={editAssetForm.purchaseDate} onChange={e => setEditAssetForm({ ...editAssetForm, purchaseDate: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-app-ink" />
                  </div>
                  {isVehicle(editAssetForm.category, editAssetForm.name) ? (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-app-smart uppercase tracking-widest pl-1">Odometer (Required)</label>
                      <input type="number" value={editAssetForm.odometer} onChange={e => setEditAssetForm({ ...editAssetForm, odometer: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-app-ink" placeholder="Current..." />
                    </div>
                  ) : <div />}
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 shrink-0 border-t border-slate-100 mt-2">
                  <button onClick={() => setIsEditingAsset(false)} className="flex-1 bg-slate-100 text-app-ink font-black py-4 rounded-2xl active:scale-95 transition-all text-sm">Cancel</button>
                  <button 
                    onClick={handleUpdateAsset}
                    disabled={isSubmitting}
                    className="flex-2 bg-app-ink text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all text-sm disabled:opacity-50"
                  >
                    {isSubmitting ? <RotateCcw className="w-4 h-4 animate-spin mx-auto" /> : 'Save Changes'}
                  </button>
              </div>
            </motion.div>
          </div>
        )}

        {isAddingComponent && (
          <div className="fixed inset-0 z-70 flex items-end sm:items-center justify-center p-0 lg:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddingComponent(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-3xl p-6 shadow-2xl flex flex-col max-h-[95vh]">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden shrink-0" />
              <div className="flex justify-between items-start mb-5 shrink-0">
                <h2 className="text-xl font-black text-app-ink tracking-tight uppercase">New Component</h2>
                <span className="text-[10px] font-bold text-app-smart bg-blue-50 px-3 py-1 rounded-full uppercase truncate max-w-[120px]">{assets.find(a => a.id === newCompForm.assetId)?.name}</span>
              </div>
              
              <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-1 pb-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Component Name</label>
                  <input value={newCompForm.name} onChange={e => setNewCompForm({ ...newCompForm, name: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-app-ink" placeholder="e.g. Brake Pads, Filter..." />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Metric Type</label>
                        <div className="relative">
                          <select value={newCompForm.metricType} onChange={e => setNewCompForm({ ...newCompForm, metricType: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none appearance-none pr-8">
                              <option value="KM">KM</option>
                              <option value="Miles">Miles</option>
                              <option value="Hours">Hours</option>
                              <option value="Days">Days</option>
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Purchase Date</label>
                        <input type="date" value={newCompForm.purchaseDate} onChange={e => setNewCompForm({ ...newCompForm, purchaseDate: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Use Level</label>
                    <div className="relative">
                      <select value={newCompForm.useLevel} onChange={e => setNewCompForm({ ...newCompForm, useLevel: e.target.value as any })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold focus:outline-none appearance-none pr-8">
                          <option value="LOW">Low Use</option>
                          <option value="MODERATE">Moderate</option>
                          <option value="HIGH">High Use</option>
                          <option value="EXTREME">Extreme</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <p className="text-[10px] font-black text-app-muted uppercase tracking-widest">Maintenance Schedule (Manual)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 uppercase">Usage Limit</p>
                      <input type="number" value={newCompForm.staticIntervalUsage} onChange={e => setNewCompForm({ ...newCompForm, staticIntervalUsage: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold" placeholder="e.g. 5000" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 uppercase">Days Limit</p>
                      <input type="number" value={newCompForm.staticIntervalTime} onChange={e => setNewCompForm({ ...newCompForm, staticIntervalTime: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold" placeholder="e.g. 180" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-tight italic">Leave both empty to enable <span className="text-app-smart font-black">Smart Track</span> based on historical repairs.</p>
                </div>
              </div>
              
              <div className="pt-4 shrink-0 border-t border-slate-100 mt-2">
                <button onClick={handleAddComponent} className="w-full bg-app-ink text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 text-sm">
                  <Plus className="w-5 h-5" /> Add Component
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isEditingComponent && editingComponent && (
          <div className="fixed inset-0 z-70 flex items-end sm:items-center justify-center p-0 lg:p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsEditingComponent(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-md" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} className="relative bg-white w-full max-w-md rounded-t-[2.5rem] sm:rounded-3xl p-6 shadow-2xl flex flex-col max-h-[95vh]">
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden shrink-0" />
              <div className="flex justify-between items-start mb-5 shrink-0">
                <h2 className="text-xl font-black text-app-ink tracking-tight uppercase">Edit Component</h2>
              </div>
              
              <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1 pr-1 pb-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Component Name</label>
                  <input value={editCompForm.name} onChange={e => setEditCompForm({ ...editCompForm, name: e.target.value })} className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-app-ink" placeholder="e.g. Brake Pads, Filter..." />
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <p className="text-[10px] font-black text-app-muted uppercase tracking-widest">Maintenance Schedule (Static)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 uppercase">Usage Limit ({editingComponent.metricType})</p>
                      <input type="number" value={editCompForm.staticIntervalUsage} onChange={e => setEditCompForm({ ...editCompForm, staticIntervalUsage: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold" placeholder="e.g. 5000" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 uppercase">Days Limit</p>
                      <input type="number" value={editCompForm.staticIntervalTime} onChange={e => setEditCompForm({ ...editCompForm, staticIntervalTime: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-bold" placeholder="e.g. 180" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-tight italic">Enter values here to configure recurring service reminders for this component based on predefined schedules. Leave both empty for Smart Track.</p>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 shrink-0 border-t border-slate-100 mt-2">
                  <button onClick={() => setIsEditingComponent(false)} className="flex-1 bg-slate-100 text-slate-500 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-colors text-sm">Cancel</button>
                  <button onClick={handleUpdateComponent} className="flex-2 bg-app-ink text-white font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all text-sm">Save Changes</button>
              </div>
            </motion.div>
          </div>
        )}

        <AnimatePresence>
            {showUndo && undoStack && (
                <motion.div 
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="fixed bottom-24 left-1/2 -translate-x-1/2 z-100 w-[90%] max-w-sm"
                >
                    <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center">
                                <Trash2 className="w-4 h-4 text-slate-400" />
                            </div>
                            <div>
                                <p className="text-xs font-bold">{undoStack.type === 'asset' ? 'Asset' : 'Component'} deleted</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={handleUndo}
                                className="flex items-center gap-1 bg-white text-app-ink px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                            >
                                <RotateCcw className="w-3 h-3" /> Undo
                            </button>
                            <button onClick={() => setShowUndo(false)} className="p-1.5 text-slate-500 hover:text-white">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {isGlobalServiceModalOpen && (
          <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 lg:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsGlobalServiceModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.5 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              className="relative bg-white w-full max-w-md rounded-t-[3rem] sm:rounded-3xl p-8 border-t border-slate-200 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8 sm:hidden" />
              
              <div className="flex justify-between items-start mb-6">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-app-ink tracking-tight uppercase">Log Service</h2>
                </div>
                <button onClick={() => setIsGlobalServiceModalOpen(false)} className="p-3 bg-slate-50 rounded-2xl text-app-muted hover:text-app-ink transition-colors border border-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6 flex-1">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Select Asset</label>
                    <div className="relative">
                        <select 
                            value={globalServiceAssetId}
                            onChange={(e) => {
                                setGlobalServiceAssetId(e.target.value);
                                setGlobalServiceComponentId('');
                            }}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-app-ink transition-all appearance-none"
                        >
                            <option value="">-- Choose Asset --</option>
                            {assets.map((a, idx) => (
                                <option key={`global-select-${a.id}-${idx}`} value={a.id}>{a.name} ({a.category})</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {globalServiceAssetId && (
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Select Component</label>
                        <div className="relative">
                            <select 
                                value={globalServiceComponentId}
                                onChange={(e) => setGlobalServiceComponentId(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-app-ink transition-all appearance-none"
                            >
                                <option value="">-- Choose Component --</option>
                                {components.filter(c => c.assetId === globalServiceAssetId).map((c, idx) => (
                                    <option key={`modal-comp-${c.id}-${idx}`} value={c.id}>{c.name}</option>
                                ))}
                                <option value="NEW">+ Add New Component</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                )}

                {globalServiceComponentId === 'NEW' && (
                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-blue-800 uppercase tracking-widest pl-1">New Component Name</label>
                            <input 
                                type="text"
                                value={globalServiceNewComponentName}
                                onChange={(e) => setGlobalServiceNewComponentName(e.target.value)}
                                placeholder="e.g. Brake Pads"
                                className="w-full bg-white border border-blue-50 rounded-xl p-3 text-sm font-bold focus:outline-none focus:border-blue-300"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-blue-800 uppercase tracking-widest pl-1">Metric Type</label>
                            <select 
                                value={globalServiceNewComponentType}
                                onChange={(e) => setGlobalServiceNewComponentType(e.target.value)}
                                className="w-full bg-white border border-blue-50 rounded-xl p-3 text-sm font-bold focus:outline-none"
                            >
                                <option value="KM">KM</option>
                                <option value="Miles">Miles</option>
                                <option value="Hours">Hours</option>
                                <option value="Days">Days</option>
                            </select>
                        </div>
                    </div>
                )}

                {globalServiceComponentId && (
                    <>
                        <div className="space-y-3">
                        <label className="text-[11px] font-black text-app-muted uppercase tracking-[0.2em] pl-1">Updated Metric/Odometer</label>
                        <div className="relative">
                            <input 
                                type="number"
                                value={globalServiceMetricValue}
                                onChange={(e) => setGlobalServiceMetricValue(e.target.value)}
                                placeholder={`Current value...`}
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl p-5 text-lg font-bold text-app-ink placeholder-slate-300 focus:outline-none focus:border-app-ink transition-all shadow-inner"
                            />
                        </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-app-muted uppercase tracking-[0.2em] pl-1">Service Cost ({currency})</label>
                            <div className="relative">
                            <input 
                                type="number"
                                value={globalServiceCostValue}
                                onChange={(e) => setGlobalServiceCostValue(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-lg font-bold text-app-ink focus:outline-none focus:border-app-ink transition-all"
                            />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[11px] font-black text-app-muted uppercase tracking-[0.2em] pl-1">Notes</label>
                            <textarea 
                                value={globalServiceLogNotes}
                                onChange={(e) => setGlobalServiceLogNotes(e.target.value)}
                                placeholder="What was done?"
                                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-app-ink focus:outline-none focus:border-app-ink transition-all h-20"
                            />
                        </div>
                        </div>

                        <button 
                            onClick={handleGlobalService}
                            disabled={isSubmitting}
                            className="w-full bg-app-ink text-white font-black text-lg py-5 rounded-4xl shadow-xl shadow-slate-900/10 active:scale-95 transition-all flex items-center justify-center gap-3 hover:bg-slate-800 disabled:opacity-50"
                        >
                            {isSubmitting ? <RotateCcw className="w-5 h-5 animate-spin" /> : 'Apply & Save Log'} <CheckCircle className="w-6 h-6" />
                        </button>
                    </>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {isStopTrackingModalOpen && (
          <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 lg:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStopTrackingModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.5 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              className="relative bg-white w-full max-w-md rounded-t-[3rem] sm:rounded-3xl p-8 border-t border-slate-200 shadow-2xl flex flex-col"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8 sm:hidden" />
              
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-black text-app-critical tracking-tight uppercase">Stop Tracking Asset</h2>
                  <p className="text-xs font-bold text-app-muted mt-1 tracking-wide">Remove an asset from tracking list</p>
                </div>
                <button onClick={() => setIsStopTrackingModalOpen(false)} className="p-3 bg-slate-50 rounded-2xl text-app-muted hover:text-app-ink transition-colors border border-slate-100">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Select Asset to Remove</label>
                    <div className="relative">
                        <select 
                            value={stopTrackingAssetId}
                            onChange={(e) => setStopTrackingAssetId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-red-500 transition-all appearance-none"
                        >
                            <option value="">-- Choose Asset --</option>
                            {assets.map((a, idx) => (
                                <option key={`stop-track-${a.id}-${idx}`} value={a.id}>{a.name} ({a.category})</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black text-app-muted uppercase tracking-widest pl-1">Reason</label>
                    <div className="grid grid-cols-1 gap-3">
                       <button 
                         onClick={() => setStopTrackingReason('SOLD')}
                         className={`p-3 rounded-2xl border text-left text-sm font-bold ${stopTrackingReason === 'SOLD' ? 'border-app-ink bg-slate-50 text-app-ink' : 'border-slate-100 text-slate-400 hover:border-slate-300'}`}
                       >
                         Sold to someone else
                       </button>
                       <button 
                         onClick={() => setStopTrackingReason('BROKEN')}
                         className={`p-3 rounded-2xl border text-left text-sm font-bold ${stopTrackingReason === 'BROKEN' ? 'border-app-ink bg-slate-50 text-app-ink' : 'border-slate-100 text-slate-400 hover:border-slate-300'}`}
                       >
                         Permanently Broken / Retired
                       </button>
                       <button 
                         onClick={() => setStopTrackingReason('UNUSED')}
                         className={`p-3 rounded-2xl border text-left text-sm font-bold ${stopTrackingReason === 'UNUSED' ? 'border-app-ink bg-slate-50 text-app-ink' : 'border-slate-100 text-slate-400 hover:border-slate-300'}`}
                       >
                         Not Used Anymore
                       </button>
                    </div>
                </div>

                <div className="pt-4">
                  <button 
                    onClick={handleStopTracking}
                    disabled={!stopTrackingAssetId || isSubmitting}
                    className="w-full bg-app-critical text-white font-black text-lg py-5 rounded-4xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:active:scale-100"
                  >
                    {isSubmitting ? <RotateCcw className="w-5 h-5 animate-spin" /> : 'Confirm Stop Tracking'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isLogging && selectedComponent && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 lg:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogging(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ y: "100%", opacity: 0.5 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.5 }}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              className="relative bg-white w-full max-w-md rounded-t-[3rem] sm:rounded-3xl p-8 border-t border-slate-200 shadow-2xl flex flex-col"
            >
              {/* Pull Bar for Modal */}
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-8 sm:hidden" />
              
              <div className="flex justify-between items-start mb-8">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-app-ink tracking-tight uppercase">Log Service</h2>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-app-muted uppercase tracking-widest">{selectedComponent.name}</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <span className="text-[10px] font-bold text-app-smart uppercase">{assets.find(a => a.id === selectedComponent.assetId)?.name}</span>
                    </div>
                    {assets.find(a => a.id === selectedComponent.assetId)?.description && (
                      <p className="text-[10px] text-slate-400 font-medium leading-tight max-w-[280px]">
                        {assets.find(a => a.id === selectedComponent.assetId)?.description}
                      </p>
                    )}
                  </div>
                </div>
                <button onClick={() => setIsLogging(false)} className="p-3 bg-slate-50 rounded-2xl text-app-muted hover:text-app-ink transition-colors border border-slate-100">
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>

              <div className="space-y-8 flex-1">
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-app-muted uppercase tracking-[0.2em] pl-1">{selectedComponent.metricType === 'KM' || selectedComponent.metricType === 'Miles' ? 'Updated Odometer' : 'Updated Metric Reading'}</label>
                  <div className="relative">
                    <input 
                        type="number"
                        value={metricValue}
                        onChange={(e) => setMetricValue(e.target.value)}
                        placeholder={`Current ${selectedComponent.metricType}...`}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl p-5 text-lg font-bold text-app-ink placeholder-slate-300 focus:outline-none focus:border-app-ink transition-all shadow-inner"
                    />
                    <div className="absolute right-5 top-5 text-xs font-black text-slate-300 uppercase tracking-widest">
                        {selectedComponent.metricType}
                    </div>
                  </div>
                  <p className="text-[10px] text-app-muted font-bold italic pl-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Leave empty to use estimate ({selectedComponent.currentAccumulatedUsage})
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-app-muted uppercase tracking-[0.2em] pl-1">Service Cost ({currency})</label>
                    <div className="relative">
                      <input 
                          type="number"
                          value={costValue}
                          onChange={(e) => setCostValue(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-lg font-bold text-app-ink focus:outline-none focus:border-app-ink transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-app-muted uppercase tracking-[0.2em] pl-1">Notes</label>
                    <textarea 
                        value={logNotes}
                        onChange={(e) => setLogNotes(e.target.value)}
                        placeholder="What was done?"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-app-ink focus:outline-none focus:border-app-ink transition-all h-20"
                    />
                  </div>
                </div>

                <div className="bg-blue-50/50 p-5 rounded-4xl border border-blue-100 flex gap-4 items-center">
                    <div className="p-4 bg-white rounded-2xl shadow-sm border border-blue-50">
                      <Zap className="w-6 h-6 text-app-smart fill-app-smart" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-app-smart uppercase tracking-widest mb-1">Smart Calibration</p>
                      <p className="text-[10px] text-slate-600 font-bold leading-relaxed">System will adapt the next {selectedComponent.metricType} interval based on this entry's deviation.</p>
                    </div>
                </div>

                <button 
                  onClick={handleService}
                  disabled={isSubmitting}
                  className="w-full bg-app-ink text-white font-black text-lg py-5 rounded-4xl shadow-xl shadow-slate-900/10 active:scale-95 transition-all flex items-center justify-center gap-3 hover:bg-slate-800 disabled:opacity-50"
                >
                  {isSubmitting ? <RotateCcw className="w-5 h-5 animate-spin" /> : language === 'en' ? 'Apply & Reset Clock' : 'Simpan & Reset'} <CheckCircle className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmModal && confirmModal.open && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmModal(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative bg-white w-full max-w-sm rounded-4xl p-8 shadow-2xl border border-slate-100">
                <div className="w-16 h-16 bg-rose-50 rounded-3xl flex items-center justify-center mb-6 mx-auto">
                    <AlertCircle className="w-8 h-8 text-app-critical" />
                </div>
                <h3 className="text-xl font-black text-center mb-2 uppercase tracking-tight">{confirmModal.title}</h3>
                <p className="text-sm text-app-muted text-center font-bold mb-8 leading-relaxed">{confirmModal.message}</p>
                <div className="flex gap-3">
                    <button onClick={() => setConfirmModal(null)} className="flex-1 py-4 bg-slate-100 text-app-ink font-black rounded-2xl active:scale-95 transition-all text-sm">Cancel</button>
                    <button onClick={confirmModal.onConfirm} className="flex-1 py-4 bg-app-critical text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all text-sm">Confirm</button>
                </div>
            </motion.div>
          </div>
        )}

        {inputModal && inputModal.open && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setInputModal(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative bg-white w-full max-w-sm rounded-4xl p-8 shadow-2xl border border-slate-100">
                <h3 className="text-xl font-black mb-6 uppercase tracking-tight">{inputModal.title}</h3>
                <input 
                    autoFocus
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-app-ink mb-6 transition-all"
                    placeholder={inputModal.placeholder}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') inputModal.onConfirm((e.target as HTMLInputElement).value);
                    }}
                />
                <div className="flex gap-3">
                    <button onClick={() => setInputModal(null)} className="flex-1 py-4 bg-slate-100 text-app-ink font-black rounded-2xl active:scale-95 transition-all text-sm">Cancel</button>
                    <button 
                        onClick={() => {
                            const input = document.querySelector('input[autoFocus]') as HTMLInputElement;
                            inputModal.onConfirm(input.value);
                        }} 
                        className="flex-1 py-4 bg-app-ink text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all text-sm"
                    >
                        Apply
                    </button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function StatusBar({ percentage, theme = 'default' }: { percentage: number; theme?: string }) {
  const themes: Record<string, string> = {
    critical: 'bg-app-critical',
    upcoming: 'bg-app-upcoming',
    healthy: 'bg-app-healthy',
    default: 'bg-app-smart'
  };

  const barColor = themes[theme] || themes.default;

  return (
    <div className="w-full">
      <div className="flex justify-between items-end mb-1">
        <span className="text-[10px] font-extrabold text-app-muted uppercase tracking-wider">{Math.round(Math.min(percentage, 100))}% Capacity</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(percentage, 100)}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={`h-full rounded-full ${barColor} shadow-sm`}
        />
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: NavItemProps) {
  return (
    <button 
        onClick={onClick} 
        className={`flex flex-col items-center gap-1 transition-all relative ${active ? 'text-app-smart' : 'text-app-muted'}`}
    >
        <motion.div 
            animate={{ y: active ? -2 : 0, scale: active ? 1.1 : 1 }}
            className="p-1"
        >
            {icon}
        </motion.div>
        <span className={`text-[9px] font-black uppercase tracking-[0.15em] ${active ? 'opacity-100' : 'opacity-40'}`}>{label}</span>
        {active && (
            <motion.div 
                layoutId="nav-dot"
                className="absolute -top-1 w-1 h-1 bg-app-smart rounded-full"
            />
        )}
    </button>
  );
}

interface ComponentCardProps {
  component: any;
  assetName: string;
  onLog: () => void;
  logs?: any[];
  predictionCompId?: string | null;
  predictedCost?: number | null;
  fetchCostPrediction?: (id: string) => void;
  formatCurrency: (val: number | null | undefined) => string;
  key?: any;
}

function ComponentCard({ component, assetName, onLog, logs = [], predictionCompId, predictedCost, fetchCostPrediction, formatCurrency }: ComponentCardProps) {
  const { status } = component;
  
  const themes = {
    [UrgencyState.CRITICAL]: { card: 'card-critical', badge: 'text-app-critical', fill: 'bg-app-critical', text: 'text-app-critical' },
    [UrgencyState.UPCOMING]: { card: 'card-upcoming', badge: 'text-app-upcoming', fill: 'bg-app-upcoming', text: 'text-app-upcoming' },
    [UrgencyState.HEALTHY]: { card: 'card-healthy', badge: 'text-app-healthy', fill: 'bg-app-healthy', text: 'text-app-healthy' }
  };

  const theme = themes[status.urgency as UrgencyState];
  const isHealthy = status.urgency === UrgencyState.HEALTHY;

  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={`card ${theme.card}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-1">
          <span className={`badge ${component.trackingMode === TrackingMode.AUTO_EWMA ? 'badge-smart' : 'badge-manual'}`}>
            {component.trackingMode === TrackingMode.AUTO_EWMA ? 'Smart Track' : 'Manual Track'}
          </span>
          <h3 className="text-sm font-bold tracking-tight text-app-ink">{component.name}</h3>
          <p className="text-[10px] text-app-muted uppercase font-bold tracking-wider">{assetName}</p>
        </div>
        
        <div className="text-right">
          <p className="text-[11px] font-black text-app-ink leading-tight">
            {component.currentAccumulatedUsage} / {Math.round(component.currentPredictedInterval || component.staticIntervalUsage || 0)}
          </p>
          <p className="text-xs text-app-muted uppercase font-bold tracking-tighter">{component.metricType}</p>
        </div>
      </div>

      <div className="space-y-4">
          <StatusBar 
            percentage={status.percentage} 
            theme={status.urgency === UrgencyState.CRITICAL ? 'critical' : status.urgency === UrgencyState.UPCOMING ? 'upcoming' : 'healthy'} 
          />
          
          <div className="flex justify-between items-center">
              <div>
                  <p className="text-[10px] font-bold text-app-muted uppercase tracking-wide">
                      {status.limitingFactor === 'TIME' 
                          ? `${status.remainingDays} Days Remaining` 
                          : `${status.remainingUsage} ${component.metricType} Left`}
                  </p>
                  {logs.some(l => l.componentId === component.id) && (
                      <div className="flex items-center gap-2 mt-1">
                          <button 
                              onClick={() => fetchCostPrediction?.(component.id)}
                              className="text-xs font-black text-app-smart uppercase tracking-tighter hover:opacity-70 transition-opacity flex items-center gap-0.5"
                          >
                              <Zap className="w-2.5 h-2.5 fill-app-smart" /> AI Predict Cost
                          </button>
                          {predictionCompId === component.id && predictedCost !== undefined && predictedCost !== null && (
                              <span className="text-xs font-black text-app-ink bg-white border border-slate-100 px-1 rounded shadow-sm">Est: {formatCurrency(predictedCost)}</span>
                          )}
                      </div>
                  )}
              </div>
              <button 
                  onClick={onLog}
                  className="p-1 px-3 bg-app-ink text-white rounded-lg text-[10px] font-bold uppercase transition-transform active:scale-95"
              >
                  Log Service
              </button>
          </div>
      </div>
    </motion.div>
  );
}

