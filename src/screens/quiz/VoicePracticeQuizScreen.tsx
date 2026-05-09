import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import AudioRecord from 'react-native-audio-record';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
import QuestionCard from '../../components/features/QuestionCard';
import QuizAPI from '../../api/QuizAPI';
import {
  buildRecordedAudioFile,
  buildVoiceFeedbackPrompt,
  buildVoiceQuestionPrompt,
  compressRecordedAudio,
  computeDbFromPcm16,
  ensureVoiceRecordingPermission,
  findFirstPendingQuestionIndex,
  getQuestionId,
  isMatchingQuestion,
  isMultipleChoiceQuestion,
  isShortAnswerQuestion,
  isTextAnswerQuestion,
  resolveVoicePracticeConfig,
} from '../../utils/voicePractice';

type VoiceState =
  | 'idle'
  | 'reading_question'
  | 'listening'
  | 'processing'
  | 'reading_feedback'
  | 'submitting';

const VOICE_AUTO_CONTINUE_DELAY_MS = 3000;

const createResolvedMap = (
  submitted: Record<number, boolean>,
  skipped: Record<number, boolean>,
) => ({
  ...submitted,
  ...skipped,
});

const getVoiceStateLabel = (voiceState: VoiceState) => {
  switch (voiceState) {
    case 'reading_question':
      return 'AI đang đọc câu hỏi';
    case 'listening':
      return 'Đang nghe câu trả lời của bạn';
    case 'processing':
      return 'Đang xử lý câu trả lời';
    case 'reading_feedback':
      return 'Đang đọc phản hồi';
    case 'submitting':
      return 'Đang hoàn tất bài luyện tập';
    default:
      return 'Sẵn sàng';
  }
};

export default function VoicePracticeQuizScreen({navigation, route}: any) {
  const {t} = useTranslation();
  const {quizId, title, backContext, autoStart, voiceConfig: routeVoiceConfig} =
    route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const voiceConfig = useMemo(
    () => resolveVoicePracticeConfig(routeVoiceConfig),
    [routeVoiceConfig],
  );

  const playerRef = useRef(new AudioRecorderPlayer());
  const audioRecordSubRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const flowTokenRef = useRef(0);
  const activeQuestionIdRef = useRef<number | null>(null);
  const didAutoStartRef = useRef(false);
  const isFinalizingRef = useRef(false);
  const activeSpeechSessionRef = useRef<{
    finish?: (result: 'finished' | 'cancelled' | 'error') => void;
  } | null>(null);
  const recordingSessionRef = useRef<{
    uri: string;
    startTime: number;
    speechDetectedAt: number | null;
    lastVoiceAt: number | null;
    stopRequested: boolean;
  }>({
    uri: '',
    startTime: 0,
    speechDetectedAt: null,
    lastVoiceAt: null,
    stopRequested: false,
  });

  const [quiz, setQuiz] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingAttempt, setStartingAttempt] = useState(false);
  const [started, setStarted] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [statusMessage, setStatusMessage] = useState('Chế độ luyện giọng nói đã sẵn sàng.');
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [currentMetering, setCurrentMetering] = useState(
    voiceConfig.silenceThresholdDb,
  );
  const [capturedTranscript, setCapturedTranscript] = useState<string | null>(null);
  const [autoContinueCountdown, setAutoContinueCountdown] = useState<number | null>(null);
  const [selectedAnswerIdsByQuestion, setSelectedAnswerIdsByQuestion] = useState<
    Record<number, number[]>
  >({});
  const [textAnswersByQuestion, setTextAnswersByQuestion] = useState<Record<number, string>>({});
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState<Record<number, boolean>>({});
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Record<number, boolean>>({});
  const [questionFeedback, setQuestionFeedback] = useState<Record<number, any>>({});

  const resolvedQuestionIds = useMemo(
    () => createResolvedMap(submittedQuestionIds, skippedQuestionIds),
    [submittedQuestionIds, skippedQuestionIds],
  );

  const currentQuestion = questions[currentIndex];
  const currentQuestionId = getQuestionId(currentQuestion);
  const currentFeedback = currentQuestionId ? questionFeedback[currentQuestionId] : null;
  const isCurrentSubmitted = currentQuestionId
    ? Boolean(submittedQuestionIds[currentQuestionId])
    : false;
  const isCurrentSkipped = currentQuestionId
    ? Boolean(skippedQuestionIds[currentQuestionId])
    : false;
  const currentCorrectAnswerSummary = useMemo(() => {
    if (!Array.isArray(currentFeedback?.correctAnswerContents)) {
      return '';
    }
    return currentFeedback.correctAnswerContents
      .map((item: any) => String(item || '').trim())
      .filter(Boolean)
      .join(', ');
  }, [currentFeedback]);
  const currentQuestionInstruction = useMemo(() => {
    if (!currentQuestion || isMatchingQuestion(currentQuestion)) {
      return undefined;
    }
    if (isTextAnswerQuestion(currentQuestion)) {
      return 'Hãy trả lời tự nhiên. Hệ thống sẽ ghi lại câu trả lời bằng giọng nói và gửi cho AI.';
    }
    if (isMultipleChoiceQuestion(currentQuestion)) {
      return 'Câu nhiều đáp án: hãy nói một hoặc nhiều đáp án, hoặc đọc nội dung đáp án thành tiếng.';
    }
    return 'Hãy nói đáp án của bạn, hoặc đọc nội dung đáp án thành tiếng.';
  }, [currentQuestion]);
  const currentFeedbackState = useMemo(() => {
    if (!currentFeedback) {
      return null;
    }
    if (currentFeedback?.skipped) {
      return {
        label: 'Đã bỏ qua',
        icon: 'skip-next-circle',
        accent: Colors.warning,
        background: isDark ? 'rgba(245,158,11,0.14)' : '#FFFBEB',
        border: isDark ? 'rgba(251,191,36,0.4)' : '#FCD34D',
        text: isDark ? '#FCD34D' : '#B45309',
      };
    }
    if (currentFeedback?.correct === true) {
      return {
        label: 'Đúng',
        icon: 'check-decagram',
        accent: Colors.success,
        background: isDark ? 'rgba(16,185,129,0.14)' : '#ECFDF5',
        border: isDark ? 'rgba(52,211,153,0.35)' : '#A7F3D0',
        text: isDark ? '#6EE7B7' : '#047857',
      };
    }
    if (currentFeedback?.correct === false) {
      return {
        label: 'Chưa đúng',
        icon: 'close-octagon',
        accent: Colors.error,
        background: isDark ? 'rgba(239,68,68,0.14)' : '#FEF2F2',
        border: isDark ? 'rgba(248,113,113,0.35)' : '#FECACA',
        text: isDark ? '#FCA5A5' : '#B91C1C',
      };
    }
    if (currentFeedback?.submitted === false) {
      return {
        label: 'Thử lại',
        icon: 'microphone-message',
        accent: Colors.primary,
        background: isDark ? 'rgba(37,99,235,0.14)' : '#EFF6FF',
        border: isDark ? 'rgba(96,165,250,0.35)' : '#BFDBFE',
        text: isDark ? '#93C5FD' : '#1D4ED8',
      };
    }
    return {
      label: 'Phản hồi AI',
      icon: 'chat-processing',
      accent: Colors.primary,
      background: isDark ? 'rgba(37,99,235,0.14)' : '#EFF6FF',
      border: isDark ? 'rgba(96,165,250,0.35)' : '#BFDBFE',
      text: isDark ? '#93C5FD' : '#1D4ED8',
    };
  }, [currentFeedback, isDark]);

  const shouldActivateAndRetry = (error: any) => {
    const message = String(
      error?.response?.data?.message || error?.message || '',
    ).toLowerCase();
    const statusCode = Number(error?.response?.data?.statusCode);
    return (
      statusCode === 1083 ||
      message.includes('chua duoc kich hoat') ||
      message.includes('not active')
    );
  };

  const stopSpeaking = useCallback(async () => {
    const activeSpeechSession = activeSpeechSessionRef.current;
    activeSpeechSessionRef.current = null;
    playerRef.current.removePlayBackListener();
    try {
      await playerRef.current.stopPlayer();
    } catch {}
    activeSpeechSession?.finish?.('cancelled');
  }, []);

  const stopRecording = useCallback(async () => {
    const wasRecording = audioRecordSubRef.current != null;
    audioRecordSubRef.current?.remove();
    audioRecordSubRef.current = null;
    recordingSessionRef.current.stopRequested = true;
    if (wasRecording) {
      try {
        await AudioRecord.stop();
      } catch {}
    }
    setRecordingDurationMs(0);
    setCurrentMetering(voiceConfig.silenceThresholdDb);
  }, [voiceConfig.silenceThresholdDb]);

  const stopAudioActivities = useCallback(async () => {
    setAutoContinueCountdown(null);
    await stopSpeaking();
    await stopRecording();
  }, [stopRecording, stopSpeaking]);

  const cancelVoiceFlow = useCallback(async () => {
    const nextToken = flowTokenRef.current + 1;
    flowTokenRef.current = nextToken;
    await stopAudioActivities();
    return nextToken;
  }, [stopAudioActivities]);

  const speakTextAsync = useCallback(
    async (text: string) => {
      const content = String(text || '').trim();
      if (!content) {
        return 'empty';
      }

      await stopSpeaking();

      return new Promise<'finished' | 'cancelled' | 'error'>(resolve => {
        let settled = false;
        let playbackTimeout: ReturnType<typeof setTimeout> | null = null;
        let activeSession: {finish?: (result: 'finished' | 'cancelled' | 'error') => void} | null =
          null;

        const cleanup = () => {
          if (playbackTimeout) {
            clearTimeout(playbackTimeout);
            playbackTimeout = null;
          }
          playerRef.current.removePlayBackListener();
          if (activeSpeechSessionRef.current === activeSession) {
            activeSpeechSessionRef.current = null;
          }
        };

        const finish = (result: 'finished' | 'cancelled' | 'error') => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve(result);
        };

        activeSession = {finish};
        activeSpeechSessionRef.current = activeSession;

        try {
          QuizAPI.createCompanionSpeech(content, attemptId)
            .then(async res => {
              if (activeSpeechSessionRef.current !== activeSession || settled) {
                return;
              }
              const speechId = String(res.data?.speechId || '').trim();
              if (!speechId) {
                finish('error');
                return;
              }

              const playbackSource = await QuizAPI.getCompanionSpeechPlaybackSource(speechId);
              if (activeSpeechSessionRef.current !== activeSession || settled) {
                return;
              }
              if (!playbackSource?.url) {
                finish('error');
                return;
              }

              await playerRef.current.setSubscriptionDuration(0.1);
              playerRef.current.addPlayBackListener(event => {
                if (activeSpeechSessionRef.current !== activeSession || settled) {
                  return;
                }
                const duration = Number(event?.duration || 0);
                const currentPosition = Number(event?.currentPosition || 0);
                if (duration > 0 && currentPosition >= duration - 250) {
                  playerRef.current.stopPlayer().catch(() => {});
                  finish('finished');
                }
              });

              playbackTimeout = setTimeout(() => {
                finish('error');
              }, 60000);

              if (activeSpeechSessionRef.current !== activeSession || settled) {
                return;
              }
              const playbackHeaders = Object.fromEntries(
                Object.entries(playbackSource.headers || {}).filter(
                  ([, value]) => typeof value === 'string' && value.length > 0,
                ),
              );
              await playerRef.current.startPlayer(
                playbackSource.url,
                playbackHeaders,
              );
            })
            .catch(() => {
              showToast(
                'Hiện chưa thể phát giọng nói của AI. Vui lòng thử lại.',
                'error',
              );
              finish('error');
            });
        } catch {
          showToast(
            'Hiện chưa thể phát giọng nói của AI. Vui lòng thử lại.',
            'error',
          );
          finish('error');
        }
      });
    },
    [showToast, stopSpeaking],
  );

  const updateQuestionWithFeedback = useCallback((questionId: number, feedback: any) => {
    setQuestions(prev =>
      prev.map(question => {
        if (getQuestionId(question) !== questionId) {
          return question;
        }

        const feedbackAnswers = Array.isArray(feedback?.answers) ? feedback.answers : [];
        const mappedFeedbackAnswers = feedbackAnswers.map((answer: any) => ({
          ...answer,
          id: Number(answer?.answerId ?? answer?.id),
          content: answer?.content,
          isCorrect: answer?.isCorrect,
        }));

        const updatedAnswers =
          mappedFeedbackAnswers.length > 0
            ? mappedFeedbackAnswers
            : Array.isArray(question?.answers)
            ? question.answers.map((answer: any) => ({
                ...answer,
                isCorrect: Array.isArray(feedback?.correctAnswerIds)
                  ? feedback.correctAnswerIds.includes(Number(answer?.id))
                  : answer?.isCorrect,
              }))
            : [];

        if (
          updatedAnswers.length === 0 &&
          Array.isArray(feedback?.correctAnswerContents) &&
          feedback.correctAnswerContents.length > 0 &&
          isTextAnswerQuestion(question)
        ) {
          return {
            ...question,
            answers: feedback.correctAnswerContents.map(
              (content: string, index: number) => ({
                id: -(index + 1),
                content,
                isCorrect: true,
              }),
            ),
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
  }, []);

  const updateLocalAnswerState = useCallback(
    (questionId: number, response: any) => {
      if (Array.isArray(response?.selectedAnswerIds)) {
        setSelectedAnswerIdsByQuestion(prev => ({
          ...prev,
          [questionId]: response.selectedAnswerIds,
        }));
      }
      if (typeof response?.textAnswer === 'string') {
        setTextAnswersByQuestion(prev => ({
          ...prev,
          [questionId]: response.textAnswer,
        }));
      }
      if (response?.submitted) {
        updateQuestionWithFeedback(questionId, response);
      }
    },
    [updateQuestionWithFeedback],
  );

  const findNextPendingIndex = useCallback(
    (fromIndex: number, nextResolvedMap?: Record<number, boolean>) => {
      const resolvedMap = nextResolvedMap || resolvedQuestionIds;
      for (let index = fromIndex + 1; index < questions.length; index += 1) {
        const questionId = getQuestionId(questions[index]);
        if (questionId > 0 && !resolvedMap[questionId]) {
          return index;
        }
      }
      return -1;
    },
    [questions, resolvedQuestionIds],
  );

  const submitWholeAttempt = useCallback(async () => {
    if (!attemptId || isFinalizingRef.current) {
      return;
    }

    isFinalizingRef.current = true;
    setVoiceState('submitting');
    setStatusMessage('Đang hoàn tất bài luyện tập bằng giọng nói...');

    try {
      await cancelVoiceFlow();
      await QuizAPI.submitAttempt(attemptId);
      navigation.replace('QuizResult', {attemptId, backContext});
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || error?.message || 'Không thể nộp bài',
        'error',
      );
      setVoiceState('idle');
      setStatusMessage('Chế độ luyện giọng nói đã sẵn sàng.');
    } finally {
      isFinalizingRef.current = false;
    }
  }, [attemptId, backContext, cancelVoiceFlow, navigation, showToast]);

  const moveToNextQuestionOrSubmit = useCallback(
    async (resolvedMap: Record<number, boolean>) => {
      const nextIndex = findNextPendingIndex(currentIndex, resolvedMap);
      setCapturedTranscript(null);
      setRecordingDurationMs(0);
      setCurrentMetering(voiceConfig.silenceThresholdDb);

      if (nextIndex >= 0) {
        activeQuestionIdRef.current = null;
        setCurrentIndex(nextIndex);
        setVoiceState('idle');
        setStatusMessage('Đang chuyển sang câu tiếp theo...');
        return;
      }

      await submitWholeAttempt();
    },
    [currentIndex, findNextPendingIndex, submitWholeAttempt, voiceConfig.silenceThresholdDb],
  );

  const waitBeforeAutoContinue = useCallback(async (token: number, shouldSubmitAfterWait = false) => {
    const totalSeconds = Math.floor(VOICE_AUTO_CONTINUE_DELAY_MS / 1000);
    for (let remaining = totalSeconds; remaining >= 1; remaining -= 1) {
      if (token !== flowTokenRef.current || !isMountedRef.current) {
        setAutoContinueCountdown(null);
        return false;
      }
      setAutoContinueCountdown(remaining);
      setStatusMessage(
        shouldSubmitAfterWait
          ? `Tự động nộp bài sau ${remaining} giây...`
          : `Tự động chuyển câu sau ${remaining} giây...`,
      );
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    setAutoContinueCountdown(null);
    return token === flowTokenRef.current && isMountedRef.current;
  }, []);

  const startListening = useCallback(
    async (question: any, token: number) => {
      const questionId = getQuestionId(question);
      if (!questionId) {
        return;
      }

      const hasPermission = await ensureVoiceRecordingPermission();
      if (!hasPermission) {
        showToast('Cần cấp quyền micro để sử dụng chế độ luyện giọng nói', 'error');
        setVoiceState('idle');
        setStatusMessage('Hãy bật quyền micro để tiếp tục.');
        return;
      }

      if (token !== flowTokenRef.current || !isMountedRef.current) {
        return;
      }

      await stopSpeaking();

      setVoiceState('listening');
      setStatusMessage('Đang nghe... hãy trả lời tự nhiên và dừng lại khi nói xong.');
      setCapturedTranscript(null);
      setRecordingDurationMs(0);
      setCurrentMetering(voiceConfig.silenceThresholdDb);

      recordingSessionRef.current = {
        uri: '',
        startTime: Date.now(),
        speechDetectedAt: null,
        lastVoiceAt: null,
        stopRequested: false,
      };

      const finalizeRecording = async () => {
        if (recordingSessionRef.current.stopRequested) {
          return;
        }
        recordingSessionRef.current.stopRequested = true;
        setVoiceState('processing');
        setStatusMessage('Đang gửi câu trả lời của bạn cho AI...');

        audioRecordSubRef.current?.remove();
        audioRecordSubRef.current = null;
        let recordedUri = recordingSessionRef.current.uri;
        try {
          const filePath = await AudioRecord.stop();
          if (filePath) {
            recordedUri = filePath;
            recordingSessionRef.current.uri = recordedUri;
          }
        } catch {}

        if (token !== flowTokenRef.current || !isMountedRef.current) {
          return;
        }

        if (recordedUri) {
          const compressedUri = await compressRecordedAudio(recordedUri);
          if (token !== flowTokenRef.current || !isMountedRef.current) {
            return;
          }
          if (compressedUri && compressedUri !== recordedUri) {
            recordedUri = compressedUri;
            recordingSessionRef.current.uri = recordedUri;
          }
        }

        const audioFile = buildRecordedAudioFile(questionId, recordedUri);
        if (!audioFile.uri) {
          setVoiceState('idle');
          setStatusMessage('Ghi âm thất bại. Vui lòng thử lại.');
          return;
        }

        try {
          const res = await QuizAPI.submitCompanionVoiceAnswer(attemptId!, {
            questionId,
            audioFile,
          });
          const response = {
            ...(res.data || {}),
            questionTypeId: question?.questionTypeId,
            questionType: question?.questionType,
          };
          if (token !== flowTokenRef.current || !isMountedRef.current) {
            return;
          }

          setQuestionFeedback(prev => ({
            ...prev,
            [questionId]: response,
          }));
          setCapturedTranscript(
            typeof response?.transcript === 'string' ? response.transcript : null,
          );
          updateLocalAnswerState(questionId, response);

          if (response?.skipped) {
            const nextSkipped = {...skippedQuestionIds, [questionId]: true};
            const nextResolvedMap = createResolvedMap(submittedQuestionIds, nextSkipped);
            const shouldSubmitAfterSkip =
              findNextPendingIndex(currentIndex, nextResolvedMap) < 0;
            setSkippedQuestionIds(nextSkipped);
            setVoiceState('reading_feedback');
            setStatusMessage('Đang bỏ qua câu hỏi chưa được hỗ trợ...');
            await speakTextAsync(buildVoiceFeedbackPrompt(response));
            if (token !== flowTokenRef.current || !isMountedRef.current) {
              return;
            }
            const canContinueAfterSkip = await waitBeforeAutoContinue(
              token,
              shouldSubmitAfterSkip,
            );
            if (!canContinueAfterSkip) {
              return;
            }
            await moveToNextQuestionOrSubmit(nextResolvedMap);
            return;
          }

          if (!response?.submitted) {
            setVoiceState('reading_feedback');
            setStatusMessage('Mình thử lại câu trả lời này nhé.');
            await speakTextAsync(buildVoiceFeedbackPrompt(response));
            if (token !== flowTokenRef.current || !isMountedRef.current) {
              return;
            }
            await startListening(question, token);
            return;
          }

          const nextSubmitted = {...submittedQuestionIds, [questionId]: true};
          const nextResolvedMap = createResolvedMap(nextSubmitted, skippedQuestionIds);
          const shouldSubmitAfterFeedback =
            findNextPendingIndex(currentIndex, nextResolvedMap) < 0;
          setSubmittedQuestionIds(nextSubmitted);
          setVoiceState('reading_feedback');
          setStatusMessage('AI đang đọc phản hồi...');
          await speakTextAsync(buildVoiceFeedbackPrompt(response));
          if (token !== flowTokenRef.current || !isMountedRef.current) {
            return;
          }
          const canContinueAfterFeedback = await waitBeforeAutoContinue(
            token,
            shouldSubmitAfterFeedback,
          );
          if (!canContinueAfterFeedback) {
            return;
          }
          await moveToNextQuestionOrSubmit(nextResolvedMap);
        } catch (error: any) {
          if (token !== flowTokenRef.current || !isMountedRef.current) {
            return;
          }
          showToast(
            error?.response?.data?.message ||
              error?.message ||
              'Không thể gửi câu trả lời bằng giọng nói',
            'error',
          );
          setVoiceState('idle');
          setStatusMessage('Không thể xử lý bản ghi âm này. Hãy thử lại.');
        }
      };

      try {
        AudioRecord.init({
          sampleRate: 16000,
          channels: 1,
          bitsPerSample: 16,
          audioSource: 6, // VOICE_RECOGNITION on Android
          wavFile: `voice-answer-${questionId}.wav`,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sub = (AudioRecord.on as any)('data', (data: string) => {
          if (token !== flowTokenRef.current || recordingSessionRef.current.stopRequested) {
            return;
          }

          const now = Date.now();
          const metering = computeDbFromPcm16(data);
          const currentPosition = now - recordingSessionRef.current.startTime;
          const isAboveThreshold = metering > voiceConfig.silenceThresholdDb;

          setRecordingDurationMs(currentPosition);
          setCurrentMetering(metering);

          if (isAboveThreshold) {
            recordingSessionRef.current.lastVoiceAt = now;
            if (recordingSessionRef.current.speechDetectedAt == null) {
              recordingSessionRef.current.speechDetectedAt = now;
            }
          }

          const speechDuration =
            recordingSessionRef.current.speechDetectedAt == null
              ? 0
              : now - recordingSessionRef.current.speechDetectedAt;
          const silenceDuration =
            recordingSessionRef.current.lastVoiceAt == null
              ? 0
              : now - recordingSessionRef.current.lastVoiceAt;
          const recordingDuration = now - recordingSessionRef.current.startTime;

          if (
            recordingSessionRef.current.speechDetectedAt != null &&
            speechDuration >= voiceConfig.minSpeechMs &&
            silenceDuration >= voiceConfig.silenceDurationMs
          ) {
            finalizeRecording().catch(() => {});
            return;
          }

          if (recordingDuration >= voiceConfig.maxRecordingMs) {
            finalizeRecording().catch(() => {});
          }
        });
        audioRecordSubRef.current = sub;
        AudioRecord.start();
      } catch (error: any) {
        showToast(
          error?.message || 'Không thể bắt đầu ghi âm. Vui lòng thử lại.',
          'error',
        );
        setVoiceState('idle');
        setStatusMessage('Chưa thể bắt đầu ghi âm.');
      }
    },
    [
      attemptId,
      moveToNextQuestionOrSubmit,
      currentIndex,
      findNextPendingIndex,
      showToast,
      skippedQuestionIds,
      speakTextAsync,
      stopSpeaking,
      submittedQuestionIds,
      waitBeforeAutoContinue,
      updateLocalAnswerState,
      voiceConfig,
    ],
  );

  const runCurrentQuestionFlow = useCallback(
    async (question: any) => {
      const questionId = getQuestionId(question);
      if (!questionId) {
        return;
      }

      const token = await cancelVoiceFlow();
      activeQuestionIdRef.current = questionId;

      if (isMatchingQuestion(question)) {
        const skipResponse = {
          questionId,
          questionTypeId: question?.questionTypeId,
          questionType: question?.questionType,
          skipped: true,
          submitted: false,
          skipReason: 'MATCHING_NOT_SUPPORTED',
          feedback:
            'Câu ghép nối hiện chưa được hỗ trợ trong chế độ giọng nói. Đang chuyển sang câu tiếp theo.',
        };

        const nextSkipped = {...skippedQuestionIds, [questionId]: true};
        setQuestionFeedback(prev => ({
          ...prev,
          [questionId]: skipResponse,
        }));
        setSkippedQuestionIds(nextSkipped);
        setVoiceState('reading_feedback');
        setStatusMessage('Đang bỏ qua câu ghép nối...');
        await speakTextAsync(buildVoiceFeedbackPrompt(skipResponse));
        if (token !== flowTokenRef.current || !isMountedRef.current) {
          return;
        }
        const canContinueAfterSkip = await waitBeforeAutoContinue(token);
        if (!canContinueAfterSkip) {
          return;
        }
        await moveToNextQuestionOrSubmit(createResolvedMap(submittedQuestionIds, nextSkipped));
        return;
      }

      setVoiceState('reading_question');
      setStatusMessage('AI đang đọc câu hỏi...');
      const speechResult = await speakTextAsync(
        buildVoiceQuestionPrompt(question, currentIndex),
      );
      if (
        speechResult === 'cancelled' ||
        token !== flowTokenRef.current ||
        !isMountedRef.current
      ) {
        return;
      }

      await startListening(question, token);
    },
    [
      cancelVoiceFlow,
      currentIndex,
      moveToNextQuestionOrSubmit,
      skippedQuestionIds,
      speakTextAsync,
      startListening,
      submittedQuestionIds,
      waitBeforeAutoContinue,
    ],
  );

  const startVoiceAttempt = useCallback(async (canRetry = true) => {
    setStartingAttempt(true);
    try {
      const res = await QuizAPI.startAttempt(quizId, {
        isPracticeMode: true,
        isCompanionMode: true,
      });
      const attempt = res.data || {};
      const nextAttemptId = Number(attempt?.id || attempt?.attemptId || 0);
      if (!nextAttemptId) {
        throw new Error('Không tìm thấy lượt làm bài');
      }

      const restoredSelectedAnswers: Record<number, number[]> = {};
      const restoredTextAnswers: Record<number, string> = {};
      const restoredSubmitted: Record<number, boolean> = {};
      const savedAnswers = Array.isArray(attempt?.savedAnswers) ? attempt.savedAnswers : [];

      savedAnswers.forEach((item: any) => {
        const savedQuestionId = Number(item?.questionId);
        if (!Number.isFinite(savedQuestionId)) {
          return;
        }

        const selectedAnswerIds = Array.isArray(item?.selectedAnswerIds)
          ? item.selectedAnswerIds
              .map((value: any) => Number(value))
              .filter((value: number) => Number.isFinite(value))
          : [];

        if (selectedAnswerIds.length > 0) {
          restoredSelectedAnswers[savedQuestionId] = selectedAnswerIds;
          restoredSubmitted[savedQuestionId] = true;
        }

        if (typeof item?.textAnswer === 'string' && item.textAnswer.trim()) {
          restoredTextAnswers[savedQuestionId] = item.textAnswer;
          restoredSubmitted[savedQuestionId] = true;
        }
      });

      setSelectedAnswerIdsByQuestion(restoredSelectedAnswers);
      setTextAnswersByQuestion(restoredTextAnswers);
      setSubmittedQuestionIds(restoredSubmitted);
      setSkippedQuestionIds({});
      setQuestionFeedback({});
      setCapturedTranscript(null);
      setAttemptId(nextAttemptId);
      setCurrentIndex(findFirstPendingQuestionIndex(questions, restoredSubmitted));
      setStarted(true);
      setStatusMessage('Chế độ luyện giọng nói đã sẵn sàng.');
    } catch (error: any) {
      if (canRetry && shouldActivateAndRetry(error)) {
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
          await startVoiceAttempt(false);
          showToast('Quiz đã được kích hoạt. Bắt đầu luyện giọng nói...', 'success');
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
        error?.response?.data?.message ||
          error?.message ||
          'Không thể bắt đầu chế độ luyện giọng nói',
        'error',
      );
    } finally {
      setStartingAttempt(false);
    }
  }, [questions, quizId, showToast]);

  const handleStart = useCallback(async () => {
    await startVoiceAttempt(true);
  }, [startVoiceAttempt]);

  const handleRepeatPrompt = useCallback(async () => {
    if (!started || !currentQuestion) {
      return;
    }
    if (isCurrentSubmitted || isCurrentSkipped) {
      await cancelVoiceFlow();
      setVoiceState('reading_question');
      await speakTextAsync(buildVoiceQuestionPrompt(currentQuestion, currentIndex));
      if (currentFeedback) {
        setVoiceState('reading_feedback');
      await speakTextAsync(buildVoiceFeedbackPrompt(currentFeedback));
      }
      setVoiceState('idle');
      setStatusMessage('Chế độ luyện giọng nói đã sẵn sàng.');
      return;
    }
    await runCurrentQuestionFlow(currentQuestion);
  }, [
    cancelVoiceFlow,
    currentFeedback,
    currentIndex,
    currentQuestion,
    isCurrentSkipped,
    isCurrentSubmitted,
    runCurrentQuestionFlow,
    speakTextAsync,
    started,
  ]);

  const handleRetryListening = useCallback(async () => {
    if (!started || !currentQuestion || !currentQuestionId || isCurrentSubmitted || isCurrentSkipped) {
      return;
    }
    activeQuestionIdRef.current = currentQuestionId;
    const token = await cancelVoiceFlow();
    await startListening(currentQuestion, token);
  }, [
    cancelVoiceFlow,
    currentQuestion,
    currentQuestionId,
    isCurrentSkipped,
    isCurrentSubmitted,
    startListening,
    started,
  ]);

  const handlePrev = useCallback(async () => {
    if (currentIndex <= 0) {
      return;
    }
    await cancelVoiceFlow();
    activeQuestionIdRef.current = null;
    setCapturedTranscript(null);
    setCurrentIndex(prev => Math.max(prev - 1, 0));
    setVoiceState('idle');
    setStatusMessage('Đang hiển thị câu trước.');
  }, [cancelVoiceFlow, currentIndex]);

  const handleManualNext = useCallback(async () => {
    if (!currentQuestionId || (!isCurrentSubmitted && !isCurrentSkipped)) {
      return;
    }
    await cancelVoiceFlow();
    const nextResolvedMap = createResolvedMap(submittedQuestionIds, skippedQuestionIds);
    await moveToNextQuestionOrSubmit(nextResolvedMap);
  }, [
    cancelVoiceFlow,
    currentQuestionId,
    isCurrentSkipped,
    isCurrentSubmitted,
    moveToNextQuestionOrSubmit,
    skippedQuestionIds,
    submittedQuestionIds,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelVoiceFlow().catch(() => {});
    };
  }, [cancelVoiceFlow]);

  useEffect(() => {
    QuizAPI.getFull(quizId, attemptId ? {attemptId} : undefined)
      .then(res => {
        const quizData = res.data;
        setQuiz(quizData);
        const allQuestions =
          quizData?.sections?.flatMap((section: any) =>
            section.questions?.map((question: any) => ({
              ...question,
              sectionName: section.name,
            })),
          ) || [];

        setQuestions(allQuestions);
      })
      .catch((error: any) => {
        showToast(
          error?.response?.data?.message || error?.message || 'Không thể tải quiz',
          'error',
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [quizId, attemptId, showToast]);

  useEffect(() => {
    if (
      !autoStart ||
      didAutoStartRef.current ||
      loading ||
      started ||
      questions.length === 0
    ) {
      return;
    }

    didAutoStartRef.current = true;
    handleStart().catch(() => {});
  }, [autoStart, handleStart, loading, questions.length, started]);

  useEffect(() => {
    if (!started || !attemptId || !currentQuestionId) {
      return;
    }
    if (resolvedQuestionIds[currentQuestionId]) {
      setVoiceState('idle');
      setStatusMessage(
        isCurrentSkipped
          ? 'Câu này đã được bỏ qua trong chế độ giọng nói.'
          : 'Câu này đã được trả lời rồi.',
      );
      return;
    }
    if (activeQuestionIdRef.current === currentQuestionId) {
      return;
    }
    runCurrentQuestionFlow(currentQuestion).catch(() => {});
  }, [
    attemptId,
    currentQuestion,
    currentQuestionId,
    isCurrentSkipped,
    resolvedQuestionIds,
    runCurrentQuestionFlow,
    started,
  ]);

  if (loading || startingAttempt) {
    return <LoadingSpinner />;
  }

  const progress = questions.length
    ? ((currentIndex + 1) / questions.length) * 100
    : 0;

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
              <Icon name="microphone-message" size={40} color={Colors.primary} />
            </View>
            <Text style={[styles.startTitle, {color: colors.heading}]}>
              {title || quiz?.name}
            </Text>
            <Text style={[styles.startMeta, {color: colors.textSecondary}]}>
              {questions.length} câu hỏi
            </Text>
            <Text style={[styles.startDescription, {color: colors.textSecondary}]}>
              AI sẽ đọc từng câu hỏi, nghe câu trả lời của bạn, đưa phản hồi và tự
              động chuyển sang câu tiếp theo.
            </Text>
            <Button
              title="Bắt đầu luyện giọng nói"
              icon="microphone"
              onPress={handleStart}
              style={styles.startBtn}
            />
            <Button
              title="Quay lại luyện tập"
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
      <View
        style={[
          styles.header,
          {backgroundColor: colors.surface, borderBottomColor: colors.border},
        ]}>
        <TouchableOpacity
          onPress={() => {
            cancelVoiceFlow().catch(() => {});
            navigation.goBack();
          }}
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

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.voicePanel,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: isDark ? colors.shadow : '#0F172A',
            },
          ]}>
          <View style={styles.voicePanelHeader}>
            <View
              style={[
                styles.voiceIconWrap,
                {
                  backgroundColor:
                    voiceState === 'listening'
                      ? isDark
                        ? 'rgba(16,185,129,0.18)'
                        : '#ECFDF5'
                      : isDark
                      ? 'rgba(37,99,235,0.15)'
                      : '#EFF6FF',
                },
              ]}>
              <Icon
                name={voiceState === 'listening' ? 'microphone' : 'volume-high'}
                size={20}
                color={
                  voiceState === 'listening' ? Colors.success : Colors.primary
                }
              />
            </View>
            <View style={styles.voiceHeaderText}>
              <Text style={[styles.voiceTitle, {color: colors.heading}]}>
                Luyện tập bằng giọng nói
              </Text>
              <Text style={[styles.voiceSubtitle, {color: colors.textSecondary}]}>
                {getVoiceStateLabel(voiceState)}
              </Text>
            </View>
            {(voiceState === 'processing' || voiceState === 'submitting') && (
              <ActivityIndicator color={Colors.primary} />
            )}
          </View>

          <Text style={[styles.voiceStatus, {color: colors.text}]}>
            {statusMessage}
          </Text>

          <View
            style={[
              styles.meterTrack,
              {backgroundColor: isDark ? '#1E293B' : '#E2E8F0'},
            ]}>
            <View
              style={[
                styles.meterFill,
                {
                  width: `${Math.max(
                    12,
                    Math.min(100, ((currentMetering + 60) / 60) * 100),
                  )}%`,
                  backgroundColor:
                    voiceState === 'listening' ? Colors.success : Colors.primary,
                },
              ]}
            />
          </View>

          <View style={styles.voiceMetaRow}>
            <Text style={[styles.voiceMeta, {color: colors.textSecondary}]}>
              Ghi âm: {(recordingDurationMs / 1000).toFixed(1)}s
            </Text>
            <Text style={[styles.voiceMeta, {color: colors.textSecondary}]}>
              Âm lượng: {Math.round(currentMetering)} dB
            </Text>
          </View>

          {capturedTranscript ? (
            <View
              style={[
                styles.transcriptCard,
                {
                  backgroundColor: isDark
                    ? Colors.dark.surfaceVariant
                    : Colors.light.surfaceVariant,
                },
              ]}>
              <Text style={[styles.transcriptLabel, {color: colors.textSecondary}]}>
                Nội dung nhận diện
              </Text>
              <Text style={[styles.transcriptText, {color: colors.text}]}>
                {capturedTranscript}
              </Text>
            </View>
          ) : null}

          {currentFeedback && currentFeedbackState ? (
            <View
              style={[
                styles.feedbackCard,
                {
                  backgroundColor: currentFeedbackState.background,
                  borderColor: currentFeedbackState.border,
                },
              ]}>
              <View style={styles.feedbackHeader}>
                <View style={styles.feedbackTitleWrap}>
                  <Icon
                    name={currentFeedbackState.icon}
                    size={18}
                    color={currentFeedbackState.accent}
                  />
                  <Text style={[styles.feedbackTitle, {color: colors.heading}]}>
                    Kết quả AI
                  </Text>
                </View>
                <View
                  style={[
                    styles.feedbackBadge,
                    {backgroundColor: currentFeedbackState.accent},
                  ]}>
                  <Text style={styles.feedbackBadgeText}>
                    {currentFeedbackState.label}
                  </Text>
                </View>
              </View>

              <Text style={[styles.feedbackBody, {color: colors.text}]}>
                {currentFeedback?.feedback ||
                  (currentFeedback?.correct === true
                    ? 'Câu trả lời của bạn chính xác.'
                    : currentFeedback?.correct === false
                    ? 'Câu trả lời của bạn chưa đúng.'
                    : 'AI đã xử lý xong câu trả lời của bạn.')}
              </Text>

              {currentCorrectAnswerSummary &&
              (currentFeedback?.correct === false || currentFeedback?.skipped) ? (
                <Text style={[styles.feedbackMeta, {color: currentFeedbackState.text}]}>
                  {t(
                    isShortAnswerQuestion(currentQuestion)
                      ? 'quiz.expectedAnswerLabel'
                      : 'quiz.correctAnswerLabel',
                    isShortAnswerQuestion(currentQuestion) ? 'Expected answer' : 'Correct answer',
                  )}: {currentCorrectAnswerSummary}
                </Text>
              ) : null}

              {autoContinueCountdown != null &&
              (isCurrentSubmitted || isCurrentSkipped) ? (
                <Text style={[styles.feedbackCountdown, {color: colors.textSecondary}]}>
                  Tự động chuyển sau {autoContinueCountdown}s...
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {currentQuestion ? (
          isMatchingQuestion(currentQuestion) ? (
            <View
              style={[
                styles.unsupportedCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: isDark ? colors.shadow : '#0F172A',
                },
              ]}>
              <View style={styles.unsupportedHeader}>
                <Icon name="swap-horizontal" size={22} color={Colors.warning} />
                <Text style={[styles.unsupportedTitle, {color: colors.heading}]}>
                  Câu ghép nối
                </Text>
              </View>
              <Text style={[styles.unsupportedText, {color: colors.textSecondary}]}>
                Chế độ giọng nói hiện sẽ tự động bỏ qua câu ghép nối.
              </Text>
            </View>
          ) : (
            <QuestionCard
              index={currentIndex}
              question={currentQuestion.content}
              answers={currentQuestion.answers || []}
              questionType={currentQuestion.questionType}
              questionTypeId={currentQuestion.questionTypeId}
              selectedAnswerId={
                selectedAnswerIdsByQuestion[currentQuestionId]?.[0] ?? null
              }
              selectedAnswerIds={selectedAnswerIdsByQuestion[currentQuestionId] || []}
              textAnswer={textAnswersByQuestion[currentQuestionId] || ''}
              showResult={isCurrentSubmitted}
              explanation={
                isCurrentSubmitted
                  ? currentFeedback?.explanation || currentQuestion.explanation
                  : undefined
              }
              isMultiChoice={isMultipleChoiceQuestion(currentQuestion)}
              instructionText={currentQuestionInstruction}
              disabled
            />
          )
        ) : null}
      </ScrollView>

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
          disabled={
            currentIndex === 0 ||
            voiceState === 'processing' ||
            voiceState === 'submitting'
          }
          fullWidth={false}
          style={{flex: 1}}
        />
        <Button
          title={isCurrentSubmitted || isCurrentSkipped ? 'Nghe lại' : 'Nghe lại câu hỏi'}
          variant="secondary"
          size="md"
          onPress={isCurrentSubmitted || isCurrentSkipped ? handleRepeatPrompt : handleRetryListening}
          disabled={voiceState === 'processing' || voiceState === 'submitting'}
          fullWidth={false}
          style={{flex: 1}}
        />
        {currentIndex === questions.length - 1 && (isCurrentSubmitted || isCurrentSkipped) ? (
          <Button
            title="Nộp ngay"
            size="md"
            onPress={() => {
              submitWholeAttempt().catch(() => {});
            }}
            fullWidth={false}
            style={{flex: 1, backgroundColor: Colors.success}}
            disabled={voiceState === 'submitting'}
          />
        ) : (
          <Button
            title="Tiếp theo"
            size="md"
            onPress={() => {
              handleManualNext().catch(() => {});
            }}
            fullWidth={false}
            style={{flex: 1}}
            disabled={!isCurrentSubmitted && !isCurrentSkipped}
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
  startMeta: {fontSize: 14, marginTop: 4},
  startDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
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
  voicePanel: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: Spacing.base,
  },
  voicePanelHeader: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: Spacing.sm},
  voiceIconWrap: {width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center'},
  voiceHeaderText: {flex: 1},
  voiceTitle: {fontSize: 16, fontWeight: '700'},
  voiceSubtitle: {fontSize: 12, marginTop: 2},
  voiceStatus: {fontSize: 14, lineHeight: 21, marginBottom: Spacing.md},
  meterTrack: {width: '100%', height: 10, borderRadius: BorderRadius.full, overflow: 'hidden'},
  meterFill: {height: '100%', borderRadius: BorderRadius.full},
  voiceMetaRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm},
  voiceMeta: {fontSize: 12, fontWeight: '600'},
  transcriptCard: {borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.md},
  transcriptLabel: {fontSize: 12, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase'},
  transcriptText: {fontSize: 13, lineHeight: 20},
  feedbackCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  feedbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: Spacing.sm,
  },
  feedbackTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  feedbackBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  feedbackBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  feedbackBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  feedbackMeta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  feedbackCountdown: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  unsupportedCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: Spacing.base,
  },
  unsupportedHeader: {flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Spacing.sm},
  unsupportedTitle: {fontSize: 16, fontWeight: '700'},
  unsupportedText: {fontSize: 14, lineHeight: 20},
  navBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
