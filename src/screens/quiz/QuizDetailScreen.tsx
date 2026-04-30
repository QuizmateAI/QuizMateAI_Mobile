import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import QuizAPI from '../../api/QuizAPI';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import type {QuizBackContext, QuizDetailRouteParams} from '../../navigation/QuizStack';

type QuizDetailTab = 'overview' | 'questions' | 'history';

type QuizDetailParams = Partial<QuizDetailRouteParams>;

const tabs: Array<{
  key: QuizDetailTab;
  label: string;
  icon: string;
}> = [
  {key: 'overview', label: 'Tổng quan', icon: 'information-outline'},
  {key: 'questions', label: 'Câu hỏi', icon: 'format-list-bulleted'},
  {key: 'history', label: 'Lịch sử làm bài', icon: 'history'},
];

const intentLabels: Record<string, string> = {
  PRE_LEARNING: 'Trước khi học',
  POST_LEARNING: 'Sau khi học',
  REVIEW: 'Ôn tập',
  PRACTICE: 'Luyện tập',
  MOCK_TEST: 'Thi thử',
  EXAM: 'Kiểm tra',
  REMEDIAL: 'Bù lỗ hổng',
};

const difficultyLabels: Record<string, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
  CUSTOM: 'Tùy chỉnh (Tự cấu hình)',
};

const questionTypeLabels: Record<string, string> = {
  SINGLE_CHOICE: 'Một đáp án',
  MULTIPLE_CHOICE: 'Nhiều đáp án',
  TRUE_FALSE: 'Đúng/Sai',
  TEXT: 'Tự luận',
  FILL_BLANK: 'Điền khuyết',
  MATCHING: 'Ghép cặp',
};

function toArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function firstText(...values: any[]) {
  for (const value of values) {
    if (value == null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function toPositiveNumber(value: any) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function isTruthyFlag(value: any) {
  if (value === true || value === 1 || value === '1') {
    return true;
  }
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === 'passed';
}

function isFalseFlag(value: any) {
  if (value === false || value === 0 || value === '0') {
    return true;
  }
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'false' || normalized === 'no' || normalized === 'failed';
}

function formatDateTime(value: any) {
  if (!value) {
    return 'Không rõ';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatNumber(value: any) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return '';
  }
  return Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(1).replace('.', ',');
}

function getQuizIdFrom(value: any) {
  return toPositiveNumber(value?.quizId || value?.id);
}

function getDurationInMinutes(quiz: any) {
  const directMinutes = toPositiveNumber(
    quiz?.timeLimitMinutes ||
      quiz?.durationInMinute ||
      quiz?.durationMinutes ||
      quiz?.totalDurationMinutes,
  );
  if (directMinutes) {
    return Math.max(1, Math.round(directMinutes));
  }

  const seconds = toPositiveNumber(
    quiz?.timeLimitSeconds ||
      quiz?.durationInSecond ||
      quiz?.durationSeconds ||
      quiz?.duration,
  );
  return seconds ? Math.max(1, Math.round(seconds / 60)) : 0;
}

function getTimerModeLabel(quiz: any) {
  const value = quiz?.timerMode ?? quiz?.isTotalTimer ?? quiz?.timeMode;
  if (
    value === true ||
    value === 'true' ||
    value === 1 ||
    value === '1' ||
    String(value || '').toUpperCase() === 'TOTAL'
  ) {
    return 'Giới hạn thời gian tổng';
  }
  if (
    value === false ||
    value === 'false' ||
    value === 0 ||
    value === '0' ||
    String(value || '').toUpperCase() === 'PER_QUESTION'
  ) {
    return 'Giới hạn theo từng câu';
  }
  return 'Chưa cấu hình';
}

function getIntentLabel(value: any) {
  const normalized = String(value || '').trim().toUpperCase();
  return intentLabels[normalized] || firstText(value, 'Không rõ');
}

function getDifficultyLabel(value: any) {
  const normalized = String(value || '').trim().toUpperCase();
  return difficultyLabels[normalized] || firstText(value, 'Không rõ');
}

function getAudienceLabel(quiz: any, params: QuizDetailParams) {
  const contextType = String(params.contextType || '').toUpperCase();
  if (contextType === 'GROUP' || params.backContext?.type === 'group') {
    const audienceMode = String(quiz?.groupAudienceMode || '').toUpperCase();
    return audienceMode === 'SELECTED_MEMBERS' ? 'Thành viên được giao' : 'Cả nhóm';
  }
  return quiz?.communityShared === true ? 'Công khai' : 'Riêng tư';
}

function getResultLabel(quiz: any, history: any[]) {
  const completedHistory = history.some(
    item => String(item?.status || '').toUpperCase() === 'COMPLETED',
  );
  if (isTruthyFlag(quiz?.myPassed)) {
    return 'Đã đạt';
  }
  if (isFalseFlag(quiz?.myPassed) && (isTruthyFlag(quiz?.myAttempted) || completedHistory)) {
    return 'Chưa đạt';
  }
  if (isTruthyFlag(quiz?.myAttempted) || completedHistory) {
    return 'Đã làm';
  }
  return 'Chưa làm';
}

function getQuestionCount(quiz: any, sections: any[]) {
  const explicitCount = toPositiveNumber(
    quiz?.totalQuestion || quiz?.questionCount || quiz?.totalQuestions,
  );
  if (explicitCount) {
    return Math.round(explicitCount);
  }
  return sections.reduce((count, section) => count + section.questions.length, 0);
}

function buildSections(quiz: any) {
  const rawSections = toArray(quiz?.sections);
  if (rawSections.length > 0) {
    return rawSections.map((section: any, sectionIndex: number) => {
      const questions = toArray(section?.questions).map((question: any, questionIndex: number) => ({
        ...question,
        sectionName:
          section?.name ||
          section?.content ||
          section?.title ||
          `Phần ${sectionIndex + 1}`,
        orderIndex: question?.orderIndex ?? questionIndex + 1,
      }));
      return {
        ...section,
        id: section?.sectionId || section?.id || sectionIndex + 1,
        name:
          section?.name ||
          section?.content ||
          section?.title ||
          `Phần ${sectionIndex + 1}`,
        questions,
      };
    });
  }

  const questions = toArray(quiz?.questions).map((question: any, questionIndex: number) => ({
    ...question,
    sectionName: 'Câu hỏi',
    orderIndex: question?.orderIndex ?? questionIndex + 1,
  }));
  return questions.length > 0
    ? [{id: 'default', name: 'Câu hỏi', questions}]
    : [];
}

function getQuestionText(question: any) {
  return firstText(
    question?.content,
    question?.questionContent,
    question?.questionText,
    question?.text,
    'Câu hỏi chưa có nội dung',
  );
}

function getAnswerText(answer: any) {
  return firstText(
    answer?.content,
    answer?.answerContent,
    answer?.text,
    answer?.answerText,
    answer?.label,
    answer?.value,
    answer?.leftText && answer?.rightText
      ? `${answer.leftText} - ${answer.rightText}`
      : '',
    'Đáp án',
  );
}

function isAnswerCorrect(answer: any) {
  return (
    answer?.isCorrect === true ||
    answer?.correct === true ||
    answer?.is_correct === true ||
    answer?.isCorrect === 1 ||
    answer?.correct === 1 ||
    String(answer?.isCorrect || answer?.correct || '').toLowerCase() === 'true'
  );
}

function getExplanationText(question: any, answers: any[] = []) {
  const answerExplanationSource =
    answers.find(isAnswerCorrect) ||
    answers.find(answer => firstText(answer?.explanation, answer?.reason));
  const answerExplanation = firstText(
    answerExplanationSource?.explanation,
    answerExplanationSource?.reason,
  );
  return firstText(
    question?.explanation,
    question?.explain,
    question?.solution,
    question?.answerExplanation,
    question?.correctAnswerExplanation,
    answerExplanation,
  );
}

function getFallbackCorrectAnswers(question: any, answers: any[] = []) {
  const explicit = [
    question?.correctAnswer,
    question?.correctAnswers,
    question?.expectedAnswer,
    question?.sampleAnswer,
  ];

  const fromQuestion = explicit
    .flatMap(value => (Array.isArray(value) ? value : [value]))
    .map(value => firstText(value))
    .filter(Boolean);

  if (fromQuestion.length > 0) {
    return fromQuestion;
  }

  return answers.filter(isAnswerCorrect).map(getAnswerText).filter(Boolean);
}

function getQuestionKey(question: any, fallbackIndex: number) {
  return String(question?.id || question?.questionId || fallbackIndex);
}

function getMaterialNames(quiz: any) {
  const candidateArrays = [
    quiz?.materials,
    quiz?.materialList,
    quiz?.sources,
    quiz?.sourceMaterials,
    quiz?.references,
    quiz?.documents,
  ];
  const names = candidateArrays.flatMap(item =>
    toArray(item)
      .map(material =>
        typeof material === 'string'
          ? material
          : firstText(
              material?.title,
              material?.name,
              material?.fileName,
              material?.originalName,
              material?.documentName,
            ),
      )
      .filter(Boolean),
  );

  const directNames = firstText(
    quiz?.materialNames,
    quiz?.materialTitles,
    quiz?.referenceMaterials,
  );
  if (directNames) {
    names.push(directNames);
  }

  return Array.from(new Set(names));
}

function getAttemptDate(attempt: any) {
  return (
    attempt?.completedAt ||
    attempt?.submittedAt ||
    attempt?.finishedAt ||
    attempt?.updatedAt ||
    attempt?.startedAt ||
    attempt?.createdAt
  );
}

function sortAttempts(history: any[]) {
  return [...history].sort((left, right) => {
    const leftTime = new Date(getAttemptDate(left) || 0).getTime();
    const rightTime = new Date(getAttemptDate(right) || 0).getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

function getAttemptModeLabel(attempt: any) {
  if (attempt?.isCompanionMode) {
    return 'Luyện tập nói';
  }
  return attempt?.isPracticeMode ? 'Luyện tập' : 'Kiểm tra';
}

function getAttemptScoreLabel(attempt: any) {
  const score = Number(attempt?.displayPercent ?? attempt?.scorePercent ?? attempt?.accuracy);
  if (Number.isFinite(score) && score > 0) {
    const percent = score <= 1 ? score * 100 : score;
    return `${formatNumber(percent)}%`;
  }

  const rawScore = Number(attempt?.score);
  const maxScore = Number(attempt?.maxScore);
  if (Number.isFinite(rawScore) && Number.isFinite(maxScore) && maxScore > 0) {
    return `${formatNumber(rawScore)}/${formatNumber(maxScore)}`;
  }
  if (Number.isFinite(rawScore)) {
    return formatNumber(rawScore);
  }
  return 'Chưa có điểm';
}

function getStatusLabel(value: any) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'COMPLETED' || normalized === 'SUBMITTED') {
    return 'Hoàn thành';
  }
  if (normalized === 'IN_PROGRESS' || normalized === 'STARTED') {
    return 'Đang làm';
  }
  if (normalized === 'ACTIVE') {
    return 'Đang mở';
  }
  if (normalized === 'DRAFT') {
    return 'Nháp';
  }
  return firstText(value, 'Không rõ');
}

function buildBackContext(params: QuizDetailParams, quiz: any): QuizBackContext {
  if (params.backContext) {
    return params.backContext;
  }

  const workspaceId = toPositiveNumber(params.workspaceId || params.contextId || quiz?.workspaceId);
  const groupId = toPositiveNumber(params.groupId || params.contextId || quiz?.groupId);
  const roadmapId = toPositiveNumber(params.roadmapId || quiz?.roadmapId);
  const phaseId = toPositiveNumber(params.phaseId || quiz?.phaseId);
  const contextType = String(params.contextType || quiz?.contextType || '').toUpperCase();

  if (contextType === 'GROUP' && groupId) {
    return {type: 'group', groupId, title: params.title};
  }
  if (contextType === 'WORKSPACE' && workspaceId) {
    return {type: 'workspace', workspaceId, title: params.title};
  }
  if ((contextType === 'ROADMAP' || roadmapId || phaseId) && (workspaceId || groupId)) {
    return {
      type: 'roadmap',
      contextType: groupId ? 'GROUP' : 'WORKSPACE',
      contextId: groupId || workspaceId,
      title: params.title,
      roadmapId: roadmapId || undefined,
      phaseId: phaseId || undefined,
      quizIntent: firstText(params.quizIntent, quiz?.quizIntent).toUpperCase() || undefined,
    };
  }
  return {type: 'quiz-list'};
}

function buildLearningContext(params: QuizDetailParams, quiz: any) {
  const intent = firstText(params.quizIntent, quiz?.quizIntent).toUpperCase();
  const roadmapTitle = firstText(
    params.roadmapTitle,
    quiz?.roadmapTitle,
    quiz?.roadmapName,
    params.backContext?.type === 'roadmap' ? params.backContext.title : '',
  );
  const phaseTitle = firstText(params.phaseTitle, quiz?.phaseTitle, quiz?.phaseName);
  const parts = [];

  if (intent) {
    parts.push(`Phase: ${intent}`);
  }
  if (roadmapTitle) {
    parts.push(`Roadmap ${roadmapTitle}`);
  }
  if (phaseTitle) {
    parts.push(`Giai đoạn ${phaseTitle}`);
  }
  return parts.join(' — ');
}

export default function QuizDetailScreen({navigation, route}: any) {
  const params: QuizDetailParams = route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const initialQuiz = params.quiz || null;
  const initialQuizId = toPositiveNumber(params.quizId || getQuizIdFrom(initialQuiz));
  const [quiz, setQuiz] = useState<any>(initialQuiz);
  const [history, setHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<QuizDetailTab>('overview');
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(Boolean(initialQuizId));
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const effectiveQuiz = useMemo(
    () => ({
      ...(initialQuiz || {}),
      ...(quiz || {}),
    }),
    [initialQuiz, quiz],
  );
  const quizId = initialQuizId || getQuizIdFrom(effectiveQuiz);
  const sections = useMemo(() => buildSections(effectiveQuiz), [effectiveQuiz]);
  const allQuestions = useMemo(
    () => sections.flatMap(section => section.questions),
    [sections],
  );
  const firstQuestionKey = useMemo(
    () => (allQuestions.length > 0 ? getQuestionKey(allQuestions[0], 1) : ''),
    [allQuestions],
  );
  const sortedHistory = useMemo(() => sortAttempts(history), [history]);
  const backContext = useMemo(
    () => buildBackContext(params, effectiveQuiz),
    [effectiveQuiz, params],
  );
  const isRoadmapQuiz =
    backContext.type === 'roadmap' ||
    String(params.contextType || '').toUpperCase() === 'ROADMAP' ||
    Boolean(params.roadmapId || params.phaseId);
  const groupHistoryContextId = useMemo(() => {
    if (backContext.type === 'group') {
      return backContext.groupId;
    }
    if (String(params.contextType || '').toUpperCase() === 'GROUP') {
      return toPositiveNumber(params.contextId || params.groupId);
    }
    return 0;
  }, [backContext, params.contextId, params.contextType, params.groupId]);

  const displayTitle = firstText(
    effectiveQuiz?.title,
    effectiveQuiz?.name,
    params.title,
    'Chi tiết quiz',
  );
  const description = firstText(
    effectiveQuiz?.description,
    effectiveQuiz?.aiDescription,
    effectiveQuiz?.summary,
    effectiveQuiz?.prompt,
  );
  const normalizedIntent = firstText(params.quizIntent, effectiveQuiz?.quizIntent).toUpperCase();
  const durationInMinutes = getDurationInMinutes(effectiveQuiz);
  const materialNames = getMaterialNames(effectiveQuiz);
  const learningContext = buildLearningContext(params, effectiveQuiz);
  const questionCount = getQuestionCount(effectiveQuiz, sections);

  const infoItems = useMemo(
    () => [
      {
        icon: 'creation-outline',
        label: 'Nguồn',
        value:
          String(effectiveQuiz?.createVia || '').toUpperCase() === 'AI'
            ? 'QUIZMATE AI'
            : 'Manual Quiz',
      },
      {
        icon: 'account-lock-outline',
        label: 'Nhóm',
        value: getAudienceLabel(effectiveQuiz, params),
      },
      {
        icon: 'flag-outline',
        label: 'Mục đích',
        value: getIntentLabel(normalizedIntent),
      },
      {
        icon: 'clock-outline',
        label: 'Kiểu thời gian',
        value: getTimerModeLabel(effectiveQuiz),
      },
      {
        icon: 'timer-outline',
        label: 'Thời gian',
        value: durationInMinutes ? `${durationInMinutes} phút` : 'Không giới hạn',
      },
      {
        icon: 'chart-bar',
        label: 'Độ khó tổng thể',
        value: getDifficultyLabel(effectiveQuiz?.overallDifficulty || effectiveQuiz?.difficulty),
      },
      {
        icon: 'target',
        label: 'Điểm đậu (0-10)',
        value: firstText(effectiveQuiz?.passScore, effectiveQuiz?.passingScore, 'Không rõ'),
      },
      {
        icon: 'repeat',
        label: 'Số lần tối đa',
        value: firstText(effectiveQuiz?.maxAttempt, effectiveQuiz?.maxAttempts, 'Không giới hạn'),
      },
      {
        icon: 'check-decagram-outline',
        label: 'Kết quả',
        value: getResultLabel(effectiveQuiz, history),
      },
      {
        icon: 'help-circle-outline',
        label: 'Câu hỏi',
        value: `${questionCount}`,
      },
    ],
    [durationInMinutes, effectiveQuiz, history, normalizedIntent, params, questionCount],
  );

  const fetchHistory = useCallback(
    async (showSpinner = true) => {
      if (!quizId) {
        return;
      }
      if (showSpinner) {
        setHistoryLoading(true);
      }
      try {
        let response;
        if (groupHistoryContextId) {
          try {
            response = await QuizAPI.getGroupAttemptHistory(groupHistoryContextId, quizId);
          } catch {
            response = await QuizAPI.getAttemptHistory(quizId);
          }
        } else {
          response = await QuizAPI.getAttemptHistory(quizId);
        }
        setHistory(Array.isArray(response?.data) ? response.data : []);
      } catch {
        setHistory([]);
      } finally {
        if (showSpinner) {
          setHistoryLoading(false);
        }
      }
    },
    [groupHistoryContextId, quizId],
  );

  const fetchDetail = useCallback(
    async (showSpinner = true) => {
      if (!quizId) {
        setLoadError('Thiếu Quiz ID');
        setLoading(false);
        return;
      }

      if (showSpinner) {
        setLoading(true);
      }
      setLoadError('');
      try {
        const response = await QuizAPI.getFull(quizId);
        const detail = response?.data || {};
        setQuiz({
          ...(initialQuiz || {}),
          ...detail,
        });
      } catch {
        if (!initialQuiz) {
          setLoadError('Không thể tải chi tiết quiz');
        }
        showToast('Không thể tải chi tiết quiz', 'error');
      } finally {
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [initialQuiz, quizId, showToast],
  );

  useEffect(() => {
    fetchDetail();
    fetchHistory(false);
  }, [fetchDetail, fetchHistory]);

  useEffect(() => {
    setExpandedQuestions({});
  }, [quizId]);

  useEffect(() => {
    if (!firstQuestionKey || Object.keys(expandedQuestions).length > 0) {
      return;
    }
    setExpandedQuestions({[firstQuestionKey]: true});
  }, [expandedQuestions, firstQuestionKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchDetail(false), fetchHistory(false)]);
    setRefreshing(false);
  }, [fetchDetail, fetchHistory]);

  const handleBack = useCallback(() => {
    if (
      backContext.type === 'workspace' &&
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
      backContext.type === 'group' &&
      Number.isInteger(backContext.groupId) &&
      backContext.groupId > 0
    ) {
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
      backContext.type === 'roadmap' &&
      Number.isInteger(backContext.contextId) &&
      backContext.contextId > 0
    ) {
      navigation.navigate('Home', {
        screen: 'RoadmapJourney',
        params: {
          contextType: backContext.contextType,
          contextId: backContext.contextId,
          title: backContext.title,
          roadmapId: backContext.roadmapId,
          phaseId: backContext.phaseId,
        },
      });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('GroupList');
  }, [backContext, navigation]);

  const handleStart = useCallback(
    (mode: 'practice' | 'exam') => {
      if (!quizId) {
        showToast('Thiếu Quiz ID', 'error');
        return;
      }
      navigation.navigate(mode === 'practice' ? 'PracticeQuiz' : 'ExamQuiz', {
        quizId,
        title: displayTitle,
        backContext,
        quizDetailParams: {
          quizId,
          title: displayTitle,
          quiz: effectiveQuiz,
          backContext,
          contextType: params.contextType,
          contextId: params.contextId,
          workspaceId: params.workspaceId,
          groupId: params.groupId,
          roadmapId: params.roadmapId,
          phaseId: params.phaseId,
          quizIntent: normalizedIntent || params.quizIntent,
          roadmapTitle: params.roadmapTitle,
          phaseTitle: params.phaseTitle,
        },
      });
    },
    [backContext, displayTitle, effectiveQuiz, navigation, normalizedIntent, params, quizId, showToast],
  );

  const handleOpenAttempt = useCallback(
    (attempt: any) => {
      const attemptId = toPositiveNumber(attempt?.attemptId || attempt?.id);
      if (!attemptId) {
        showToast('Thiếu Attempt ID', 'error');
        return;
      }
      navigation.navigate('QuizResult', {attemptId, backContext});
    },
    [backContext, navigation, showToast],
  );

  const toggleQuestion = useCallback((question: any, fallbackIndex: number) => {
    const key = String(question?.id || question?.questionId || fallbackIndex);
    setExpandedQuestions(prev => ({...prev, [key]: !prev[key]}));
  }, []);

  if (loading && !quiz) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top', 'bottom']}>
      <View
        style={[
          styles.header,
          {backgroundColor: colors.surface, borderBottomColor: colors.border},
        ]}>
        <TouchableOpacity
          onPress={handleBack}
          style={[styles.iconButton, {backgroundColor: colors.surfaceVariant}]}
          activeOpacity={0.7}>
          <Icon name="chevron-left" size={24} color={colors.heading} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, {color: colors.heading}]} numberOfLines={1}>
            Chi tiết quiz
          </Text>
          <Text style={[styles.headerSubtitle, {color: colors.textSecondary}]} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }>
        {loadError ? (
          <View
            style={[
              styles.emptyState,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <Icon name="alert-circle-outline" size={36} color={Colors.error} />
            <Text style={[styles.emptyTitle, {color: colors.heading}]}>{loadError}</Text>
          </View>
        ) : (
          <>
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: isDark ? colors.shadow : '#0F172A',
                },
              ]}>
              <View style={styles.heroTopRow}>
                <View
                  style={[
                    styles.heroIcon,
                    {backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : '#EFF6FF'},
                  ]}>
                  <Icon name="clipboard-text-outline" size={24} color={Colors.primary} />
                </View>
                <View style={styles.heroBadges}>
                  {normalizedIntent ? (
                    <View
                      style={[
                        styles.pill,
                        {backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : '#DBEAFE'},
                      ]}>
                      <Text style={[styles.pillText, {color: Colors.primary}]}>
                        {getIntentLabel(normalizedIntent)}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.pill,
                      {backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : '#D1FAE5'},
                    ]}>
                    <Text style={[styles.pillText, {color: isDark ? '#34D399' : '#059669'}]}>
                      {getStatusLabel(effectiveQuiz?.status || 'ACTIVE')}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={[styles.heroTimer, {color: Colors.primary}]}>
                {getTimerModeLabel(effectiveQuiz)}
              </Text>
              <Text style={[styles.heroTitle, {color: colors.heading}]}>
                {displayTitle}
              </Text>
              {description ? (
                <Text style={[styles.description, {color: colors.textSecondary}]}>
                  {description}
                </Text>
              ) : null}
              {learningContext ? (
                <View
                  style={[
                    styles.contextBox,
                    {
                      backgroundColor: isDark ? 'rgba(15,23,42,0.85)' : '#F8FAFC',
                      borderColor: colors.border,
                    },
                  ]}>
                  <Icon name="map-marker-path" size={16} color={Colors.primary} />
                  <Text style={[styles.contextText, {color: colors.textSecondary}]}>
                    {learningContext}
                  </Text>
                </View>
              ) : null}
            </View>

            <View
              style={[
                styles.tabs,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              {tabs.map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setActiveTab(tab.key)}
                    style={[
                      styles.tabButton,
                      isActive && {
                        backgroundColor: isDark ? 'rgba(37,99,235,0.18)' : '#EFF6FF',
                      },
                    ]}
                    activeOpacity={0.7}>
                    <Icon
                      name={tab.icon}
                      size={16}
                      color={isActive ? Colors.primary : colors.textTertiary}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tabLabel,
                        {color: isActive ? Colors.primary : colors.textSecondary},
                      ]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeTab === 'overview' ? (
              <View style={styles.section}>
                <View style={styles.infoGrid}>
                  {infoItems.map(item => (
                    <InfoTile
                      key={`${item.label}-${item.value}`}
                      icon={item.icon}
                      label={item.label}
                      value={item.value}
                      colors={colors}
                      isDark={isDark}
                    />
                  ))}
                </View>
                {materialNames.length > 0 ? (
                  <View
                    style={[
                      styles.panel,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <View style={styles.panelTitleRow}>
                      <Icon name="book-open-page-variant-outline" size={18} color={Colors.primary} />
                      <Text style={[styles.panelTitle, {color: colors.heading}]}>
                        Tài liệu tham khảo
                      </Text>
                    </View>
                    <Text style={[styles.panelText, {color: colors.textSecondary}]}>
                      {materialNames.join(', ')}
                    </Text>
                  </View>
                ) : null}
                <View
                  style={[
                    styles.panel,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.panelTitleRow}>
                    <Icon name="calendar-clock" size={18} color={Colors.primary} />
                    <Text style={[styles.panelTitle, {color: colors.heading}]}>
                      Ngày tạo
                    </Text>
                  </View>
                  <Text style={[styles.panelText, {color: colors.textSecondary}]}>
                    {formatDateTime(effectiveQuiz?.createdAt)}
                  </Text>
                </View>
              </View>
            ) : null}

            {activeTab === 'questions' ? (
              <View style={styles.section}>
                {allQuestions.length === 0 ? (
                  <View
                    style={[
                      styles.emptyState,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <Icon name="help-circle-outline" size={36} color={colors.textTertiary} />
                    <Text style={[styles.emptyTitle, {color: colors.heading}]}>
                      Chưa có câu hỏi
                    </Text>
                    <Text style={[styles.emptySubtitle, {color: colors.textSecondary}]}>
                      Kéo xuống để làm mới nếu quiz vừa được tạo.
                    </Text>
                  </View>
                ) : (
                  sections.map((section, sectionIndex) => (
                    <View key={String(section.id || sectionIndex)} style={styles.questionSection}>
                      <View style={styles.questionSectionHeader}>
                        <Text style={[styles.questionSectionTitle, {color: colors.heading}]}>
                          {section.name}
                        </Text>
                        <Text style={[styles.questionSectionCount, {color: colors.textSecondary}]}>
                          {section.questions.length} câu
                        </Text>
                      </View>
                      {section.questions.map((question: any, questionIndex: number) => {
                        const globalIndex =
                          sections
                            .slice(0, sectionIndex)
                            .reduce((count, item) => count + item.questions.length, 0) +
                          questionIndex +
                          1;
                        const questionKey = getQuestionKey(question, globalIndex);
                        const expanded = Boolean(expandedQuestions[questionKey]);
                        const type = firstText(question?.questionType, question?.type).toUpperCase();
                        const answers = toArray(question?.answers);
                        const explanation = getExplanationText(question, answers);
                        const fallbackCorrectAnswers = getFallbackCorrectAnswers(question, answers);
                        return (
                          <TouchableOpacity
                            key={questionKey}
                            activeOpacity={0.78}
                            onPress={() => toggleQuestion(question, globalIndex)}
                            style={[
                              styles.questionCard,
                              {backgroundColor: colors.surface, borderColor: colors.border},
                            ]}>
                            <View style={styles.questionHeader}>
                              <View style={styles.questionIndex}>
                                <Text style={styles.questionIndexText}>{globalIndex}</Text>
                              </View>
                              <View style={styles.questionMain}>
                                <Text style={[styles.questionText, {color: colors.heading}]}>
                                  {getQuestionText(question)}
                                </Text>
                                <View style={styles.questionMetaRow}>
                                  <Text style={[styles.questionMeta, {color: colors.textSecondary}]}>
                                    {questionTypeLabels[type] || firstText(type, 'Câu hỏi')}
                                  </Text>
                                  {question?.difficulty ? (
                                    <Text style={[styles.questionMeta, {color: colors.textSecondary}]}>
                                      {getDifficultyLabel(question.difficulty)}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                              <Icon
                                name={expanded ? 'chevron-up' : 'chevron-down'}
                                size={20}
                                color={colors.textTertiary}
                              />
                            </View>
                            {expanded ? (
                              <View style={styles.answerList}>
                                {answers.length > 0 ? (
                                  answers.map((answer: any, answerIndex: number) => {
                                    const correct = isAnswerCorrect(answer);
                                    return (
                                      <View
                                        key={String(answer?.id || answer?.answerId || answerIndex)}
                                        style={[
                                          styles.answerRow,
                                          {
                                            backgroundColor: correct
                                              ? isDark
                                                ? 'rgba(16,185,129,0.16)'
                                                : '#ECFDF5'
                                              : isDark
                                              ? 'rgba(15,23,42,0.7)'
                                              : '#F8FAFC',
                                            borderColor: correct
                                              ? isDark
                                                ? 'rgba(52,211,153,0.45)'
                                                : '#A7F3D0'
                                              : 'transparent',
                                          },
                                        ]}>
                                        <Text
                                          style={[
                                            styles.answerPrefix,
                                            {color: correct ? '#059669' : Colors.primary},
                                          ]}>
                                          {String.fromCharCode(65 + answerIndex)}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.answerText,
                                            {color: correct ? (isDark ? '#A7F3D0' : '#047857') : colors.textSecondary},
                                          ]}>
                                          {getAnswerText(answer)}
                                        </Text>
                                        {correct ? (
                                          <Icon
                                            name="check-circle-outline"
                                            size={18}
                                            color={isDark ? '#34D399' : '#059669'}
                                          />
                                        ) : null}
                                      </View>
                                    );
                                  })
                                ) : fallbackCorrectAnswers.length > 0 ? (
                                  <View
                                    style={[
                                      styles.correctAnswerBox,
                                      {
                                        backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : '#ECFDF5',
                                        borderColor: isDark ? 'rgba(52,211,153,0.45)' : '#A7F3D0',
                                      },
                                    ]}>
                                    <Icon name="check-circle-outline" size={18} color={isDark ? '#34D399' : '#059669'} />
                                    <View style={styles.correctAnswerContent}>
                                      <Text style={[styles.correctAnswerLabel, {color: isDark ? '#A7F3D0' : '#047857'}]}>
                                        Đáp án đúng
                                      </Text>
                                      <Text style={[styles.correctAnswerText, {color: isDark ? '#D1FAE5' : '#065F46'}]}>
                                        {fallbackCorrectAnswers.join(' / ')}
                                      </Text>
                                    </View>
                                  </View>
                                ) : (
                                  <Text style={[styles.noAnswerText, {color: colors.textSecondary}]}>
                                    Câu hỏi này không có lựa chọn hiển thị.
                                  </Text>
                                )}
                                {explanation ? (
                                  <View
                                    style={[
                                      styles.explanationBox,
                                      {
                                        backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB',
                                        borderColor: isDark ? 'rgba(251,191,36,0.35)' : '#FDE68A',
                                      },
                                    ]}>
                                    <Icon
                                      name="lightbulb-on-outline"
                                      size={17}
                                      color={isDark ? '#FBBF24' : '#D97706'}
                                    />
                                    <Text style={[styles.explanationText, {color: isDark ? '#FDE68A' : '#92400E'}]}>
                                      <Text style={styles.explanationLabel}>Giải thích: </Text>
                                      {explanation}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))
                )}
              </View>
            ) : null}

            {activeTab === 'history' ? (
              <View style={styles.section}>
                {historyLoading ? (
                  <View
                    style={[
                      styles.emptyState,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <LoadingSpinner />
                  </View>
                ) : sortedHistory.length === 0 ? (
                  <View
                    style={[
                      styles.emptyState,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <Icon name="history" size={36} color={colors.textTertiary} />
                    <Text style={[styles.emptyTitle, {color: colors.heading}]}>
                      Chưa có lịch sử làm bài
                    </Text>
                    <Text style={[styles.emptySubtitle, {color: colors.textSecondary}]}>
                      Sau khi làm quiz, kết quả sẽ xuất hiện tại đây.
                    </Text>
                  </View>
                ) : (
                  sortedHistory.map((attempt, index) => {
                    const status = String(attempt?.status || '').toUpperCase();
                    const completed = status === 'COMPLETED' || status === 'SUBMITTED';
                    return (
                      <TouchableOpacity
                        key={String(attempt?.attemptId || attempt?.id || index)}
                        activeOpacity={0.75}
                        onPress={() => handleOpenAttempt(attempt)}
                        style={[
                          styles.historyCard,
                          {backgroundColor: colors.surface, borderColor: colors.border},
                        ]}>
                        <View
                          style={[
                            styles.historyStatusIcon,
                            {
                              backgroundColor: completed
                                ? isDark
                                  ? 'rgba(16,185,129,0.16)'
                                  : '#D1FAE5'
                                : isDark
                                ? 'rgba(245,158,11,0.16)'
                                : '#FEF3C7',
                            },
                          ]}>
                          <Icon
                            name={completed ? 'check-circle-outline' : 'clock-outline'}
                            size={20}
                            color={completed ? '#059669' : '#D97706'}
                          />
                        </View>
                        <View style={styles.historyMain}>
                          <Text style={[styles.historyTitle, {color: colors.heading}]}>
                            {formatDateTime(getAttemptDate(attempt))}
                          </Text>
                          <Text style={[styles.historyMeta, {color: colors.textSecondary}]}>
                            {getAttemptModeLabel(attempt)} • {getStatusLabel(attempt?.status)}
                          </Text>
                        </View>
                        <View style={styles.historyScoreBox}>
                          <Text style={[styles.historyScore, {color: Colors.primary}]}>
                            {getAttemptScoreLabel(attempt)}
                          </Text>
                          <Icon name="chevron-right" size={18} color={colors.textTertiary} />
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {backgroundColor: colors.surface, borderTopColor: colors.border},
        ]}>
        {!isRoadmapQuiz ? (
          <TouchableOpacity
            onPress={() => handleStart('practice')}
            activeOpacity={0.75}
            style={[
              styles.footerButton,
              styles.practiceButton,
              {
                borderColor: isDark ? 'rgba(37,99,235,0.45)' : '#BFDBFE',
                backgroundColor: isDark ? 'rgba(37,99,235,0.14)' : '#EFF6FF',
              },
            ]}>
            <Icon name="play-outline" size={18} color={Colors.primary} />
            <Text style={[styles.footerButtonText, {color: Colors.primary}]}>
              Luyện tập
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => handleStart('exam')}
          activeOpacity={0.75}
          style={[styles.footerButton, styles.examButton]}>
          <Icon name="clipboard-check-outline" size={18} color="#FFFFFF" />
          <Text style={[styles.footerButtonText, {color: '#FFFFFF'}]}>
            Kiểm tra
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function InfoTile({
  icon,
  label,
  value,
  colors,
  isDark,
}: {
  icon: string;
  label: string;
  value: any;
  colors: any;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.infoTile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: isDark ? colors.shadow : '#0F172A',
        },
      ]}>
      <View
        style={[
          styles.infoIcon,
          {backgroundColor: isDark ? 'rgba(37,99,235,0.14)' : '#EFF6FF'},
        ]}>
        <Icon name={icon} size={17} color={Colors.primary} />
      </View>
      <Text style={[styles.infoLabel, {color: colors.textTertiary}]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.infoValue, {color: colors.heading}]} numberOfLines={3}>
        {firstText(value, 'Không rõ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {flex: 1, minWidth: 0},
  headerTitle: {fontSize: 18, fontWeight: '700'},
  headerSubtitle: {fontSize: 12, marginTop: 2},
  scroll: {flex: 1},
  content: {
    padding: Spacing.base,
    paddingBottom: 112,
    gap: Spacing.base,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    flex: 1,
  },
  pill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: {fontSize: 11, fontWeight: '700'},
  heroTimer: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 6,
  },
  heroTitle: {fontSize: 20, lineHeight: 28, fontWeight: '800'},
  description: {fontSize: 14, lineHeight: 21, marginTop: Spacing.sm},
  contextBox: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    gap: 8,
  },
  contextText: {flex: 1, fontSize: 13, lineHeight: 19},
  tabs: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 3,
  },
  tabLabel: {fontSize: 11, fontWeight: '700'},
  section: {gap: Spacing.base},
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  infoTile: {
    width: '48%',
    minHeight: 118,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  infoLabel: {fontSize: 11, fontWeight: '700', textTransform: 'uppercase'},
  infoValue: {fontSize: 14, lineHeight: 19, fontWeight: '700', marginTop: 4},
  panel: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.base,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  panelTitle: {fontSize: 15, fontWeight: '700'},
  panelText: {fontSize: 14, lineHeight: 20},
  emptyState: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {fontSize: 15, fontWeight: '700', marginTop: 10, textAlign: 'center'},
  emptySubtitle: {fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 19},
  questionSection: {gap: Spacing.sm},
  questionSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  questionSectionTitle: {fontSize: 16, fontWeight: '800'},
  questionSectionCount: {fontSize: 12, fontWeight: '600'},
  questionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  questionHeader: {flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start'},
  questionIndex: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionIndexText: {color: '#FFFFFF', fontSize: 12, fontWeight: '800'},
  questionMain: {flex: 1, minWidth: 0},
  questionText: {fontSize: 14, lineHeight: 20, fontWeight: '700'},
  questionMetaRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6},
  questionMeta: {fontSize: 11, fontWeight: '600'},
  answerList: {marginTop: Spacing.md, gap: Spacing.sm},
  answerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  answerPrefix: {width: 18, fontSize: 12, fontWeight: '800'},
  answerText: {flex: 1, fontSize: 13, lineHeight: 18},
  noAnswerText: {fontSize: 13, fontStyle: 'italic'},
  correctAnswerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  correctAnswerContent: {flex: 1, minWidth: 0},
  correctAnswerLabel: {fontSize: 11, fontWeight: '800', marginBottom: 2},
  correctAnswerText: {fontSize: 13, lineHeight: 18, fontWeight: '600'},
  explanationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  explanationText: {flex: 1, fontSize: 12, lineHeight: 18},
  explanationLabel: {fontWeight: '800'},
  historyCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  historyStatusIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyMain: {flex: 1, minWidth: 0},
  historyTitle: {fontSize: 14, fontWeight: '700'},
  historyMeta: {fontSize: 12, marginTop: 3},
  historyScoreBox: {flexDirection: 'row', alignItems: 'center', gap: 4},
  historyScore: {fontSize: 13, fontWeight: '800'},
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.base,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  footerButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  practiceButton: {borderWidth: 1},
  examButton: {backgroundColor: Colors.primary},
  footerButtonText: {fontSize: 14, fontWeight: '800'},
});
