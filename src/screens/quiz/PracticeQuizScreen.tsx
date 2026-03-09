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
  const {quizId, title} = route.params;
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResult, setShowResult] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);

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
      .catch(() => showToast('Failed to load quiz', 'error'))
      .finally(() => setLoading(false));
  }, [quizId, showToast]);

  const handleStart = async () => {
    try {
      const res = await QuizAPI.startAttempt(quizId);
      setAttemptId(res.data?.id);
      setStarted(true);
    } catch {
      showToast('Failed to start quiz', 'error');
    }
  };

  const handleSelectAnswer = (questionId: number, answerId: number) => {
    setAnswers(prev => ({...prev, [questionId]: answerId}));
    if (attemptId) {
      QuizAPI.saveAnswer(attemptId, {questionId, answerId}).catch(() => {});
    }
  };

  const handleSubmit = async () => {
    if (!attemptId) return;
    try {
      await QuizAPI.submitAttempt(attemptId);
      navigation.replace('QuizResult', {attemptId});
    } catch {
      showToast('Failed to submit', 'error');
    }
  };

  const handleNext = () => {
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
            selectedAnswerId={answers[currentQuestion.id]}
            onSelectAnswer={(answerId) =>
              handleSelectAnswer(currentQuestion.id, answerId)
            }
            difficulty={currentQuestion.difficulty}
            explanation={
              showResult ? currentQuestion.explanation : undefined
            }
            showResult={showResult}
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
          <Button
            title="Submit"
            size="md"
            onPress={handleSubmit}
            fullWidth={false}
            style={{flex: 1, backgroundColor: Colors.success}}
          />
        ) : (
          <Button
            title="Next"
            size="md"
            onPress={handleNext}
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
