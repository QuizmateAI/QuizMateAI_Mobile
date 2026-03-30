import {PermissionsAndroid, Platform} from 'react-native';
import {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  AVEncodingOption,
  AVModeIOSOption,
  OutputFormatAndroidType,
  type AudioSet,
} from 'react-native-audio-recorder-player';

export const VOICE_SILENCE_THRESHOLD_DB = Platform.OS === 'ios' ? -45 : -40;
export const VOICE_SILENCE_DURATION_MS = 1400;
export const VOICE_MAX_RECORDING_MS = 15000;
export const VOICE_MIN_SPEECH_MS = 700;
export const VOICE_TTS_RATE = 0.48;

export const VOICE_PRACTICE_CONFIG_STORAGE_KEY = '@voice_practice_config';

export type VoicePracticeConfig = {
  silenceThresholdDb: number;
  silenceDurationMs: number;
  maxRecordingMs: number;
  minSpeechMs: number;
};

export type VoicePracticePreset = {
  id: 'balanced' | 'fast' | 'noisy' | 'long';
  label: string;
  description: string;
  config: VoicePracticeConfig;
};

const VOICE_PRACTICE_LIMITS = {
  silenceThresholdDb: {min: -60, max: -20},
  silenceDurationMs: {min: 500, max: 3000},
  maxRecordingMs: {min: 5000, max: 45000},
  minSpeechMs: {min: 300, max: 2000},
} as const;

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

const createPlatformThreshold = (iosValue: number, androidValue: number) =>
  Platform.OS === 'ios' ? iosValue : androidValue;

export const createDefaultVoicePracticeConfig = (): VoicePracticeConfig => ({
  silenceThresholdDb: VOICE_SILENCE_THRESHOLD_DB,
  silenceDurationMs: VOICE_SILENCE_DURATION_MS,
  maxRecordingMs: VOICE_MAX_RECORDING_MS,
  minSpeechMs: VOICE_MIN_SPEECH_MS,
});

export const resolveVoicePracticeConfig = (
  value?: Partial<VoicePracticeConfig> | null,
): VoicePracticeConfig => {
  const fallback = createDefaultVoicePracticeConfig();

  return {
    silenceThresholdDb: clampNumber(
      value?.silenceThresholdDb,
      VOICE_PRACTICE_LIMITS.silenceThresholdDb.min,
      VOICE_PRACTICE_LIMITS.silenceThresholdDb.max,
      fallback.silenceThresholdDb,
    ),
    silenceDurationMs: clampNumber(
      value?.silenceDurationMs,
      VOICE_PRACTICE_LIMITS.silenceDurationMs.min,
      VOICE_PRACTICE_LIMITS.silenceDurationMs.max,
      fallback.silenceDurationMs,
    ),
    maxRecordingMs: clampNumber(
      value?.maxRecordingMs,
      VOICE_PRACTICE_LIMITS.maxRecordingMs.min,
      VOICE_PRACTICE_LIMITS.maxRecordingMs.max,
      fallback.maxRecordingMs,
    ),
    minSpeechMs: clampNumber(
      value?.minSpeechMs,
      VOICE_PRACTICE_LIMITS.minSpeechMs.min,
      VOICE_PRACTICE_LIMITS.minSpeechMs.max,
      fallback.minSpeechMs,
    ),
  };
};

export const VOICE_PRACTICE_PRESETS: VoicePracticePreset[] = [
  {
    id: 'balanced',
    label: 'Cân bằng',
    description: 'Mặc định ổn định cho đa số tình huống.',
    config: createDefaultVoicePracticeConfig(),
  },
  {
    id: 'fast',
    label: 'Phản hồi nhanh',
    description: 'Tự chuyển nhanh hơn sau khi bạn dừng nói.',
    config: resolveVoicePracticeConfig({
      silenceThresholdDb: VOICE_SILENCE_THRESHOLD_DB,
      silenceDurationMs: 900,
      maxRecordingMs: 12000,
      minSpeechMs: 500,
    }),
  },
  {
    id: 'noisy',
    label: 'Chống ồn',
    description: 'Giảm bắt nhầm tiếng ồn nền hoặc âm thanh xung quanh.',
    config: resolveVoicePracticeConfig({
      silenceThresholdDb: createPlatformThreshold(-40, -35),
      silenceDurationMs: 1800,
      maxRecordingMs: 15000,
      minSpeechMs: 900,
    }),
  },
  {
    id: 'long',
    label: 'Trả lời dài',
    description: 'Phù hợp khi bạn cần nói chậm hơn hoặc trả lời dài hơn.',
    config: resolveVoicePracticeConfig({
      silenceThresholdDb: createPlatformThreshold(-48, -42),
      silenceDurationMs: 1900,
      maxRecordingMs: 25000,
      minSpeechMs: 600,
    }),
  },
];

export const areVoicePracticeConfigsEqual = (
  left?: Partial<VoicePracticeConfig> | null,
  right?: Partial<VoicePracticeConfig> | null,
) => {
  const normalizedLeft = resolveVoicePracticeConfig(left);
  const normalizedRight = resolveVoicePracticeConfig(right);
  return (
    normalizedLeft.silenceThresholdDb === normalizedRight.silenceThresholdDb &&
    normalizedLeft.silenceDurationMs === normalizedRight.silenceDurationMs &&
    normalizedLeft.maxRecordingMs === normalizedRight.maxRecordingMs &&
    normalizedLeft.minSpeechMs === normalizedRight.minSpeechMs
  );
};

export const detectVoicePracticePresetId = (
  config?: Partial<VoicePracticeConfig> | null,
) =>
  VOICE_PRACTICE_PRESETS.find(preset =>
    areVoicePracticeConfigsEqual(preset.config, config),
  )?.id || null;

export const formatVoicePracticeConfigSummary = (
  config?: Partial<VoicePracticeConfig> | null,
) => {
  const normalized = resolveVoicePracticeConfig(config);
  return `Ngưỡng ${normalized.silenceThresholdDb} dB | Chờ ${(
    normalized.silenceDurationMs / 1000
  ).toFixed(1)}s | Tối đa ${Math.round(
    normalized.maxRecordingMs / 1000,
  )}s | Nói tối thiểu ${(normalized.minSpeechMs / 1000).toFixed(1)}s`;
};

export const VOICE_AUDIO_SET: AudioSet = {
  AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
  AudioSourceAndroid: AudioSourceAndroidType.MIC,
  OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
  AudioSamplingRateAndroid: 44100,
  AudioEncodingBitRateAndroid: 128000,
  AudioChannelsAndroid: 1,
  AVFormatIDKeyIOS: AVEncodingOption.aac,
  AVModeIOS: AVModeIOSOption.measurement,
  AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
  AVNumberOfChannelsKeyIOS: 1,
  AVSampleRateKeyIOS: 44100,
};

const QUESTION_TYPE_IDS = {
  SHORT_ANSWER: 3,
  FILL_IN_BLANK: 5,
} as const;

const TEXT_QUESTION_TYPES = new Set([
  'SHORT_ANSWER',
  'SHORTANSWER',
  'SHORT_ANSWERS',
  'TRA_LOI_NGAN',
  'CAU_TRA_LOI_NGAN',
  'FILL_IN_BLANK',
  'FILL_IN_THE_BLANK',
  'FILL_BLANK',
  'BLANK_FILLING',
  'DIEN_VAO_CHO_TRONG',
  'DIEN_KHUYET',
]);

export const getQuestionId = (question: any) =>
  Number(question?.id ?? question?.questionId ?? 0);

const extractQuestionTypeValue = (questionType: any): string => {
  if (typeof questionType === 'string') {
    return questionType;
  }

  if (questionType && typeof questionType === 'object') {
    const nestedValue =
      questionType.questionType ??
      questionType.name ??
      questionType.type ??
      questionType.value;

    return typeof nestedValue === 'string' ? nestedValue : '';
  }

  return '';
};

export const normalizeQuestionType = (question: any) =>
  extractQuestionTypeValue(question?.questionType)
    .trim()
    .toUpperCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');

const hasMatchingPayload = (question: any) =>
  (Array.isArray(question?.matchingPairs) && question.matchingPairs.length > 0) ||
  (Array.isArray(question?.correctMatchingPairs) &&
    question.correctMatchingPairs.length > 0) ||
  (Array.isArray(question?.answers) &&
    question.answers.some(
      (answer: any) =>
        Array.isArray(answer?.matchingPairs) && answer.matchingPairs.length > 0,
    ));

export const isTextAnswerQuestion = (question: any) => {
  const type = normalizeQuestionType(question);
  return (
    TEXT_QUESTION_TYPES.has(type) ||
    question?.questionTypeId === QUESTION_TYPE_IDS.SHORT_ANSWER ||
    question?.questionTypeId === QUESTION_TYPE_IDS.FILL_IN_BLANK
  );
};

export const isMatchingQuestion = (question: any) =>
  normalizeQuestionType(question) === 'MATCHING' || hasMatchingPayload(question);

export const isMultipleChoiceQuestion = (question: any) =>
  ['MULTIPLE_CHOICE', 'MULTIPLE_ANSWERS', 'MULTIPLE ANSWERS', 'MULTI_CHOICE', 'MULTI_SELECT', 'MULTI SELECT'].includes(
    normalizeQuestionType(question),
  ) ||
  (Array.isArray(question?.answers)
    ? question.answers.filter((answer: any) => Boolean(answer?.isCorrect)).length > 1
    : false);

const sanitizeForSpeech = (value: any) =>
  String(value || '')
    .replace(/\r?\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();

const buildAnswerLabel = (index: number) => {
  const orderLabels = [
    'thứ nhất',
    'thứ hai',
    'thứ ba',
    'thứ tư',
    'thứ năm',
  ];

  return orderLabels[index] || `thứ ${index + 1}`;
};

const joinSpeechParts = (parts: Array<string | null | undefined>) =>
  parts
    .map(part => sanitizeForSpeech(part))
    .filter(Boolean)
    .join(' ');

export const buildVoiceQuestionPrompt = (question: any, questionIndex: number) => {
  const shouldReadAnswers = !isTextAnswerQuestion(question);
  const answerLines = shouldReadAnswers && Array.isArray(question?.answers)
    ? question.answers
        .map((answer: any, index: number) => {
          const content = sanitizeForSpeech(answer?.content);
          if (!content) {
            return null;
          }
          return `Lựa chọn ${buildAnswerLabel(index)}. ${content}.`;
        })
        .filter(Boolean)
    : [];

  return joinSpeechParts([
    `Câu ${questionIndex + 1}.`,
    sanitizeForSpeech(question?.content),
    shouldReadAnswers && answerLines.length > 0
      ? `Các đáp án như sau. ${answerLines.join(' ')}`
      : null,
    isTextAnswerQuestion(question)
      ? 'Hãy trả lời ngắn gọn bằng giọng nói nhé.'
      : 'Hãy nói đáp án của bạn nhé.',
  ]);
};

export const buildVoiceFeedbackPrompt = (response: any) => {
  if (response?.skipped) {
    return joinSpeechParts([
      response?.feedback || 'Câu hỏi này sẽ được bỏ qua.',
      response?.skipReason === 'MATCHING_NOT_SUPPORTED'
        ? 'Đang chuyển sang câu tiếp theo.'
        : null,
    ]);
  }

  if (!response?.submitted) {
    return joinSpeechParts([
      response?.feedback || 'Mình chưa nghe rõ câu trả lời.',
      'Bạn thử nói lại một lần nữa nhé.',
    ]);
  }

  const correctness =
    response?.correct === true
      ? 'Chúc mừng! bạn đã trả lời chính xác.'
      : response?.correct === false
      ? 'Rất tiếc câu trả lời của bạn chưa chính xác.'
      : null;

  const correctAnswerContent = Array.isArray(response?.correctAnswerContents)
    ? response.correctAnswerContents
        .map((item: any) => sanitizeForSpeech(item))
        .filter(Boolean)
        .join('. ')
    : '';

  return joinSpeechParts([
    response?.feedback || correctness,
    !response?.correct && correctAnswerContent
      ? `Đáp án đúng là ${correctAnswerContent}.`
      : null,
    response?.explanation ? `Giải thích. ${response.explanation}` : null,
  ]);
};

export const findFirstPendingQuestionIndex = (
  questions: any[],
  resolvedQuestionIds: Record<number, boolean>,
) => {
  const nextIndex = questions.findIndex(question => {
    const questionId = getQuestionId(question);
    return questionId > 0 && !resolvedQuestionIds[questionId];
  });

  return nextIndex >= 0 ? nextIndex : Math.max(questions.length - 1, 0);
};

export const normalizeRecordedFileUri = (uri: string) => {
  const value = sanitizeForSpeech(uri);
  if (!value) {
    return '';
  }
  if (value.startsWith('file://') || value.startsWith('content://')) {
    return value;
  }
  return `file://${value}`;
};

export const buildRecordedAudioFile = (questionId: number, uri: string) => {
  const normalizedUri = normalizeRecordedFileUri(uri);
  const lowerUri = normalizedUri.toLowerCase();
  const extension = lowerUri.endsWith('.m4a')
    ? 'm4a'
    : lowerUri.endsWith('.mp3')
    ? 'mp3'
    : lowerUri.endsWith('.wav')
    ? 'wav'
    : 'mp4';

  const mimeTypeMap: Record<string, string> = {
    m4a: 'audio/m4a',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    mp4: 'audio/mp4',
  };

  return {
    uri: normalizedUri,
    name: `voice-answer-${questionId}.${extension}`,
    type: mimeTypeMap[extension] || 'audio/mp4',
  };
};

export const ensureVoiceRecordingPermission = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: 'Quyền truy cập micro',
      message: 'Chế độ luyện giọng nói cần quyền micro để ghi âm câu trả lời của bạn.',
      buttonPositive: 'Cho phép',
      buttonNegative: 'Để sau',
    },
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
};
