import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
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
import Dialog from '../../components/ui/Dialog';
import QuestionCard from '../../components/features/QuestionCard';
import QuizAPI from '../../api/QuizAPI';
import {storage} from '../../utils/storage';
import {
  VOICE_PRACTICE_CONFIG_STORAGE_KEY,
  VOICE_PRACTICE_PRESETS,
  createDefaultVoicePracticeConfig,
  detectVoicePracticePresetId,
  isMultipleChoiceQuestion,
  isMatchingQuestion,
  isTextAnswerQuestion,
  resolveVoicePracticeConfig,
  type VoicePracticeConfig,
} from '../../utils/voicePractice';
import {MatchingPair} from '../../components/features/MatchingQuestion';

const VOICE_SETTING_FIELDS: Array<{
  key: keyof VoicePracticeConfig;
  label: string;
  description: string;
  min: number;
  max: number;
  minHint: string;
  maxHint: string;
  step: number;
  formatValue: (value: number) => string;
}> = [
  {
    key: 'silenceThresholdDb',
    label: 'Độ nhạy micro',
    description: 'Tăng nếu bạn ở nơi ồn. Giảm nếu bạn nói nhỏ hoặc đứng xa máy.',
    min: -60,
    max: -20,
    minHint: 'Nhạy hơn',
    maxHint: 'Ít nhạy hơn',
    step: 5,
    formatValue: value => `${value} dB`,
  },
  {
    key: 'silenceDurationMs',
    label: 'Chờ sau khi im lặng',
    description: 'Ứng dụng đợi bấy lâu sau khi bạn dừng nói rồi mới tự gửi câu trả lời.',
    min: 500,
    max: 5000,
    minHint: 'Phản hồi nhanh hơn',
    maxHint: 'Chờ lâu hơn',
    step: 500,
    formatValue: value => formatVoiceSeconds(value),
  },
  {
    key: 'maxRecordingMs',
    label: 'Thời gian tối đa mỗi câu',
    description: 'Giới hạn độ dài của một lần trả lời bằng giọng nói.',
    min: 5000,
    max: 45000,
    minHint: 'Ngắn hơn',
    maxHint: 'Dài hơn',
    step: 1000,
    formatValue: value => formatVoiceSeconds(value),
  },
  {
    key: 'minSpeechMs',
    label: 'Nói đủ lâu trước khi tự dừng',
    description:
      'Ứng dụng chỉ tự gửi sau khi đã nghe bạn nói ít nhất chừng này rồi bạn im lặng.',
    min: 300,
    max: 2000,
    minHint: 'Dừng sớm hơn',
    maxHint: 'Chắc chắn hơn',
    step: 500,
    formatValue: value => formatVoiceSeconds(value),
  },
];

function formatVoiceSeconds(ms: number) {
  const seconds = ms / 1000;
  const formatted = Number.isInteger(seconds)
    ? String(seconds)
    : seconds.toFixed(1).replace('.', ',');
  return `${formatted} giây`;
}

function describeSensitivity(thresholdDb: number) {
  if (thresholdDb <= -45) {
    return 'Nhạy hơn, phù hợp khi bạn nói nhỏ hoặc để máy hơi xa.';
  }
  if (thresholdDb <= -39) {
    return 'Mức vừa, phù hợp đa số môi trường bình thường.';
  }
  return 'Ít nhạy hơn, phù hợp nơi có nhiều tiếng ồn nền.';
}

function buildVoiceConfigHighlights(config: VoicePracticeConfig) {
  return [
    {
      key: 'sensitivity',
      title: 'Độ nhạy micro',
      description: describeSensitivity(config.silenceThresholdDb),
    },
    {
      key: 'silence',
      title: 'Tự dừng sau khi im lặng',
      description: `Ứng dụng sẽ đợi ${formatVoiceSeconds(
        config.silenceDurationMs,
      )} sau khi bạn dừng nói rồi tự gửi câu trả lời.`,
    },
    {
      key: 'max',
      title: 'Thời gian tối đa mỗi câu',
      description: `Mỗi lần trả lời bằng giọng nói kéo dài tối đa ${formatVoiceSeconds(
        config.maxRecordingMs,
      )}.`,
    },
    {
      key: 'min',
      title: 'Nói đủ lâu rồi mới tự dừng',
      description: `Ứng dụng sẽ chờ bạn nói ít nhất ${formatVoiceSeconds(
        config.minSpeechMs,
      )} rồi mới tự gửi sau khi bạn im lặng.`,
    },
  ];
}

export default function PracticeQuizScreen({navigation, route}: any) {
  const {quizId, title, backContext, quizDetailParams} = route.params;
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
  const [matchingPairsByQuestion, setMatchingPairsByQuestion] = useState<
    Record<number, MatchingPair[]>
  >({});
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState<
    Record<number, boolean>
  >({});
  const [questionFeedback, setQuestionFeedback] = useState<Record<number, any>>({});
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [voiceConfigDialogVisible, setVoiceConfigDialogVisible] = useState(false);
  const [voiceConfig, setVoiceConfig] = useState<VoicePracticeConfig>(
    createDefaultVoicePracticeConfig(),
  );
  const [voiceConfigDraft, setVoiceConfigDraft] = useState<VoicePracticeConfig>(
    createDefaultVoicePracticeConfig(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [voiceEligibility, setVoiceEligibility] = useState<{
    canUseVoice: boolean;
    reason?: string;
  } | null>(null);

  const handleBack = useCallback(() => {
    if (quizDetailParams?.quizId) {
      navigation.navigate('QuizDetail', quizDetailParams);
      return;
    }
    if (
      backContext?.type === 'collection' &&
      Number.isInteger(backContext.workspaceId) &&
      backContext.workspaceId > 0 &&
      Number.isInteger(backContext.collectionId) &&
      backContext.collectionId > 0
    ) {
      const collectionParams = {
        workspaceId: backContext.workspaceId,
        title: backContext.title,
        initialCollectionId: backContext.collectionId,
        canCreateCollection: backContext.canCreateCollection,
      };
      const routeNames = navigation.getState?.()?.routeNames || [];
      if (routeNames.includes('QuizCollection')) {
        navigation.navigate('QuizCollection', collectionParams);
      } else {
        navigation.navigate('Home', {
          screen: 'QuizCollection',
          params: collectionParams,
        });
      }
      return;
    }
    navigation.goBack();
  }, [backContext, navigation, quizDetailParams]);

  useEffect(() => {
    let active = true;

    storage
      .get<VoicePracticeConfig>(VOICE_PRACTICE_CONFIG_STORAGE_KEY)
      .then(savedConfig => {
        if (!active) {
          return;
        }
        const resolvedConfig = resolveVoicePracticeConfig(savedConfig);
        setVoiceConfig(resolvedConfig);
        setVoiceConfigDraft(resolvedConfig);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const activeVoicePresetId = useMemo(
    () => detectVoicePracticePresetId(voiceConfig),
    [voiceConfig],
  );
  const activeVoicePresetLabel = useMemo(
    () =>
      VOICE_PRACTICE_PRESETS.find(preset => preset.id === activeVoicePresetId)?.label ||
      'Tùy chỉnh',
    [activeVoicePresetId],
  );
  const activeVoicePresetDescription = useMemo(
    () =>
      VOICE_PRACTICE_PRESETS.find(preset => preset.id === activeVoicePresetId)
        ?.description || 'Bạn có thể chỉnh chi tiết theo cách nói của mình.',
    [activeVoicePresetId],
  );
  const draftVoicePresetId = useMemo(
    () => detectVoicePracticePresetId(voiceConfigDraft),
    [voiceConfigDraft],
  );
  const voiceConfigHighlights = useMemo(
    () => buildVoiceConfigHighlights(voiceConfig),
    [voiceConfig],
  );
  const draftVoiceConfigHighlights = useMemo(
    () => buildVoiceConfigHighlights(voiceConfigDraft),
    [voiceConfigDraft],
  );

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
    QuizAPI.getFull(quizId, attemptId ? {attemptId} : undefined)
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
          error?.response?.data?.message || error?.message || 'Không thể tải quiz',
          'error',
        ),
      )
      .finally(() => setLoading(false));
  }, [quizId, attemptId, showToast]);

  useEffect(() => {
    let active = true;
    QuizAPI.getVoiceEligibility(Number(quizId))
      .then((res: any) => {
        if (!active) {
          return;
        }
        setVoiceEligibility(res?.data || null);
      })
      .catch(() => {
        // Lỗi BE → mặc định cho phép, không chặn user.
        if (!active) {
          return;
        }
        setVoiceEligibility({canUseVoice: true});
      });
    return () => {
      active = false;
    };
  }, [quizId]);

  const handleStart = async () => {
    try {
      const res = await QuizAPI.startAttempt(quizId, {isPracticeMode: true});
      const attempt = res.data || {};
      const nextAttemptId = Number(attempt?.id || attempt?.attemptId || 0);
      setAttemptId(nextAttemptId || null);

      const restoredSelectedAnswerIds: Record<number, number[]> = {};
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
          ? item.selectedAnswerIds
              .map((value: any) => Number(value))
              .filter((value: number) => Number.isFinite(value))
          : [];

        if (selectedAnswerIds.length > 0) {
          restoredSelectedAnswerIds[qid] = selectedAnswerIds;
          restoredSubmitted[qid] = true;
        }

        if (typeof item?.textAnswer === 'string' && item.textAnswer.trim()) {
          restoredTextAnswers[qid] = item.textAnswer;
          restoredSubmitted[qid] = true;
        }
      });

      setSelectedAnswerIdsByQuestion(restoredSelectedAnswerIds);
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
        error?.response?.data?.message || error?.message || 'Không thể bắt đầu quiz',
        'error',
      );
    }
  };

  const handleSelectAnswer = (questionId: number, answerId: number) => {
    if (submittedQuestionIds[questionId]) {
      return;
    }
    setSelectedAnswerIdsByQuestion(prev => ({...prev, [questionId]: [answerId]}));
  };

  const handleToggleAnswer = (questionId: number, answerId: number) => {
    if (submittedQuestionIds[questionId]) {
      return;
    }
    setSelectedAnswerIdsByQuestion(prev => {
      const currentIds = Array.isArray(prev[questionId]) ? prev[questionId] : [];
      const nextIds = currentIds.includes(answerId)
        ? currentIds.filter(id => id !== answerId)
        : [...currentIds, answerId];

      return {
        ...prev,
        [questionId]: nextIds,
      };
    });
  };

  const handleChangeTextAnswer = (questionId: number, text: string) => {
    if (submittedQuestionIds[questionId]) {
      return;
    }
    setTextAnswers(prev => ({...prev, [questionId]: text}));
  };

  const handleMatchingPairChange = (questionId: number, pairs: MatchingPair[]) => {
    if (submittedQuestionIds[questionId]) {
      return;
    }
    setMatchingPairsByQuestion(prev => ({...prev, [questionId]: pairs}));
  };

  const getMatchingItems = (question: any) => {
    if (!isMatchingQuestion(question)) {
      return {
        leftItems: [],
        rightItems: [],
      };
    }

    const answers = question?.answers || [];
    const correctAnswer = answers.find((a: any) => a.isCorrect);
    const pairs: Array<{leftKey: string; rightKey: string}> =
      Array.isArray(correctAnswer?.matchingPairs) ? correctAnswer.matchingPairs : [];
    return {
      leftItems: pairs.map((p: any) => p.leftKey),
      rightItems: pairs.map((p: any) => p.rightKey),
    };
  };

  const handleViewResult = async () => {
    if (!attemptId) {
      showToast('Không tìm thấy lượt làm bài', 'error');
      return;
    }

    const currentQuestion = questions[currentIndex];
    if (!currentQuestion?.id) {
      showToast('Không tìm thấy câu hỏi', 'error');
      return;
    }

    const questionId = Number(currentQuestion.id);
    if (submittedQuestionIds[questionId]) {
      return;
    }

    const text = (textAnswers[questionId] || '').trim();
    const selectedAnswerIds = Array.isArray(selectedAnswerIdsByQuestion[questionId])
      ? selectedAnswerIdsByQuestion[questionId]
      : [];
    const matchingPairs = matchingPairsByQuestion[questionId] || [];
    if (!text && selectedAnswerIds.length === 0 && matchingPairs.length === 0) {
      showToast('Hãy chọn câu trả lời để xem đáp án', 'error');
      return;
    }

    try {
      const res = await QuizAPI.submitPracticeQuestion(attemptId, {
        questionId,
        selectedAnswerIds,
        textAnswer: text || null,
        matchingPairs: matchingPairs.length > 0 ? matchingPairs : null,
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
          'Không thể xem kết quả',
        'error',
      );
    }
  };

  const handleSubmit = async () => {
    if (!attemptId) {
      showToast('Không tìm thấy lượt làm bài', 'error');
      return;
    }
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

  const handleSubmitGuarded = async () => {
    if (submitting) {
      return;
    }
    if (!attemptId) {
      showToast('Không tìm thấy lượt làm bài', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await handleSubmit();
    } finally {
      setSubmitting(false);
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

  const openVoiceConfigDialog = () => {
    if (voiceEligibility && voiceEligibility.canUseVoice === false) {
      Alert.alert(
        'Không thể luyện tập bằng giọng nói',
        voiceEligibility.reason ||
          'Quiz có dạng câu hỏi không hỗ trợ làm bằng giọng nói (ghép cặp hoặc dựa trên hình ảnh). Vui lòng chọn "Luyện tập thường".',
        [{text: 'Đã hiểu'}],
      );
      return;
    }
    setVoiceConfigDraft(voiceConfig);
    setVoiceConfigDialogVisible(true);
  };

  const closeVoiceConfigDialog = () => {
    setVoiceConfigDialogVisible(false);
    setVoiceConfigDraft(voiceConfig);
  };

  const adjustVoiceConfigDraft = (
    key: keyof VoicePracticeConfig,
    delta: number,
  ) => {
    setVoiceConfigDraft(prev =>
      resolveVoicePracticeConfig({
        ...prev,
        [key]: prev[key] + delta,
      }),
    );
  };

  const handleApplyVoicePreset = (presetConfig: VoicePracticeConfig) => {
    setVoiceConfigDraft(resolveVoicePracticeConfig(presetConfig));
  };

  const handleResetVoiceConfig = () => {
    setVoiceConfigDraft(createDefaultVoicePracticeConfig());
  };

  const handleStartVoicePractice = async () => {
    const nextConfig = resolveVoicePracticeConfig(voiceConfigDraft);
    setVoiceConfig(nextConfig);
    setVoiceConfigDialogVisible(false);

    try {
      await storage.set(VOICE_PRACTICE_CONFIG_STORAGE_KEY, nextConfig);
    } catch {}

    navigation.navigate('VoicePracticeQuiz', {
      quizId,
      title: title || quiz?.name,
      backContext,
      autoStart: true,
      voiceConfig: nextConfig,
    });
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
  const currentSelectedAnswerIds = currentQuestion
    ? selectedAnswerIdsByQuestion[currentQuestion.id] || []
    : [];

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
              {questions.length} câu hỏi
            </Text>
            <Button
              title="Luyện tập thường"
              onPress={handleStart}
              style={styles.startBtn}
            />
            <Button
              title="Luyện tập bằng giọng nói"
              variant="secondary"
              icon="microphone-outline"
              onPress={openVoiceConfigDialog}
              style={styles.startBtn}
            />
            <View
              style={[
                styles.voiceSummaryCard,
                {
                  backgroundColor: isDark ? Colors.dark.surfaceVariant : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}>
              <View style={styles.voiceSummaryHeader}>
                <View
                  style={[
                    styles.voiceSummaryIconWrap,
                    {backgroundColor: isDark ? 'rgba(37,99,235,0.14)' : '#EFF6FF'},
                  ]}>
                  <Icon name="tune-vertical" size={16} color={Colors.primary} />
                </View>
                <View style={styles.voiceSummaryHeaderText}>
                  <Text style={[styles.voiceSummaryTitle, {color: colors.heading}]}>
                    Cấu hình hiện tại
                  </Text>
                  <Text style={[styles.voiceSummaryPreset, {color: Colors.primary}]}>
                    {activeVoicePresetLabel}
                  </Text>
                </View>
              </View>
              <Text style={[styles.voiceSummaryText, {color: colors.textSecondary}]}>
                {activeVoicePresetDescription}
              </Text>
              <View style={styles.voiceHighlightList}>
                {voiceConfigHighlights.slice(0, 3).map(item => (
                  <View key={item.key} style={styles.voiceHighlightRow}>
                    <View
                      style={[
                        styles.voiceHighlightDot,
                        {backgroundColor: Colors.primary},
                      ]}
                    />
                    <Text
                      style={[
                        styles.voiceHighlightText,
                        {color: colors.textSecondary},
                      ]}>
                      <Text style={[styles.voiceHighlightTextStrong, {color: colors.text}]}>
                        {item.title}:{' '}
                      </Text>
                      {item.description}
                    </Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                onPress={openVoiceConfigDialog}
                style={styles.voiceSummaryLink}>
                <Text style={[styles.voiceSummaryLinkText, {color: Colors.primary}]}>
                  Chỉnh trước khi bắt đầu
                </Text>
              </TouchableOpacity>
            </View>
            <Button
              title="Quay lại"
              variant="ghost"
              onPress={handleBack}
            />
          </View>
        </View>
        <Dialog
          visible={voiceConfigDialogVisible}
          onClose={closeVoiceConfigDialog}
          title="Cấu hình luyện giọng nói">
          <ScrollView
            style={styles.voiceDialogScroll}
            showsVerticalScrollIndicator={false}>
            <Text style={[styles.voiceDialogIntro, {color: colors.textSecondary}]}>
              Bạn có thể chọn cấu hình gợi ý nhanh hoặc tinh chỉnh từng thông số ghi âm.
            </Text>
            <View
              style={[
                styles.voiceTipCard,
                {
                  backgroundColor: isDark ? 'rgba(37,99,235,0.12)' : '#EFF6FF',
                  borderColor: isDark ? 'rgba(96,165,250,0.24)' : '#BFDBFE',
                },
              ]}>
              <Text style={[styles.voiceTipTitle, {color: colors.heading}]}>
                Gợi ý nhanh
              </Text>
              <Text style={[styles.voiceTipText, {color: colors.textSecondary}]}>
                Nếu ứng dụng cắt lời bạn quá sớm, hãy tăng mục "Chờ sau khi im lặng".
              </Text>
              <Text style={[styles.voiceTipText, {color: colors.textSecondary}]}>
                Nếu nơi xung quanh ồn, hãy chọn cấu hình "Chống ồn" hoặc tăng ngưỡng ít nhạy hơn.
              </Text>
            </View>

            <Text style={[styles.voiceSectionTitle, {color: colors.heading}]}>
              Cấu hình gợi ý
            </Text>
            <View style={styles.voicePresetList}>
              {VOICE_PRACTICE_PRESETS.map(preset => {
                const isActive = preset.id === draftVoicePresetId;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    activeOpacity={0.8}
                    onPress={() => handleApplyVoicePreset(preset.config)}
                    style={[
                      styles.voicePresetCard,
                      {
                        backgroundColor: isActive
                          ? isDark
                            ? 'rgba(37,99,235,0.18)'
                            : '#EFF6FF'
                          : colors.surface,
                        borderColor: isActive ? Colors.primary : colors.border,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.voicePresetTitle,
                        {color: isActive ? Colors.primary : colors.heading},
                      ]}>
                      {preset.label}
                    </Text>
                    <Text
                      style={[
                        styles.voicePresetDescription,
                        {color: colors.textSecondary},
                      ]}>
                      {preset.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.voiceSectionTitle, {color: colors.heading}]}>
              Tinh chỉnh chi tiết
            </Text>
            {VOICE_SETTING_FIELDS.map(field => {
              const value = voiceConfigDraft[field.key];
              return (
                <View
                  key={field.key}
                  style={[
                    styles.voiceSettingCard,
                    {
                      backgroundColor: isDark
                        ? Colors.dark.surfaceVariant
                        : Colors.light.surfaceVariant,
                      borderColor: colors.border,
                    },
                  ]}>
                  <View style={styles.voiceSettingHeader}>
                    <Text style={[styles.voiceSettingLabel, {color: colors.heading}]}>
                      {field.label}
                    </Text>
                    <Text
                      style={[styles.voiceSettingValue, {color: Colors.primary}]}>
                      {field.formatValue(value)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.voiceSettingDescription,
                      {color: colors.textSecondary},
                    ]}>
                    {field.description}
                  </Text>
                  <View style={styles.voiceStepperRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={value <= field.min}
                      onPress={() =>
                        adjustVoiceConfigDraft(field.key, -field.step)
                      }
                      style={[
                        styles.voiceStepperBtn,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          opacity: value <= field.min ? 0.45 : 1,
                        },
                      ]}>
                      <Icon name="minus" size={18} color={colors.text} />
                    </TouchableOpacity>
                    <View
                      style={[
                        styles.voiceStepperValueWrap,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.voiceStepperValue,
                          {color: colors.heading},
                        ]}>
                        {field.formatValue(value)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={value >= field.max}
                      onPress={() =>
                        adjustVoiceConfigDraft(field.key, field.step)
                      }
                      style={[
                        styles.voiceStepperBtn,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          opacity: value >= field.max ? 0.45 : 1,
                        },
                      ]}>
                      <Icon name="plus" size={18} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.voiceSettingRange}>
                    <Text
                      style={[
                        styles.voiceSettingRangeText,
                        {color: colors.textTertiary},
                      ]}>
                      {field.minHint} ({field.formatValue(field.min)})
                    </Text>
                    <Text
                      style={[
                        styles.voiceSettingRangeText,
                        {color: colors.textTertiary},
                      ]}>
                      {field.maxHint} ({field.formatValue(field.max)})
                    </Text>
                  </View>
                </View>
              );
            })}

            <View
              style={[
                styles.voicePreviewCard,
                {
                  backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5',
                  borderColor: isDark ? 'rgba(52,211,153,0.3)' : '#A7F3D0',
                },
              ]}>
              <Text style={[styles.voicePreviewTitle, {color: colors.heading}]}>
                Cấu hình sẽ áp dụng
              </Text>
              {draftVoiceConfigHighlights.map(item => (
                <View key={item.key} style={styles.voiceHighlightRow}>
                  <View
                    style={[
                      styles.voiceHighlightDot,
                      {backgroundColor: Colors.success},
                    ]}
                  />
                  <Text
                    style={[
                      styles.voiceHighlightText,
                      {color: colors.textSecondary},
                    ]}>
                    <Text style={[styles.voiceHighlightTextStrong, {color: colors.text}]}>
                      {item.title}:{' '}
                    </Text>
                    {item.description}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={styles.voiceDialogActions}>
            <Button
              title="Khôi phục mặc định"
              variant="outline"
              size="md"
              onPress={handleResetVoiceConfig}
              style={styles.voiceDialogSecondaryAction}
            />
            <Button
              title="Bắt đầu làm bằng giọng nói"
              onPress={handleStartVoicePractice}
              style={styles.voiceDialogPrimaryAction}
            />
          </View>
        </Dialog>
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
          onPress={handleBack}
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
            explanation={
              isCurrentSubmitted
                ? currentFeedback?.explanation || currentQuestion.explanation
                : undefined
            }
            showResult={isCurrentSubmitted}
            isMultiChoice={isMultipleChoiceQuestion(currentQuestion)}
            matchedPairs={matchingPairsByQuestion[currentQuestion.id] || []}
            onMatchingPairChange={pairs =>
              handleMatchingPairChange(currentQuestion.id, pairs)
            }
            matchingLeftItems={getMatchingItems(currentQuestion).leftItems}
            matchingRightItems={getMatchingItems(currentQuestion).rightItems}
            correctMatchingPairs={
              isCurrentSubmitted
                ? currentFeedback?.correctMatchingPairs || []
                : []
            }
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
          title="Trước"
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
              title={submitting ? 'Đang nộp...' : 'Nộp bài'}
              size="md"
              disabled={submitting}
              onPress={handleSubmitGuarded}
              fullWidth={false}
              style={{flex: 1, backgroundColor: Colors.success}}
            />
          ) : (
            <Button
              title="Xem kết quả"
              size="md"
              onPress={handleViewResult}
              fullWidth={false}
              style={{flex: 1}}
            />
          )
        ) : (
          <Button
            title={isCurrentSubmitted ? 'Tiếp theo' : 'Xem kết quả'}
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
  voiceSummaryCard: {
    width: '100%',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  voiceSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  voiceSummaryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  voiceSummaryHeaderText: {flex: 1},
  voiceSummaryTitle: {fontSize: 14, fontWeight: '700'},
  voiceSummaryPreset: {fontSize: 12, marginTop: 2, fontWeight: '600'},
  voiceSummaryText: {fontSize: 13, lineHeight: 20, marginBottom: Spacing.sm},
  voiceHighlightList: {gap: 10},
  voiceHighlightRow: {flexDirection: 'row', alignItems: 'flex-start'},
  voiceHighlightDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginTop: 6,
    marginRight: Spacing.sm,
  },
  voiceHighlightText: {flex: 1, fontSize: 12, lineHeight: 19},
  voiceHighlightTextStrong: {fontWeight: '700'},
  voiceSummaryLink: {marginTop: Spacing.sm, alignSelf: 'flex-start'},
  voiceSummaryLinkText: {fontSize: 13, fontWeight: '600'},
  voiceDialogScroll: {maxHeight: 520},
  voiceDialogIntro: {fontSize: 13, lineHeight: 20, marginBottom: Spacing.base},
  voiceTipCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  voiceTipTitle: {fontSize: 14, fontWeight: '700', marginBottom: 6},
  voiceTipText: {fontSize: 12, lineHeight: 18, marginTop: 4},
  voiceSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  voicePresetList: {gap: Spacing.sm, marginBottom: Spacing.base},
  voicePresetCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.base,
  },
  voicePresetTitle: {fontSize: 14, fontWeight: '700', marginBottom: 4},
  voicePresetDescription: {fontSize: 12, lineHeight: 18},
  voiceSettingCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
  },
  voiceSettingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  voiceSettingLabel: {fontSize: 14, fontWeight: '700', flex: 1},
  voiceSettingValue: {fontSize: 13, fontWeight: '700'},
  voiceSettingDescription: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: Spacing.sm,
  },
  voiceStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  voiceStepperBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceStepperValueWrap: {
    flex: 1,
    minHeight: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
  },
  voiceStepperValue: {fontSize: 14, fontWeight: '700'},
  voiceSettingRange: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  voiceSettingRangeText: {fontSize: 11},
  voicePreviewCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.base,
    marginTop: Spacing.sm,
    marginBottom: Spacing.base,
  },
  voicePreviewTitle: {fontSize: 14, fontWeight: '700', marginBottom: 6},
  voicePreviewText: {fontSize: 13, lineHeight: 20},
  voiceDialogActions: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  voiceDialogSecondaryAction: {
    width: '100%',
  },
  voiceDialogPrimaryAction: {
    width: '100%',
  },

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
