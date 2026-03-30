import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import QuestionCard from '../../components/features/QuestionCard';
import QuizAPI from '../../api/QuizAPI';
import {
  isMultipleChoiceQuestion,
  isTextAnswerQuestion,
} from '../../utils/voicePractice';

export default function ExamQuizScreen({navigation, route}: any) {
  const {quizId, title, backContext} = route.params;
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswerIdsByQuestion, setSelectedAnswerIdsByQuestion] = useState<
    Record<number, number[]>
  >({});
  const [textAnswers, setTextAnswers] = useState<Record<number, string>>({});
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const attemptIdRef = useRef<number | null>(null);
  const currentIndexRef = useRef(0);
  const questionsRef = useRef<any[]>([]);
  const isPerQuestionModeRef = useRef(false);

  const isTotalTimerMode = (value: any) => {
    if (
      value === true ||
      value === 'true' ||
      value === 1 ||
      value === '1'
    ) {
      return true;
    }
    return String(value || '').toUpperCase() === 'TOTAL';
  };

  const getPerQuestionDuration = (question: any) => {
    const seconds = Number(
      question?.duration ?? question?.timeLimit ?? question?.timeLimitSeconds ?? 0,
    );
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return 30;
    }
    return Math.max(1, Math.floor(seconds));
  };

  const isPerQuestionMode = quiz ? !isTotalTimerMode(quiz?.timerMode) : false;

  const getAttemptRemainingSeconds = (
    timeoutAt?: string | null,
    fallbackSeconds: number = 0,
  ) => {
    if (!timeoutAt) {
      return Math.max(0, fallbackSeconds);
    }

    const timeoutMs = new Date(timeoutAt).getTime();
    if (Number.isNaN(timeoutMs)) {
      return Math.max(0, fallbackSeconds);
    }

    return Math.max(0, Math.ceil((timeoutMs - Date.now()) / 1000));
  };

  const resolvePerQuestionProgress = (
    list: any[],
    startedAt?: string | null,
    restoredSelectedAnswerIds: Record<number, number[]> = {},
    restoredTextAnswers: Record<number, string> = {},
  ) => {
    if (!Array.isArray(list) || list.length === 0) {
      return {currentIndex: 0, timeLeft: 0, isFinished: true};
    }

    const firstUnansweredIndex = list.findIndex((q: any) => {
      const hasChoice = (restoredSelectedAnswerIds[q?.id] || []).length > 0;
      const hasText = (restoredTextAnswers[q?.id] || '').trim().length > 0;
      return !(hasChoice || hasText);
    });
    const fallbackIndex =
      firstUnansweredIndex === -1 ? list.length : firstUnansweredIndex;

    if (!startedAt) {
      if (fallbackIndex >= list.length) {
        return {
          currentIndex: list.length - 1,
          timeLeft: 0,
          isFinished: true,
        };
      }
      return {
        currentIndex: fallbackIndex,
        timeLeft: getPerQuestionDuration(list[fallbackIndex]),
        isFinished: false,
      };
    }

    const startedAtMs = new Date(startedAt).getTime();
    if (Number.isNaN(startedAtMs)) {
      if (fallbackIndex >= list.length) {
        return {
          currentIndex: list.length - 1,
          timeLeft: 0,
          isFinished: true,
        };
      }
      return {
        currentIndex: fallbackIndex,
        timeLeft: getPerQuestionDuration(list[fallbackIndex]),
        isFinished: false,
      };
    }

    let elapsedSeconds = Math.floor((Date.now() - startedAtMs) / 1000);
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
      elapsedSeconds = 0;
    }

    let timelineIndex = 0;
    let timelineTimeLeft = getPerQuestionDuration(list[0]);
    let cursor = elapsedSeconds;

    for (let i = 0; i < list.length; i += 1) {
      const questionDuration = getPerQuestionDuration(list[i]);
      if (cursor >= questionDuration) {
        cursor -= questionDuration;
        continue;
      }
      timelineIndex = i;
      timelineTimeLeft = Math.max(0, questionDuration - cursor);
      break;
    }

    const totalDuration = list.reduce(
      (sum, q) => sum + getPerQuestionDuration(q),
      0,
    );
    const isTimelineFinished = elapsedSeconds >= totalDuration;
    const isAnsweredFinished = fallbackIndex >= list.length;

    if (isTimelineFinished || isAnsweredFinished) {
      return {
        currentIndex: list.length - 1,
        timeLeft: 0,
        isFinished: true,
      };
    }

    const resolvedIndex = Math.max(timelineIndex, fallbackIndex);
    const resolvedTimeLeft =
      resolvedIndex === timelineIndex
        ? timelineTimeLeft
        : getPerQuestionDuration(list[resolvedIndex]);

    return {
      currentIndex: resolvedIndex,
      timeLeft: resolvedTimeLeft,
      isFinished: false,
    };
  };

  const shouldActivateAndRetry = (error: any) => {
    const message = String(
      error?.response?.data?.message || error?.message || '',
    ).toLowerCase();
    const statusCode = Number(error?.response?.data?.statusCode);
    return (
      statusCode === 1083 ||
      message.includes('chua duoc kich hoat') ||
      message.includes('chưa được kích hoạt') ||
      message.includes('not active')
    );
  };

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    isPerQuestionModeRef.current = isPerQuestionMode;
  }, [isPerQuestionMode]);

  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  useEffect(() => {
    QuizAPI.getFull(quizId)
      .then(res => {
        const quizData = res.data;
        setQuiz(quizData);
        const allQuestions =
          quizData?.sections?.flatMap((s: any) =>
            s.questions?.map((q: any) => ({...q, sectionName: s.name})),
          ) || [];
        setQuestions(allQuestions);

        const perQuestion = !isTotalTimerMode(quizData?.timerMode);
        if (perQuestion) {
          setTimeLeft(getPerQuestionDuration(allQuestions[0]));
        } else {
          setTimeLeft(quizData?.timeLimitSeconds || 30 * 60);
        }
      })
      .catch((error: any) =>
        showToast(
          error?.response?.data?.message || error?.message || 'Không thể tải quiz',
          'error',
        ),
      )
      .finally(() => setLoading(false));

    return () => {
      if (timerRef.current) {clearInterval(timerRef.current);}
    };
  }, [quizId, showToast]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
  };

  const startTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (isPerQuestionModeRef.current) {
            const idx = currentIndexRef.current;
            const list = questionsRef.current;
            const hasNext = idx < list.length - 1;

            if (hasNext) {
              const nextIndex = idx + 1;
              setCurrentIndex(nextIndex);
              return getPerQuestionDuration(list[nextIndex]);
            }

            stopTimer();
            handleAutoSubmit();
            return 0;
          }

          stopTimer();
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleAutoSubmit = async () => {
    if (attemptIdRef.current) {
      try {
        await QuizAPI.submitAttempt(attemptIdRef.current);
        navigation.replace('QuizResult', {
          attemptId: attemptIdRef.current,
          backContext,
        });
      } catch {}
    }
  };

  const handleStart = async () => {
    try {
      const res = await QuizAPI.startAttempt(quizId);
      const attempt = res.data || {};
      const nextAttemptId = Number(attempt?.id || attempt?.attemptId || 0);
      setAttemptId(nextAttemptId || null);
      attemptIdRef.current = nextAttemptId || null;

      const savedAnswers = Array.isArray(attempt?.savedAnswers)
        ? attempt.savedAnswers
        : [];
      const restoredSelectedAnswerIds: Record<number, number[]> = {};
      const restoredTextAnswers: Record<number, string> = {};

      savedAnswers.forEach((item: any) => {
        const qid = Number(item?.questionId);
        if (!Number.isFinite(qid)) {
          return;
        }

        const selectedAnswerIds = Array.isArray(item?.selectedAnswerIds)
          ? item.selectedAnswerIds
              .map((value: any) => Number(value))
              .filter((value: number) => Number.isFinite(value))
          : [];

        if (selectedAnswerIds.length > 0) {
          restoredSelectedAnswerIds[qid] = selectedAnswerIds;
        }

        if (typeof item?.textAnswer === 'string' && item.textAnswer.trim()) {
          restoredTextAnswers[qid] = item.textAnswer;
        }
      });

      setSelectedAnswerIdsByQuestion(restoredSelectedAnswerIds);
      setTextAnswers(restoredTextAnswers);

      const allQuestions = questionsRef.current;
      if (isPerQuestionMode) {
          const progress = resolvePerQuestionProgress(
            allQuestions,
            attempt?.startedAt,
            restoredSelectedAnswerIds,
            restoredTextAnswers,
          );

        setCurrentIndex(progress.currentIndex);
        setTimeLeft(progress.timeLeft);
        setStarted(true);

        if (progress.isFinished) {
          stopTimer();
          handleAutoSubmit();
        } else {
          startTimer();
        }
      } else {
        const fallbackTotalSeconds = Number(quiz?.timeLimitSeconds) || 30 * 60;
        const remainingSeconds = getAttemptRemainingSeconds(
          attempt?.timeoutAt,
          fallbackTotalSeconds,
        );
        setCurrentIndex(0);
        setTimeLeft(remainingSeconds);
        setStarted(true);
        startTimer();
      }
    } catch (error: any) {
      if (shouldActivateAndRetry(error)) {
        try {
          await QuizAPI.toggleStatus(quizId);
          setQuiz((prev: any) =>
            prev
              ? {
                  ...prev,
                  status: 'ACTIVE',
                }
              : prev,
          );
          const retryRes = await QuizAPI.startAttempt(quizId);
          const attempt = retryRes.data || {};
          const nextAttemptId = Number(attempt?.id || attempt?.attemptId || 0);
          setAttemptId(nextAttemptId || null);
          attemptIdRef.current = nextAttemptId || null;

          const savedAnswers = Array.isArray(attempt?.savedAnswers)
            ? attempt.savedAnswers
            : [];
          const restoredSelectedAnswerIds: Record<number, number[]> = {};
          const restoredTextAnswers: Record<number, string> = {};

          savedAnswers.forEach((item: any) => {
            const qid = Number(item?.questionId);
            if (!Number.isFinite(qid)) {
              return;
            }

            const selectedAnswerIds = Array.isArray(item?.selectedAnswerIds)
              ? item.selectedAnswerIds
                  .map((value: any) => Number(value))
                  .filter((value: number) => Number.isFinite(value))
              : [];

            if (selectedAnswerIds.length > 0) {
              restoredSelectedAnswerIds[qid] = selectedAnswerIds;
            }

            if (typeof item?.textAnswer === 'string' && item.textAnswer.trim()) {
              restoredTextAnswers[qid] = item.textAnswer;
            }
          });

          setSelectedAnswerIdsByQuestion(restoredSelectedAnswerIds);
          setTextAnswers(restoredTextAnswers);

          const allQuestions = questionsRef.current;
          if (isPerQuestionMode) {
            const progress = resolvePerQuestionProgress(
              allQuestions,
              attempt?.startedAt,
              restoredSelectedAnswerIds,
              restoredTextAnswers,
            );

            setCurrentIndex(progress.currentIndex);
            setTimeLeft(progress.timeLeft);
            setStarted(true);

            if (progress.isFinished) {
              stopTimer();
              handleAutoSubmit();
            } else {
              startTimer();
            }
          } else {
            const fallbackTotalSeconds = Number(quiz?.timeLimitSeconds) || 30 * 60;
            const remainingSeconds = getAttemptRemainingSeconds(
              attempt?.timeoutAt,
              fallbackTotalSeconds,
            );
            setCurrentIndex(0);
            setTimeLeft(remainingSeconds);
            setStarted(true);
            startTimer();
          }
          showToast('Quiz đã được kích hoạt. Bắt đầu ngay...', 'success');
          return;
        } catch (retryError: any) {
          showToast(
            retryError?.response?.data?.message ||
              retryError?.message ||
              'Không thể kích hoạt quiz',
            'error',
          );
          return;
        }
      }

      showToast(
        error?.response?.data?.message || error?.message || 'Không thể bắt đầu bài thi',
        'error',
      );
    }
  };

  const handleSelectAnswer = (questionId: number, answerId: number) => {
    setSelectedAnswerIdsByQuestion(prev => ({...prev, [questionId]: [answerId]}));
    if (attemptId) {
      QuizAPI.saveAnswer(attemptId, {questionId, selectedAnswerIds: [answerId]}).catch(() => {});
    }
  };

  const handleToggleAnswer = (questionId: number, answerId: number) => {
    setSelectedAnswerIdsByQuestion(prev => {
      const currentIds = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const nextIds = currentIds.includes(answerId)
        ? currentIds.filter(id => id !== answerId)
        : [...currentIds, answerId];

      if (attemptId) {
        QuizAPI.saveAnswer(attemptId, {questionId, selectedAnswerIds: nextIds}).catch(() => {});
      }

      return {
        ...prev,
        [questionId]: nextIds,
      };
    });
  };

  const currentQuestion = questions[currentIndex];
  const currentSelectedAnswerIds = currentQuestion
    ? selectedAnswerIdsByQuestion[currentQuestion.id] || []
    : [];

  const isAnsweredQuestion = (question: any) => {
    if (!question) {
      return false;
    }
    const hasChoiceAnswer = (selectedAnswerIdsByQuestion[question?.id] || []).length > 0;
    const hasTextAnswer = (textAnswers[question?.id] || '').trim().length > 0;
    return hasChoiceAnswer || hasTextAnswer;
  };

  const handleChangeTextAnswer = (questionId: number, text: string) => {
    setTextAnswers(prev => ({...prev, [questionId]: text}));
    if (attemptId) {
      QuizAPI.saveAnswer(attemptId, {questionId, textAnswer: text}).catch(() => {});
    }
  };

  const handleSubmit = async () => {
    if (!attemptId) {
      showToast('Thiếu lượt làm bài thi', 'error');
      return;
    }
    stopTimer();
    try {
      await QuizAPI.submitAttempt(attemptId);
      navigation.replace('QuizResult', {attemptId, backContext});
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || error?.message || 'Không thể nộp bài',
        'error',
      );
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!started) {
    return (
      <SafeAreaView
        style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}>
        <View style={styles.startScreen}>
          <View
            style={[
              styles.startCard,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <View
              style={[
                styles.startIcon,
                {backgroundColor: isDark ? 'rgba(234,88,12,0.15)' : '#FFF7ED'},
              ]}>
              <Icon name="timer-outline" size={40} color="#EA580C" />
            </View>
            <Text style={[styles.startTitle, {color: colors.heading}]}>
              {title || quiz?.name}
            </Text>
            <View style={styles.startInfoRow}>
              <View style={styles.startInfoItem}>
                <Icon name="help-circle-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.startInfoText, {color: colors.textSecondary}]}>
                  {questions.length} câu hỏi
                </Text>
              </View>
              <View style={styles.startInfoItem}>
                <Icon name="clock-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.startInfoText, {color: colors.textSecondary}]}>
                  {isPerQuestionMode
                    ? `${getPerQuestionDuration(questions[0])} giây/câu`
                    : formatTime(quiz?.timeLimitSeconds || 30 * 60)}
                </Text>
              </View>
            </View>
            <Button
              title="Bắt đầu thi"
              onPress={handleStart}
              style={{...styles.startBtn, backgroundColor: '#EA580C'}}
            />
            <Button
              title="Quay lại"
              variant="ghost"
              onPress={() => navigation.goBack()}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const isTimeWarning = isPerQuestionMode ? timeLeft <= 10 : timeLeft < 60;
  const answeredCount = questions.filter(isAnsweredQuestion).length;

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top']}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {backgroundColor: colors.surface, borderBottomColor: colors.border},
        ]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}>
          <Icon name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.heading}]} numberOfLines={1}>
          Thi thử
        </Text>
        <View
          style={[
            styles.timerBadge,
            {
              backgroundColor: isTimeWarning
                ? isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2'
                : isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF',
            },
          ]}>
          <Icon
            name="clock-outline"
            size={14}
            color={isTimeWarning ? Colors.error : Colors.primary}
          />
          <Text
            style={[
              styles.timerText,
              {color: isTimeWarning ? Colors.error : Colors.primary},
            ]}>
            {formatTime(timeLeft)}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.timerPanel,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}>
        <Icon
          name="timer-sand"
          size={20}
          color={isTimeWarning ? Colors.error : Colors.primary}
        />
        <Text
          style={[
            styles.timerPanelValue,
            {
              color: isTimeWarning ? Colors.error : colors.heading,
            },
          ]}>
          {formatTime(timeLeft)}
        </Text>
        <Text style={[styles.timerPanelSub, {color: colors.textSecondary}]}>
          Đã trả lời {answeredCount}/{questions.length}
        </Text>
      </View>

      {/* Question Nav (TOTAL mode only, FE behavior) */}
      {!isPerQuestionMode && (
        <ScrollView
          style={styles.navContainer}
          contentContainerStyle={styles.navWrap}
          showsVerticalScrollIndicator>
          {questions.map((q, index) => {
            const isActive = index === currentIndex;
            const isAnswered =
              isAnsweredQuestion(q);
            return (
              <TouchableOpacity
                key={`${q?.id ?? index}`}
                onPress={() => setCurrentIndex(index)}
                style={[
                  styles.navItem,
                  {
                    backgroundColor: isActive
                      ? Colors.primary
                      : isAnswered
                      ? isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF'
                      : isDark ? Colors.dark.surfaceVariant : '#F1F5F9',
                  },
                ]}>
                <Text
                  style={[
                    styles.navItemText,
                    {
                      color: isActive
                        ? '#FFFFFF'
                        : isAnswered
                        ? Colors.primary
                        : colors.textSecondary,
                    },
                  ]}>
                  {index + 1}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Question */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {currentQuestion && (
          <QuestionCard
            index={currentIndex}
            question={currentQuestion.content}
            answers={currentQuestion.answers || []}
            questionType={currentQuestion.questionType}
            questionTypeId={currentQuestion.questionTypeId}
            selectedAnswerId={currentSelectedAnswerIds[0] ?? null}
            selectedAnswerIds={currentSelectedAnswerIds}
            onSelectAnswer={(answerId) =>
              handleSelectAnswer(currentQuestion.id, answerId)
            }
            onToggleAnswer={(answerId) =>
              handleToggleAnswer(currentQuestion.id, answerId)
            }
            textAnswer={textAnswers[currentQuestion.id] || ''}
            onChangeTextAnswer={text =>
              handleChangeTextAnswer(currentQuestion.id, text)
            }
            difficulty={currentQuestion.difficulty}
            isMultiChoice={isMultipleChoiceQuestion(currentQuestion)}
          />
        )}
      </ScrollView>

      {/* Submit */}
      <View
        style={[
          styles.navBar,
          {backgroundColor: colors.surface, borderTopColor: colors.border},
        ]}>
        {!isPerQuestionMode && (
          <Button
            title="Trước"
            variant="outline"
            size="md"
            onPress={() => {
              const prevIndex = Math.max(0, currentIndex - 1);
              setCurrentIndex(prevIndex);
            }}
            disabled={currentIndex === 0}
            fullWidth={false}
            style={{flex: 1}}
          />
        )}
        {currentIndex === questions.length - 1 ? (
          <Button
            title="Nộp bài thi"
            size="md"
            onPress={handleSubmit}
            fullWidth={false}
            style={{
              flex: 1,
              backgroundColor: Colors.success,
            }}
          />
        ) : (
          <Button
            title={
              currentQuestion && isTextAnswerQuestion(currentQuestion)
                ? 'Lưu và tiếp theo'
                : 'Tiếp theo'
            }
            size="md"
            onPress={() => {
              const nextIndex = Math.min(questions.length - 1, currentIndex + 1);
              setCurrentIndex(nextIndex);
              if (isPerQuestionMode) {
                setTimeLeft(getPerQuestionDuration(questions[nextIndex]));
              }
            }}
            fullWidth={false}
            style={{flex: 1}}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  startScreen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  startCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing['2xl'],
    alignItems: 'center',
  },
  startIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  startTitle: {fontSize: 22, fontWeight: '700', textAlign: 'center'},
  startInfoRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
    marginBottom: Spacing.xl,
  },
  startInfoItem: {flexDirection: 'row', alignItems: 'center', gap: 4},
  startInfoText: {fontSize: 13},
  startBtn: {marginBottom: Spacing.sm},

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: {padding: Spacing.sm},
  headerTitle: {flex: 1, fontSize: 16, fontWeight: '600'},
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  timerText: {fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums']},
  timerPanel: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerPanelValue: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  timerPanelSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '500',
  },

  navContainer: {
    maxHeight: 132,
  },
  navWrap: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  navItem: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navItemText: {fontSize: 13, fontWeight: '600'},

  scrollContent: {padding: Spacing.lg, paddingBottom: 20},

  navBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
