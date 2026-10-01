import {NativeModules, Platform} from 'react-native';

type SpeechNative = {
  startListening(prompt?: string): Promise<string>;
};

const NativeSpeech: SpeechNative | null =
  Platform.OS === 'android' && NativeModules.XecuteSpeech
    ? (NativeModules.XecuteSpeech as SpeechNative)
    : null;

export const SpeechBridge = {
  available(): boolean {
    return Boolean(NativeSpeech);
  },

  async listen(prompt?: string): Promise<string> {
    if (!NativeSpeech) {
      throw new Error('Speech recognition is only available on Android builds.');
    }
    return NativeSpeech.startListening(prompt);
  },
};
