import React, {useMemo, useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';

export interface MatchingPair {
  leftKey: string;
  rightKey: string;
}

interface MatchingQuestionProps {
  leftItems: string[];
  rightItems: string[];
  matchedPairs: MatchingPair[];
  onPairChange?: (pairs: MatchingPair[]) => void;
  disabled?: boolean;
  showResult?: boolean;
  correctPairs?: MatchingPair[];
}

function shuffleOnce<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function MatchingQuestion({
  leftItems,
  rightItems,
  matchedPairs,
  onPairChange,
  disabled = false,
  showResult = false,
  correctPairs = [],
}: MatchingQuestionProps) {
  const {isDark, colors} = useTheme();
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const matchedByLeft = useMemo(
    () => new Map((matchedPairs || []).map(p => [p.leftKey, p.rightKey])),
    [matchedPairs],
  );

  const matchedRightKeys = useMemo(
    () => new Set([...matchedByLeft.values()]),
    [matchedByLeft],
  );

  const correctByLeft = useMemo(
    () => new Map((correctPairs || []).map(p => [p.leftKey, p.rightKey])),
    [correctPairs],
  );

  const shuffledRight = useMemo(
    () => shuffleOnce(rightItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rightItems.join('|')],
  );

  const handleLeftPress = (leftKey: string) => {
    if (disabled || showResult) return;

    // If this left already has a match, remove it
    if (matchedByLeft.has(leftKey)) {
      const next = (matchedPairs || []).filter(p => p.leftKey !== leftKey);
      onPairChange?.(next);
      setSelectedLeft(null);
      return;
    }

    // Toggle selection
    setSelectedLeft(prev => (prev === leftKey ? null : leftKey));
  };

  const handleRightPress = (rightKey: string) => {
    if (disabled || showResult) return;

    // If this right is already matched, remove that pair
    if (matchedRightKeys.has(rightKey)) {
      const next = (matchedPairs || []).filter(p => p.rightKey !== rightKey);
      onPairChange?.(next);
      setSelectedLeft(null);
      return;
    }

    // If no left is selected, ignore
    if (!selectedLeft) return;

    // Create the pair
    const next = [
      ...(matchedPairs || []).filter(p => p.leftKey !== selectedLeft),
      {leftKey: selectedLeft, rightKey},
    ];
    onPairChange?.(next);
    setSelectedLeft(null);
  };

  const getPairResult = (leftKey: string) => {
    if (!showResult) return null;
    const userRight = matchedByLeft.get(leftKey);
    const correctRight = correctByLeft.get(leftKey);
    if (!userRight) return 'unanswered';
    return userRight === correctRight ? 'correct' : 'incorrect';
  };

  const getLeftStyle = (leftKey: string) => {
    const isSelected = selectedLeft === leftKey;
    const isMatched = matchedByLeft.has(leftKey);
    const result = getPairResult(leftKey);

    if (result === 'correct') {
      return {
        bg: isDark ? 'rgba(16,185,129,0.12)' : '#F0FDF4',
        border: isDark ? '#34D399' : '#10B981',
        text: isDark ? '#34D399' : '#059669',
      };
    }
    if (result === 'incorrect') {
      return {
        bg: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
        border: isDark ? '#F87171' : '#EF4444',
        text: isDark ? '#F87171' : '#DC2626',
      };
    }

    if (isMatched) {
      return {
        bg: isDark ? 'rgba(37,99,235,0.12)' : '#EFF6FF',
        border: isDark ? '#60A5FA' : Colors.primary,
        text: isDark ? '#60A5FA' : '#1D4ED8',
      };
    }
    if (isSelected) {
      return {
        bg: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB',
        border: isDark ? '#FBBF24' : '#F59E0B',
        text: isDark ? '#FBBF24' : '#D97706',
      };
    }

    return {
      bg: 'transparent',
      border: colors.border,
      text: colors.text,
    };
  };

  const getRightStyle = (rightKey: string) => {
    const isMatched = matchedRightKeys.has(rightKey);
    const hasSelectedLeft = selectedLeft !== null && !matchedByLeft.has(selectedLeft);

    if (showResult) {
      // Find which left this right was matched to
      const matchedLeft = [...matchedByLeft.entries()].find(
        ([, v]) => v === rightKey,
      )?.[0];
      if (matchedLeft) {
        const result = getPairResult(matchedLeft);
        if (result === 'correct') {
          return {
            bg: isDark ? 'rgba(16,185,129,0.12)' : '#F0FDF4',
            border: isDark ? '#34D399' : '#10B981',
            text: isDark ? '#34D399' : '#059669',
          };
        }
        if (result === 'incorrect') {
          return {
            bg: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
            border: isDark ? '#F87171' : '#EF4444',
            text: isDark ? '#F87171' : '#DC2626',
          };
        }
      }
      return {
        bg: 'transparent',
        border: colors.border,
        text: colors.text,
      };
    }

    if (isMatched) {
      return {
        bg: isDark ? 'rgba(37,99,235,0.12)' : '#EFF6FF',
        border: isDark ? '#60A5FA' : Colors.primary,
        text: isDark ? '#60A5FA' : '#1D4ED8',
      };
    }

    if (hasSelectedLeft) {
      return {
        bg: 'transparent',
        border: isDark ? '#FBBF24' : '#F59E0B',
        text: colors.text,
      };
    }

    return {
      bg: 'transparent',
      border: colors.border,
      text: colors.text,
    };
  };

  const getMatchIndex = (leftKey: string) => {
    const rightKey = matchedByLeft.get(leftKey);
    if (!rightKey) return null;
    return shuffledRight.indexOf(rightKey);
  };

  const allMatched =
    !showResult &&
    !disabled &&
    leftItems.length > 0 &&
    leftItems.every(lk => matchedByLeft.has(lk));

  return (
    <View style={styles.container}>
      {!showResult && !disabled && (
        <View
          style={[
            styles.hintBox,
            {
              backgroundColor: isDark ? 'rgba(37,99,235,0.12)' : '#EFF6FF',
              borderColor: isDark ? 'rgba(96,165,250,0.25)' : '#BFDBFE',
            },
          ]}>
          <Icon name="gesture-tap" size={16} color={Colors.primary} />
          <Text
            style={[
              styles.hintText,
              {color: isDark ? '#BFDBFE' : '#1D4ED8'},
            ]}>
            Chọn 1 mục bên trái, rồi chọn mục tương ứng bên phải để ghép đôi.
            Chạm lại để bỏ ghép.
          </Text>
        </View>
      )}

      <View style={styles.matchingArea}>
        {/* Left column */}
        <View style={styles.column}>
          <Text style={[styles.columnLabel, {color: colors.textTertiary}]}>
            Câu hỏi
          </Text>
          {leftItems.map((leftKey, idx) => {
            const style = getLeftStyle(leftKey);
            const matchIdx = getMatchIndex(leftKey);
            const result = getPairResult(leftKey);

            return (
              <TouchableOpacity
                key={leftKey}
                onPress={() => handleLeftPress(leftKey)}
                activeOpacity={disabled || showResult ? 1 : 0.7}
                style={[
                  styles.item,
                  {
                    backgroundColor: style.bg,
                    borderColor: style.border,
                  },
                ]}>
                <View style={styles.itemRow}>
                  <View
                    style={[
                      styles.indexBadge,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255,255,255,0.1)'
                          : '#F1F5F9',
                      },
                    ]}>
                    <Text
                      style={[
                        styles.indexText,
                        {color: colors.textSecondary},
                      ]}>
                      {idx + 1}
                    </Text>
                  </View>
                  <Text
                    style={[styles.itemText, {color: style.text}]}
                    numberOfLines={3}>
                    {leftKey}
                  </Text>
                </View>
                {matchIdx !== null && !showResult && (
                  <View style={styles.matchBadgeRow}>
                    <Icon name="link-variant" size={12} color={style.border} />
                    <Text style={[styles.matchBadgeText, {color: style.text}]}>
                      → {String.fromCharCode(65 + matchIdx)}
                    </Text>
                  </View>
                )}
                {showResult && result === 'correct' && (
                  <Icon
                    name="check-circle"
                    size={16}
                    color={isDark ? '#34D399' : '#10B981'}
                    style={styles.resultIcon}
                  />
                )}
                {showResult && result === 'incorrect' && (
                  <Icon
                    name="close-circle"
                    size={16}
                    color={isDark ? '#F87171' : '#EF4444'}
                    style={styles.resultIcon}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Arrow column */}
        <View style={styles.arrowColumn}>
          <Text style={[styles.columnLabel, {color: 'transparent'}]}>{'·'}</Text>
          {leftItems.map(leftKey => (
            <View key={leftKey} style={styles.arrowCell}>
              <Icon
                name="arrow-right"
                size={16}
                color={
                  matchedByLeft.has(leftKey)
                    ? Colors.primary
                    : colors.textTertiary
                }
              />
            </View>
          ))}
        </View>

        {/* Right column */}
        <View style={styles.column}>
          <Text style={[styles.columnLabel, {color: colors.textTertiary}]}>
            Đáp án
          </Text>
          {shuffledRight.map((rightKey, idx) => {
            const style = getRightStyle(rightKey);
            const isMatched = matchedRightKeys.has(rightKey);

            return (
              <TouchableOpacity
                key={rightKey}
                onPress={() => handleRightPress(rightKey)}
                activeOpacity={disabled || showResult ? 1 : 0.7}
                style={[
                  styles.item,
                  {
                    backgroundColor: style.bg,
                    borderColor: style.border,
                    opacity: isMatched && !showResult ? 0.6 : 1,
                  },
                ]}>
                <View style={styles.itemRow}>
                  <View
                    style={[
                      styles.indexBadge,
                      {
                        backgroundColor: isDark
                          ? 'rgba(255,255,255,0.1)'
                          : '#F1F5F9',
                      },
                    ]}>
                    <Text
                      style={[
                        styles.indexText,
                        {color: colors.textSecondary},
                      ]}>
                      {String.fromCharCode(65 + idx)}
                    </Text>
                  </View>
                  <Text
                    style={[styles.itemText, {color: style.text}]}
                    numberOfLines={3}>
                    {rightKey}
                  </Text>
                </View>
                {isMatched && !showResult && (
                  <Icon name="link-variant" size={12} color={style.border} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Show correct pairs when result is wrong */}
      {showResult && correctPairs.length > 0 && (
        <View
          style={[
            styles.correctBox,
            {
              borderColor: isDark ? '#065F46' : '#10B981',
              backgroundColor: isDark ? 'rgba(16,185,129,0.1)' : '#ECFDF5',
            },
          ]}>
          <Text
            style={[
              styles.correctLabel,
              {color: isDark ? '#34D399' : '#059669'},
            ]}>
            Đáp án đúng
          </Text>
          {correctPairs.map(pair => (
            <Text
              key={pair.leftKey}
              style={[
                styles.correctPairText,
                {color: isDark ? '#34D399' : '#047857'},
              ]}>
              {pair.leftKey} → {pair.rightKey}
            </Text>
          ))}
        </View>
      )}

      {allMatched && (
        <Text
          style={[
            styles.allMatchedText,
            {color: isDark ? '#34D399' : '#059669'},
          ]}>
          Tất cả đã được ghép đôi!
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  hintText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 18,
  },
  matchingArea: {
    flexDirection: 'row',
    gap: 4,
  },
  column: {
    flex: 1,
    gap: Spacing.sm,
  },
  arrowColumn: {
    width: 24,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  arrowCell: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  columnLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  item: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 52,
    justifyContent: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  indexBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexText: {
    fontSize: 10,
    fontWeight: '700',
  },
  itemText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  matchBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    paddingLeft: 26,
  },
  matchBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  resultIcon: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  correctBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  correctLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  correctPairText: {
    fontSize: 12,
    lineHeight: 18,
  },
  allMatchedText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
