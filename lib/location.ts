import * as Location from "expo-location";

export async function requestLocationPermissions(): Promise<boolean> {
  const { status: foreground } = await Location.requestForegroundPermissionsAsync();
  if (foreground !== "granted") return false;

  const { status: background } = await Location.requestBackgroundPermissionsAsync();
  return background === "granted";
}

export async function getCurrentLocation() {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    timestamp: location.timestamp,
  };
}
