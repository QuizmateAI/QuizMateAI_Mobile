import React from 'react';
import {View, Text, Image, StyleSheet} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {Spacing, BorderRadius} from '../../theme/spacing';

export default function ContentRenderer({blocks}: {blocks: any[]}) {
  const {colors} = useTheme();
  if (!Array.isArray(blocks) || blocks.length === 0) return null;

  return (
    <View style={{gap: Spacing.sm}}>
      {blocks.map((b: any, i: number) => {
        if (b.type === 'image' && b.url) {
          return (
            <Image
              key={`img-${i}`}
              source={{uri: b.url}}
              style={styles.image}
              resizeMode="contain"
            />
          );
        }

        return (
          <Text key={`txt-${i}`} style={[styles.text, {color: colors.text}]}>
            {b.value}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 220,
    borderRadius: BorderRadius.md,
    backgroundColor: '#00000010',
  },
  text: {fontSize: 14, lineHeight: 20},
});
