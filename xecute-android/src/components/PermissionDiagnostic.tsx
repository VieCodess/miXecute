import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  BlockerBridge,
  PermissionStatus,
  PermissionType,
} from '../native/BlockerBridge';

type CheckItem = {
  label: string;
  granted: boolean;
  type: PermissionType;
};

export const PermissionDiagnostic: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionStatus | null>(null);

  const checkPermissions = useCallback(async () => {
    try {
      const status = await BlockerBridge.checkPermissions();
      setPermissions(status);
    } catch {
      setPermissions({
        accessibilityGranted: false,
        overlayGranted: false,
        usageStatsGranted: false,
        batteryOptimizationIgnored: false,
      });
    }
  }, []);

  useEffect(() => {
    checkPermissions();
    const interval = setInterval(checkPermissions, 5000);
    return () => clearInterval(interval);
  }, [checkPermissions]);

  if (!permissions) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#a855f7" />
      </View>
    );
  }

  const checks: CheckItem[] = [
    {
      label: 'Accessibility Service',
      granted: permissions.accessibilityGranted,
      type: 'accessibility',
    },
    {
      label: 'Draw Over Other Apps',
      granted: permissions.overlayGranted,
      type: 'overlay',
    },
    {
      label: 'Usage Access',
      granted: permissions.usageStatsGranted,
      type: 'usageStats',
    },
    {
      label: 'Battery Optimization',
      granted: permissions.batteryOptimizationIgnored,
      type: 'battery',
    },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Permission Diagnostic</Text>
      {checks.map(check => (
        <TouchableOpacity
          key={check.type}
          style={styles.checkRow}
          onPress={() => BlockerBridge.requestPermission(check.type)}
          activeOpacity={0.7}>
          <Text
            style={[
              styles.checkLabel,
              check.granted ? styles.granted : styles.missing,
            ]}>
            {check.granted ? '✓' : '✗'} {check.label}
          </Text>
          {!check.granted && <Text style={styles.tapHint}>Tap to fix</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  checkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  checkLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  granted: {color: '#10b981'},
  missing: {color: '#ef4444'},
  tapHint: {color: '#6b7280', fontSize: 12},
});
