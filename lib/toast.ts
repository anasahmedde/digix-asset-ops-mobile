import { Alert, Platform, ToastAndroid } from "react-native";

function show(message: string) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert("", message);
  }
}

export const toast = {
  success: show,
  error: show,
  info: show,
};
