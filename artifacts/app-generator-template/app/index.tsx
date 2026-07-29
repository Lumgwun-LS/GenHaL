import { WebView } from "react-native-webview";
import { SafeAreaView, StyleSheet, ActivityIndicator, View, Text } from "react-native";
import Constants from "expo-constants";

const WEBSITE_URL: string = Constants.expoConfig?.extra?.websiteUrl ?? "https://awajimaa.com";
const VENDOR_NAME: string = Constants.expoConfig?.extra?.vendorName ?? "App";

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <WebView
        source={{ uri: WEBSITE_URL }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#7F50FF" />
            <Text style={styles.loaderText}>Loading {VENDOR_NAME}…</Text>
          </View>
        )}
        javaScriptEnabled
        domStorageEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        onError={() => {}}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  webview:   { flex: 1 },
  loader: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center", backgroundColor: "#fff",
  },
  loaderText: { marginTop: 12, color: "#7F50FF", fontSize: 16 },
});
