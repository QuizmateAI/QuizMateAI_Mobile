import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import QuestionCard from '../../components/features/QuestionCard';
import QuizAPI from '../../api/QuizAPI';
import AIAPI from '../../api/AIAPI';
import RoadmapPhaseAPI from '../../api/RoadmapPhaseAPI';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

const getMatchingItemsFromResult = (question: any) => {
  const correctPairs = Array.isArray(question?.correctMatchingPairs)
    ? question.correctMatchingPairs
    : [];
  // Fallback: extract from answers if correctMatchingPairs not available
  if (correctPairs.length === 0) {
    const answers = question?.answers || [];
    const correctAnswer = answers.find((a: any) => a.isCorrect);
    const pairs = Array.isArray(correctAnswer?.matchingPairs)
      ? correctAnswer.matchingPairs
      : [];
    return {
      leftItems: pairs.map((p: any) => p.leftKey),
      rightItems: pairs.map((p: any) => p.rightKey),
      correctPairs: pairs,
    };
  }
  return {
    leftItems: correctPairs.map((p: any) => p.leftKey),
    rightItems: correctPairs.map((p: any) => p.rightKey),
    correctPairs,
  };
};

export default function QuizResultScreen({navigation, route}: any) {
  const {attemptId, backContext} = route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const {t} = useTranslation();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [assessmentData, setAssessmentData] = useState<any>(null);
  const [assessmentStatus, setAssessmentStatus] = useState('NOT_AVAILABLE');
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [loadingCurrentPhase, setLoadingCurrentPhase] = useState(false);
  const [currentPhaseProgress, setCurrentPhaseProgress] = useState<any>(null);
  const [submittingRoadmapDecision, setSubmittingRoadmapDecision] = useState(false);
  const [triggeringKnowledge, setTriggeringKnowledge] = useState(false);
  const [knowledgeGenerationTriggered, setKnowledgeGenerationTriggered] = useState(false);

  useEffect(() => {
    if (!attemptId) {
      setLoadError('Không tìm thấy lượt làm bài để hiển thị kết quả');
      setLoading(false);
      return;
    }

    QuizAPI.getResult(attemptId)
      .then(async res => {
        setLoadError(null);
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
            const source: any = questionMap.get(Number(q?.id || q?.questionId));
            return {
              ...q,
              id: q?.id || q?.questionId || source?.id || i,
              content: source?.content || q?.content || `Question ${i + 1}`,
              answers: Array.isArray(source?.answers) ? source.answers : q?.answers || [],
              explanation: source?.explanation || q?.explanation,
              difficulty: source?.difficulty || q?.difficulty,
              questionTypeId: source?.questionTypeId || q?.questionTypeId,
              questionType: source?.questionType || q?.questionType,
            };
          });

          setResult({...attemptResult, questions: mergedQuestions});
        } catch {
          setResult(attemptResult);
        }
      })
      .catch((error: any) => {
        const message =
          error?.response?.data?.message ||
          error?.message ||
          'Không thể tải kết quả bài làm';
        setLoadError(message);
        showToast(message, 'error');
      })
      .finally(() => setLoading(false));
  }, [attemptId, reloadKey, showToast]);

  const applyAssessmentPayload = useCallback((payload: any) => {
    const nextStatus = String(payload?.status || 'NOT_AVAILABLE').toUpperCase();
    setAssessmentStatus(nextStatus);
    setAssessmentData(payload || null);
  }, []);

  const fetchAssessment = useCallback(async (showLoader = true) => {
    if (!attemptId) {
      applyAssessmentPayload(null);
      return;
    }

    if (showLoader) {
      setAssessmentLoading(true);
    }

    try {
      const response = await QuizAPI.getAttemptAssessment(attemptId);
      applyAssessmentPayload(response?.data || null);
    } catch {
      applyAssessmentPayload(null);
    } finally {
      if (showLoader) {
        setAssessmentLoading(false);
      }
    }
  }, [applyAssessmentPayload, attemptId]);

  useEffect(() => {
    fetchAssessment();
  }, [fetchAssessment, reloadKey]);

  useEffect(() => {
    if (assessmentStatus !== 'PROCESSING') {
      return undefined;
    }

    const intervalId = setInterval(() => {
      fetchAssessment(false);
    }, 8000);

    return () => clearInterval(intervalId);
  }, [assessmentStatus, fetchAssessment]);

  const handleRefreshAssessment = useCallback(async () => {
    if (!attemptId) {
      return;
    }

    if (assessmentStatus !== 'FAILED') {
      await fetchAssessment();
      return;
    }

    setAssessmentLoading(true);
    try {
      const response = await QuizAPI.refreshAttemptAssessment(attemptId);
      applyAssessmentPayload(response?.data || null);
      showToast(
        t('quizResult.assessmentRefreshQueued', 'AI assessment refresh has started.'),
        'success',
      );
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ||
          error?.message ||
          t('quizResult.assessmentRefreshFailed', 'Unable to refresh AI assessment right now.'),
        'error',
      );
      await fetchAssessment(false);
    } finally {
      setAssessmentLoading(false);
    }
  }, [
    applyAssessmentPayload,
    assessmentStatus,
    attemptId,
    fetchAssessment,
    showToast,
    t,
  ]);

  const roadmapContext = useMemo(() => {
    if (backContext?.type !== 'roadmap') {
      return {
        isRoadmap: false,
        contextType: 'WORKSPACE',
        contextId: 0,
        roadmapId: null,
        phaseId: null,
        quizIntent: '',
      };
    }

    const normalizedRoadmapId = Number(backContext?.roadmapId ?? result?.roadmapId ?? 0);
    const normalizedPhaseId = Number(backContext?.phaseId ?? result?.phaseId ?? 0);
    return {
      isRoadmap: true,
      contextType: backContext?.contextType,
      contextId: Number(backContext?.contextId ?? 0),
      roadmapId:
        Number.isInteger(normalizedRoadmapId) && normalizedRoadmapId > 0
          ? normalizedRoadmapId
          : null,
      phaseId:
        Number.isInteger(normalizedPhaseId) && normalizedPhaseId > 0
          ? normalizedPhaseId
          : null,
      quizIntent: String(backContext?.quizIntent || result?.quizIntent || '').toUpperCase(),
    };
  }, [backContext, result?.phaseId, result?.quizIntent, result?.roadmapId]);

  const isRoadmapPreLearningQuiz =
    roadmapContext.isRoadmap && roadmapContext.quizIntent === 'PRE_LEARNING';
  const isCompletedAttempt = String(result?.status || '').toUpperCase() === 'COMPLETED';
  const isAssessmentReady = assessmentStatus === 'READY' && Boolean(assessmentData);
  const canTriggerKnowledgeAfterPreLearning =
    isRoadmapPreLearningQuiz &&
    isCompletedAttempt &&
    Boolean(roadmapContext.roadmapId);

  const fetchCurrentRoadmapPhase = useCallback(async () => {
    if (!roadmapContext.roadmapId || !canTriggerKnowledgeAfterPreLearning || !isAssessmentReady) {
      setCurrentPhaseProgress(null);
      return null;
    }

    setLoadingCurrentPhase(true);
    try {
      const response = await RoadmapPhaseAPI.getCurrentPhaseProgress(roadmapContext.roadmapId);
      const payload = response?.data || null;
      setCurrentPhaseProgress(payload);
      return payload;
    } catch {
      setCurrentPhaseProgress(null);
      return null;
    } finally {
      setLoadingCurrentPhase(false);
    }
  }, [canTriggerKnowledgeAfterPreLearning, isAssessmentReady, roadmapContext.roadmapId]);

  useEffect(() => {
    if (!canTriggerKnowledgeAfterPreLearning || !isAssessmentReady) {
      setCurrentPhaseProgress(null);
      return;
    }
    fetchCurrentRoadmapPhase();
  }, [canTriggerKnowledgeAfterPreLearning, fetchCurrentRoadmapPhase, isAssessmentReady]);

  const score = result?.score || 0;
  const accuracyPercent = result?.accuracyPercent || 0;
  const displayPercent = result?.displayPercent ?? score;
  const totalQuestions = result?.totalQuestions || 0;
  const correctCount = result?.correctCount || 0;
  const hasPassScore = typeof result?.passScore === 'number';
  const passedFlag = typeof result?.passed === 'boolean' ? result.passed : null;
  const statusVariant = !hasPassScore ? 'neutral' : passedFlag ? 'pass' : 'fail';
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

  const neutralColors = {
    gradient1: isDark ? 'rgba(59,130,246,0.14)' : '#EFF6FF',
    gradient2: isDark ? 'rgba(14,165,233,0.1)' : '#F0F9FF',
    border: isDark ? '#1D4ED8' : '#BFDBFE',
    icon: '#2563EB',
    title: isDark ? '#93C5FD' : '#1D4ED8',
  };

  const c =
    statusVariant === 'pass'
      ? passColors
      : statusVariant === 'fail'
      ? failColors
      : neutralColors;
  const primaryMetricLabel =
    score === 0 && accuracyPercent > 0 ? 'Độ chính xác' : 'Điểm';

  const stats = [
    {icon: 'percent', label: primaryMetricLabel, value: `${displayPercent}%`},
    {icon: 'check-circle-outline', label: 'Đúng', value: `${correctCount}/${totalQuestions}`},
    {icon: 'clock-outline', label: 'Thời gian', value: timeTaken},
    {icon: 'help-circle-outline', label: 'Câu hỏi', value: totalQuestions},
  ];

  const backButtonTitle =
    backContext?.type === 'workspace'
      ? 'Về workspace'
      : backContext?.type === 'group'
      ? 'Về nhóm'
      : backContext?.type === 'roadmap'
      ? 'Về lộ trình'
      : 'Về danh sách quiz';

  const navigateBackToRoadmap = useCallback((phaseIdOverride?: number | null) => {
    if (!roadmapContext.isRoadmap || roadmapContext.contextId <= 0) {
      return false;
    }

    const fallbackPhaseId = Number(
      phaseIdOverride ?? currentPhaseProgress?.phaseId ?? roadmapContext.phaseId ?? 0,
    );

    const roadmapParams = {
      contextType: roadmapContext.contextType,
      contextId: roadmapContext.contextId,
      title: backContext?.title,
      roadmapId: roadmapContext.roadmapId ?? undefined,
      phaseId:
        Number.isInteger(fallbackPhaseId) && fallbackPhaseId > 0
          ? fallbackPhaseId
          : undefined,
    };
    const routeNames = navigation.getState?.()?.routeNames || [];

    if (roadmapContext.contextType === 'GROUP' && routeNames.includes('RoadmapJourney')) {
      navigation.navigate('RoadmapJourney', roadmapParams);
      return true;
    }

    navigation.navigate('Home', {
      screen: 'RoadmapJourney',
      params: roadmapParams,
    });

    return true;
  }, [
    backContext?.title,
    currentPhaseProgress?.phaseId,
    navigation,
    roadmapContext.contextId,
    roadmapContext.contextType,
    roadmapContext.isRoadmap,
    roadmapContext.phaseId,
    roadmapContext.roadmapId,
  ]);

  const handleBack = () => {
    const routeNames = navigation.getState?.()?.routeNames || [];

    if (
      backContext?.type === 'workspace' &&
      Number.isInteger(backContext.workspaceId) &&
      backContext.workspaceId > 0
    ) {
      navigation.navigate('Home', {
        screen: 'Workspace',
        params: {
          workspaceId: backContext.workspaceId,
          title: backContext.title,
        },
      });
      return;
    }

    if (
      backContext?.type === 'group' &&
      Number.isInteger(backContext.groupId) &&
      backContext.groupId > 0
    ) {
      if (routeNames.includes('GroupWorkspace')) {
        navigation.navigate('GroupWorkspace', {
          groupId: backContext.groupId,
          title: backContext.title,
        });
        return;
      }

      navigation.navigate('Home', {
        screen: 'GroupWorkspace',
        params: {
          groupId: backContext.groupId,
          title: backContext.title,
        },
      });
      return;
    }

    if (
      backContext?.type === 'roadmap' &&
      Number.isInteger(backContext.contextId) &&
      backContext.contextId > 0
    ) {
      navigateBackToRoadmap();
      return;
    }

    try {
      navigation.reset({
        index: 0,
        routes: [{name: 'QuizList'}],
      });
  } catch {
      navigation.navigate('QuizList');
    }
  };

  const handleGenerateKnowledgeAfterPreLearning = useCallback(async () => {
    if (!canTriggerKnowledgeAfterPreLearning || !isAssessmentReady) {
      return;
    }

    const roadmapId = Number(roadmapContext.roadmapId || 0);
    const phaseId = Number(currentPhaseProgress?.phaseId ?? roadmapContext.phaseId ?? 0);
    if (!Number.isInteger(roadmapId) || roadmapId <= 0) {
      showToast('Không xác định được roadmap để tạo nội dung', 'error');
      return;
    }
    if (!Number.isInteger(phaseId) || phaseId <= 0) {
      showToast('Không xác định được phase để tạo nội dung', 'error');
      return;
    }

    setTriggeringKnowledge(true);
    try {
      await AIAPI.generateRoadmapPhaseContent({
        roadmapId,
        phaseId,
        skipPreLearning: false,
      });
      setKnowledgeGenerationTriggered(true);
      showToast('Đã gửi yêu cầu tạo nội dung giai đoạn', 'success');
      navigateBackToRoadmap(phaseId);
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || error?.message || 'Không thể tạo nội dung giai đoạn',
        'error',
      );
    } finally {
      setTriggeringKnowledge(false);
    }
  }, [
    canTriggerKnowledgeAfterPreLearning,
    currentPhaseProgress?.phaseId,
    isAssessmentReady,
    navigateBackToRoadmap,
    roadmapContext.phaseId,
    roadmapContext.roadmapId,
    showToast,
  ]);

  const handleSkipDecision = useCallback(
    async (skipped: boolean) => {
      const phaseId = Number(currentPhaseProgress?.phaseId ?? roadmapContext.phaseId ?? 0);
      if (!Number.isInteger(phaseId) || phaseId <= 0) {
        showToast('Không xác định được phase để cập nhật quyết định', 'error');
        return;
      }

      setSubmittingRoadmapDecision(true);
      try {
        await RoadmapPhaseAPI.submitSkipDecision(phaseId, skipped);
        if (skipped) {
          showToast('Đã bỏ qua phase hiện tại', 'success');
          const latest = await fetchCurrentRoadmapPhase();
          const nextPhaseId = Number(latest?.phaseId || 0);
          navigateBackToRoadmap(nextPhaseId > 0 ? nextPhaseId : phaseId);
          return;
        }

        await handleGenerateKnowledgeAfterPreLearning();
      } catch (error: any) {
        showToast(
          error?.response?.data?.message || error?.message || 'Không thể cập nhật quyết định',
          'error',
        );
      } finally {
        setSubmittingRoadmapDecision(false);
      }
    },
    [
      currentPhaseProgress?.phaseId,
      fetchCurrentRoadmapPhase,
      handleGenerateKnowledgeAfterPreLearning,
      navigateBackToRoadmap,
      roadmapContext.phaseId,
      showToast,
    ],
  );

  const canShowSkipDecision =
    canTriggerKnowledgeAfterPreLearning &&
    isAssessmentReady &&
    currentPhaseProgress?.skipable === true &&
    !knowledgeGenerationTriggered;

  const canShowGenerateKnowledgeFallback =
    canTriggerKnowledgeAfterPreLearning &&
    isAssessmentReady &&
    !loadingCurrentPhase &&
    !canShowSkipDecision &&
    !knowledgeGenerationTriggered;
  const shouldShowAssessmentSection =
    assessmentLoading || assessmentStatus !== 'NOT_AVAILABLE';
  const assessmentSummary = assessmentData?.summary;
  const assessmentStrengths = Array.isArray(assessmentData?.strengths)
    ? assessmentData.strengths.filter(Boolean)
    : [];
  const assessmentWeaknesses = Array.isArray(assessmentData?.weaknesses)
    ? assessmentData.weaknesses.filter(Boolean)
    : [];

  if (loading) {
    return <LoadingSpinner />;
  }

  if (loadError) {
    return (
      <SafeAreaView
        style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}>
        <View style={styles.errorState}>
          <View
            style={[
              styles.errorStateIcon,
              {
                backgroundColor: isDark
                  ? 'rgba(239,68,68,0.16)'
                  : '#FEF2F2',
              },
            ]}>
            <Icon name="alert-circle-outline" size={36} color={Colors.error} />
          </View>
          <Text style={[styles.errorStateTitle, {color: colors.heading}]}>
            Không tải được kết quả
          </Text>
          <Text
            style={[styles.errorStateText, {color: colors.textSecondary}]}>
            {loadError}
          </Text>
          <View style={styles.errorStateActions}>
            <Button title={backButtonTitle} variant="outline" onPress={handleBack} />
            <Button
              title="Thử lại"
              onPress={() => {
                setLoading(true);
                setLoadError(null);
                setResult(null);
                setReloadKey(prev => prev + 1);
              }}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

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
                backgroundColor: statusVariant === 'pass'
                  ? isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5'
                  : statusVariant === 'fail'
                  ? isDark ? 'rgba(239,68,68,0.2)' : '#FEE2E2'
                  : isDark ? 'rgba(59,130,246,0.18)' : '#DBEAFE',
              },
            ]}>
            <Icon
              name={
                statusVariant === 'pass'
                  ? 'trophy'
                  : statusVariant === 'fail'
                  ? 'close-circle'
                  : 'information-outline'
              }
              size={40}
              color={c.icon}
            />
          </View>
          <Text style={[styles.scoreTitle, {color: c.title}]}>
            {statusVariant === 'pass'
              ? 'Chúc mừng!'
              : statusVariant === 'fail'
              ? 'Cố gắng thêm!'
              : 'Hoàn thành quiz'}
          </Text>
          <Text style={[styles.scoreSubtitle, {color: c.title}]}>
            {statusVariant === 'pass'
              ? 'Bạn đã vượt qua bài quiz!'
              : statusVariant === 'fail'
              ? 'Đừng bỏ cuộc, luyện tập sẽ giúp bạn tiến bộ!'
              : 'Quiz này không có ngưỡng đậu. Kết quả được hiển thị theo độ chính xác.'}
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

        {shouldShowAssessmentSection && (
          <View
            style={[
              styles.assessmentCard,
              {
                borderColor: isDark ? '#6D28D9' : '#DDD6FE',
                backgroundColor: isDark ? 'rgba(76,29,149,0.2)' : '#FFFFFF',
              },
            ]}>
            <View style={styles.assessmentHeader}>
              <View style={styles.assessmentTitleRow}>
                <Icon name="sparkles" size={18} color="#8B5CF6" />
                <Text style={[styles.assessmentTitle, {color: colors.heading}]}>
                  {t('quizResult.aiAssessment', 'AI Assessment')}
                </Text>
              </View>
              <Button
                title={t('quizResult.refreshAssessment', 'Refresh')}
                variant="outline"
                size="sm"
                fullWidth={false}
                icon="refresh"
                loading={assessmentLoading}
                onPress={handleRefreshAssessment}
                style={styles.assessmentRefreshButton}
              />
            </View>

            {assessmentLoading && !assessmentData ? (
              <Text style={[styles.assessmentText, {color: colors.textSecondary}]}>
                {t('quizResult.assessmentLoading', 'Loading AI assessment...')}
              </Text>
            ) : null}

            {assessmentStatus === 'PROCESSING' ? (
              <View
                style={[
                  styles.assessmentNotice,
                  {
                    borderColor: isDark ? '#92400E' : '#FDE68A',
                    backgroundColor: isDark ? 'rgba(146,64,14,0.2)' : '#FFFBEB',
                  },
                ]}>
                <ActivityIndicator size="small" color="#F59E0B" />
                <Text style={[styles.assessmentNoticeText, {color: isDark ? '#FCD34D' : '#92400E'}]}>
                  {t(
                    'quizResult.assessmentProcessing',
                    'AI assessment is still processing. This page will refresh automatically.',
                  )}
                </Text>
              </View>
            ) : null}

            {assessmentStatus === 'FAILED' ? (
              <View
                style={[
                  styles.assessmentNotice,
                  {
                    borderColor: isDark ? '#991B1B' : '#FECACA',
                    backgroundColor: isDark ? 'rgba(127,29,29,0.25)' : '#FEF2F2',
                  },
                ]}>
                <Text style={[styles.assessmentNoticeText, {color: isDark ? '#FCA5A5' : '#B91C1C'}]}>
                  {assessmentData?.message ||
                    t(
                      'quizResult.assessmentFailed',
                      'AI assessment could not be completed yet. Try refreshing after grading finishes.',
                    )}
                </Text>
              </View>
            ) : null}

            {assessmentStatus === 'READY' && assessmentData ? (
              <View style={styles.assessmentReadyContent}>
                {assessmentStrengths.length > 0 || assessmentWeaknesses.length > 0 ? (
                  <View style={styles.assessmentInsightGrid}>
                    {assessmentStrengths.length > 0 ? (
                      <View
                        style={[
                          styles.assessmentInsightBox,
                          {
                            borderColor: isDark ? '#047857' : '#A7F3D0',
                            backgroundColor: isDark ? 'rgba(6,95,70,0.2)' : '#ECFDF5',
                          },
                        ]}>
                        <Text style={[styles.assessmentInsightTitle, {color: isDark ? '#6EE7B7' : '#047857'}]}>
                          {t('quizResult.strengths', 'Strengths')}
                        </Text>
                        {assessmentStrengths.map((item: string, index: number) => (
                          <Text
                            key={`assessment-strength-${index}`}
                            style={[styles.assessmentBullet, {color: colors.text}]}>
                            {'• '}{item}
                          </Text>
                        ))}
                      </View>
                    ) : null}

                    {assessmentWeaknesses.length > 0 ? (
                      <View
                        style={[
                          styles.assessmentInsightBox,
                          {
                            borderColor: isDark ? '#B45309' : '#FDE68A',
                            backgroundColor: isDark ? 'rgba(146,64,14,0.18)' : '#FFFBEB',
                          },
                        ]}>
                        <Text style={[styles.assessmentInsightTitle, {color: isDark ? '#FCD34D' : '#B45309'}]}>
                          {t('quizResult.weaknesses', 'Needs improvement')}
                        </Text>
                        {assessmentWeaknesses.map((item: string, index: number) => (
                          <Text
                            key={`assessment-weakness-${index}`}
                            style={[styles.assessmentBullet, {color: colors.text}]}>
                            {'• '}{item}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <Text style={[styles.assessmentText, {color: colors.text}]}>
                  {assessmentSummary ||
                    t('quizResult.assessmentNoSummary', 'No AI assessment summary yet.')}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {canTriggerKnowledgeAfterPreLearning && isAssessmentReady && (
          <View
            style={[
              styles.decisionCard,
              {
                borderColor: colors.border,
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
              },
            ]}>
            <Text style={[styles.decisionTitle, {color: colors.heading}]}>
              {t('quizResult.preLearningDecisionTitle', 'Decision after Pre-learning')}
            </Text>
            <Text style={[styles.decisionText, {color: colors.textSecondary}]}>
              {t(
                'quizResult.preLearningDecisionDescription',
                'Based on the pre-learning result, choose whether to skip this phase or generate practice content.',
              )}
            </Text>

            {loadingCurrentPhase ? (
              <Text style={[styles.decisionHint, {color: colors.textSecondary}]}>
                {t('quizResult.loadingCurrentPhase', 'Checking your current phase...')}
              </Text>
            ) : canShowSkipDecision ? (
              <View style={styles.decisionActions}>
                <Button
                  title={t('quizResult.skipPhaseAction', 'Skip this phase')}
                  variant="outline"
                  onPress={() => handleSkipDecision(true)}
                  loading={submittingRoadmapDecision}
                  icon="skip-next"
                />
                <Button
                  title={t('quizResult.continuePracticeAction', 'Continue practicing')}
                  onPress={() => handleSkipDecision(false)}
                  loading={submittingRoadmapDecision || triggeringKnowledge}
                  icon="book-open-variant"
                />
              </View>
            ) : canShowGenerateKnowledgeFallback ? (
              <View style={styles.decisionActions}>
                <Button
                  title={t('quizResult.generateKnowledgeAction', 'Generate practice knowledge')}
                  onPress={handleGenerateKnowledgeAfterPreLearning}
                  loading={triggeringKnowledge}
                  icon="lightning-bolt-outline"
                />
              </View>
            ) : null}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title={
              showReview
                ? t('quizResult.hideReview', 'Hide review')
                : t('quizResult.reviewAnswers', 'Review answers')
            }
            variant="outline"
            icon={showReview ? 'eye-off-outline' : 'eye-outline'}
            onPress={() => setShowReview(!showReview)}
          />
          <Button
            title={backButtonTitle}
            onPress={handleBack}
            icon="arrow-left"
          />
        </View>

        {/* Review Questions */}
        {showReview && result?.questions && (
          <View style={styles.reviewSection}>
            <Text style={[styles.reviewTitle, {color: colors.heading}]}>
              Xem lại
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
                selectedAnswerIds={q.selectedAnswerIds || []}
                textAnswer={q.textAnswer || ''}
                showResult
                difficulty={q.difficulty}
                explanation={q.explanation}
                matchedPairs={q.matchingPairs || []}
                matchingLeftItems={getMatchingItemsFromResult(q).leftItems}
                matchingRightItems={getMatchingItemsFromResult(q).rightItems}
                correctMatchingPairs={getMatchingItemsFromResult(q).correctPairs}
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

  assessmentCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  assessmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  assessmentTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assessmentTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  assessmentRefreshButton: {
    minWidth: 92,
  },
  assessmentText: {
    fontSize: 13,
    lineHeight: 20,
  },
  assessmentNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    gap: 8,
  },
  assessmentNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  assessmentReadyContent: {
    gap: Spacing.sm,
  },
  assessmentInsightGrid: {
    gap: Spacing.sm,
  },
  assessmentInsightBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    gap: 4,
  },
  assessmentInsightTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  assessmentBullet: {
    fontSize: 12,
    lineHeight: 18,
  },

  decisionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  decisionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  decisionText: {
    fontSize: 13,
    lineHeight: 20,
  },
  decisionHint: {
    fontSize: 12,
  },
  decisionActions: {
    gap: Spacing.sm,
  },

  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  errorStateIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  errorStateTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorStateText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  errorStateActions: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },

  reviewSection: {marginTop: Spacing.sm},
  reviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.base,
  },
});
