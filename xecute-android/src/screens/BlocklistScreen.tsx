import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  Switch,
  TextInput,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import {BlockerBridge, InstalledApp} from '../native/BlockerBridge';

export const BlocklistScreen: React.FC = () => {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [blockedApps, setBlockedApps] = useState<Set<string>>(new Set());
  const [blockedDomains, setBlockedDomains] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const [allApps, blocked, domains] = await Promise.all([
        BlockerBridge.getInstalledApps(),
        BlockerBridge.getBlockedPackages(),
        BlockerBridge.getBlockedDomains(),
      ]);
      const sorted = [...allApps].sort((a, b) =>
        a.appName.localeCompare(b.appName),
      );
      setApps(sorted);
      setBlockedApps(new Set(blocked));
      setBlockedDomains(domains);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const toggleApp = async (packageName: string) => {
    const updated = new Set(blockedApps);
    if (updated.has(packageName)) {
      updated.delete(packageName);
    } else {
      updated.add(packageName);
    }
    setBlockedApps(updated);
    await BlockerBridge.updateBlocklist(Array.from(updated), blockedDomains);
  };

  const filtered = apps.filter(app =>
    app.appName.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#a855f7" size="large" />
        <Text style={styles.loadingText}>Loading installed apps…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search apps..."
        placeholderTextColor="#6b7280"
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filtered}
        keyExtractor={item => item.packageName}
        initialNumToRender={20}
        windowSize={10}
        renderItem={({item}) => (
          <View style={styles.appRow}>
            {item.icon ? (
              <Image
                source={{uri: `data:image/png;base64,${item.icon}`}}
                style={styles.icon}
              />
            ) : (
              <View style={[styles.icon, styles.iconPlaceholder]} />
            )}
            <View style={styles.appMeta}>
              <Text style={styles.appName} numberOfLines={1}>
                {item.appName}
              </Text>
              <Text style={styles.packageName} numberOfLines={1}>
                {item.packageName}
              </Text>
            </View>
            <Switch
              value={blockedApps.has(item.packageName)}
              onValueChange={() => toggleApp(item.packageName)}
              trackColor={{false: '#333', true: '#a855f7'}}
              thumbColor="#fff"
            />
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No apps match your search.</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0d0b14'},
  centered: {
    flex: 1,
    backgroundColor: '#0d0b14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {color: '#9ca3af', marginTop: 12},
  search: {
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    color: '#fff',
    fontSize: 15,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomColor: '#222233',
    borderBottomWidth: 1,
  },
  icon: {width: 36, height: 36, borderRadius: 8, marginRight: 12},
  iconPlaceholder: {backgroundColor: '#333'},
  appMeta: {flex: 1, marginRight: 8},
  appName: {color: '#fff', fontSize: 14, fontWeight: '500'},
  packageName: {color: '#6b7280', fontSize: 11, marginTop: 2},
  empty: {color: '#6b7280', textAlign: 'center', marginTop: 40},
});
