import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import QuestionCard from '../../components/features/QuestionCard';
import QuizAPI from '../../api/QuizAPI';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

export default function QuizResultScreen({navigation, route}: any) {
  const {attemptId} = route.params;
  const {isDark, colors} = useTheme();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    QuizAPI.getResult(attemptId)
      .then(async res => {
        const attemptResult = res.data;
        const quizId = Number(attemptResult?.quizId);

        if (!quizId) {
          setResult(attemptResult);
          return;
        }

        try {
          const fullRes = await QuizAPI.getFull(quizId);
          const fullQuestions =
            fullRes.data?.sections?.flatMap((section: any) => section?.questions || []) || [];
          const questionMap = new Map(
            fullQuestions.map((q: any) => [Number(q?.id || q?.questionId), q]),
          );

          const mergedQuestions = (attemptResult?.questions || []).map((q: any, i: number) => {
            const source = questionMap.get(Number(q?.id || q?.questionId));
            return {
              ...q,
              id: q?.id || q?.questionId || source?.id || i,
              content: source?.content || q?.content || `Question ${i + 1}`,
              answers: Array.isArray(source?.answers) ? source.answers : q?.answers || [],
              explanation: source?.explanation || q?.explanation,
              difficulty: source?.difficulty || q?.difficulty,
              questionTypeId: source?.questionTypeId || q?.questionTypeId,
              questionType: q?.questionType,
            };
          });

          setResult({...attemptResult, questions: mergedQuestions});
        } catch {
          setResult(attemptResult);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return <LoadingSpinner />;
  }

  const score = result?.score || 0;
  const totalQuestions = result?.totalQuestions || 0;
  const correctCount = result?.correctCount || 0;
  const isPassed = result?.passed ?? score >= 50;
  const timeTaken = result?.timeTakenSeconds
    ? `${Math.floor(result.timeTakenSeconds / 60)}m ${result.timeTakenSeconds % 60}s`
    : '--';

  const passColors = {
    gradient1: isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5',
    gradient2: isDark ? 'rgba(20,184,166,0.1)' : '#F0FDFA',
    border: isDark ? '#065F46' : '#A7F3D0',
    icon: '#10B981',
    title: isDark ? '#34D399' : '#059669',
  };

  const failColors = {
    gradient1: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2',
    gradient2: isDark ? 'rgba(249,115,22,0.1)' : '#FFF7ED',
    border: isDark ? '#7F1D1D' : '#FECACA',
    icon: '#EF4444',
    title: isDark ? '#F87171' : '#DC2626',
  };

  const c = isPassed ? passColors : failColors;

  const stats = [
    {icon: 'percent', label: 'Score', value: `${score}%`},
    {icon: 'check-circle-outline', label: 'Correct', value: `${correctCount}/${totalQuestions}`},
    {icon: 'clock-outline', label: 'Time', value: timeTaken},
    {icon: 'help-circle-outline', label: 'Questions', value: totalQuestions},
  ];

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Score Card */}
        <View
          style={[
            styles.scoreCard,
            {backgroundColor: c.gradient1, borderColor: c.border},
          ]}>
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: isPassed
                  ? isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5'
                  : isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2',
              },
            ]}>
            <Icon
              name={isPassed ? 'trophy' : 'close-circle'}
              size={40}
              color={c.icon}
            />
          </View>
          <Text style={[styles.scoreTitle, {color: c.title}]}>
            {isPassed ? 'Congratulations!' : 'Keep Trying!'}
          </Text>
          <Text style={[styles.scoreSubtitle, {color: c.title}]}>
            {isPassed
              ? 'You passed the quiz!'
              : "Don't give up, practice makes perfect!"}
          </Text>

          <Text style={[styles.scoreValue, {color: c.title}]}>
            {score}%
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          {stats.map(stat => (
            <View
              key={stat.label}
              style={[
                styles.statCard,
                {
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.05)'
                    : '#FFFFFF',
                  borderColor: colors.border,
                },
              ]}>
              <Icon name={stat.icon} size={18} color={Colors.primary} />
              <Text style={[styles.statValue, {color: colors.heading}]}>
                {stat.value}
              </Text>
              <Text style={[styles.statLabel, {color: colors.textSecondary}]}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title={showReview ? 'Hide Review' : 'Review Answers'}
            variant="outline"
            icon={showReview ? 'eye-off-outline' : 'eye-outline'}
            onPress={() => setShowReview(!showReview)}
          />
          <Button
            title="Back to Quizzes"
            onPress={() => navigation.popToTop()}
            icon="arrow-left"
          />
        </View>

        {/* Review Questions */}
        {showReview && result?.questions && (
          <View style={styles.reviewSection}>
            <Text style={[styles.reviewTitle, {color: colors.heading}]}>
              Review
            </Text>
            {result.questions.map((q: any, i: number) => (
              <QuestionCard
                key={q.id}
                index={i}
                question={q.content}
                answers={q.answers || []}
                questionType={q.questionType}
                questionTypeId={q.questionTypeId}
                selectedAnswerId={q.selectedAnswerId}
                textAnswer={q.textAnswer || ''}
                showResult
                difficulty={q.difficulty}
                explanation={q.explanation}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },

  scoreCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing['2xl'],
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  scoreTitle: {fontSize: 24, fontWeight: '700'},
  scoreSubtitle: {fontSize: 14, marginTop: 4, textAlign: 'center'},
  scoreValue: {fontSize: 48, fontWeight: '800', marginTop: Spacing.base},

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  statCard: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 4,
  },
  statValue: {fontSize: 16, fontWeight: '700'},
  statLabel: {fontSize: 11},

  actions: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },

  reviewSection: {marginTop: Spacing.sm},
  reviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.base,
  },
});
