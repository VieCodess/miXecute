import {NativeModules, NativeEventEmitter, Platform} from 'react-native';

const LINKING_ERROR =
  'XecuteBlocker native module is not linked. Rebuild the Android app after adding the package.';

export type PermissionType =
  | 'accessibility'
  | 'overlay'
  | 'usageStats'
  | 'battery';

export interface PermissionStatus {
  accessibilityGranted: boolean;
  overlayGranted: boolean;
  usageStatsGranted: boolean;
  batteryOptimizationIgnored: boolean;
}

export interface InstalledApp {
  appName: string;
  packageName: string;
  icon?: string;
}

export interface ShieldStatus {
  isAccessibilityEnabled: boolean;
  isOverlayGranted: boolean;
  isUsageStatsGranted: boolean;
  isBatteryOptimizationExempt: boolean;
  isBlockActive: boolean;
  isShieldActive: boolean;
  isOnBreak: boolean;
  activeTaskId: string | null;
  xCreditsBalance: number;
  permissionsHealthy?: boolean;
  deviceAdminEnabled?: boolean;
  xscore?: number;
  breaksDisabled?: boolean;
  punishmentActive?: boolean;
  sessionTamperCount?: number;
}

export interface FocusSessionInput {
  taskId: string;
  durationMinutes: number;
  isStrict?: boolean;
  domains?: string[];
}

export type PendingSyncItem = {
  id: number;
  endpoint: string;
  payload: string;
  idempotencyKey: string;
  retryCount: number;
};

type XecuteBlockerNative = {
  checkPermissions(): Promise<PermissionStatus>;
  requestPermission(type: PermissionType): Promise<void>;
  updateBlocklist(appsJson: string, domainsJson: string): Promise<void>;
  toggleShield(isActive: boolean): Promise<void>;
  getInstalledApps(): Promise<InstalledApp[]>;
  getBlockedPackages(): Promise<string[]>;
  getBlockedDomains(): Promise<string[]>;
  requestBreak(minutes: number): Promise<void>;
  isShieldActive(): Promise<boolean>;
  startFocusSession(
    taskId: string,
    durationMinutes: number,
    isStrict: boolean,
    domainsJson: string,
  ): Promise<void>;
  endFocusSession(taskId: string, completed: boolean): Promise<void>;
  getShieldStatus(): Promise<ShieldStatus>;
  getXCreditsBalance(): Promise<number>;
  earnXCredits(amount: number): Promise<number>;
  burnXCredits(amount: number): Promise<number>;
  setXCreditsBalance(balance: number): Promise<number>;
  getPendingXCreditsBurn(): Promise<number>;
  clearPendingXCreditsBurn(amount: number): Promise<number>;
  requestDeviceAdmin(): Promise<void>;
  configureOfflineSync(
    apiBaseUrl: string | null,
    authToken: string | null,
    userId: string | null,
  ): Promise<void>;
  flushOfflineSync(): Promise<number>;
  getPendingSyncItems(): Promise<PendingSyncItem[]>;
  markSyncItemDone(id: number): Promise<void>;
  bumpSyncItemRetry(id: number): Promise<void>;
};

const NativeXecuteBlocker: XecuteBlockerNative | null =
  Platform.OS === 'android' && NativeModules.XecuteBlocker
    ? (NativeModules.XecuteBlocker as XecuteBlockerNative)
    : null;

function nativeOrReject<T>(fn: (m: XecuteBlockerNative) => Promise<T>): Promise<T> {
  if (!NativeXecuteBlocker) {
    return Promise.reject(new Error(LINKING_ERROR));
  }
  try {
    return fn(NativeXecuteBlocker);
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }
}

const blockerEmitter =
  Platform.OS === 'android' && NativeModules.XecuteBlocker
    ? new NativeEventEmitter(NativeModules.XecuteBlocker)
    : null;

export const BlockerBridge = {
  checkPermissions: (): Promise<PermissionStatus> =>
    nativeOrReject(m => m.checkPermissions()),

  requestPermission: (type: PermissionType): Promise<void> =>
    nativeOrReject(m => m.requestPermission(type)),

  updateBlocklist: (apps: string[], domains: string[]): Promise<void> =>
    nativeOrReject(m =>
      m.updateBlocklist(JSON.stringify(apps), JSON.stringify(domains)),
    ),

  toggleShield: (isActive: boolean): Promise<void> =>
    nativeOrReject(m => m.toggleShield(isActive)),

  getInstalledApps: (): Promise<InstalledApp[]> =>
    nativeOrReject(m => m.getInstalledApps()),

  getBlockedPackages: (): Promise<string[]> =>
    nativeOrReject(m => m.getBlockedPackages()),

  getBlockedDomains: (): Promise<string[]> =>
    nativeOrReject(m => m.getBlockedDomains()),

  requestBreak: (minutes: number): Promise<void> =>
    nativeOrReject(m => m.requestBreak(minutes)),

  isShieldActive: (): Promise<boolean> =>
    nativeOrReject(m => m.isShieldActive()),

  startFocusSession: (input: FocusSessionInput): Promise<void> =>
    nativeOrReject(m =>
      m.startFocusSession(
        input.taskId,
        input.durationMinutes,
        !!input.isStrict,
        JSON.stringify(input.domains || []),
      ),
    ),

  endFocusSession: (taskId: string, completed = true): Promise<void> =>
    nativeOrReject(m => m.endFocusSession(taskId, completed)),

  getShieldStatus: (): Promise<ShieldStatus> =>
    nativeOrReject(m => m.getShieldStatus()),

  getXCreditsBalance: (): Promise<number> =>
    nativeOrReject(m => m.getXCreditsBalance()),

  earnXCredits: (amount: number): Promise<number> =>
    nativeOrReject(m => m.earnXCredits(amount)),

  burnXCredits: (amount: number): Promise<number> =>
    nativeOrReject(m => m.burnXCredits(amount)),

  setXCreditsBalance: (balance: number): Promise<number> =>
    nativeOrReject(m => m.setXCreditsBalance(balance)),

  getPendingXCreditsBurn: (): Promise<number> =>
    nativeOrReject(m => m.getPendingXCreditsBurn()),

  clearPendingXCreditsBurn: (amount: number): Promise<number> =>
    nativeOrReject(m => m.clearPendingXCreditsBurn(amount)),

  requestDeviceAdmin: (): Promise<void> =>
    nativeOrReject(m => m.requestDeviceAdmin()),

  configureOfflineSync: (
    apiBaseUrl: string | null,
    authToken: string | null,
    userId: string | null,
  ): Promise<void> =>
    nativeOrReject(m => m.configureOfflineSync(apiBaseUrl, authToken, userId)),

  flushOfflineSync: (): Promise<number> =>
    nativeOrReject(m => m.flushOfflineSync()),

  getPendingSyncItems: (): Promise<PendingSyncItem[]> =>
    nativeOrReject(m => m.getPendingSyncItems()),

  markSyncItemDone: (id: number): Promise<void> =>
    nativeOrReject(m => m.markSyncItemDone(id)),

  bumpSyncItemRetry: (id: number): Promise<void> =>
    nativeOrReject(m => m.bumpSyncItemRetry(id)),

  onAppBlocked: (callback: (packageName: string) => void): (() => void) => {
    if (!blockerEmitter) {
      return () => undefined;
    }
    const subscription = blockerEmitter.addListener(
      'onAppBlocked',
      (event: {packageName: string}) => {
        callback(event.packageName);
      },
    );
    return () => subscription.remove();
  },
};
