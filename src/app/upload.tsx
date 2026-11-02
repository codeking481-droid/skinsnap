import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Alert,
  BackHandler,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Camera, CameraView, type CameraType, type FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePhoto } from '../PhotoContext';
import { backOrReplace } from '../navigation';
import { inspectCapture } from '../services/captureQuality';
import { getCaptureGuideWidth, type CaptureCheck } from '../smartCapture';
import { loadSkinPreferences } from '../services/retentionApi';
import { isAdultEligibilityConfirmed, MINIMUM_USER_AGE, PHOTO_ANALYSIS_CONSENT_VERSION } from '../privacy';
import { loadPreferences } from '../preferences';
import { AnalysisPreferencesForm } from '../components/AnalysisPreferencesForm';
import { developmentAnalysisEnabled } from '../releasePolicy';
import { getVerifiedEntitlement } from '../services/billing';
import { responsiveScale } from '../responsive';

export default function UploadScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ test?: string }>();
  const liveTest = developmentAnalysisEnabled(__DEV__, process.env.EXPO_PUBLIC_AI_DEV_TEST_MODE)
    && params.test === 'live';
  const scale = responsiveScale(width);
  const { photoUri, setPhotoUri, photoUploadConsent, setPhotoUploadConsent, setAnalysisResult, analysisPreferences, setAnalysisPreferences, photoView, setPhotoView } = usePhoto();
  const [permission, requestPermission] = useCameraPermissions();
  const [refreshedPermission, setRefreshedPermission] = useState<typeof permission>(null);
  const cameraPermission = refreshedPermission ?? permission;
  const [facing, setFacing] = useState<CameraType>('front');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [quality, setQuality] = useState<{ uri: string; check: CaptureCheck } | null>(null);
  const [photoMime, setPhotoMime] = useState<string | undefined>();
  const [isCapturing, setIsCapturing] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(photoUploadConsent);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(0.76);
  const [showScanInfo, setShowScanInfo] = useState(false);
  const [screenFocused, setScreenFocused] = useState(true);
  const [ageGateReady, setAgeGateReady] = useState(false);
  const [scanAccessChecked, setScanAccessChecked] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [lightingConfirmed, setLightingConfirmed] = useState(false);
  const [framingConfirmed, setFramingConfirmed] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(76 * scale);
  const [footerHeight, setFooterHeight] = useState(210 * scale);
  const cameraRef = useRef<CameraView>(null);
  const captureInProgress = useRef(false);
  const hasFocusedBefore = useRef(false);
  const cameraAreaHeight = Math.max(0, height - headerHeight - footerHeight);
  const guideOffset = Math.min(62 * scale, Math.max(18 * scale, cameraAreaHeight * 0.12));
  const guideSize = getCaptureGuideWidth(width, cameraAreaHeight, guideOffset) * 1.06;
  const previewWidth = Math.min(width - insets.left - insets.right - 40, 420);
  const previewHeight = Math.min(previewWidth / previewAspectRatio, Math.max(150, height * 0.38), 380);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    setCameraReady(false);
    setIsSwitchingCamera(false);
    if (hasFocusedBefore.current) setCameraAttempt(current => current + 1);
    hasFocusedBefore.current = true;
    return () => {
      setScreenFocused(false);
      setCameraReady(false);
      setIsSwitchingCamera(false);
    };
  }, []));

  useFocusEffect(useCallback(() => {
    let active = true;
    setScanAccessChecked(false);
    void getVerifiedEntitlement().then(entitlement => {
      if (!active) return;
      if (!entitlement.active) {
        router.replace({ pathname: '/paywall', params: { next: 'analysis' } });
        return;
      }
      setScanAccessChecked(true);
    }).catch(() => {
      if (active) router.replace({ pathname: '/paywall', params: { next: 'analysis' } });
    });
    return () => { active = false; };
  }, []));

  useFocusEffect(useCallback(() => {
    let active = true;
    setAgeGateReady(false);
    void loadPreferences().then(preferences => {
      if (!active) return;
      if (!preferences.onboardingComplete || !isAdultEligibilityConfirmed(preferences.ageConfirmed)) {
        router.replace('/onboarding');
        return;
      }
      setAgeGateReady(true);
    }).catch(() => {
      if (!active) return;
      Alert.alert('Age eligibility unavailable', 'Confirm that you are 18 or older in onboarding before using Scan.');
      router.replace('/onboarding');
    });
    return () => {
      active = false;
      setAgeGateReady(false);
    };
  }, []));

  useFocusEffect(useCallback(() => {
    let active = true;
    void loadSkinPreferences().then(saved => { if (active && saved) setAnalysisPreferences(saved.preferences); }).catch(() => undefined);
    return () => { active = false; };
  }, [setAnalysisPreferences]));
  useEffect(() => {
    if (!photoUri) return;
    let active = true;
    void inspectCapture(photoUri, photoMime).then(check => { if (active) setQuality({ uri: photoUri, check }); })
      .catch(() => { if (active) setQuality({ uri: photoUri, check: { usable: false, warnings: [], message: 'The local photo check could not finish. Retake or choose another image.' } }); });
    return () => { active = false; };
  }, [photoMime, photoUri]);

  useEffect(() => {
    if (!photoUri) return;
    let active = true;
    Image.getSize(photoUri, (imageWidth, imageHeight) => {
      if (active && imageWidth > 0 && imageHeight > 0) {
        setPreviewAspectRatio(imageWidth / imageHeight);
      }
    }, () => { if (active) setPreviewAspectRatio(0.76); });
    return () => { active = false; };
  }, [photoUri]);

  useEffect(() => {
    let wasActive = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setAppActive(active);
      if (!active) {
        setCameraReady(false);
        setIsSwitchingCamera(false);
      }
      if (state === 'active') {
        if (!wasActive) setCameraAttempt(current => current + 1);
        void Camera.getCameraPermissionsAsync().then(setRefreshedPermission).catch(() => undefined);
      }
      wasActive = active;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!ageGateReady || !scanAccessChecked || !screenFocused || !appActive || !cameraPermission?.granted || photoUri || cameraError || cameraReady) return;
    const timeout = setTimeout(() => {
      setIsSwitchingCamera(false);
      setCameraError('The camera is taking longer than expected to start. Try again or choose a photo from your gallery.');
    }, 15_000);
    return () => clearTimeout(timeout);
  }, [ageGateReady, appActive, cameraError, cameraPermission?.granted, cameraReady, photoUri, scanAccessChecked, screenFocused]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (photoUri) {
          setPhotoUri(null);
          setPhotoUploadConsent(false);
          setAnalysisResult(null);
          setPhotoConsent(false);
          setFramingConfirmed(false);
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
      const eligibility = await loadPreferences();
      if (!eligibility.onboardingComplete || !isAdultEligibilityConfirmed(eligibility.ageConfirmed)) {
        Alert.alert(`${MINIMUM_USER_AGE}+ age requirement`, `SkinSnap is available only to people aged ${MINIMUM_USER_AGE} or older.`);
        router.replace('/onboarding');
        return;
      }
      if (!quality || quality.uri !== uri) { Alert.alert('Checking your photo', 'Wait for the local photo check to finish.'); return; }
      if (!quality.check.usable) { Alert.alert('Choose another photo', quality.check.message); return; }
      if (!framingConfirmed) { Alert.alert('Check your framing', 'Make sure your face fills more than 40% of the guide and is clearly visible before continuing.'); return; }
      if (!photoConsent) {
        Alert.alert('Consent needed', 'Please confirm that your photo may be securely processed when you request an authorized analysis.');
        return;
      }

      const proceed = () => {
        setPhotoUploadConsent(true);
        if (liveTest) {
          router.replace({ pathname: '/analysis', params: { mode: 'development' } });
          return;
        }
        router.push({ pathname: '/paywall', params: { next: 'analysis' } });
      };
      if (quality.check.warnings.length) Alert.alert('A retake may help', quality.check.message, [{ text: 'Retake', onPress: retakePhoto }, { text: 'Use this photo', onPress: proceed }]);
      else proceed();
    } catch {
      Alert.alert('Photo could not be checked', 'Please select a different photo and try again.');
    }
  };

  const takePhoto = async () => {
    if (!ageGateReady || !scanAccessChecked || captureInProgress.current || isCapturing || !cameraReady || !cameraRef.current) return;
    captureInProgress.current = true;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false, exif: false });
      if (!photo?.uri) {
        Alert.alert('Camera capture failed', 'Please try again or choose a photo from your gallery.');
        return;
      }
      setCameraReady(false);
      setPhotoMime('image/jpeg');
      setQuality(null);
      setFramingConfirmed(false);
      setPhotoUri(photo.uri);
      setAnalysisResult(null);
      setPhotoUploadConsent(false);
      setPhotoConsent(false);
    } catch {
      Alert.alert('Camera unavailable', 'Please try again or switch to a gallery photo instead.');
    } finally {
      setIsCapturing(false);
      captureInProgress.current = false;
    }
  };

  const flipCamera = () => {
    if (captureInProgress.current || isCapturing || isSwitchingCamera) return;
    setCameraReady(false);
    setCameraError(null);
    setIsSwitchingCamera(true);
    setFlash('off');
    setFacing(current => current === 'front' ? 'back' : 'front');
  };

  const chooseFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      setCameraReady(false);
      setPhotoMime(result.assets[0].mimeType);
      setQuality(null);
      setFramingConfirmed(false);
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
    setCameraReady(false);
    setCameraError(null);
    setPhotoUri(null);
    setPhotoUploadConsent(false);
    setAnalysisResult(null);
    setPhotoConsent(false);
    setFramingConfirmed(false);
  };

  if (!ageGateReady || !scanAccessChecked) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={['#151515', '#0A0A0A']} style={StyleSheet.absoluteFill} />
        <View style={[styles.permissionCard, { width: Math.min(width - 32, 360), paddingTop: Math.max(insets.top, 24), paddingBottom: 28 }]}>
          <Text style={[styles.permissionEyebrow, { fontSize: 12 * scale }]}>PREMIUM SCAN</Text>
          <Text style={[styles.permissionTitle, { fontSize: 24 * scale, lineHeight: 31 * scale }]}>Checking your access</Text>
          <Text style={[styles.permissionText, { fontSize: 14 * scale, lineHeight: 20 * scale }]}>Confirming your subscription before opening Scan.</Text>
        </View>
      </View>
    );
  }

  if (!photoUri && !cameraPermission) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={['#151515', '#0A0A0A']} style={StyleSheet.absoluteFill} />
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

  if (!photoUri && cameraPermission && !cameraPermission.granted) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={['#151515', '#0A0A0A']} style={StyleSheet.absoluteFill} />
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
        <LinearGradient colors={['#151515', '#0A0A0A']} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.previewSafeArea} edges={['top', 'bottom', 'left', 'right']}>
        <ScrollView
          style={styles.previewScroll}
          contentContainerStyle={[
            styles.previewScreen,
            { paddingBottom: Math.max(insets.bottom, 16) + 16 },
          ]}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        >
        <View style={[styles.previewContent, { width: previewWidth }]}>
          <View style={styles.previewHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to camera" onPress={() => retakePhoto()} style={[styles.iconButton, styles.previewBack]}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
            </Pressable>
            <Text accessibilityRole="header" style={styles.previewHeadline}>Photo preview</Text>
            <View style={styles.previewBack} />
          </View>

          <View style={styles.previewCard}>
            <Image source={{ uri: photoUri }} accessibilityLabel="Your selected photo" style={[styles.previewImage, { height: previewHeight }]} resizeMode="contain" />
            <LinearGradient colors={['rgba(7,7,12,0.1)', 'rgba(7,7,12,0.0)', 'rgba(7,7,12,0.13)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
          </View>

          <View style={styles.previewTips}>
            <Text style={styles.previewTipsTitle}>Photo quality guide</Text>
            <Text style={styles.previewTipsBody}>Face a window for soft, even light. Keep your phone steady, avoid strong shadows and heavy beauty filters.{ '\n' }The oval is a guide, not automatic face detection.</Text>
          </View>

          <View style={styles.previewTips}><Text accessibilityLiveRegion="polite" style={styles.previewTipsBody}>{quality?.uri === photoUri ? quality.check.message : 'Checking this file locally...'}</Text></View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: framingConfirmed }}
            accessibilityLabel="Confirm my face fills more than 40 percent of the guide and is clearly visible"
            onPress={() => setFramingConfirmed(value => !value)}
            style={styles.consentRow}
          >
            <View style={[styles.checkbox, framingConfirmed && styles.checkboxActive]}>{framingConfirmed && <Text style={styles.checkmark}>✓</Text>}</View>
            <Text style={styles.consentText}>I confirm my face fills more than 40% of the guide and is clearly visible.</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/skin-preferences')} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>My Skin Preferences</Text></Pressable>
          <AnalysisPreferencesForm value={analysisPreferences} onChange={setAnalysisPreferences} />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: photoConsent }}
            accessibilityLabel="Consent to securely process this photo for skin analysis"
            onPress={() => setPhotoConsent((value) => !value)}
            style={styles.consentRow}
          >
            <View style={[styles.checkbox, photoConsent && styles.checkboxActive]}>{photoConsent && <Text style={styles.checkmark}>✓</Text>}</View>
            <Text style={styles.consentText}>I consent to send this photo securely to SkinSnap and Groq for cosmetic observations and general skincare guidance. Groq receives the photo for visual analysis, then text observations and any optional preferences for routine guidance. Lighting and image quality can affect results; this is not medical advice. SkinSnap saves analysis results, not the photo, to account history. The prepared copy is removed after processing when cleanup succeeds. You can request account-data deletion in Progress → Account &amp; data settings; provider copies follow their own terms.</Text>
          </Pressable>
          <View style={styles.privacyLinks}>
            <Text style={styles.consentVersion}>Disclosure {PHOTO_ANALYSIS_CONSENT_VERSION}</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} hitSlop={8}>
              <Text style={styles.privacyLink}>Privacy information</Text>
            </Pressable>
          </View>

          <View style={styles.previewActions}>
            <Pressable accessibilityRole="button" onPress={useSelectedPhoto} disabled={quality?.uri !== photoUri || !quality.check.usable || !framingConfirmed} accessibilityState={{ disabled: quality?.uri !== photoUri || !quality.check.usable || !framingConfirmed }} style={[styles.primaryButton, (quality?.uri !== photoUri || !quality.check.usable || !framingConfirmed) && { opacity: 0.45 }]}>
              <LinearGradient colors={['#E8C9A0', '#D4B896']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
              <Text style={styles.primaryButtonText}>Continue to scan</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={retakePhoto} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Retake</Text>
            </Pressable>
          </View>
        </View>
        </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        ref={cameraRef}
        key={`${facing}-${cameraAttempt}`}
        style={StyleSheet.absoluteFill}
        active={screenFocused && appActive && Boolean(cameraPermission?.granted) && !photoUri && !cameraError}
        facing={facing}
        flash={flash}
        onCameraReady={() => {
          setCameraError(null);
          setIsSwitchingCamera(false);
          setCameraReady(true);
        }}
        onMountError={event => {
          setCameraReady(false);
          setIsSwitchingCamera(false);
          setCameraError(event.message || 'The camera could not start.');
        }}
        mirror={facing === 'front'}
      />

      <View onLayout={event => {
        const measured = event.nativeEvent.layout.height;
        setHeaderHeight(current => Math.abs(current - measured) > 1 ? measured : current);
      }} style={[styles.scanHeader, { paddingTop: Math.max(insets.top, 8), paddingHorizontal: 16 * scale, minHeight: 64 * scale }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to home" onPress={() => backOrReplace('/')} style={[styles.scanHeaderSide, { width: 42 * scale, height: 42 * scale }]}>
          <Svg width={22 * scale} height={22 * scale} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><Path d="m15 18-6-6 6-6" /></Svg>
        </Pressable>
        <View style={styles.scanHeaderTitle}>
          <Text style={[styles.scanBrand, { fontSize: 22 * scale }]}>Scan your glow</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="About your skin scan" onPress={() => setShowScanInfo(true)} style={[styles.scanHeaderSide, { width: 42 * scale, height: 42 * scale }]}>
          <Text style={styles.infoGlyph}>i</Text>
        </Pressable>
      </View>

      <View style={[styles.cameraCenter, { top: headerHeight + 24 * scale, bottom: footerHeight + 10 * scale, transform: [{ translateY: guideOffset }] }]} pointerEvents="none">
        {cameraError
          ? <View style={[styles.cameraErrorCard, { maxWidth: Math.min(width - 40, 340), padding: 16 * scale, borderRadius: 18 * scale }]}>
            <Text style={[styles.cameraErrorTitle, { fontSize: 15 * scale }]}>Camera unavailable</Text>
            <Text style={[styles.cameraErrorText, { fontSize: 11 * scale, lineHeight: 16 * scale }]}>{cameraError}</Text>
          </View>
          : <View style={[styles.faceGuide, {
            width: guideSize,
            height: guideSize * (4 / 3),
            borderRadius: guideSize / 2,
            borderWidth: Math.max(3, 4 * scale),
            opacity: cameraReady ? 1 : 0.72,
          }]} />}
        </View>

      <View onLayout={event => {
        const measured = event.nativeEvent.layout.height;
        setFooterHeight(current => Math.abs(current - measured) > 1 ? measured : current);
      }} style={[styles.cameraFooter, { paddingBottom: Math.max(insets.bottom, 10) + 5, paddingHorizontal: 17 * scale }]}>
        <Text style={[styles.helperText, { fontSize: 13 * scale, lineHeight: 19 * scale }]}>
          {photoView === 'side' ? 'Turn gently to one side • Keep your cheek inside the oval' : 'Look straight at the camera • Fit your head inside the oval'}
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Choose face angle" style={[styles.captureViews, { marginTop: 7 * scale, gap: 8 * scale }]}>
          {(['front', 'side'] as const).map(view => (
            <Pressable
              key={view}
              accessibilityRole="radio"
              accessibilityState={{ checked: photoView === view }}
              accessibilityLabel={view === 'front' ? 'Capture front view' : 'Capture side profile'}
              onPress={() => setPhotoView(view)}
              style={[styles.captureViewOption, photoView === view && styles.captureViewOptionSelected, { minHeight: 32 * scale, paddingHorizontal: 14 * scale }]}
            >
              <Text style={[styles.captureViewText, photoView === view && styles.captureViewTextSelected, { fontSize: 10 * scale }]}>
                {view === 'front' ? 'Front view' : 'Side profile'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.readinessChips, { marginTop: 5 * scale, gap: 10 * scale }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: lightingConfirmed }}
            accessibilityLabel={lightingConfirmed ? 'Good light confirmed' : 'Confirm good lighting'}
            onPress={() => setLightingConfirmed(value => !value)}
            style={[styles.readinessChip, lightingConfirmed && styles.readinessChipSelected, { paddingHorizontal: 10 * scale, minHeight: 28 * scale }]}
          >
            <Text style={[styles.readinessChipText, lightingConfirmed && styles.readinessChipTextSelected, { fontSize: 9.5 * scale }]}>{lightingConfirmed ? '✓ Good light' : 'Good light'}</Text>
          </Pressable>
          <Text style={[styles.readinessHint, { fontSize: 10 * scale }]}>No glasses</Text>
          <Text style={[styles.readinessHint, { fontSize: 10 * scale }]}>Hair back</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={isCapturing ? 'Capturing photo' : cameraReady ? 'Capture photo' : 'Camera starting'} accessibilityState={{ disabled: isCapturing || !cameraReady }} onPress={takePhoto} disabled={isCapturing || !cameraReady} style={({ pressed }) => [styles.captureButton, { minHeight: 68 * scale, borderRadius: 36 * scale, marginTop: 8 * scale, opacity: isCapturing || !cameraReady ? 0.65 : pressed ? 0.84 : 1 }]}>
            <Svg width={22 * scale} height={22 * scale} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 8h3l2-3h6l2 3h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /><Circle cx="12" cy="13" r="4" /></Svg>
            <Text style={[styles.captureLabel, { fontSize: 18 * scale }]}>{isCapturing ? 'Capturing…' : cameraError ? 'Camera unavailable' : isSwitchingCamera ? 'Switching camera…' : cameraReady ? 'Capture' : 'Starting camera…'}</Text>
        </Pressable>
        <View style={[styles.captureFooter, { marginTop: 3 * scale }]}>
            <Pressable accessibilityRole="button" onPress={chooseFromGallery} style={({ pressed }) => [styles.galleryLink, pressed && { opacity: 0.7 }]}><Text style={styles.galleryLinkText}>Choose from gallery</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={isSwitchingCamera ? 'Switching camera' : facing === 'front' ? 'Switch to rear camera' : 'Switch to front camera'} accessibilityState={{ disabled: isCapturing || isSwitchingCamera }} disabled={isCapturing || isSwitchingCamera} onPress={flipCamera} style={styles.cameraUtility}><Text style={styles.utilityText}>{isSwitchingCamera ? 'Switching…' : 'Flip camera'}</Text></Pressable>
            {facing === 'back' && <Pressable accessibilityRole="button" onPress={() => setFlash(current => current === 'off' ? 'on' : 'off')} style={styles.cameraUtility}><Text style={styles.utilityText}>{flash === 'off' ? 'Flash off' : 'Flash on'}</Text></Pressable>}
            {cameraError && <Pressable accessibilityRole="button" onPress={() => {
              setCameraError(null);
              setCameraReady(false);
              setIsSwitchingCamera(false);
              setCameraAttempt(current => current + 1);
            }} style={styles.cameraUtility}><Text style={styles.utilityText}>Try again</Text></Pressable>}
        </View>
      </View>

      <Modal visible={showScanInfo} transparent animationType="fade" onRequestClose={() => setShowScanInfo(false)}>
        <View style={styles.infoBackdrop}>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>A thoughtful skin snapshot</Text>
            <Text style={styles.infoCopy}>Choose a front view or a side profile. The oval is only a positioning guide; SkinSnap does not detect faces. Nothing is analyzed until you preview your photo, give consent, and request an authorized analysis.</Text>
            <Pressable accessibilityRole="button" onPress={() => setShowScanInfo(false)} style={styles.infoDismiss}><Text style={styles.infoDismissText}>Got it</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0A' },
  permissionCard: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', flex: 1 },
  permissionEyebrow: { color: '#D4B896', fontFamily: 'InterSemibold', letterSpacing: 2, textTransform: 'uppercase' },
  permissionTitle: { color: '#F6F5F8', fontFamily: 'InterExtraBold', textAlign: 'center' },
  permissionText: { color: '#B9B4B5', fontFamily: 'InterRegular', textAlign: 'center', marginTop: 12 },
  permissionButton: { width: '100%', marginTop: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8C9A0' },
  permissionButtonText: { color: '#181613', fontFamily: 'InterExtraBold' },
  permissionSecondary: { paddingVertical: 8 },
  permissionSecondaryText: { color: '#C8C1C0', fontFamily: 'InterMedium' },
  iconButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11, 12, 15, 0.45)', borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderRadius: 21 },
  cameraCenter: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  faceGuide: { backgroundColor: 'transparent', borderColor: '#A77BEB', borderStyle: 'dashed' },
  cameraErrorCard: { alignItems: 'center', gap: 6, backgroundColor: 'rgba(10,10,10,0.82)', borderWidth: 1, borderColor: '#2A2A2C' },
  cameraErrorTitle: { color: '#FFFFFF', fontFamily: 'InterExtraBold', textAlign: 'center' },
  cameraErrorText: { color: '#D0D0D0', fontFamily: 'InterRegular', textAlign: 'center' },
  cameraFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 3, alignItems: 'stretch', paddingTop: 9, backgroundColor: 'rgba(10,10,10,0.82)' },
  helperText: { color: '#FFFFFF', fontFamily: 'InterExtraBold', textAlign: 'center', paddingHorizontal: 12 },
  scanHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(10,10,10,0.46)', borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  scanHeaderSide: { alignItems: 'center', justifyContent: 'center' },
  scanHeaderTitle: { flex: 1, alignItems: 'flex-start', paddingLeft: 8 },
  scanBrand: { color: '#FFFFFF', fontFamily: 'InterExtraBold' },
  scanStep: { color: '#A8A3A5', fontFamily: 'InterRegular', marginTop: 1 },
  infoGlyph: { color: '#AAA5A7', fontSize: 19, fontFamily: 'InterSemibold', borderWidth: 1.5, borderColor: '#777174', width: 22, height: 22, textAlign: 'center', borderRadius: 12, lineHeight: 21 },
  readinessChips: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  captureViews: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  captureViewOption: { justifyContent: 'center', alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: '#3B3734', backgroundColor: '#171719' },
  captureViewOptionSelected: { borderColor: '#D4B896', backgroundColor: 'rgba(212,184,150,0.16)' },
  captureViewText: { color: '#B9B4B5', fontFamily: 'InterMedium' },
  captureViewTextSelected: { color: '#E8C9A0', fontFamily: 'InterSemibold' },
  readinessChip: { justifyContent: 'center', borderRadius: 18, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C' },
  readinessChipSelected: { backgroundColor: '#263126', borderColor: '#6F936D' },
  readinessChipText: { color: '#B8B8B8', fontFamily: 'InterSemibold' },
  readinessChipTextSelected: { color: '#A9D3A5' },
  readinessHint: { color: '#A9A4A6', fontFamily: 'InterMedium' },
  captureButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#8D58D6' },
  captureLabel: { color: '#FFFFFF', fontFamily: 'InterSemibold' },
  captureFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  galleryLink: { paddingVertical: 5, paddingRight: 8 },
  galleryLinkText: { color: '#E8C9A0', fontFamily: 'InterMedium', fontSize: 11 },
  cameraUtility: { paddingHorizontal: 5, paddingVertical: 5 },
  utilityText: { color: '#A9A4A6', fontFamily: 'InterRegular', fontSize: 10 },
  infoBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.78)', padding: 24 },
  infoCard: { width: '100%', maxWidth: 380, borderRadius: 22, padding: 22, backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#393437', gap: 14 },
  infoTitle: { color: '#FFFFFF', fontSize: 20, fontFamily: 'InterSemibold' },
  infoCopy: { color: '#C7C1C4', fontSize: 14, lineHeight: 21, fontFamily: 'InterRegular' },
  infoDismiss: { minHeight: 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8C9A0' },
  infoDismissText: { color: '#181613', fontFamily: 'InterSemibold' },
  previewSafeArea: { flex: 1 },
  previewScroll: { flex: 1 },
  previewScreen: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 20, paddingTop: 12 },
  previewContent: { gap: 16 },
  previewHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewBack: { width: 48, height: 48, flexShrink: 0 },
  previewHeadline: { flex: 1, color: '#F7F5F9', fontFamily: 'InterExtraBold', textAlign: 'center', fontSize: 24, lineHeight: 31 },
  previewCard: { overflow: 'hidden', backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#3C3835', borderRadius: 24 },
  previewImage: { width: '100%', backgroundColor: '#1A1A1D' },
  previewTips: { backgroundColor: '#1A1A1C', borderWidth: 1, borderColor: '#2A2A2C', borderRadius: 18, padding: 16 },
  previewTipsTitle: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 15, lineHeight: 21 },
  previewTipsBody: { color: '#C4BDBD', fontFamily: 'InterRegular', marginTop: 4, fontSize: 13, lineHeight: 20 },
  consentRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 56, paddingVertical: 8 },
  checkbox: { width: 28, height: 28, marginTop: 2, flexShrink: 0, borderRadius: 7, borderWidth: 1.5, borderColor: '#777174', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  checkboxActive: { backgroundColor: '#E8C9A0', borderColor: '#E8C9A0' },
  checkmark: { color: '#06070A', fontFamily: 'InterExtraBold', fontSize: 12 },
  consentText: { color: '#C8C1C0', fontFamily: 'InterRegular', flex: 1, fontSize: 14, lineHeight: 21 },
  privacyLinks: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -8 },
  consentVersion: { color: '#AAA4AF', fontFamily: 'InterRegular', fontSize: 11 },
  privacyLink: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 12, textDecorationLine: 'underline' },
  previewActions: { width: '100%', alignItems: 'stretch', gap: 10 },
  primaryButton: { position: 'relative', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 56, borderRadius: 28, paddingHorizontal: 16, paddingVertical: 14 },
  primaryButtonText: { color: '#181613', fontFamily: 'InterExtraBold', zIndex: 1, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  secondaryButton: { backgroundColor: '#1A1A1C', borderColor: '#3A3735', borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12 },
  secondaryButtonText: { color: '#E8C9A0', fontFamily: 'InterSemibold', fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
