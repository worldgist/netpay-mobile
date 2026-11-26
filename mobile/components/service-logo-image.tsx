import { useEffect, useState } from 'react';
import { StyleSheet, type ImageSourcePropType, type StyleProp, type ImageStyle } from 'react-native';
import { Image } from 'expo-image';

type ServiceLogoImageProps = {
  source?: ImageSourcePropType | null;
  fallback?: ImageSourcePropType | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
};

function isRemoteSource(source?: ImageSourcePropType | null): boolean {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false;
  return typeof (source as { uri?: string }).uri === 'string';
}

/**
 * Renders a service/network logo and falls back to a local asset if a remote URI fails.
 * Prevents logos flashing then disappearing when admin CDN URLs 404/CORS-fail.
 */
export function ServiceLogoImage({
  source,
  fallback,
  style,
  contentFit = 'contain',
}: ServiceLogoImageProps) {
  const [failed, setFailed] = useState(false);
  const remote = isRemoteSource(source);
  const active = failed && fallback ? fallback : source || fallback;

  useEffect(() => {
    setFailed(false);
  }, [source]);

  if (!active) return null;

  return (
    <Image
      source={active}
      style={[styles.image, style]}
      contentFit={contentFit}
      onError={() => {
        if (remote && fallback) setFailed(true);
      }}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
  },
});
