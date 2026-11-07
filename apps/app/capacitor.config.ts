import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.vrum',
  appName: 'VRUM',
  webDir: 'dist',
  backgroundColor: '#101114',
  android: { allowMixedContent: false },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
