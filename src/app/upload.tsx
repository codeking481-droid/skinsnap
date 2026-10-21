import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Alert,
  BackHandler,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Camera, CameraView, type CameraType, type FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoto } from '../PhotoContext';
import { backOrReplace } from '../navigation';
import { validatePhoto } from '../photoValidation';

function FaceGuide({ size }: { size: number }) {
  return (
    <View pointerEvents="none" style={[styles.faceGuideWrap, { width: size, height: size * 1.18, borderRadius: size * 0.54 }]}>
      <View style={[styles.faceGuide, { width: size, height: size * 1.18, borderRadius: size * 0.54 }]} />
      <View pointerEvents="none" style={[styles.faceGuideLine, { width: size * 0.66, top: size * 0.74 }]} />
    </View>
  );
}

export default function UploadScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { photoUri, setPhotoUri, photoUploadConsent, setPhotoUploadConsent, setAnalysisResult } = usePhoto();
  const [permission, requestPermission] = useCameraPermissions();
  const [refreshedPermission, setRefreshedPermission] = useState<typeof permission>(null);
  const cameraPermission = refreshedPermission ?? permission;
  const [facing, setFacing] = useState<CameraType>('front');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [isCapturing, setIsCapturing] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(photoUploadConsent);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(0.76);
  const cameraRef = useRef<CameraView>(null);
  const scale = Math.max(0.9, Math.min(Math.min(width, 520) / 393, 1.08));
  const guideSize = Math.min(width - 96, 276) * (width < 380 ? 0.88 : 1);

  useEffect(() => {
    if (!photoUri) return;
    Image.getSize(photoUri, (imageWidth, imageHeight) => {
      if (imageWidth > 0 && imageHeight > 0) {
        setPreviewAspectRatio(Math.max(0.58, Math.min(imageWidth / imageHeight, 1.2)));
      }
    }, () => setPreviewAspectRatio(0.76));
  }, [photoUri]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void Camera.getCameraPermissionsAsync().then(setRefreshedPermission).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (photoUri) {
          setPhotoUri(null);
          setPhotoUploadConsent(false);
          setAnalysisResult(null);
          setPhotoConsent(false);
          return true;
        }
        void backOrReplace('/');
        return true;
      });
      return () => subscription.remove();
    }, [photoUri, setAnalysisResult, setPhotoUri, setPhotoUploadConsent]),
  );

  const validateSelectedPhoto = async (uri: string) => {
    try {
      const { width: imageWidth, height: imageHeight } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(uri, (imageWidthValue, imageHeightValue) => resolve({ width: imageWidthValue, height: imageHeightValue }), reject);
      });
      if (!validatePhoto(imageWidth, imageHeight).valid) {
        Alert.alert('Photo could not be checked', 'Choose an image that your device can open and preview.');
        return;
      }

      if (!photoConsent) {
        Alert.alert('Consent needed', 'Please confirm that your photo may be processed only after you subscribe and request analysis.');
        return;
      }

      setPhotoUploadConsent(true);
      router.push('/paywall');
    } catch {
      Alert.alert('Photo could not be checked', 'Please select a different photo and try again.');
    }
  };

  const takePhoto = async () => {
    if (isCapturing || !cameraRef.current) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false, exif: false });
      if (!photo?.uri) {
        Alert.alert('Camera capture failed', 'Please try again or choose a photo from your gallery.');
        return;
      }
      setPhotoUri(photo.uri);
      setAnalysisResult(null);
      setPhotoUploadConsent(false);
      setPhotoConsent(false);
    } catch {
      Alert.alert('Camera unavailable', 'Please try again or switch to a gallery photo instead.');
    } finally {
      setIsCapturing(false);
    }
  };

  const chooseFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      setPhotoUri(result.assets[0].uri);
      setPhotoUploadConsent(false);
      setAnalysisResult(null);
      setPhotoConsent(false);
    } catch {
      Alert.alert('Gallery unavailable', 'Please try again or choose a photo from the camera instead.');
    }
  };

  const useSelectedPhoto = async () => {
    if (!photoUri) return;
    await validateSelectedPhoto(photoUri);
  };

  const retakePhoto = () => {
    setPhotoUri(null);
    setPhotoUploadConsent(false);
    setAnalysisResult(null);
    setPhotoConsent(false);
  };

  if (!cameraPermission) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={['#090B10', '#120C12', '#050609']} style={StyleSheet.absoluteFill} />
        <View style={[styles.permissionCard, { width: Math.min(width - 32, 360), paddingTop: Math.max(insets.top, 24), paddingBottom: 28 }]}>
          <Text style={[styles.permissionEyebrow, { fontSize: 12 * scale }]}>Choose a photo</Text>
          <Text style={[styles.permissionTitle, { fontSize: 28 * scale, lineHeight: 34 * scale }]}>Use any clear image</Text>
          <Text style={[styles.permissionText, { fontSize: 14 * scale, lineHeight: 20 * scale }]}>Select an image from your gallery, or allow camera access to take a new photo.</Text>
          <Pressable accessibilityRole="button" onPress={() => void chooseFromGallery()} style={[styles.permissionButton, { minHeight: 52 * scale, borderRadius: 26 * scale }]}>
            <Text style={[styles.permissionButtonText, { fontSize: 15 * scale }]}>Choose from gallery</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => backOrReplace('/')} style={[styles.permissionSecondary, { marginTop: 12 * scale }]}>
            <Text style={[styles.permissionSecondaryText, { fontSize: 13 * scale }]}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={['#090B10', '#120C12', '#050609']} style={StyleSheet.absoluteFill} />
        <View style={[styles.permissionCard, { width: Math.min(width - 32, 360), paddingTop: Math.max(insets.top, 24), paddingBottom: 28 }]}>
          <Text style={[styles.permissionEyebrow, { fontSize: 12 * scale }]}>Camera access</Text>
          <Text style={[styles.permissionTitle, { fontSize: 28 * scale, lineHeight: 34 * scale }]}>Allow SkinSnap to { '\n' }access your camera</Text>
          <Text style={[styles.permissionText, { fontSize: 14 * scale, lineHeight: 20 * scale }]}>We only use your camera to capture a clear selfie for your skincare preview and keep your photo local until you choose to continue.</Text>
          <Pressable accessibilityRole="button" onPress={() => {
            if (!cameraPermission.canAskAgain) {
              void Linking.openSettings();
              return;
            }
            void requestPermission().then(setRefreshedPermission).catch(() => undefined);
          }} style={[styles.permissionButton, { minHeight: 52 * scale, borderRadius: 26 * scale }]}>
            <Text style={[styles.permissionButtonText, { fontSize: 15 * scale }]}>{cameraPermission.canAskAgain ? 'Enable camera' : 'Open Settings'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void chooseFromGallery()} style={[styles.permissionSecondary, { marginTop: 16 * scale }]}>
            <Text style={[styles.permissionSecondaryText, { fontSize: 14 * scale }]}>Choose from gallery instead</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => backOrReplace('/')} style={[styles.permissionSecondary, { marginTop: 12 * scale }]}>
            <Text style={[styles.permissionSecondaryText, { fontSize: 13 * scale }]}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (photoUri) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={['#090B10', '#120C12', '#050609']} style={StyleSheet.absoluteFill} />
        <View style={[styles.previewScreen, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 22) }]}>
          <View style={styles.previewHeader}>
            <Pressable accessibilityRole="button" onPress={() => retakePhoto()} style={[styles.iconButton, { width: 42 * scale, height: 42 * scale }]}>
              <Svg width={22 * scale} height={22 * scale} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
            </Pressable>
            <Text style={[styles.previewHeadline, { fontSize: 22 * scale, lineHeight: 28 * scale }]}>Photo preview</Text>
            <View style={[styles.iconButton, { width: 42 * scale, height: 42 * scale, opacity: 0 }]} />
          </View>

          <View style={[styles.previewCard, { width: Math.min(width - 30, 420), borderRadius: 26 * scale }]}>
            <Image source={{ uri: photoUri }} style={[styles.previewImage, { aspectRatio: previewAspectRatio }]} resizeMode="contain" />
            <LinearGradient colors={['rgba(7,7,12,0.1)', 'rgba(7,7,12,0.0)', 'rgba(7,7,12,0.13)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
          </View>

          <View style={[styles.previewTips, { width: Math.min(width - 30, 420), borderRadius: 18 * scale, marginTop: 18 * scale, paddingVertical: 14 * scale, paddingHorizontal: 16 * scale }]}>
            <Text style={[styles.tipsTitle, { fontSize: 13 * scale }]}>Photo quality guide</Text>
            <Text style={[styles.tipsBody, { fontSize: 12 * scale, lineHeight: 18 * scale }]}>Use natural light and avoid filters.{ '\n' }This screen does not detect faces; choose a photo where your face is clearly visible.</Text>
          </View>

          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: photoConsent }} onPress={() => setPhotoConsent((value) => !value)} style={[styles.consentRow, { width: Math.min(width - 30, 420), marginTop: 16 * scale }]}>
            <View style={[styles.checkbox, photoConsent && styles.checkboxActive]}>{photoConsent && <Text style={styles.checkmark}>✓</Text>}</View>
            <Text style={[styles.consentText, { fontSize: 11 * scale, lineHeight: 16 * scale }]}>I consent to this photo being processed only after I subscribe and request secure analysis.</Text>
          </Pressable>

          <View style={[styles.previewActions, { width: Math.min(width - 30, 420), marginTop: 18 * scale, gap: 12 * scale }]}>
            <Pressable accessibilityRole="button" onPress={useSelectedPhoto} style={[styles.primaryButton, { minHeight: 54 * scale, borderRadius: 27 * scale }]}>
              <LinearGradient colors={['#FFB2C9', '#FF6DA5', '#FF6C9D']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
              <Text style={[styles.primaryButtonText, { fontSize: 15 * scale }]}>Use This Photo</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={retakePhoto} style={[styles.secondaryButton, { minHeight: 48 * scale, borderRadius: 24 * scale }]}>
              <Text style={[styles.secondaryButtonText, { fontSize: 14 * scale }]}>Retake</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
        ratio="4:3"
        onCameraReady={() => undefined}
        mirror
      />

      <LinearGradient colors={['rgba(9,10,15,0.32)', 'rgba(9,10,15,0.18)', 'rgba(9,10,15,0.78)']} style={StyleSheet.absoluteFill} pointerEvents="none" />

      <View style={[styles.cameraTop, { paddingTop: Math.max(insets.top, 16), paddingHorizontal: 18 * scale }]}>
        <Pressable accessibilityRole="button" onPress={() => backOrReplace('/')} style={[styles.iconButton, { width: 42 * scale, height: 42 * scale }]}>
          <Svg width={22 * scale} height={22 * scale} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
        </Pressable>

        <View style={styles.cameraActionsRight}>
          <Pressable accessibilityRole="button" onPress={() => setFlash((current) => (current === 'off' ? 'on' : 'off'))} style={[styles.iconButton, { width: 42 * scale, height: 42 * scale }]}>
            <Svg width={20 * scale} height={20 * scale} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 2 5 13h5l-1 9 9-13h-5l2-7Z" />
            </Svg>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setFacing((current) => (current === 'front' ? 'back' : 'front'))} style={[styles.switchButton, { width: 42 * scale, height: 42 * scale }]}>
            <Svg width={20 * scale} height={20 * scale} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3m6-14h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3M8 12h8M15 9V7m0 10v-2" /></Svg>
          </Pressable>
        </View>
      </View>

      <View style={styles.cameraCenter} pointerEvents="none">
        <View style={[styles.faceGuideShell, { width: guideSize, height: guideSize * 1.2, borderRadius: guideSize * 0.5 }]}>
          <FaceGuide size={guideSize} />
        </View>
      </View>

      <View style={styles.cameraFooter}>
        <Text style={[styles.helperText, { fontSize: 13 * scale, lineHeight: 18 * scale }]}>Position your face inside the frame.</Text>
        <View style={[styles.cameraControls, { width: Math.min(width - 40, 420), marginTop: 12 * scale }]}>
          <Pressable accessibilityRole="button" onPress={chooseFromGallery} style={[styles.galleryButton, { width: 64 * scale, height: 64 * scale, borderRadius: 22 * scale }]}>
            <Svg width={28 * scale} height={28 * scale} viewBox="0 0 24 24" fill="none" stroke="#0A090D" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M4 5h16v14H4zM4 16l4-4 4 4 3-3 5 5" /><Circle cx="9" cy="9" r="1.5" fill="#0A090D" stroke="none" />
            </Svg>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={takePhoto} disabled={isCapturing} style={[styles.shutterButton, { width: 86 * scale, height: 86 * scale, borderRadius: 43 * scale, opacity: isCapturing ? 0.7 : 1 }]}>
            <LinearGradient colors={['#FFB7CE', '#FF73A7', '#FF5C96']} style={StyleSheet.absoluteFill} />
            <View style={[styles.shutterInner, { width: 62 * scale, height: 62 * scale, borderRadius: 31 * scale }]} />
          </Pressable>

          <View style={[styles.galleryButton, { width: 64 * scale, height: 64 * scale, borderRadius: 22 * scale, opacity: 0.35 }]} pointerEvents="none">
            <Svg width={28 * scale} height={28 * scale} viewBox="0 0 24 24" fill="none" stroke="#0A090D" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M8 6h8l2 2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l2-2Z" /><Circle cx="12" cy="13" r="4" /></Svg>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050609' },
  permissionCard: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', flex: 1 },
  permissionEyebrow: { color: '#FF7EA9', fontFamily: 'InterSemibold', letterSpacing: 2, textTransform: 'uppercase' },
  permissionTitle: { color: '#F6F5F8', fontFamily: 'InterExtraBold', textAlign: 'center' },
  permissionText: { color: '#C8C5D1', fontFamily: 'InterRegular', textAlign: 'center', marginTop: 12 },
  permissionButton: { width: '100%', marginTop: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF6E9F' },
  permissionButtonText: { color: '#0A090D', fontFamily: 'InterExtraBold' },
  permissionSecondary: { paddingVertical: 8 },
  permissionSecondaryText: { color: '#E9DCE4', fontFamily: 'InterMedium' },
  cameraTop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cameraActionsRight: { flexDirection: 'row', gap: 10 },
  iconButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11, 12, 15, 0.45)', borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderRadius: 21 },
  switchButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11, 12, 15, 0.45)', borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderRadius: 21 },
  cameraCenter: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  faceGuideShell: { alignItems: 'center', justifyContent: 'center', opacity: 0.95 },
  faceGuideWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  faceGuide: { borderWidth: 2.8, borderColor: '#B6F3B9', borderRadius: 200, backgroundColor: 'transparent' },
  faceGuideLine: { position: 'absolute', height: 2.2, backgroundColor: '#B6F3B9', borderRadius: 2, alignSelf: 'center' },
  cameraFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3, alignItems: 'center', paddingBottom: 30 },
  helperText: { color: '#FFFFFF', fontFamily: 'InterMedium', textAlign: 'center', paddingHorizontal: 24 },
  cameraControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  galleryButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2EAEF', borderColor: '#E7D6DE', borderWidth: 1 },
  shutterButton: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.08)', shadowColor: '#FF5E97', shadowOpacity: 0.65, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  shutterInner: { backgroundColor: '#FFFFFF', borderWidth: 4, borderColor: '#FF6EA4' },
  previewScreen: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  previewHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  previewHeadline: { color: '#F7F5F9', fontFamily: 'InterExtraBold', textAlign: 'center' },
  previewCard: { overflow: 'hidden', backgroundColor: '#201E24', borderWidth: 1, borderColor: '#F6CDD8', marginTop: 22 },
  previewImage: { width: '100%', backgroundColor: '#1A1A1D' },
  previewTips: { backgroundColor: 'rgba(244, 232, 237, 0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' },
  tipsTitle: { color: '#090B10', fontFamily: 'InterSemibold' },
  tipsBody: { color: '#2E2A32', fontFamily: 'InterRegular', marginTop: 4 },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: '#D4CED5', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  checkboxActive: { backgroundColor: '#FF6D9A', borderColor: '#FF6D9A' },
  checkmark: { color: '#06070A', fontFamily: 'InterExtraBold', fontSize: 12 },
  consentText: { color: '#D7D6DE', fontFamily: 'InterRegular', flex: 1 },
  previewActions: { alignItems: 'stretch' },
  primaryButton: { position: 'relative', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  primaryButtonText: { color: '#090B10', fontFamily: 'InterExtraBold', zIndex: 1 },
  secondaryButton: { backgroundColor: 'rgba(18, 18, 21, 0.94)', borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#F6F5F8', fontFamily: 'InterSemibold' },
});
