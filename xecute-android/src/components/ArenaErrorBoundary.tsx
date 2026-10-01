import React, {Component, ErrorInfo, ReactNode} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

type Props = {
  children: ReactNode;
  onReset?: () => void;
  label?: string;
};

type State = {
  error: Error | null;
};

/**
 * Prevents a Home/Tabs render crash from leaving a permanent black window
 * (Android windowBackground is #0D0B14 — same as an empty Arena).
 */
export class ArenaErrorBoundary extends Component<Props, State> {
  state: State = {error: null};

  static getDerivedStateFromError(error: Error): State {
    return {error};
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[ArenaErrorBoundary]', error.message, info.componentStack);
  }

  private reset = () => {
    this.setState({error: null});
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.brand}>Xecute</Text>
        <Text style={styles.title}>Arena hit a snag</Text>
        <Text style={styles.copy}>
          {this.props.label ||
            'Something failed while opening your missions. Tap retry — your account is still signed in.'}
        </Text>
        <Text style={styles.detail} numberOfLines={4}>
          {this.state.error.message}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.88}>
          <Text style={styles.btnText}>Retry Arena</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0b14',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  brand: {
    color: '#a855f7',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  copy: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
  },
  detail: {
    color: 'rgba(248,113,113,0.9)',
    fontSize: 11,
    marginTop: 14,
    textAlign: 'center',
  },
  btn: {
    marginTop: 22,
    backgroundColor: '#a855f7',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  btnText: {color: '#fff', fontWeight: '800', fontSize: 15},
});
