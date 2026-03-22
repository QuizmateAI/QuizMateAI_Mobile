import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, TextInput} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import Badge from '../ui/Badge';
import {BorderRadius, Spacing} from '../../theme/spacing';

interface Answer {
  id: number;
  content: string;
  isCorrect?: boolean;
}

interface QuestionCardProps {
  index: number;
  question: string;
  answers: Answer[];
  questionTypeId?: number;
  questionType?: string;
  selectedAnswerId?: number | null;
  onSelectAnswer?: (answerId: number) => void;
  textAnswer?: string;
  onChangeTextAnswer?: (text: string) => void;
  showResult?: boolean;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  explanation?: string;
  isMultiChoice?: boolean;
  selectedAnswerIds?: number[];
  onToggleAnswer?: (answerId: number) => void;
}

export default function QuestionCard({
  index,
  question,
  answers,
  questionTypeId,
  questionType,
  selectedAnswerId,
  onSelectAnswer,
  textAnswer,
  onChangeTextAnswer,
  showResult = false,
  difficulty,
  explanation,
  isMultiChoice = false,
  selectedAnswerIds = [],
  onToggleAnswer,
}: QuestionCardProps) {
  const {isDark, colors} = useTheme();

  const normalizedType = String(questionType || '').toUpperCase();
  const isTextAnswerQuestion =
    normalizedType === 'SHORT_ANSWER' ||
    normalizedType === 'FILL_IN_BLANK' ||
    questionTypeId === 3 ||
    questionTypeId === 5;

  const correctTextAnswer =
    answers.find(answer => answer.isCorrect)?.content || '';

  const getDifficultyVariant = () => {
    switch (difficulty) {
      case 'EASY': return 'success' as const;
      case 'MEDIUM': return 'warning' as const;
      case 'HARD': return 'error' as const;
      default: return 'default' as const;
    }
  };

  const getAnswerStyle = (answer: Answer) => {
    const isSelected = isMultiChoice
      ? selectedAnswerIds.includes(answer.id)
      : selectedAnswerId === answer.id;

    if (showResult) {
      if (answer.isCorrect) {
        return {
          bg: isDark ? 'rgba(16,185,129,0.1)' : '#F0FDF4',
          border: isDark ? '#34D399' : '#10B981',
          text: isDark ? '#34D399' : '#059669',
          icon: 'check-circle' as const,
        };
      }
      if (isSelected && !answer.isCorrect) {
        return {
          bg: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2',
          border: isDark ? '#F87171' : '#EF4444',
          text: isDark ? '#F87171' : '#DC2626',
          icon: 'close-circle' as const,
        };
      }
    }

    if (isSelected) {
      return {
        bg: isDark ? 'rgba(37,99,235,0.1)' : '#EFF6FF',
        border: isDark ? '#60A5FA' : Colors.primary,
        text: isDark ? '#60A5FA' : '#1D4ED8',
        icon: isMultiChoice ? 'checkbox-marked' as const : 'radiobox-marked' as const,
      };
    }

    return {
      bg: 'transparent',
      border: colors.border,
      text: colors.text,
      icon: isMultiChoice ? 'checkbox-blank-outline' as const : 'radiobox-blank' as const,
    };
  };

  const handlePress = (answerId: number) => {
    if (showResult) {
      return;
    }
    if (isMultiChoice && onToggleAnswer) {
      onToggleAnswer(answerId);
    } else if (onSelectAnswer) {
      onSelectAnswer(answerId);
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: isDark ? colors.shadow : '#0F172A',
        },
      ]}>
      <View style={styles.header}>
        <View style={styles.questionInfo}>
          <Text style={[styles.questionNumber, {color: colors.textTertiary}]}>
            Question {index + 1}
          </Text>
          {difficulty && (
            <Badge
              label={difficulty}
              variant={getDifficultyVariant()}
              size="sm"
            />
          )}
        </View>
      </View>

      <Text style={[styles.questionText, {color: colors.heading}]}>
        {question}
      </Text>

      {isTextAnswerQuestion ? (
        <View style={styles.textAnswerWrap}>
          <Text style={[styles.textAnswerLabel, {color: colors.textSecondary}]}>
            {showResult ? 'Your answer' : 'Enter your answer'}
          </Text>
          <TextInput
            value={textAnswer || ''}
            onChangeText={onChangeTextAnswer}
            editable={!showResult}
            multiline
            placeholder="Type your answer..."
            placeholderTextColor={colors.placeholder}
            style={[
              styles.textAnswerInput,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: isDark ? Colors.dark.surfaceVariant : '#F8FAFC',
              },
            ]}
          />

          {showResult && (
            <View
              style={[
                styles.correctAnswerBox,
                {
                  borderColor: isDark ? '#065F46' : '#10B981',
                  backgroundColor: isDark ? 'rgba(16,185,129,0.1)' : '#ECFDF5',
                },
              ]}>
              <Text style={[styles.correctAnswerLabel, {color: isDark ? '#34D399' : '#059669'}]}>
                Expected answer
              </Text>
              <Text style={[styles.correctAnswerText, {color: isDark ? '#34D399' : '#047857'}]}>
                {correctTextAnswer || 'No reference answer provided'}
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.answers}>
          {answers.map(answer => {
            const style = getAnswerStyle(answer);
            return (
              <TouchableOpacity
                key={answer.id}
                onPress={() => handlePress(answer.id)}
                activeOpacity={showResult ? 1 : 0.7}
                style={[
                  styles.answerOption,
                  {
                    backgroundColor: style.bg,
                    borderColor: style.border,
                  },
                ]}>
                <Icon name={style.icon} size={20} color={style.border} />
                <Text
                  style={[styles.answerText, {color: style.text}]}
                  numberOfLines={3}>
                  {answer.content}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {showResult && explanation && (
        <View
          style={[
            styles.explanation,
            {backgroundColor: isDark ? Colors.dark.surfaceVariant : '#F8FAFC'},
          ]}>
          <Text style={[styles.explanationLabel, {color: colors.textSecondary}]}>
            Explanation
          </Text>
          <Text style={[styles.explanationText, {color: colors.text}]}>
            {explanation}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: Spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  questionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  questionNumber: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  questionText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: Spacing.base,
  },
  answers: {
    gap: Spacing.sm,
  },
  answerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: 10,
  },
  answerText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    lineHeight: 20,
  },
  textAnswerWrap: {
    gap: Spacing.xs,
  },
  textAnswerLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  textAnswerInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    minHeight: 88,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
  },
  correctAnswerBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  correctAnswerLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  correctAnswerText: {
    fontSize: 13,
    lineHeight: 19,
  },
  explanation: {
    marginTop: Spacing.base,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  explanationLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  explanationText: {
    fontSize: 13,
    lineHeight: 20,
  },
});
