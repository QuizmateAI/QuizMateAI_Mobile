import React from 'react';
import {View, Text, Image, StyleSheet} from 'react-native';
import {Colors} from '../../theme/colors';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
}

export default function Avatar({uri, name = '', size = 40}: AvatarProps) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (uri) {
    return (
      <Image
        source={{uri}}
        style={[
          styles.avatar,
          {width: size, height: size, borderRadius: size / 2},
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: Colors.primary,
        },
      ]}>
      <Text style={[styles.initials, {fontSize: size * 0.38}]}>
        {initials || '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    resizeMode: 'cover',
  },
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
