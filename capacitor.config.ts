const config = {
  appId: "com.lincoz.generalpos",
  appName: "Lincoz General POS",
  webDir: "public",
  bundledWebRuntime: false,
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "https://gpos-mu.vercel.app",
    cleartext: true,
    allowNavigation: [
      "gpos-mu.vercel.app",
      "*.vercel.app",
      "192.168.*.*",
      "10.0.2.2",
      "localhost",
      "*",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#2563eb",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#ffffff",
      overlaysWebView: true,
    },
    Keyboard: {
      resize: "body",
      style: "LIGHT",
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  ios: {
    contentInset: "automatic",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
};

export default config;

