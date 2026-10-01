import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import WebView, {WebViewMessageEvent} from 'react-native-webview';
import {buildWebArenaEntry} from '../bridge/webArenaSession';
import {sessionStore} from '../api/sessionStore';
import {APP_CONFIG} from '../config';
import {BlockerBridge} from '../native/BlockerBridge';

type BridgeMessage = {
  type: string;
  payload?: Record<string, unknown>;
};

type Props = {
  onSignedOut?: () => void;
};

function sessionPayload(
  taskId: string,
  scopedDurationSeconds: number,
  startedAt: string,
  endedAt: string | null = null,
  activeDurationSeconds = 0,
) {
  return {
    taskId,
    scopedDurationSeconds,
    activeDurationSeconds,
    startedAt,
    endedAt,
    source: 'xlock',
  };
}

/**
 * Full Xecute arena inside the app after sign-in.
 * (dashboard, missions, spend, stats, user, wallet, goal tanks, etc.).
 * Native Shield / blocklist stay on the Shield tab via BlockerBridge.
 */
export const WebArenaScreen: React.FC<Props> = ({onSignedOut}) => {
  const webRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<{uri: string; inject: string} | null>(
    null,
  );
  const sessionStarts = useRef<
    Record<string, {startedAt: string; scoped: number}>
  >({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await buildWebArenaEntry();
        if (!cancelled) {
          setEntry(next);
        }
      } catch {
        if (!cancelled) {
          const base = APP_CONFIG.webAppUrl.replace(/\/$/, '');
          setEntry({uri: `${base}/?native=1`, inject: ''});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reply = useCallback((type: string, payload: unknown) => {
    const json = JSON.stringify({type, payload});
    const escaped = JSON.stringify(json);
    webRef.current?.injectJavaScript(
      `window.__xecuteNativeReply && window.__xecuteNativeReply(${escaped}); true;`,
    );
  }, []);

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let msg: BridgeMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      const payload = msg.payload || {};

      try {
        switch (msg.type) {
          case 'NATIVE_SIGN_OUT': {
            await sessionStore.clear();
            onSignedOut?.();
            break;
          }
          case 'BRIDGE_READY': {
            const status = await BlockerBridge.getShieldStatus();
            reply('SHIELD_STATUS', status);
            break;
          }
          case 'GET_SHIELD_STATUS': {
            const status = await BlockerBridge.getShieldStatus();
            reply('SHIELD_STATUS', status);
            break;
          }
          case 'START_FOCUS_SESSION': {
            const taskId = String(payload.taskId || `task_${Date.now()}`);
            const durationMinutes = Number(payload.durationMinutes) || 30;
            const scoped =
              Number(payload.scopedDurationSeconds) || durationMinutes * 60;
            const domains = Array.isArray(payload.domains)
              ? (payload.domains as string[])
              : APP_CONFIG.defaultBlockedDomains;
            const startedAt = new Date().toISOString();

            await BlockerBridge.startFocusSession({
              taskId,
              durationMinutes,
              isStrict: !!payload.isStrict,
              domains,
            });

            sessionStarts.current[taskId] = {startedAt, scoped};
            const ack = sessionPayload(taskId, scoped, startedAt);
            reply('SESSION_ACK', ack);
            reply('SESSION_UPDATE', ack);
            break;
          }
          case 'END_FOCUS_SESSION': {
            const taskId = String(payload.taskId || '');
            await BlockerBridge.endFocusSession(taskId, !!payload.completed);
            const meta = sessionStarts.current[taskId];
            const startedAt = meta?.startedAt || new Date().toISOString();
            const scoped = meta?.scoped || 1800;
            const endedAt = new Date().toISOString();
            const activeDurationSeconds = Math.max(
              0,
              Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
            );
            delete sessionStarts.current[taskId];
            reply(
              'SESSION_DATA',
              sessionPayload(
                taskId,
                scoped,
                startedAt,
                endedAt,
                activeDurationSeconds,
              ),
            );
            break;
          }
          case 'REQUEST_BREAK': {
            const minutes = Number(payload.breakMinutes) || 5;
            await BlockerBridge.requestBreak(minutes);
            reply('BREAK_APPROVED', {
              breakMinutes: minutes,
              breakUnlockedUntil: Date.now() + minutes * 60_000,
            });
            break;
          }
          case 'GET_SESSION': {
            const taskId = String(payload.taskId || '');
            const meta = sessionStarts.current[taskId];
            if (!meta) {
              reply('SESSION_DATA', null);
              break;
            }
            const activeDurationSeconds = Math.max(
              0,
              Math.floor(
                (Date.now() - new Date(meta.startedAt).getTime()) / 1000,
              ),
            );
            reply(
              'SESSION_DATA',
              sessionPayload(
                taskId,
                meta.scoped,
                meta.startedAt,
                null,
                activeDurationSeconds,
              ),
            );
            break;
          }
          default:
            break;
        }
      } catch (err) {
        reply('BREAK_DENIED', {
          reason: err instanceof Error ? err.message : 'native_error',
        });
      }
    },
    [onSignedOut, reply],
  );

  if (!entry) {
    return (
      <View style={[styles.root, styles.loader]}>
        <ActivityIndicator color="#9010FF" size="large" />
        <Text style={styles.loaderText}>Loading arena…</Text>
      </View>
    );
  }

  const inject = entry.inject || undefined;

  return (
    <View style={[styles.root, {paddingTop: insets.top}]}>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Couldn’t open Xecute</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity
            style={styles.retry}
            onPress={() => {
              setError(null);
              setLoading(true);
              webRef.current?.reload();
            }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <WebView
        ref={webRef}
        source={{uri: entry.uri}}
        style={styles.web}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={e => {
          setLoading(false);
          setError(e.nativeEvent.description || 'Network error');
        }}
        onHttpError={e => {
          if (e.nativeEvent.statusCode >= 400) {
            setError(`HTTP ${e.nativeEvent.statusCode}`);
          }
        }}
        injectedJavaScriptBeforeContentLoaded={inject}
        injectedJavaScript={inject}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
        pullToRefreshEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        applicationNameForUserAgent=" XecuteAndroidApp/1.0"
        {...(Platform.OS === 'android'
          ? {
              nestedScrollEnabled: true,
              setBuiltInZoomControls: false,
              setDisplayZoomControls: false,
            }
          : {})}
      />

      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <View style={styles.loaderCard}>
            <ActivityIndicator color="#9010FF" size="large" />
            <Text style={styles.loaderText}>Opening arena…</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

/** @deprecated Use WebArenaScreen */
export const WebHomeScreen = WebArenaScreen;

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#F7F0FF'},
  web: {flex: 1, backgroundColor: '#F7F0FF'},
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F0FF',
  },
  loaderCard: {
    alignItems: 'center',
    gap: 14,
  },
  loaderText: {
    color: '#430076',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  errorBox: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E8D4FF',
  },
  errorTitle: {color: '#430076', fontWeight: '800', fontSize: 16, marginBottom: 6},
  errorBody: {color: '#6b7280', marginBottom: 12},
  retry: {
    alignSelf: 'flex-start',
    backgroundColor: '#9010FF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {color: '#fff', fontWeight: '700'},
});
