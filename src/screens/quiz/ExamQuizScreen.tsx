import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
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

export default function ExamQuizScreen({navigation, route}: any) {
  const {quizId, title} = route.params;
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [textAnswers, setTextAnswers] = useState<Record<number, string>>({});
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const isTextAnswerQuestion = (q: any) => {
    const type = String(q?.questionType || '').toUpperCase();
    return (
      type === 'SHORT_ANSWER' ||
      type === 'FILL_IN_BLANK' ||
      q?.questionTypeId === 3 ||
      q?.questionTypeId === 5
    );
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
    QuizAPI.getFull(quizId)
      .then(res => {
        setQuiz(res.data);
        const allQuestions =
          res.data?.sections?.flatMap((s: any) =>
            s.questions?.map((q: any) => ({...q, sectionName: s.name})),
          ) || [];
        setQuestions(allQuestions);
        setTimeLeft(res.data?.timeLimitSeconds || 30 * 60);
      })
      .catch((error: any) =>
        showToast(
          error?.response?.data?.message || error?.message || 'Failed to load quiz',
          'error',
        ),
      )
      .finally(() => setLoading(false));

    return () => {
      if (timerRef.current) {clearInterval(timerRef.current);}
    };
  }, [quizId, showToast]);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) {clearInterval(timerRef.current);}
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleAutoSubmit = async () => {
    if (attemptId) {
      try {
        await QuizAPI.submitAttempt(attemptId);
        navigation.replace('QuizResult', {attemptId});
      } catch {}
    }
  };

  const handleStart = async () => {
    try {
      const res = await QuizAPI.startAttempt(quizId);
      setAttemptId(res.data?.id);
      setStarted(true);
      startTimer();
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
          setAttemptId(retryRes.data?.id);
          setStarted(true);
          startTimer();
          showToast('Quiz activated. Starting now...', 'success');
          return;
        } catch (retryError: any) {
          showToast(
            retryError?.response?.data?.message ||
              retryError?.message ||
              'Failed to activate quiz',
            'error',
          );
          return;
        }
      }

      showToast(
        error?.response?.data?.message || error?.message || 'Failed to start exam',
        'error',
      );
    }
  };

  const handleSelectAnswer = (questionId: number, answerId: number) => {
    setAnswers(prev => ({...prev, [questionId]: answerId}));
    if (attemptId) {
      QuizAPI.saveAnswer(attemptId, {questionId, answerId}).catch(() => {});
    }
  };

  const handleChangeTextAnswer = (questionId: number, text: string) => {
    setTextAnswers(prev => ({...prev, [questionId]: text}));
    if (attemptId) {
      QuizAPI.saveAnswer(attemptId, {questionId, textAnswer: text}).catch(() => {});
    }
  };

  const handleSubmit = async () => {
    if (!attemptId) {
      showToast('Exam attempt is missing', 'error');
      return;
    }
    if (timerRef.current) {clearInterval(timerRef.current);}
    try {
      await QuizAPI.submitAttempt(attemptId);
      navigation.replace('QuizResult', {attemptId});
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || error?.message || 'Failed to submit',
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
                  {questions.length} questions
                </Text>
              </View>
              <View style={styles.startInfoItem}>
                <Icon name="clock-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.startInfoText, {color: colors.textSecondary}]}>
                  {formatTime(quiz?.timeLimitSeconds || 30 * 60)}
                </Text>
              </View>
            </View>
            <Button
              title="Start Exam"
              onPress={handleStart}
              style={{...styles.startBtn, backgroundColor: '#EA580C'}}
            />
            <Button
              title="Go Back"
              variant="ghost"
              onPress={() => navigation.goBack()}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const currentQuestion = questions[currentIndex];
  const isTimeWarning = timeLeft < 60;
  const answeredCount = questions.filter(q => {
    const hasChoiceAnswer = answers[q?.id] !== undefined;
    const hasTextAnswer = (textAnswers[q?.id] || '').trim().length > 0;
    return hasChoiceAnswer || hasTextAnswer;
  }).length;

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
          Exam
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
          {answeredCount}/{questions.length} answered
        </Text>
      </View>

      {/* Question Nav */}
      <FlatList
        data={questions}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.navScroll}
        renderItem={({index}) => {
          const isActive = index === currentIndex;
          const q = questions[index];
          const isAnswered =
            answers[q?.id] !== undefined ||
            (textAnswers[q?.id] || '').trim().length > 0;
          return (
            <TouchableOpacity
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
        }}
      />

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
            selectedAnswerId={answers[currentQuestion.id]}
            onSelectAnswer={(answerId) =>
              handleSelectAnswer(currentQuestion.id, answerId)
            }
            textAnswer={textAnswers[currentQuestion.id] || ''}
            onChangeTextAnswer={text =>
              handleChangeTextAnswer(currentQuestion.id, text)
            }
            difficulty={currentQuestion.difficulty}
          />
        )}
      </ScrollView>

      {/* Submit */}
      <View
        style={[
          styles.navBar,
          {backgroundColor: colors.surface, borderTopColor: colors.border},
        ]}>
        <Button
          title="Previous"
          variant="outline"
          size="md"
          onPress={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          fullWidth={false}
          style={{flex: 1}}
        />
        {currentIndex === questions.length - 1 ? (
          <Button
            title="Submit Exam"
            size="md"
            onPress={handleSubmit}
            fullWidth={false}
            style={{flex: 1, backgroundColor: Colors.success}}
          />
        ) : (
          <Button
            title={
              currentQuestion && isTextAnswerQuestion(currentQuestion)
                ? 'Save & Next'
                : 'Next'
            }
            size="md"
            onPress={() =>
              setCurrentIndex(i => Math.min(questions.length - 1, i + 1))
            }
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

  navScroll: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
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
