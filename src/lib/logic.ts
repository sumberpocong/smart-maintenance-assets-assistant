/**
 * Smart Maintenance Logic Engine
 * Implements EWMA (Exponentially Weighted Moving Average) and 
 * Whichever-Comes-First threshold logic.
 */

export enum TrackingMode {
  AUTO_EWMA = 'AUTO_EWMA',
  MANUAL_STATIC = 'MANUAL_STATIC'
}

export enum UrgencyState {
  HEALTHY = 'HEALTHY', // Green
  UPCOMING = 'UPCOMING', // Yellow
  CRITICAL = 'CRITICAL' // Red
}

export interface MaintenanceStatus {
  percentage: number;
  urgency: UrgencyState;
  limitingFactor: 'USAGE' | 'TIME' | 'PREDICTION';
  remainingUsage?: number;
  remainingDays?: number;
}

/**
 * Mode A: Smart Predict (EWMA Engine)
 * Formula: Et = α * At + (1 - α) * Et-1
 * 
 * @param actualInterval The actual interval logged by the user (At)
 * @param previousExpected The previous predicted interval (Et-1)
 * @param alpha Smoothing factor (default 0.3)
 */
export function calculateNextEWMA(
  actualInterval: number,
  previousExpected: number,
  alpha: number = 0.3
): number {
  return alpha * actualInterval + (1 - alpha) * previousExpected;
}

/**
 * Mode B: Whichever Comes First Logic
 * Calculates completion percentage for both components.
 */
export function calculateMaintenanceStatus(
  mode: TrackingMode,
  currentUsage: number,
  usageLimit: number,
  lastServiceDate: Date,
  timeLimitDays: number,
  predictedInterval?: number
): MaintenanceStatus {
  const now = new Date();
  const daysSinceService = Math.max(0, Math.floor((now.getTime() - lastServiceDate.getTime()) / (1000 * 60 * 60 * 24)));
  
  let percentageUsage = 0;
  let percentageTime = 0;
  let limitingFactor: 'USAGE' | 'TIME' | 'PREDICTION' = 'USAGE';

  if (mode === TrackingMode.MANUAL_STATIC) {
    percentageUsage = (currentUsage / usageLimit) * 100;
  } else {
    // For EWMA, usage is compared against the predicted interval
    const effectiveLimit = predictedInterval || usageLimit;
    percentageUsage = (currentUsage / effectiveLimit) * 100;
  }

  // Time based reminder is always evaluated! It complements predictive analytics.
  if (timeLimitDays > 0) {
    percentageTime = (daysSinceService / timeLimitDays) * 100;
  }

  if (percentageTime > percentageUsage) {
    limitingFactor = 'TIME';
  } else {
    limitingFactor = mode === TrackingMode.MANUAL_STATIC ? 'USAGE' : 'PREDICTION';
  }

  const percentage = Math.max(percentageUsage, percentageTime);
  
  let urgency = UrgencyState.HEALTHY;
  if (percentage >= 100) {
    urgency = UrgencyState.CRITICAL;
  } else if (percentage >= 85) {
    urgency = UrgencyState.UPCOMING;
  }

  return {
    percentage: Math.min(percentage, 100), // Cap for display, but logic can exceed 100
    urgency,
    limitingFactor,
    remainingUsage: Math.max(0, (mode === TrackingMode.MANUAL_STATIC ? usageLimit : (predictedInterval || usageLimit)) - currentUsage),
    remainingDays: Math.max(0, timeLimitDays - daysSinceService)
  };
}
