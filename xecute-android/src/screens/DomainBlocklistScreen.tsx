import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  Switch,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {BlockerBridge} from '../native/BlockerBridge';
import {APP_CONFIG} from '../config';

export const DomainBlocklistScreen: React.FC = () => {
  const [domains, setDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [apps, setApps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const persist = useCallback(async (nextDomains: string[], nextApps: string[]) => {
    setDomains(nextDomains);
    await BlockerBridge.updateBlocklist(nextApps, nextDomains);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [blockedDomains, blockedApps] = await Promise.all([
        BlockerBridge.getBlockedDomains(),
        BlockerBridge.getBlockedPackages(),
      ]);
      setApps(blockedApps);
      if (blockedDomains.length === 0) {
        await persist(APP_CONFIG.defaultBlockedDomains, blockedApps);
      } else {
        setDomains(blockedDomains);
      }
    } catch {
      setDomains([...APP_CONFIG.defaultBlockedDomains]);
    } finally {
      setLoading(false);
    }
  }, [persist]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDomain = async (domain: string, enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...domains, domain]))
      : domains.filter(d => d !== domain);
    await persist(next, apps);
  };

  const addDomain = async () => {
    const cleaned = draft
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
    if (!cleaned || !cleaned.includes('.')) {
      Alert.alert('Invalid domain', 'Enter a domain like youtube.com');
      return;
    }
    if (domains.includes(cleaned)) {
      setDraft('');
      return;
    }
    await persist([...domains, cleaned], apps);
    setDraft('');
  };

  const seedDefaults = async () => {
    const merged = Array.from(
      new Set([...domains, ...APP_CONFIG.defaultBlockedDomains]),
    );
    await persist(merged, apps);
  };

  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Add domain (e.g. youtube.com)"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addDomain}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addDomain}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.seed} onPress={seedDefaults}>
        <Text style={styles.seedText}>Seed common distractions</Text>
      </TouchableOpacity>

      {loading ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : (
        <FlatList
          data={domains}
          keyExtractor={item => item}
          renderItem={({item}) => (
            <View style={styles.row}>
              <Text style={styles.domain}>{item}</Text>
              <Switch
                value={true}
                onValueChange={enabled => toggleDomain(item, enabled)}
                trackColor={{false: '#333', true: '#a855f7'}}
                thumbColor="#fff"
              />
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No domains blocked yet.</Text>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0d0b14'},
  addRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addBtn: {
    backgroundColor: '#a855f7',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  addBtnText: {color: '#fff', fontWeight: '700'},
  seed: {paddingHorizontal: 16, paddingBottom: 8},
  seedText: {color: '#a855f7', fontWeight: '600', fontSize: 13},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222233',
  },
  domain: {color: '#fff', fontSize: 14, fontWeight: '500'},
  empty: {color: '#6b7280', textAlign: 'center', marginTop: 40},
});
