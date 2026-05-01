import React, {useEffect, useMemo, useRef} from 'react';
import {View, StyleSheet, Animated, Dimensions} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

const ICON_NAMES = [
  'star-outline',
  'book-open-page-variant',
  'brain',
  'lightbulb-outline',
  'school',
  'target',
  'rocket',
  'chip',
  'atom',
  'earth',
];

const COUNT = 25;

function seededFraction(index: number, salt: number) {
  const seed = Math.sin((index + 1) * (salt + 1) * 12.9898) * 43758.5453;
  return seed - Math.floor(seed);
}

export default function WelcomeBackground({isDark = false}: {isDark?: boolean}) {
  const drops = useMemo(() => {
    return Array.from({length: COUNT}).map((_, index) => {
      const icon = ICON_NAMES[index % ICON_NAMES.length] || 'rocket';
      const durationMs = 15000 + seededFraction(index, 2) * 20000;
      const initialProgress = seededFraction(index, 1);

      return {
        id: index,
        icon,
        left: 10 + seededFraction(index, 0) * 120,
        size: Math.round(24 + seededFraction(index, 3) * 36),
        durationMs: Math.round(durationMs),
        initialProgress,
      };
    });
  }, []);

  return (
    <View pointerEvents="none" style={styles.container}>
      {drops.map(drop => (
        <AnimatedDrop
          key={drop.id}
          left={drop.left}
          size={drop.size}
          durationMs={drop.durationMs}
          initialProgress={drop.initialProgress}
          name={drop.icon}
          isDark={isDark}
        />
      ))}
    </View>
  );
}

function AnimatedDrop({
  left,
  size,
  durationMs,
  initialProgress,
  name,
  isDark,
}: {
  left: number;
  size: number;
  durationMs: number;
  initialProgress: number;
  name: string;
  isDark: boolean;
}) {
  const progress = useRef(new Animated.Value(initialProgress)).current;

  useEffect(() => {
    let loopAnimation: Animated.CompositeAnimation | null = null;
    progress.setValue(initialProgress);

    const continueDuration = Math.max(
      1,
      Math.round(durationMs * (1 - initialProgress)),
    );

    const startLoop = () => {
      progress.setValue(0);
      loopAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(progress, {
            toValue: 1,
            duration: durationMs,
            useNativeDriver: true,
          }),
          Animated.timing(progress, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      loopAnimation.start();
    };

    const initialAnimation = Animated.timing(progress, {
      toValue: 1,
      duration: continueDuration,
      useNativeDriver: true,
    });

    initialAnimation.start(({finished}) => {
      if (finished) {
        startLoop();
      }
    });

    return () => {
      initialAnimation.stop();
      loopAnimation?.stop();
    };
  }, [durationMs, initialProgress, progress]);

  const opacity = progress.interpolate({
    inputRange: [0, 0.1, 0.8, 1],
    outputRange: [0, isDark ? 0.4 : 0.85, isDark ? 0.4 : 0.85, 0],
  });

  const animatedStyle = {
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [-100, SCREEN_HEIGHT * 1.2],
        }),
      },
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -SCREEN_WIDTH * 0.4],
        }),
      },
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        }),
      },
    ],
    position: 'absolute' as const,
    left: `${left}%`,
    top: '-10%',
    zIndex: 0,
    opacity,
  };

  return (
    <Animated.View style={animatedStyle}>
      <Icon
        name={name}
        size={size}
        color={isDark ? '#334155' : '#E2E8F0'}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
  },
});
