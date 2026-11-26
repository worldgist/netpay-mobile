import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';

export type Social3DVariant = 'x' | 'instagram' | 'facebook' | 'whatsapp' | 'email';

type SocialConfig = {
  face: string;
  shadow: string;
  iconColor: string;
  faIcon?: ComponentProps<typeof FontAwesome5>['name'];
  materialIcon?: ComponentProps<typeof MaterialIcons>['name'];
};

const SOCIAL: Record<Social3DVariant, SocialConfig> = {
  x: {
    face: '#111827',
    shadow: '#030712',
    iconColor: '#FFFFFF',
    faIcon: 'twitter',
  },
  instagram: {
    face: '#E1306C',
    shadow: '#C13584',
    iconColor: '#FFFFFF',
    faIcon: 'instagram',
  },
  facebook: {
    face: '#1877F2',
    shadow: '#0D65D9',
    iconColor: '#FFFFFF',
    faIcon: 'facebook-f',
  },
  whatsapp: {
    face: '#25D366',
    shadow: '#1DA851',
    iconColor: '#FFFFFF',
    faIcon: 'whatsapp',
  },
  email: {
    face: '#FF7F00',
    shadow: '#CC6200',
    iconColor: '#FFFFFF',
    materialIcon: 'mail-outline',
  },
};

type Social3DIconProps = {
  variant: Social3DVariant;
  size?: number;
};

export function Social3DIcon({ variant, size = 28 }: Social3DIconProps) {
  const config = SOCIAL[variant];
  const depth = Math.max(3, Math.round(size * 0.14));
  const borderRadius = Math.round(size * 0.28);
  const iconSize = Math.round(size * 0.46);

  return (
    <View style={[styles.wrap, { width: size + depth, height: size + depth }]}>
      <View
        style={[
          styles.shadow,
          {
            width: size,
            height: size,
            borderRadius,
            backgroundColor: config.shadow,
            top: depth,
            left: depth,
          },
        ]}
      />
      <View
        style={[
          styles.face,
          {
            width: size,
            height: size,
            borderRadius,
            backgroundColor: config.face,
          },
        ]}>
        <View style={[styles.highlight, { borderRadius }]} />
        {config.faIcon ? (
          <FontAwesome5 name={config.faIcon} size={iconSize} color={config.iconColor} />
        ) : (
          <MaterialIcons name={config.materialIcon!} size={iconSize} color={config.iconColor} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  shadow: {
    position: 'absolute',
  },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
    backgroundColor: '#FFFFFF',
    opacity: 0.2,
  },
});
