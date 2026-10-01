/**
 * Injected into the Xecute WebView.
 * Treats this app as a connected shield.
 * and forwards engagement events to React Native via postMessage.
 * Also applies native-shell CSS so embedded screens feel like an app.
 */
export const NATIVE_TAB_BAR_HEIGHT = 56;

export const NATIVE_BRIDGE_INJECT = `
(function () {
  if (window.__XECUTE_NATIVE_BRIDGE__) return;
  window.__XECUTE_NATIVE_BRIDGE__ = true;
  window.__XECUTE_NATIVE__ = true;
  window.__XECUTE_PLATFORM__ = 'android';

  try {
    var root = document.documentElement;
    root.classList.add('xecute-native');
    root.dataset.xecuteNative = '1';
    root.style.setProperty('--xecute-native-tab-height', '${NATIVE_TAB_BAR_HEIGHT}px');
  } catch (e) {}

  // Soften gestures / selection inside the WebView.
  try {
    var style = document.createElement('style');
    style.id = 'xecute-native-shell-css';
    style.textContent = [
      'html.xecute-native, html.xecute-native body {',
      '  overscroll-behavior: none;',
      '  -webkit-tap-highlight-color: transparent;',
      '  -webkit-touch-callout: none;',
      '}',
      'html.xecute-native .xecute-native-hide { display: none !important; }',
      'html.xecute-native .bottom-nav {',
      '  bottom: calc(var(--xecute-native-tab-height, 56px) + max(0.35rem, env(safe-area-inset-bottom))) !important;',
      '}',
      'html.xecute-native .page-shell {',
      '  padding-bottom: calc(5.5rem + var(--xecute-native-tab-height, 56px)) !important;',
      '}',
    ].join('\\n');
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {}

  function post(type, payload) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || {} }));
      }
    } catch (e) {}
  }

  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail == null ? null : detail }));
    } catch (e) {}
  }

  window.AndroidXecute = {
    startFocusSession: function (taskId, durationMinutes, isStrict) {
      post('START_FOCUS_SESSION', {
        taskId: String(taskId || ''),
        durationMinutes: Number(durationMinutes) || 30,
        isStrict: !!isStrict,
      });
    },
    endFocusSession: function (taskId, isCompleted) {
      post('END_FOCUS_SESSION', {
        taskId: String(taskId || ''),
        completed: !!isCompleted,
      });
    },
    requestBreak: function (breakMinutes) {
      post('REQUEST_BREAK', { breakMinutes: Number(breakMinutes) || 5 });
      return true;
    },
    getShieldStatus: function () {
      post('GET_SHIELD_STATUS', {});
      return JSON.stringify({ pending: true });
    },
  };

  window.addEventListener('XLOCK_PING', function () {
    emit('XLOCK_PONG', { native: true, platform: 'android' });
    emit('XLOCK_INSTALLED', { native: true });
    emit('XLOCK_CONNECTED', { native: true });
  });

  window.addEventListener('XLOCK_GET_STATUS', function () {
    post('GET_SHIELD_STATUS', {});
    emit('XLOCK_PONG', { native: true, platform: 'android' });
    emit('XLOCK_CONNECTED', { native: true });
  });

  window.addEventListener('XLOCK_START_SESSION', function (e) {
    var d = (e && e.detail) || {};
    post('START_FOCUS_SESSION', {
      taskId: d.taskId,
      scopedDurationSeconds: d.scopedDurationSeconds,
      durationMinutes: d.scopedDurationSeconds
        ? Math.max(1, Math.round(Number(d.scopedDurationSeconds) / 60))
        : 30,
      domains: d.domains || [],
      isStrict: !!d.isStrict,
      title: d.title,
      userId: d.userId,
    });
  });

  window.addEventListener('XLOCK_END_SESSION', function (e) {
    var d = (e && e.detail) || {};
    post('END_FOCUS_SESSION', { taskId: d.taskId, completed: true });
  });

  window.addEventListener('XLOCK_PAUSE_BLOCK', function (e) {
    var d = (e && e.detail) || {};
    post('REQUEST_BREAK', { breakMinutes: d.breakMinutes || 15, taskId: d.taskId });
  });

  window.addEventListener('XLOCK_GET_SESSION', function (e) {
    var d = (e && e.detail) || {};
    post('GET_SESSION', { taskId: d.taskId });
  });

  window.__xecuteNativeReply = function (message) {
    try {
      var msg = typeof message === 'string' ? JSON.parse(message) : message;
      if (!msg || !msg.type) return;
      if (msg.type === 'SESSION_ACK' || msg.type === 'SESSION_UPDATE') {
        emit('XLOCK_SESSION_ACK', msg.payload);
        emit('XLOCK_SESSION_UPDATE', msg.payload);
      } else if (msg.type === 'SESSION_DATA') {
        emit('XLOCK_SESSION_DATA', msg.payload);
      } else if (msg.type === 'SHIELD_STATUS') {
        emit('XLOCK_STATUS_RESPONSE', msg.payload);
        emit('XLOCK_CONNECTED', msg.payload);
      } else if (msg.type === 'BREAK_APPROVED') {
        emit('XLOCK_BREAK_APPROVED', msg.payload);
      } else if (msg.type === 'BREAK_DENIED') {
        emit('XLOCK_BREAK_DENIED', msg.payload);
      }
    } catch (err) {}
  };

  emit('XLOCK_INSTALLED', { native: true });
  emit('XLOCK_CONNECTED', { native: true });
  post('BRIDGE_READY', {});
})();
true;
`;
