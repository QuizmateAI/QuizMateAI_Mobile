import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, TextInput} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import Badge from '../ui/Badge';
import {BorderRadius, Spacing} from '../../theme/spacing';
import MatchingQuestion, {MatchingPair} from './MatchingQuestion';
import {
  isMatchingQuestion,
  isMultipleChoiceQuestion,
  isTextAnswerQuestion,
} from '../../utils/voicePractice';
import ContentRenderer from '../ui/ContentRenderer';
import {buildContentBlocks} from '../../utils/contentBlocks';

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
  disabled?: boolean;
  instructionText?: string;
  matchedPairs?: MatchingPair[];
  onMatchingPairChange?: (pairs: MatchingPair[]) => void;
  correctMatchingPairs?: MatchingPair[];
  matchingLeftItems?: string[];
  matchingRightItems?: string[];
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
  disabled = false,
  instructionText,
  matchedPairs = [],
  onMatchingPairChange,
  correctMatchingPairs = [],
  matchingLeftItems = [],
  matchingRightItems = [],
}: QuestionCardProps) {
  const {isDark, colors} = useTheme();
  const questionMeta = {questionType, questionTypeId, answers};
  const isTextType = isTextAnswerQuestion(questionMeta);
  const isMatchingType = isMatchingQuestion(questionMeta);

  const correctTextAnswer =
    answers.find(answer => answer.isCorrect)?.content || '';

  const resolvedIsMultiChoice =
    isMultiChoice || isMultipleChoiceQuestion(questionMeta);

  const getDifficultyVariant = () => {
    switch (difficulty) {
      case 'EASY': return 'success' as const;
      case 'MEDIUM': return 'warning' as const;
      case 'HARD': return 'error' as const;
      default: return 'default' as const;
    }
  };

  const getAnswerStyle = (answer: Answer) => {
    const isSelected = resolvedIsMultiChoice
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
        icon: resolvedIsMultiChoice ? 'checkbox-marked' as const : 'radiobox-marked' as const,
      };
    }

    return {
      bg: 'transparent',
      border: colors.border,
      text: colors.text,
      icon: resolvedIsMultiChoice ? 'checkbox-blank-outline' as const : 'radiobox-blank' as const,
    };
  };

  const handlePress = (answerId: number) => {
    if (showResult || disabled) {
      return;
    }
    if (resolvedIsMultiChoice && onToggleAnswer) {
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
            Câu {index + 1}
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

      {(() => {
        const qBlocks = buildContentBlocks(question);
        return qBlocks.length > 0 ? (
          <ContentRenderer blocks={qBlocks} />
        ) : (
          <Text style={[styles.questionText, {color: colors.heading}]}>{question}</Text>
        );
      })()}

      {instructionText ? (
        <View
          style={[
            styles.instructionBox,
            {
              backgroundColor: isDark ? 'rgba(37,99,235,0.12)' : '#EFF6FF',
              borderColor: isDark ? 'rgba(96,165,250,0.25)' : '#BFDBFE',
            },
          ]}>
          <Icon name="information-outline" size={16} color={Colors.primary} />
          <Text style={[styles.instructionText, {color: isDark ? '#BFDBFE' : '#1D4ED8'}]}>
            {instructionText}
          </Text>
        </View>
      ) : null}

      {isMatchingType ? (
        <MatchingQuestion
          leftItems={matchingLeftItems}
          rightItems={matchingRightItems}
          matchedPairs={matchedPairs}
          onPairChange={onMatchingPairChange}
          disabled={disabled}
          showResult={showResult}
          correctPairs={correctMatchingPairs}
        />
      ) : isTextType ? (
        <View style={styles.textAnswerWrap}>
          <Text style={[styles.textAnswerLabel, {color: colors.textSecondary}]}>
            {showResult ? 'Câu trả lời của bạn' : 'Nhập câu trả lời'}
          </Text>
          <TextInput
            value={textAnswer || ''}
            onChangeText={onChangeTextAnswer}
            editable={!showResult && !disabled}
            multiline
            placeholder={disabled ? 'Câu trả lời của bạn sẽ được ghi lại bằng giọng nói...' : 'Nhập câu trả lời của bạn...'}
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
                Đáp án tham chiếu
              </Text>
              <Text style={[styles.correctAnswerText, {color: isDark ? '#34D399' : '#047857'}]}>
                {correctTextAnswer || 'Không có đáp án tham chiếu'}
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
                activeOpacity={showResult || disabled ? 1 : 0.7}
                style={[
                  styles.answerOption,
                  {
                    backgroundColor: style.bg,
                    borderColor: style.border,
                  },
                ]}>
                <Icon name={style.icon} size={20} color={style.border} />
                  {(() => {
                    const aBlocks = buildContentBlocks(answer.content);
                    return aBlocks.length > 0 ? (
                      <ContentRenderer blocks={aBlocks} />
                    ) : (
                      <Text
                        style={[styles.answerText, {color: style.text}]}
                        numberOfLines={3}>
                        {answer.content}
                      </Text>
                    );
                  })()}
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
            Giải thích
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
  instructionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.base,
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
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
