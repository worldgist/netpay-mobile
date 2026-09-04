import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Slide 1: mobile bills · Slide 2: utility bills · Slide 3: lifestyle bills */
export type OnboardingIconVariant = 'mobile-bills' | 'utility-bills' | 'lifestyle-bills';

type TileShape = 'rounded' | 'circle' | 'soft';

type SatelliteConfig = {
  icon: keyof typeof MaterialIcons.glyphMap;
  size: number;
  top: number;
  left: number;
  rotate: string;
  color: string;
  face: string;
  shadow: string;
  shape?: TileShape;
};

type VariantConfig = {
  mainIcon: keyof typeof MaterialIcons.glyphMap;
  mainFace: string;
  mainShadow: string;
  mainShape: TileShape;
  accent: string;
  mainTop: number;
  mainLeft: number;
  floatRange: number;
  satellites: SatelliteConfig[];
};

const BRAND = {
  orange: '#FF7F00',
  orangeDeep: '#CC6200',
  navy: '#1A2B4A',
  navyDeep: '#0F1A2E',
  mint: '#10B981',
  mintDark: '#0D9668',
  sky: '#3B82F6',
  skyDark: '#2563EB',
  violet: '#7C3AED',
  violetDark: '#5B21B6',
  amber: '#F59E0B',
  amberDark: '#D97706',
  rose: '#F43F5E',
  roseDark: '#E11D48',
  cream: '#FFF3E8',
  mintGlow: '#ECFDF5',
  violetGlow: '#F5F3FF',
};

const VARIANTS: Record<OnboardingIconVariant, VariantConfig> = {
  'mobile-bills': {
    mainIcon: 'smartphone',
    mainFace: BRAND.orange,
    mainShadow: BRAND.orangeDeep,
    mainShape: 'rounded',
    accent: BRAND.cream,
    mainTop: 72,
    mainLeft: 58,
    floatRange: 8,
    satellites: [
      {
        icon: 'wifi',
        size: 50,
        top: 6,
        left: 158,
        rotate: '12deg',
        color: '#fff',
        face: BRAND.sky,
        shadow: BRAND.skyDark,
        shape: 'circle',
      },
      {
        icon: 'phone-android',
        size: 46,
        top: 138,
        left: -4,
        rotate: '-10deg',
        color: '#fff',
        face: BRAND.navy,
        shadow: BRAND.navyDeep,
        shape: 'rounded',
      },
      {
        icon: 'signal-cellular-alt',
        size: 44,
        top: 152,
        left: 162,
        rotate: '8deg',
        color: '#fff',
        face: BRAND.mint,
        shadow: BRAND.mintDark,
        shape: 'soft',
      },
    ],
  },
  'utility-bills': {
    mainIcon: 'bolt',
    mainFace: BRAND.amber,
    mainShadow: BRAND.amberDark,
    mainShape: 'circle',
    accent: BRAND.mintGlow,
    mainTop: 64,
    mainLeft: 72,
    floatRange: 10,
    satellites: [
      {
        icon: 'tv',
        size: 54,
        top: 4,
        left: 150,
        rotate: '14deg',
        color: '#fff',
        face: BRAND.violet,
        shadow: BRAND.violetDark,
        shape: 'rounded',
      },
      {
        icon: 'electrical-services',
        size: 48,
        top: 118,
        left: -10,
        rotate: '-12deg',
        color: '#fff',
        face: BRAND.mint,
        shadow: BRAND.mintDark,
        shape: 'circle',
      },
      {
        icon: 'home',
        size: 42,
        top: 160,
        left: 168,
        rotate: '10deg',
        color: '#fff',
        face: BRAND.sky,
        shadow: BRAND.skyDark,
        shape: 'soft',
      },
    ],
  },
  'lifestyle-bills': {
    mainIcon: 'school',
    mainFace: BRAND.navy,
    mainShadow: BRAND.navyDeep,
    mainShape: 'soft',
    accent: BRAND.violetGlow,
    mainTop: 78,
    mainLeft: 48,
    floatRange: 9,
    satellites: [
      {
        icon: 'casino',
        size: 52,
        top: 10,
        left: 164,
        rotate: '16deg',
        color: '#fff',
        face: BRAND.rose,
        shadow: BRAND.roseDark,
        shape: 'circle',
      },
      {
        icon: 'menu-book',
        size: 46,
        top: 132,
        left: 8,
        rotate: '-8deg',
        color: '#fff',
        face: BRAND.orange,
        shadow: BRAND.orangeDeep,
        shape: 'rounded',
      },
      {
        icon: 'sports-esports',
        size: 44,
        top: 158,
        left: 154,
        rotate: '12deg',
        color: '#fff',
        face: BRAND.violet,
        shadow: BRAND.violetDark,
        shape: 'soft',
      },
    ],
  },
};

type Onboarding3DIconProps = {
  variant: OnboardingIconVariant;
  size?: number;
};

function getBorderRadius(shape: TileShape, tileSize: number) {
  if (shape === 'circle') return tileSize / 2;
  if (shape === 'soft') return tileSize * 0.22;
  return tileSize * 0.28;
}

function Tile3D({
  icon,
  tileSize,
  iconSize,
  face,
  shadow,
  iconColor,
  rotate,
  shape = 'rounded',
  style,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  tileSize: number;
  iconSize: number;
  face: string;
  shadow: string;
  iconColor: string;
  rotate?: string;
  shape?: TileShape;
  style?: object;
}) {
  const depth = Math.max(8, Math.round(tileSize * (shape === 'circle' ? 0.1 : 0.12)));
  const borderRadius = getBorderRadius(shape, tileSize);

  return (
    <View style={[styles.tileWrap, { width: tileSize + depth, height: tileSize + depth }, style]}>
      <View
        style={[
          styles.tileShadow,
          {
            width: tileSize,
            height: tileSize,
            borderRadius,
            backgroundColor: shadow,
            top: depth,
            left: depth,
          },
        ]}
      />
      <View
        style={[
          styles.tileFace,
          {
            width: tileSize,
            height: tileSize,
            borderRadius,
            backgroundColor: face,
            transform: rotate ? [{ rotate }] : undefined,
          },
        ]}>
        <View style={[styles.tileHighlight, { borderRadius, opacity: shape === 'circle' ? 0.24 : 0.18 }]} />
        {shape === 'circle' ? <View style={[styles.tileRing, { borderRadius }]} /> : null}
        <MaterialIcons name={icon} size={iconSize} color={iconColor} />
      </View>
    </View>
  );
}

export function Onboarding3DIcon({ variant, size = 220 }: Onboarding3DIconProps) {
  const config = VARIANTS[variant];
  const floatY = useSharedValue(0);

  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-config.floatRange, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [config.floatRange, floatY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));

  const mainTile = Math.round(size * 0.58);
  const mainIcon = Math.round(mainTile * 0.44);

  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <View style={[styles.glow, { backgroundColor: config.accent }]} />
      <Animated.View style={[styles.compose, animatedStyle]}>
        {config.satellites.map((satellite, index) => (
          <Tile3D
            key={`${variant}-${satellite.icon}-${index}`}
            icon={satellite.icon}
            tileSize={satellite.size}
            iconSize={Math.round(satellite.size * 0.46)}
            face={satellite.face}
            shadow={satellite.shadow}
            iconColor={satellite.color}
            rotate={satellite.rotate}
            shape={satellite.shape}
            style={{ position: 'absolute', top: satellite.top, left: satellite.left }}
          />
        ))}
        <View style={[styles.mainTilePosition, { top: config.mainTop, left: config.mainLeft }]}>
          <Tile3D
            icon={config.mainIcon}
            tileSize={mainTile}
            iconSize={mainIcon}
            face={config.mainFace}
            shadow={config.mainShadow}
            iconColor="#FFFFFF"
            shape={config.mainShape}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  glow: {
    position: 'absolute',
    width: '88%',
    height: '88%',
    borderRadius: 999,
    opacity: 0.92,
  },
  compose: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTilePosition: {
    position: 'absolute',
  },
  tileWrap: {
    position: 'relative',
  },
  tileShadow: {
    position: 'absolute',
  },
  tileFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  tileHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
    backgroundColor: '#FFFFFF',
  },
  tileRing: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
