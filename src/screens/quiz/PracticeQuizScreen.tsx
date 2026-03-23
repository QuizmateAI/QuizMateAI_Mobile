import React, {useState, useEffect} from 'react';
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

export default function PracticeQuizScreen({navigation, route}: any) {
  const {quizId, title, backContext} = route.params;
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [textAnswers, setTextAnswers] = useState<Record<number, string>>({});
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState<
    Record<number, boolean>
  >({});
  const [questionFeedback, setQuestionFeedback] = useState<Record<number, any>>({});
  const [attemptId, setAttemptId] = useState<number | null>(null);

  const isTextAnswerQuestion = (q: any) => {
    const type = String(q?.questionType || '').toUpperCase();
    return type === 'SHORT_ANSWER' || type === 'FILL_IN_BLANK' || q?.questionTypeId === 3 || q?.questionTypeId === 5;
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
      })
      .catch((error: any) =>
        showToast(
          error?.response?.data?.message || error?.message || 'Failed to load quiz',
          'error',
        ),
      )
      .finally(() => setLoading(false));
  }, [quizId, showToast]);

  const handleStart = async () => {
    try {
      const res = await QuizAPI.startAttempt(quizId, {isPracticeMode: true});
      const attempt = res.data || {};
      const nextAttemptId = Number(attempt?.id || attempt?.attemptId || 0);
      setAttemptId(nextAttemptId || null);

      const restoredAnswers: Record<number, number> = {};
      const restoredTextAnswers: Record<number, string> = {};
      const restoredSubmitted: Record<number, boolean> = {};
      const savedAnswers = Array.isArray(attempt?.savedAnswers)
        ? attempt.savedAnswers
        : [];

      savedAnswers.forEach((item: any) => {
        const qid = Number(item?.questionId);
        if (!Number.isFinite(qid)) {
          return;
        }

        const selectedAnswerIds = Array.isArray(item?.selectedAnswerIds)
          ? item.selectedAnswerIds.filter((value: any) => value != null)
          : [];

        if (selectedAnswerIds.length > 0) {
          restoredAnswers[qid] = Number(selectedAnswerIds[0]);
          restoredSubmitted[qid] = true;
        }

        if (typeof item?.textAnswer === 'string' && item.textAnswer.trim()) {
          restoredTextAnswers[qid] = item.textAnswer;
          restoredSubmitted[qid] = true;
        }
      });

      setAnswers(restoredAnswers);
      setTextAnswers(restoredTextAnswers);
      setSubmittedQuestionIds(restoredSubmitted);
      setStarted(true);
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
          const retryRes = await QuizAPI.startAttempt(quizId, {
            isPracticeMode: true,
          });
          const attempt = retryRes.data || {};
          const nextAttemptId = Number(attempt?.id || attempt?.attemptId || 0);
          setAttemptId(nextAttemptId || null);
          setStarted(true);
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
        error?.response?.data?.message || error?.message || 'Failed to start quiz',
        'error',
      );
    }
  };

  const handleSelectAnswer = (questionId: number, answerId: number) => {
    if (submittedQuestionIds[questionId]) {
      return;
    }
    setAnswers(prev => ({...prev, [questionId]: answerId}));
  };

  const handleChangeTextAnswer = (questionId: number, text: string) => {
    if (submittedQuestionIds[questionId]) {
      return;
    }
    setTextAnswers(prev => ({...prev, [questionId]: text}));
  };

  const handleViewResult = async () => {
    if (!attemptId) {
      showToast('Quiz attempt is missing', 'error');
      return;
    }

    const currentQuestion = questions[currentIndex];
    if (!currentQuestion?.id) {
      showToast('Question is missing', 'error');
      return;
    }

    const questionId = Number(currentQuestion.id);
    if (submittedQuestionIds[questionId]) {
      return;
    }

    const text = (textAnswers[questionId] || '').trim();
    const selectedId = answers[questionId];
    if (!text && (selectedId === undefined || selectedId === null)) {
      showToast('Hãy chọn câu trả lời để xem đáp án', 'error');
      return;
    }

    try {
      const res = await QuizAPI.submitPracticeQuestion(attemptId, {
        questionId,
        selectedAnswerIds:
          selectedId !== undefined && selectedId !== null ? [selectedId] : [],
        textAnswer: text || null,
      });

      const feedback = res.data || {};
      setQuestionFeedback(prev => ({...prev, [questionId]: feedback}));
      setSubmittedQuestionIds(prev => ({...prev, [questionId]: true}));

      const correctAnswerIds = Array.isArray(feedback?.correctAnswerIds)
        ? feedback.correctAnswerIds
        : [];
      const correctAnswerContents = Array.isArray(feedback?.correctAnswerContents)
        ? feedback.correctAnswerContents
        : [];

      setQuestions(prev =>
        prev.map((question: any) => {
          if (Number(question?.id) !== questionId) {
            return question;
          }

          const updatedAnswers = Array.isArray(question?.answers)
            ? question.answers.map((answer: any) => ({
                ...answer,
                isCorrect: correctAnswerIds.includes(Number(answer?.id)),
              }))
            : [];

          if (
            updatedAnswers.length === 0 &&
            correctAnswerContents.length > 0 &&
            isTextAnswerQuestion(question)
          ) {
            return {
              ...question,
              answers: correctAnswerContents.map((content: string, idx: number) => ({
                id: -(idx + 1),
                content,
                isCorrect: true,
              })),
              explanation: feedback?.explanation || question?.explanation,
            };
          }

          return {
            ...question,
            answers: updatedAnswers,
            explanation: feedback?.explanation || question?.explanation,
          };
        }),
      );
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ||
          error?.message ||
          'Failed to view result',
        'error',
      );
    }
  };

  const handleSubmit = async () => {
    if (!attemptId) {
      showToast('Quiz attempt is missing', 'error');
      return;
    }
    try {
      await QuizAPI.submitAttempt(attemptId);
      navigation.replace('QuizResult', {attemptId, backContext});
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || error?.message || 'Failed to submit',
        'error',
      );
    }
  };

  const handleNext = () => {
    const currentQuestion = questions[currentIndex];
    if (currentQuestion && !submittedQuestionIds[currentQuestion.id]) {
      return;
    }
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const progress = questions.length
    ? ((currentIndex + 1) / questions.length) * 100
    : 0;
  const currentQuestion = questions[currentIndex];
  const isCurrentSubmitted = currentQuestion
    ? Boolean(submittedQuestionIds[currentQuestion.id])
    : false;
  const currentFeedback = currentQuestion
    ? questionFeedback[currentQuestion.id]
    : null;

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
                {backgroundColor: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF'},
              ]}>
              <Icon name="play-circle-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={[styles.startTitle, {color: colors.heading}]}>
              {title || quiz?.name}
            </Text>
            <Text style={[styles.startMeta, {color: colors.textSecondary}]}>
              {questions.length} questions
            </Text>
            <Button
              title="Start Practice"
              onPress={handleStart}
              style={styles.startBtn}
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

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top']}>
      {/* Header with progress */}
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
        <View style={styles.progressSection}>
          <View
            style={[
              styles.progressBar,
              {backgroundColor: isDark ? '#1E293B' : '#E2E8F0'},
            ]}>
            <View
              style={[
                styles.progressFill,
                {width: `${progress}%`, backgroundColor: Colors.primary},
              ]}
            />
          </View>
          <Text style={[styles.progressText, {color: colors.textSecondary}]}>
            {currentIndex + 1}/{questions.length}
          </Text>
        </View>
      </View>

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
            explanation={
              isCurrentSubmitted
                ? currentFeedback?.explanation || currentQuestion.explanation
                : undefined
            }
            showResult={isCurrentSubmitted}
          />
        )}
      </ScrollView>

      {/* Navigation Buttons */}
      <View
        style={[
          styles.navBar,
          {backgroundColor: colors.surface, borderTopColor: colors.border},
        ]}>
        <Button
          title="Previous"
          variant="outline"
          size="md"
          onPress={handlePrev}
          disabled={currentIndex === 0}
          fullWidth={false}
          style={{flex: 1}}
        />
        {currentIndex === questions.length - 1 ? (
          isCurrentSubmitted ? (
            <Button
              title="Submit"
              size="md"
              onPress={handleSubmit}
              fullWidth={false}
              style={{flex: 1, backgroundColor: Colors.success}}
            />
          ) : (
            <Button
              title="View Result"
              size="md"
              onPress={handleViewResult}
              fullWidth={false}
              style={{flex: 1}}
            />
          )
        ) : (
          <Button
            title={isCurrentSubmitted ? 'Next' : 'View Result'}
            size="md"
            onPress={isCurrentSubmitted ? handleNext : handleViewResult}
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
  startMeta: {fontSize: 14, marginTop: 4, marginBottom: Spacing.xl},
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
  progressSection: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10},
  progressBar: {flex: 1, height: 6, borderRadius: 3, overflow: 'hidden'},
  progressFill: {height: '100%', borderRadius: 3},
  progressText: {fontSize: 12, fontWeight: '600', minWidth: 40, textAlign: 'right'},

  scrollContent: {padding: Spacing.lg, paddingBottom: 20},

  navBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
