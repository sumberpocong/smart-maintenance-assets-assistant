export enum TrackingMode {
  AUTO_EWMA = 'AUTO_EWMA',
  MANUAL_STATIC = 'MANUAL_STATIC'
}

export enum UrgencyState {
  HEALTHY = 'HEALTHY',
  UPCOMING = 'UPCOMING',
  CRITICAL = 'CRITICAL'
}

export type UseLevel = 'LEISURE' | 'NORMAL' | 'HEAVY' | 'EXTREME';

export interface Asset {
  id: string;
  name: string;
  category: string;
  description?: string;
  purchaseDate?: string; // ISO string
  odometer?: number;
  useLevel?: UseLevel;
}

export interface Component {
  id: string;
  assetId: string;
  name: string;
  metricType: string;
  trackingMode: TrackingMode;
  staticIntervalUsage?: number;
  staticIntervalTime?: number;
  currentPredictedInterval?: number;
  currentAccumulatedUsage: number;
  lastServiceDate: string; // ISO string
  useLevel?: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  estimatedCost?: number;
  purchaseDate?: string; // ISO string
}

export interface ServiceLog {
  id: string;
  componentId: string;
  timestamp: string;
  actualMetricValue: number;
  notes?: string;
  cost?: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
  componentId?: string;
}

export interface UseLevelLog {
  id: string;
  assetId: string;
  oldUseLevel?: UseLevel;
  newUseLevel?: UseLevel;
  timestamp: string;
}
