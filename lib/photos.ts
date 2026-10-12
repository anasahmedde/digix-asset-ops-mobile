import * as ImagePicker from "expo-image-picker";

/** A photograph from the camera, or from the gallery when the camera is refused. */
export async function takePhoto(): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  const result = perm.granted
    ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
}

/** A file from the gallery: the signed sheet, a scan, a document photo. */
export async function pickFromLibrary(): Promise<ImagePicker.ImagePickerAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
}

export function asUpload(asset: ImagePicker.ImagePickerAsset, name = "photo.jpg") {
  return { uri: asset.uri, name: asset.fileName ?? name, type: asset.mimeType ?? "image/jpeg" } as unknown as Blob;
}
