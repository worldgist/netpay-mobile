import { Image } from 'react-native';

const PURCHASE_LOGOS = [
  require('@/assets/images/IKEDC.png'),
  require('@/assets/images/EKEDC.png'),
  require('@/assets/images/AEDC.png'),
  require('@/assets/images/KAEDCO.png'),
  require('@/assets/images/IBEDC.png'),
  require('@/assets/images/KEDCO.png'),
  require('@/assets/images/PHEDC.png'),
  require('@/assets/images/JED.png'),
  require('@/assets/images/BEDC.png'),
  require('@/assets/images/YEDC.png'),
  require('@/assets/images/EEDC.png'),
  require('@/assets/images/dstv.png'),
  require('@/assets/images/gotv.png'),
  require('@/assets/images/startimes.png'),
];

let started = false;

export function prefetchPurchaseLogos() {
  if (started) return;
  started = true;
  const resolve = Image.resolveAssetSource;
  if (typeof resolve !== 'function') return;
  try {
    for (const source of PURCHASE_LOGOS) {
      const resolved = resolve(source);
      if (resolved?.uri) {
        void Image.prefetch(resolved.uri);
      }
    }
  } catch {
    // Bundled logos still render directly. Prefetch is only a warm-up.
  }
}
