import { useEffect, useRef, useMemo } from 'react';
import { StyleSheet, View, Animated, Easing, useWindowDimensions, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';

const LOGO = require('@/assets/images/logo.png');

export type NetpayLoadingAnimationProps = {
  /**
   * Outer ring diameter in dp.
   * Omit to match reference layout: ~28% of screen width (capped for large devices).
   */
  size?: number;
  /** Optional caption under the ring */
  message?: string;
  /** Ring stroke width (defaults scale with size) */
  strokeWidth?: number;
  /** `onBrand` — light ring for use on orange / dark buttons */
  variant?: 'default' | 'onBrand';
  style?: ViewStyle;
};

/**
 * NetPay logo centered with a smooth infinite rotating progress ring.
 * Default size follows a full-screen loader layout: ring ≈ 28% of window width, logo ≈ 45% of ring.
 */
export function NetpayLoadingAnimation({
  size: sizeProp,
  message,
  strokeWidth,
  variant = 'default',
  style,
}: NetpayLoadingAnimationProps) {
  const { width: windowWidth } = useWindowDimensions();

  const size = useMemo(() => {
    if (sizeProp != null && sizeProp > 0) return sizeProp;
    // Reference: ring diameter ~25–30% of screen width
    return Math.round(Math.min(360, Math.max(104, windowWidth * 0.28)));
  }, [sizeProp, windowWidth]);

  const spin = useRef(new Animated.Value(0)).current;
  const border = strokeWidth ?? Math.max(4, Math.round(size * 0.05));
  const logoSize = Math.round(size * 0.45);
  const onBrand = variant === 'onBrand';
  const messageFontSize = Math.round(Math.min(24, Math.max(17, size * 0.18)));
  const messageLineHeight = Math.round(messageFontSize * 1.35);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.wrap, style]} accessibilityRole="progressbar" accessibilityLabel={message || 'Loading'}>
      <View style={[styles.ringBox, { width: size, height: size }]}>
        <View
          pointerEvents="none"
          style={[
            styles.track,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: border,
              borderColor: onBrand ? 'rgba(255,255,255,0.35)' : '#E8ECF0',
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.arc,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: border,
              borderColor: 'transparent',
              borderTopColor: onBrand ? '#fff' : '#FF7F00',
              borderRightColor: onBrand ? 'rgba(255,255,255,0.85)' : '#FFB04D',
              transform: [{ rotate }],
            },
          ]}
        />
        <Image
          source={LOGO}
          style={{ width: logoSize, height: logoSize, zIndex: 2 }}
          contentFit="contain"
        />
      </View>
      {message ? (
        <ThemedText
          style={[
            styles.message,
            {
              fontSize: messageFontSize,
              lineHeight: messageLineHeight,
              marginTop: Math.round(size * 0.2),
            },
          ]}
          numberOfLines={2}
        >
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    zIndex: 0,
  },
  arc: {
    position: 'absolute',
    zIndex: 1,
  },
  message: {
    fontWeight: '700',
    color: '#37474F',
    textAlign: 'center',
    paddingHorizontal: 12,
    maxWidth: '92%',
  },
});
