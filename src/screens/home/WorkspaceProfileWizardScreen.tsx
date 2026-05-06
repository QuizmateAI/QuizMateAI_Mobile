import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Button from '../../components/ui/Button';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import GroupWorkspaceProfileAPI from '../../api/GroupWorkspaceProfileAPI';
import StudyProfileAPI from '../../api/StudyProfileAPI';
import WorkspaceProfileAPI from '../../api/WorkspaceProfileAPI';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import {deriveWorkspaceSetupState} from '../../utils/workspaceSetup';

type LearningMode = 'STUDY_NEW' | 'REVIEW';
type ContextType = 'WORKSPACE' | 'GROUP';
type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';
type DomainOption = {id?: string; label: string; reason?: string};
type KnowledgeOption = {id?: string; label: string; reason?: string; suggestedDomainOptionIds?: string[]};

const ANALYSIS_DEBOUNCE_MS = 650;
const SUGGEST_DEBOUNCE_MS = 700;
const CONSISTENCY_DEBOUNCE_MS = 850;

const LEARNING_MODES: Array<{
  key: LearningMode;
  title: string;
  description: string;
  icon: string;
  color: string;
}> = [
  {
    key: 'STUDY_NEW',
    title: 'Học mới',
    description: 'Xây lộ trình từ nền tảng đến mục tiêu.',
    icon: 'book-open-page-variant-outline',
    color: '#0EA5E9',
  },
  {
    key: 'REVIEW',
    title: 'Ôn tập',
    description: 'Củng cố kiến thức và luyện lại điểm yếu.',
    icon: 'layers-triple-outline',
    color: '#F59E0B',
  },
];

const SPEED_MODES = [
  {key: 'SLOW', label: 'Chậm mà chắc', description: 'Phù hợp khi bạn cần hiểu sâu và chỉ có ít thời gian học mỗi ngày.'},
  {key: 'STANDARD', label: 'Tiêu chuẩn', description: 'Nhịp học cân bằng, phù hợp với phần lớn người học.'},
  {key: 'FAST', label: 'Nhanh', description: 'Tăng tốc để bám sát thời hạn hoặc kỳ thi đang đến gần.'},
] as const;

const ADAPTATION_MODES = [
  {key: 'FLEXIBLE', label: 'Linh hoạt', description: 'Ưu tiên điều chỉnh nhịp học theo quỹ thời gian và mức năng lượng thực tế.'},
  {key: 'BALANCED', label: 'Cân bằng', description: 'Giữ kế hoạch rõ ràng nhưng vẫn có không gian điều chỉnh khi cần.'},
] as const;

const KNOWLEDGE_LOADS = [
  {key: 'BASIC', label: 'Cơ bản', description: 'Tập trung vào nền tảng cốt lõi, thuật ngữ chính và các phần bắt buộc phải nắm.'},
  {key: 'INTERMEDIATE', label: 'Trung cấp', description: 'Học đầy đủ phần nền tảng và các ứng dụng phổ biến ở mức sử dụng thực tế.'},
  {key: 'ADVANCED', label: 'Nâng cao', description: 'Đi sâu vào các tình huống khó, ngoại lệ và phần kiến thức có độ phức tạp cao.'},
] as const;

const ROADMAP_DAY_RECOMMENDATIONS: Record<
  'BASIC' | 'INTERMEDIATE' | 'ADVANCED',
  Record<'SLOW' | 'STANDARD' | 'FAST', number>
> = {
  BASIC: {FAST: 20, STANDARD: 30, SLOW: 45},
  INTERMEDIATE: {FAST: 30, STANDARD: 60, SLOW: 90},
  ADVANCED: {FAST: 45, STANDARD: 90, SLOW: 135},
};

const ROADMAP_TOTAL_MINUTES: Record<'BASIC' | 'INTERMEDIATE' | 'ADVANCED', number> = {
  BASIC: 1800,
  INTERMEDIATE: 4200,
  ADVANCED: 7200,
};

function getRecommendedRoadmapDays(
  knowledgeLoad: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED',
  speedMode: 'SLOW' | 'STANDARD' | 'FAST',
) {
  return ROADMAP_DAY_RECOMMENDATIONS[knowledgeLoad]?.[speedMode] || 30;
}

function getRecommendedRoadmapMinutesPerDay(
  knowledgeLoad: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED',
  totalDays: number,
) {
  const safeDays = Number.isFinite(totalDays) && totalDays > 0 ? totalDays : 30;
  const raw = ROADMAP_TOTAL_MINUTES[knowledgeLoad] / safeDays;
  return Math.max(15, Math.round(raw / 5) * 5);
}

const DOMAIN_OPTION_THEMES = [
  {color: '#0EA5E9', soft: '#E0F2FE', darkSoft: 'rgba(14,165,233,0.14)', icon: 'compass-outline'},
  {color: '#F97316', soft: '#FFEDD5', darkSoft: 'rgba(249,115,22,0.14)', icon: 'map-marker-radius-outline'},
  {color: '#10B981', soft: '#D1FAE5', darkSoft: 'rgba(16,185,129,0.14)', icon: 'leaf-circle-outline'},
] as const;

const SURFACE_SHADOW = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: {width: 0, height: 8},
  elevation: 3,
};

const EMPTY_SUGGESTIONS = {
  currentLevelSuggestions: [] as string[],
  learningGoalSuggestions: [] as string[],
  strongAreaSuggestions: [] as string[],
  weakAreaSuggestions: [] as string[],
  examNameSuggestions: [] as string[],
};

const trim = (value: any) => String(value || '').trim();

const normalizeList = (value: any): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => trim(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,;/|]+/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
};

const normalizeSuggestions = (value: any): string[] =>
  normalizeList(value).filter(Boolean).slice(0, 6);

const pickPayload = (response: any) => response?.data?.data || response?.data || {};

function buildDomainOptions(data: any, knowledge: string): DomainOption[] {
  const details =
    data?.domainSuggestionDetails ||
    data?.domainSuggestionDetail ||
    data?.domainSuggestionsDetails ||
    data?.domainOptions ||
    [];

  if (Array.isArray(details) && details.length > 0) {
    return details
      .map((item: any, index: number) => ({
        id: trim(item?.id || item?.optionId || `domain-${index}`),
        label: trim(item?.label || item?.domain || item?.title || item?.name),
        reason: trim(item?.reason || item?.message || item?.description),
      }))
      .filter(item => item.label)
      .slice(0, 5);
  }

  if (Array.isArray(data?.domainSuggestions)) {
    return data.domainSuggestions
      .map((item: any, index: number) => ({
        id: `domain-${index}`,
        label: trim(item),
        reason: `AI gợi ý dựa trên phạm vi "${knowledge}".`,
      }))
      .filter((item: DomainOption) => item.label)
      .slice(0, 5);
  }

  return [];
}

function mapProfileSuggestions(data: any) {
  return {
    currentLevelSuggestions: normalizeSuggestions(
      data?.currentLevelSuggestions || data?.currentLevelSuggestion || data?.currentLevel,
    ),
    learningGoalSuggestions: normalizeSuggestions(
      data?.learningGoalSuggestions || data?.learningGoalSuggestion || data?.learningGoal,
    ),
    strongAreaSuggestions: normalizeSuggestions(
      data?.strongAreaSuggestions || data?.strongAreasSuggestions || data?.strongAreas,
    ),
    weakAreaSuggestions: normalizeSuggestions(
      data?.weakAreaSuggestions || data?.weakAreasSuggestions || data?.weakAreas,
    ),
    examNameSuggestions: normalizeSuggestions(
      data?.examNameSuggestions || data?.examSuggestions || data?.examName,
    ),
  };
}

export default function WorkspaceProfileWizardScreen({navigation, route}: any) {
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const {width} = useWindowDimensions();
  const contextType: ContextType = route?.params?.contextType === 'GROUP' ? 'GROUP' : 'WORKSPACE';
  const isGroup = contextType === 'GROUP';
  const isCompactLayout = width < 390;
  const title = trim(route?.params?.title);
  const profileApi = useMemo(
    () => (isGroup ? GroupWorkspaceProfileAPI : WorkspaceProfileAPI),
    [isGroup],
  );

  const [workspaceId, setWorkspaceId] = useState<number | null>(
    Number(route?.params?.workspaceId) || null,
  );
  const [step, setStep] = useState(1);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [learningMode, setLearningMode] = useState<LearningMode>('STUDY_NEW');
  const [knowledgeInput, setKnowledgeInput] = useState('');
  const [domain, setDomain] = useState('');
  const [currentLevel, setCurrentLevel] = useState('');
  const [learningGoal, setLearningGoal] = useState('');
  const [strongAreas, setStrongAreas] = useState('');
  const [weakAreas, setWeakAreas] = useState('');
  const [roadmapEnabled, setRoadmapEnabled] = useState(true);
  const [knowledgeLoad, setKnowledgeLoad] = useState<'BASIC' | 'INTERMEDIATE' | 'ADVANCED'>('INTERMEDIATE');
  const [adaptationMode, setAdaptationMode] = useState<'BALANCED' | 'FLEXIBLE'>('BALANCED');
  const [speedMode, setSpeedMode] = useState<'STANDARD' | 'SLOW' | 'FAST'>('STANDARD');
  const [estimatedTotalDays, setEstimatedTotalDays] = useState('30');
  const [estimatedMinutesPerDay, setEstimatedMinutesPerDay] = useState('60');

  const [setupCompleted, setSetupCompleted] = useState(false);
  const [setupSummary, setSetupSummary] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState<AsyncStatus>('idle');
  const [analysisNote, setAnalysisNote] = useState('');
  const [domainOptions, setDomainOptions] = useState<DomainOption[]>([]);
  const [fieldSuggestions, setFieldSuggestions] = useState(EMPTY_SUGGESTIONS);
  const [fieldSuggestionStatus, setFieldSuggestionStatus] = useState<AsyncStatus>('idle');
  const [suggestionNote, setSuggestionNote] = useState('');
  const [consistencyResult, setConsistencyResult] = useState<any>(null);
  const [consistencyStatus, setConsistencyStatus] = useState<AsyncStatus>('idle');
  const [consistencyNote, setConsistencyNote] = useState('');
  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionAbortRef = useRef<AbortController | null>(null);
  const consistencyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consistencyAbortRef = useRef<AbortController | null>(null);

  const effectiveKnowledge = knowledgeInput;
  const canUseRoadmap = learningMode === 'STUDY_NEW' || roadmapEnabled;
  const totalSteps = canUseRoadmap ? 3 : 2;
  const stepTitle = isGroup
    ? ['Mục tiêu nhóm', 'Hồ sơ học chung', 'Lộ trình nhóm'][step - 1]
    : ['Nền tảng học tập', 'Hồ sơ cá nhân', 'Lộ trình cá nhân'][step - 1];
  const stepSubtitle = isGroup
    ? [
        'Chốt mục đích, phạm vi kiến thức và domain chung.',
        'Đặt mục tiêu học tập mà cả nhóm sẽ dùng.',
        'Hoàn thiện cấu hình lộ trình cuối cùng.',
      ][step - 1]
    : [
        'Mô tả thứ bạn muốn học để AI hiểu đúng ngữ cảnh.',
        'Bổ sung trình độ, mục tiêu, điểm mạnh và điểm yếu.',
        'Chốt nhịp học, độ sâu và thời lượng như trên FE.',
      ][step - 1];

  const hasSelectedSuggestedDomain = useMemo(() => {
    if (!domain.trim()) {
      return false;
    }
    if (domainOptions.length === 0) {
      return analysisStatus !== 'loading' && analysisStatus !== 'error';
    }
    return domainOptions.some(option => option.label === domain);
  }, [analysisStatus, domain, domainOptions]);

  const stepOneValid = Boolean(learningMode && effectiveKnowledge.trim() && domain.trim() && hasSelectedSuggestedDomain);
  const stepTwoValid = isGroup
    ? Boolean(learningGoal.trim())
    : Boolean(currentLevel.trim() && learningGoal.trim());
  const finalStepValid = !canUseRoadmap || (
    Number(estimatedTotalDays) > 0 &&
    Number(estimatedMinutesPerDay) > 0 &&
    Boolean(knowledgeLoad && adaptationMode && speedMode)
  );

  useEffect(() => {
    setStep(current => Math.min(current, totalSteps));
  }, [totalSteps]);

  const resetDownstreamProfileFields = useCallback(() => {
    setDomain('');
    setDomainOptions([]);
    setFieldSuggestions(EMPTY_SUGGESTIONS);
    setFieldSuggestionStatus('idle');
    setSuggestionNote('');
    setConsistencyResult(null);
    setConsistencyNote('');
    setConsistencyStatus('idle');
  }, []);

  useEffect(() => {
    const id = Number(route?.params?.workspaceId);
    if (Number.isInteger(id) && id > 0) {
      setWorkspaceId(id);
    }
  }, [route?.params?.workspaceId]);

  useEffect(() => {
    return () => {
      if (analysisTimerRef.current) {
        clearTimeout(analysisTimerRef.current);
      }
      if (suggestionTimerRef.current) {
        clearTimeout(suggestionTimerRef.current);
      }
      if (consistencyTimerRef.current) {
        clearTimeout(consistencyTimerRef.current);
      }
      analysisAbortRef.current?.abort();
      suggestionAbortRef.current?.abort();
      consistencyAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
      if (!workspaceId) {
        setLoadingProfile(false);
        return;
      }

      setLoadingProfile(true);
      try {
        const response = await profileApi.getProfile(workspaceId);
        const profile = pickPayload(response);
        if (!mounted) {
          return;
        }

        const loadedLearningMode = trim(profile?.learningMode || profile?.workspacePurpose) as LearningMode;
        const resolvedLearningMode: LearningMode =
          ['STUDY_NEW', 'REVIEW'].includes(loadedLearningMode)
            ? loadedLearningMode
            : 'STUDY_NEW';
        const loadedKnowledge = trim(
          profile?.selectedKnowledgeOption ||
            profile?.knowledge ||
            profile?.knowledgeInput ||
            profile?.customKnowledge,
        );
        const loadedDomain = trim(
          profile?.domain ||
            profile?.inferredDomain ||
            profile?.customDomain,
        );
        const loadedGoal = trim(profile?.groupLearningGoal || profile?.learningGoal);

        setLearningMode(resolvedLearningMode);
        setKnowledgeInput(loadedKnowledge);
        setDomain(loadedDomain);
        setDomainOptions(
          loadedDomain ? [{id: 'saved-domain', label: loadedDomain, reason: 'Domain đã lưu trong hồ sơ.'}] : [],
        );
        setCurrentLevel(trim(profile?.currentLevel || profile?.customCurrentLevel));
        setLearningGoal(loadedGoal);
        setStrongAreas(normalizeList(profile?.strongAreas).join(', '));
        setWeakAreas(normalizeList(profile?.weakAreas).join(', '));
        setRoadmapEnabled(
          typeof profile?.roadmapEnabled === 'boolean'
            ? profile.roadmapEnabled
            : resolvedLearningMode === 'STUDY_NEW',
        );
        setKnowledgeLoad(
          profile?.knowledgeLoad === 'BASIC' || profile?.knowledgeLoad === 'ADVANCED'
            ? profile.knowledgeLoad
            : 'INTERMEDIATE',
        );
        setAdaptationMode(profile?.adaptationMode === 'FLEXIBLE' ? 'FLEXIBLE' : 'BALANCED');
        setSpeedMode(
          profile?.speedMode === 'SLOW' || profile?.speedMode === 'FAST'
            ? profile.speedMode
            : 'STANDARD',
        );
        setEstimatedTotalDays(profile?.estimatedTotalDays ? String(profile.estimatedTotalDays) : '30');
        setEstimatedMinutesPerDay(
          profile?.estimatedMinutesPerDay ? String(profile.estimatedMinutesPerDay) : '60',
        );

        const setupState = deriveWorkspaceSetupState(profile, contextType);
        setSetupCompleted(setupState.completed);
        setSetupSummary(setupState.summary);
        const resolvedRoadmapEnabled =
          typeof profile?.roadmapEnabled === 'boolean'
            ? profile.roadmapEnabled
            : resolvedLearningMode === 'STUDY_NEW';
        const resolvedTotalSteps =
          resolvedLearningMode === 'STUDY_NEW' || resolvedRoadmapEnabled ? 3 : 2;
        setStep(Math.min(setupState.currentStep, resolvedTotalSteps));
        setAnalysisStatus(loadedKnowledge ? 'success' : 'idle');
        setAnalysisNote(loadedKnowledge ? 'Đã tải hồ sơ hiện có. Bạn có thể chỉnh lại trước khi lưu.' : '');
      } catch {
        if (mounted) {
          showToast(isGroup ? 'Không thể tải hồ sơ nhóm hiện tại' : 'Không thể tải hồ sơ học tập hiện tại', 'warning');
        }
      } finally {
        if (mounted) {
          setLoadingProfile(false);
        }
      }
    }

    loadProfile();
    return () => {
      mounted = false;
    };
  }, [contextType, isGroup, profileApi, showToast, workspaceId]);

  useEffect(() => {
    if (analysisTimerRef.current) {
      clearTimeout(analysisTimerRef.current);
    }
    analysisAbortRef.current?.abort();

    const value = knowledgeInput.trim();
    if (!value) {
      setAnalysisStatus('idle');
      setAnalysisNote('');
      resetDownstreamProfileFields();
      return;
    }

    setAnalysisStatus('loading');
    analysisTimerRef.current = setTimeout(async () => {
      const abortController = new AbortController();
      analysisAbortRef.current = abortController;
      try {
        const response = await StudyProfileAPI.analyzeKnowledge(value, abortController.signal);
        if (abortController.signal.aborted) {
          return;
        }

        const data = pickPayload(response);
        const nextDomainOptions = buildDomainOptions(data, value);
        setDomainOptions(nextDomainOptions);
        setAnalysisStatus('success');
        setAnalysisNote(
          trim(data?.message || data?.summary || data?.advice || data?.warning) ||
            (nextDomainOptions.length > 0
              ? 'AI đã phân tích và gợi ý domain phù hợp.'
              : 'AI đã phân tích phạm vi kiến thức.'),
        );

        setDomain(current => {
          if (nextDomainOptions.some(option => option.label === current)) {
            return current;
          }
          return nextDomainOptions[0]?.label || current;
        });
      } catch {
        if (abortController.signal.aborted) {
          return;
        }
        setAnalysisStatus('error');
        setDomainOptions([]);
        setAnalysisNote('Không thể phân tích tự động. Bạn có thể thử lại hoặc nhập domain thủ công trên web.');
      }
    }, ANALYSIS_DEBOUNCE_MS);

    return () => {
      if (analysisTimerRef.current) {
        clearTimeout(analysisTimerRef.current);
      }
      analysisAbortRef.current?.abort();
    };
  }, [knowledgeInput, resetDownstreamProfileFields]);

  const requestFieldSuggestions = useCallback(
    async ({silent = false, signal}: {silent?: boolean; signal?: AbortSignal} = {}) => {
      if (!effectiveKnowledge.trim() || !domain.trim()) {
        if (!silent) {
          showToast('Nhập kiến thức và chọn domain trước khi gợi ý', 'error');
        }
        return;
      }

      setFieldSuggestionStatus('loading');

      try {
        const response = await StudyProfileAPI.suggestProfileFields(
          {
            knowledge: effectiveKnowledge.trim(),
            domain: domain.trim(),
            learningMode,
            currentLevel: currentLevel.trim() || undefined,
            strongAreas: normalizeList(strongAreas),
            weakAreas: normalizeList(weakAreas),
          },
          signal,
        );
        const data = pickPayload(response);
        setFieldSuggestions(mapProfileSuggestions(data));
        setSuggestionNote(
          trim(data?.message || data?.summary || data?.reasoning) ||
            'AI đã chuẩn bị gợi ý cho hồ sơ học tập.',
        );
        setFieldSuggestionStatus('success');
        if (!silent) {
          showToast('Đã tạo gợi ý hồ sơ', 'success');
        }
      } catch {
        if (signal?.aborted) {
          setFieldSuggestionStatus('idle');
          return;
        }
        setFieldSuggestionStatus('error');
        if (!silent) {
          showToast('Không thể tạo gợi ý hồ sơ', 'error');
        }
      }
    },
    [currentLevel, domain, effectiveKnowledge, learningMode, showToast, strongAreas, weakAreas],
  );

  const runConsistencyValidation = useCallback(
    async ({silent = false, signal}: {silent?: boolean; signal?: AbortSignal} = {}) => {
      setConsistencyStatus('loading');

      try {
        const response = await StudyProfileAPI.validateProfileConsistency(
          {
            knowledge: effectiveKnowledge,
            domain,
            learningMode,
            currentLevel,
            learningGoal,
            groupLearningGoal: learningGoal,
            strongAreas: normalizeList(strongAreas),
            weakAreas: normalizeList(weakAreas),
          },
          signal,
        );
        const data = pickPayload(response);
        setConsistencyResult(data);
        setConsistencyNote(
          trim(data?.message || data?.summary) ||
            (Array.isArray(data?.warnings) ? data.warnings.join('. ') : '') ||
            'Hồ sơ hiện tại nhất quán và có thể lưu.',
        );
        setConsistencyStatus('success');
        if (!silent) {
          showToast('Đã kiểm tra hồ sơ', 'success');
        }
      } catch {
        if (signal?.aborted) {
          setConsistencyStatus('idle');
          return;
        }
        setConsistencyStatus('error');
        setConsistencyResult(null);
        setConsistencyNote('Không thể kiểm tra tự động. Hãy rà soát lại thông tin trước khi hoàn tất.');
        if (!silent) {
          showToast('Không thể kiểm tra hồ sơ', 'error');
        }
      }
    },
    [currentLevel, domain, effectiveKnowledge, learningGoal, learningMode, showToast, strongAreas, weakAreas],
  );

  useEffect(() => {
    if (suggestionTimerRef.current) {
      clearTimeout(suggestionTimerRef.current);
    }
    suggestionAbortRef.current?.abort();

    if (step !== 2 || !stepOneValid) {
      if (fieldSuggestionStatus === 'loading') {
        setFieldSuggestionStatus('idle');
      }
      return;
    }

    const missingCore = isGroup
      ? !learningGoal.trim()
      : !currentLevel.trim() || !learningGoal.trim() || !strongAreas.trim() || !weakAreas.trim();
    if (!missingCore) {
      if (fieldSuggestionStatus === 'loading') {
        setFieldSuggestionStatus('idle');
      }
      return;
    }

    suggestionTimerRef.current = setTimeout(() => {
      const abortController = new AbortController();
      suggestionAbortRef.current = abortController;
      requestFieldSuggestions({silent: true, signal: abortController.signal});
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      if (suggestionTimerRef.current) {
        clearTimeout(suggestionTimerRef.current);
      }
      suggestionAbortRef.current?.abort();
    };
  }, [
    currentLevel,
    domain,
    fieldSuggestionStatus,
    isGroup,
    learningGoal,
    learningMode,
    requestFieldSuggestions,
    step,
    stepOneValid,
    strongAreas,
    weakAreas,
  ]);

  useEffect(() => {
    if (consistencyTimerRef.current) {
      clearTimeout(consistencyTimerRef.current);
    }
    consistencyAbortRef.current?.abort();

    if (step < 2 || !stepOneValid || !stepTwoValid) {
      if (consistencyStatus === 'loading') {
        setConsistencyStatus('idle');
      }
      return;
    }

    consistencyTimerRef.current = setTimeout(() => {
      const abortController = new AbortController();
      consistencyAbortRef.current = abortController;
      runConsistencyValidation({silent: true, signal: abortController.signal});
    }, CONSISTENCY_DEBOUNCE_MS);

    return () => {
      if (consistencyTimerRef.current) {
        clearTimeout(consistencyTimerRef.current);
      }
      consistencyAbortRef.current?.abort();
    };
  }, [
    consistencyStatus,
    currentLevel,
    domain,
    effectiveKnowledge,
    learningGoal,
    learningMode,
    runConsistencyValidation,
    step,
    stepOneValid,
    stepTwoValid,
    strongAreas,
    weakAreas,
  ]);

  const applySuggestion = useCallback((field: string, value: string) => {
    const nextValue = trim(value);
    if (!nextValue) {
      return;
    }

    if (field === 'currentLevel') {
      setCurrentLevel(nextValue);
      return;
    }
    if (field === 'learningGoal') {
      setLearningGoal(nextValue);
      return;
    }
    const setter = field === 'strongAreas' ? setStrongAreas : setWeakAreas;
    const currentValue = field === 'strongAreas' ? strongAreas : weakAreas;
    const existing = normalizeList(currentValue).map(item => item.toLowerCase());
    if (existing.includes(nextValue.toLowerCase())) {
      return;
    }
    setter(currentValue.trim() ? `${currentValue.trim()}, ${nextValue}` : nextValue);
  }, [strongAreas, weakAreas]);

  const goNext = useCallback(() => {
    if (step === 1 && !stepOneValid) {
      showToast('Hoàn tất mục đích, kiến thức và domain trước khi tiếp tục', 'error');
      return;
    }
    if (step === 2 && !stepTwoValid) {
      showToast(isGroup ? 'Nhập mục tiêu học tập chung của nhóm' : 'Nhập trình độ và mục tiêu học tập', 'error');
      return;
    }
    setStep(current => Math.min(totalSteps, current + 1));
  }, [isGroup, showToast, step, stepOneValid, stepTwoValid, totalSteps]);

  const handleSubmitProfile = useCallback(async () => {
    if (!workspaceId) {
      showToast(isGroup ? 'Thiếu group id' : 'Thiếu workspace id', 'error');
      return;
    }
    if (!stepOneValid || !stepTwoValid || !finalStepValid) {
      showToast('Vui lòng hoàn tất các trường bắt buộc trước khi lưu', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        learningMode,
        domain: domain.trim(),
        knowledge: effectiveKnowledge.trim(),
        currentLevel: currentLevel.trim(),
        learningGoal: learningGoal.trim(),
        groupLearningGoal: learningGoal.trim(),
        groupName: title || undefined,
        weakAreas: normalizeList(weakAreas),
        strongAreas: normalizeList(strongAreas),
        roadmapEnabled: learningMode === 'STUDY_NEW' ? true : roadmapEnabled,
        knowledgeLoad,
        adaptationMode,
        speedMode,
        estimatedTotalDays: Number(estimatedTotalDays) || null,
        estimatedMinutesPerDay: Number(estimatedMinutesPerDay) || null,
      };

      await profileApi.configureProfileDraft(workspaceId, payload as any);
      await runConsistencyValidation({silent: true});
      const confirmResponse = await profileApi.confirm(workspaceId);
      const confirmPayload = pickPayload(confirmResponse);
      showToast(
        trim(confirmPayload?.message || confirmResponse?.data?.message) ||
          (isGroup ? 'Đã hoàn tất hồ sơ nhóm' : 'Đã hoàn tất hồ sơ học tập'),
        'success',
      );
      navigation.goBack();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          'Không thể lưu hồ sơ học tập',
        'error',
      );
    } finally {
      setSaving(false);
    }
  }, [
    adaptationMode,
    currentLevel,
    domain,
    effectiveKnowledge,
    estimatedMinutesPerDay,
    estimatedTotalDays,
    finalStepValid,
    isGroup,
    knowledgeLoad,
    learningGoal,
    learningMode,
    navigation,
    profileApi,
    roadmapEnabled,
    runConsistencyValidation,
    showToast,
    speedMode,
    stepOneValid,
    stepTwoValid,
    strongAreas,
    title,
    weakAreas,
    workspaceId,
  ]);

  if (loadingProfile) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[styles.loadingText, {color: colors.textSecondary}]}>
            Đang tải hồ sơ học tập...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        <View style={[styles.header, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Icon name="chevron-left" size={26} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerKicker, {color: Colors.primary}]}>
              {isGroup ? 'Hồ sơ học tập nhóm' : 'Hồ sơ không gian học tập'}
            </Text>
            <Text style={[styles.headerTitle, {color: colors.heading}]} numberOfLines={1}>
              {title || (isGroup ? 'Không gian nhóm' : 'Không gian cá nhân')}
            </Text>
          </View>
          <View style={[styles.stepPill, {backgroundColor: isDark ? '#1E293B' : '#EFF6FF'}]}>
            <Text style={styles.stepPillText}>{step}/{totalSteps}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <SetupStatusCard
            colors={colors}
            isDark={isDark}
            completed={setupCompleted}
            summary={setupSummary}
          />

          <ProgressStepper
            colors={colors}
            step={step}
            totalSteps={totalSteps}
            onStepPress={target => {
              if (
                target <= totalSteps &&
                (target < step || (target === 2 && stepOneValid) || (target === 3 && stepOneValid && stepTwoValid))
              ) {
                setStep(target);
              }
            }}
          />

          <View style={[styles.heroCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[styles.heroEyebrow, {color: Colors.primary}]}>{stepTitle}</Text>
            <Text style={[styles.heroTitle, {color: colors.heading}]}>
              {stepSubtitle}
            </Text>
            <View style={styles.heroMeter}>
              {Array.from({length: totalSteps}, (_, index) => index + 1).map(item => (
                <View
                  key={item}
                  style={[
                    styles.heroMeterSegment,
                    {
                      backgroundColor: item <= step ? Colors.primary : colors.border,
                    },
                  ]}
                />
              ))}
            </View>
          </View>

          {step === 1 ? (
            <StepOne
              colors={colors}
              isDark={isDark}
              analysisNote={analysisNote}
              analysisStatus={analysisStatus}
              domain={domain}
              domainOptions={domainOptions}
              knowledgeInput={knowledgeInput}
              learningMode={learningMode}
              roadmapEnabled={roadmapEnabled}
              setDomain={setDomain}
              setKnowledgeInput={text => {
                setKnowledgeInput(text);
              }}
              setLearningMode={mode => {
                setLearningMode(mode);
                setRoadmapEnabled(mode === 'STUDY_NEW' ? true : roadmapEnabled);
              }}
              setRoadmapEnabled={setRoadmapEnabled}
              onRetryAnalysis={() => {
                setKnowledgeInput(value => `${value} `);
                setTimeout(() => setKnowledgeInput(value => value.trim()), 0);
              }}
            />
          ) : null}

          {step === 2 ? (
            <StepTwo
              colors={colors}
              contextType={contextType}
              consistencyNote={consistencyNote}
              consistencyResult={consistencyResult}
              consistencyStatus={consistencyStatus}
              isCompactLayout={isCompactLayout}
              currentLevel={currentLevel}
              fieldSuggestionStatus={fieldSuggestionStatus}
              fieldSuggestions={fieldSuggestions}
              isDark={isDark}
              learningGoal={learningGoal}
              setCurrentLevel={setCurrentLevel}
              setLearningGoal={setLearningGoal}
              setStrongAreas={setStrongAreas}
              setWeakAreas={setWeakAreas}
              strongAreas={strongAreas}
              suggestionNote={suggestionNote}
              weakAreas={weakAreas}
              onApplySuggestion={applySuggestion}
            />
          ) : null}

          {step === 3 && canUseRoadmap ? (
            <StepThree
              adaptationMode={adaptationMode}
              colors={colors}
              estimatedMinutesPerDay={estimatedMinutesPerDay}
              estimatedTotalDays={estimatedTotalDays}
              isDark={isDark}
              isCompactLayout={isCompactLayout}
              knowledgeLoad={knowledgeLoad}
              setAdaptationMode={setAdaptationMode}
              setEstimatedMinutesPerDay={setEstimatedMinutesPerDay}
              setEstimatedTotalDays={setEstimatedTotalDays}
              setKnowledgeLoad={setKnowledgeLoad}
              setSpeedMode={setSpeedMode}
              speedMode={speedMode}
            />
          ) : null}

          <View style={styles.bottomSpacer} />
        </ScrollView>

        <View style={[styles.footer, {backgroundColor: colors.surface, borderTopColor: colors.border}]}>
          {step > 1 ? (
            <Button
              title="Quay lại"
              onPress={() => setStep(current => Math.max(1, current - 1))}
              variant="outline"
              size="md"
              fullWidth={false}
              style={styles.footerBtn}
            />
          ) : (
            <View style={styles.footerBtn} />
          )}

          {step < totalSteps ? (
            <Button
              title="Tiếp theo"
              onPress={goNext}
              disabled={(step === 1 && !stepOneValid) || (step === 2 && !stepTwoValid)}
              size="md"
              fullWidth={false}
              style={styles.footerBtn}
            />
          ) : (
            <Button
              title={saving ? 'Đang lưu...' : 'Hoàn tất'}
              onPress={handleSubmitProfile}
              loading={saving}
              disabled={!finalStepValid}
              size="md"
              fullWidth={false}
              style={styles.footerBtn}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SetupStatusCard({
  colors,
  completed,
  isDark,
  summary,
}: {
  colors: any;
  completed: boolean;
  isDark: boolean;
  summary: string;
}) {
  return (
    <View
      style={[
        styles.statusCard,
        {
          backgroundColor: completed
            ? isDark
              ? 'rgba(16, 185, 129, 0.12)'
              : '#ECFDF5'
            : isDark
            ? 'rgba(59, 130, 246, 0.12)'
            : '#EFF6FF',
          borderColor: completed
            ? isDark
              ? 'rgba(16, 185, 129, 0.3)'
              : '#A7F3D0'
            : isDark
            ? 'rgba(59, 130, 246, 0.28)'
            : '#BFDBFE',
        },
      ]}>
      <Icon
        name={completed ? 'check-decagram-outline' : 'account-cog-outline'}
        size={20}
        color={completed ? Colors.success : Colors.primary}
      />
      <View style={styles.statusCopy}>
        <Text style={[styles.statusTitle, {color: colors.heading}]}>
          {completed ? 'Hồ sơ đã thiết lập' : 'Cần hoàn tất hồ sơ'}
        </Text>
        <Text style={[styles.statusText, {color: colors.textSecondary}]}>
          {summary || 'Cấu hình này quyết định cách AI tạo quiz, flashcard và lộ trình.'}
        </Text>
      </View>
    </View>
  );
}

function ProgressStepper({
  colors,
  onStepPress,
  step,
  totalSteps,
}: {
  colors: any;
  onStepPress: (step: number) => void;
  step: number;
  totalSteps: number;
}) {
  return (
    <View style={styles.stepper}>
      {Array.from({length: totalSteps}, (_, index) => index + 1).map(item => {
        const active = item === step;
        const done = item < step;
        return (
          <TouchableOpacity
            key={item}
            onPress={() => onStepPress(item)}
            style={[
              styles.stepItem,
              {
                borderColor: active || done ? Colors.primary : colors.border,
                backgroundColor: active
                  ? Colors.primary
                  : done
                  ? Colors.primaryLight
                  : colors.surface,
              },
            ]}>
            <Icon
              name={done ? 'check' : item === 1 ? 'target' : item === 2 ? 'account-edit-outline' : 'map-check-outline'}
              size={16}
              color={active ? '#FFFFFF' : done ? Colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StepOne(props: {
  analysisNote: string;
  analysisStatus: AsyncStatus;
  colors: any;
  domain: string;
  domainOptions: DomainOption[];
  isDark: boolean;
  knowledgeInput: string;
  learningMode: LearningMode;
  roadmapEnabled: boolean;
  setDomain: (value: string) => void;
  setKnowledgeInput: (value: string) => void;
  setLearningMode: (value: LearningMode) => void;
  setRoadmapEnabled: (value: boolean) => void;
  onRetryAnalysis: () => void;
}) {
  const {
    analysisNote,
    analysisStatus,
    colors,
    domain,
    domainOptions,
    isDark,
    knowledgeInput,
    learningMode,
    roadmapEnabled,
    setDomain,
    setKnowledgeInput,
    setLearningMode,
    setRoadmapEnabled,
    onRetryAnalysis,
  } = props;

  return (
    <View style={styles.stepBody}>
      <WizardSection
        colors={colors}
        isDark={isDark}
        icon="target"
        tint={Colors.primary}
        title="Xác định kiến thức và cách học"
        description="Chọn cách học chính, nhập kiến thức bạn muốn học và để Quizmate AI gợi ý domain phù hợp."
      >
        <Text style={[styles.sectionTitle, {color: colors.heading}]}>Cách học chính*</Text>
        <View style={styles.modeGrid}>
          {LEARNING_MODES.map(mode => {
            const active = learningMode === mode.key;
            return (
              <TouchableOpacity
                key={mode.key}
                onPress={() => setLearningMode(mode.key)}
                style={[
                  styles.modeCard,
                  active && styles.optionActiveShadow,
                  {
                    backgroundColor: active ? mode.color : colors.surface,
                    borderColor: active ? mode.color : colors.border,
                  },
                ]}>
                <View
                  style={[
                    styles.modeIcon,
                    {backgroundColor: active ? 'rgba(255,255,255,0.18)' : `${mode.color}18`},
                  ]}>
                  <Icon name={mode.icon} size={20} color={active ? '#FFFFFF' : mode.color} />
                </View>
                <View style={styles.modeCopy}>
                  <Text style={[styles.modeTitle, {color: active ? '#FFFFFF' : colors.heading}]}>{mode.title}</Text>
                  <Text style={[styles.modeDesc, {color: active ? 'rgba(255,255,255,0.82)' : colors.textSecondary}]}>{mode.description}</Text>
                </View>
                {active ? <Icon name="check-circle" size={18} color="#FFFFFF" /> : <Icon name="chevron-right" size={18} color={colors.textTertiary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </WizardSection>

      <WizardSection
        colors={colors}
        isDark={isDark}
        icon="book-open-page-variant-outline"
        tint="#2563EB"
        title="Nhập kiến thức bạn muốn học"
        description="Nhập kiến thức mà bạn muốn học. Quizmate AI sẽ suy ra lĩnh vực phù hợp với bạn."
      >
        <TextArea
          colors={colors}
          label="Kiến thức bạn muốn học*"
          placeholder="Ví dụ: java cơ bản"
          value={knowledgeInput}
          onChangeText={setKnowledgeInput}
          minHeight={128}
        />

        <InlineStatus
          colors={colors}
          isDark={isDark}
          status={analysisStatus}
          text={
            analysisStatus === 'loading'
              ? 'AI đang phân tích phạm vi kiến thức...'
              : analysisNote
          }
          onRetry={analysisStatus === 'error' ? onRetryAnalysis : undefined}
        />

        <OptionGroup
          colors={colors}
          isDark={isDark}
          title="Suggested domains*"
          variant="domain"
          options={domainOptions}
          selected={domain}
          onSelect={option => setDomain(option.label)}
        />

        {domainOptions.length === 0 && analysisStatus === 'success' ? (
          <View style={[styles.infoCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Icon name="information-outline" size={20} color={colors.textSecondary} />
            <Text style={[styles.infoText, {color: colors.textSecondary}]}>
              Quizmate AI chưa có đủ domain để bạn chọn. Hãy nhập kiến thức cụ thể hơn giống FE.
            </Text>
          </View>
        ) : null}
      </WizardSection>

      {learningMode === 'REVIEW' ? (
        <WizardSection
          colors={colors}
          isDark={isDark}
          icon="map-marker-path"
          tint="#8B5CF6"
          title="Có tạo lộ trình đi kèm không?"
          description="FE chỉ hỏi thêm mục này khi bạn chọn Ôn tập."
        >
          <View style={styles.modeGrid}>
            {[
              {
                key: 'yes',
                enabled: true,
                title: 'Có',
                description: 'Vẫn tạo roadmap để ôn tập có nhịp học rõ ràng.',
                color: '#10B981',
              },
              {
                key: 'no',
                enabled: false,
                title: 'Không',
                description: 'Chỉ dùng hồ sơ để AI tạo nội dung, không mở roadmap.',
                color: '#F59E0B',
              },
            ].map(option => {
              const active = roadmapEnabled === option.enabled;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setRoadmapEnabled(option.enabled)}
                  style={[
                    styles.modeCard,
                    active && styles.optionActiveShadow,
                    {
                      backgroundColor: active ? option.color : colors.surface,
                      borderColor: active ? option.color : colors.border,
                    },
                  ]}>
                  <View
                    style={[
                      styles.modeIcon,
                      {backgroundColor: active ? 'rgba(255,255,255,0.18)' : `${option.color}18`},
                    ]}>
                    <Icon
                      name={option.enabled ? 'check-circle-outline' : 'close-circle-outline'}
                      size={20}
                      color={active ? '#FFFFFF' : option.color}
                    />
                  </View>
                  <View style={styles.modeCopy}>
                    <Text style={[styles.modeTitle, {color: active ? '#FFFFFF' : colors.heading}]}>{option.title}</Text>
                    <Text style={[styles.modeDesc, {color: active ? 'rgba(255,255,255,0.82)' : colors.textSecondary}]}>
                      {option.description}
                    </Text>
                  </View>
                  {active ? <Icon name="check-circle" size={18} color="#FFFFFF" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </WizardSection>
      ) : null}
    </View>
  );
}

function StepTwo(props: {
  colors: any;
  contextType: ContextType;
  consistencyNote: string;
  consistencyResult: any;
  consistencyStatus: AsyncStatus;
  currentLevel: string;
  fieldSuggestionStatus: AsyncStatus;
  fieldSuggestions: typeof EMPTY_SUGGESTIONS;
  isDark: boolean;
  isCompactLayout: boolean;
  learningGoal: string;
  setCurrentLevel: (value: string) => void;
  setLearningGoal: (value: string) => void;
  setStrongAreas: (value: string) => void;
  setWeakAreas: (value: string) => void;
  strongAreas: string;
  suggestionNote: string;
  weakAreas: string;
  onApplySuggestion: (field: string, value: string) => void;
}) {
  const {
    colors,
    contextType,
    consistencyNote,
    consistencyResult,
    consistencyStatus,
    currentLevel,
    fieldSuggestionStatus,
    fieldSuggestions,
    isDark,
    isCompactLayout,
    learningGoal,
    setCurrentLevel,
    setLearningGoal,
    setStrongAreas,
    setWeakAreas,
    strongAreas,
    suggestionNote,
    weakAreas,
    onApplySuggestion,
  } = props;
  const isGroup = contextType === 'GROUP';
  const normalizedConsistency = consistencyResult && typeof consistencyResult === 'object'
    ? consistencyResult
    : {};
  const aiWorkspaceNameSuggestion = trim(
    normalizedConsistency?.workspaceNameSuggestion ||
      normalizedConsistency?.workspaceTitleSuggestion ||
      normalizedConsistency?.workspaceTitle,
  );
  const aiAlignmentHighlights = normalizeList(normalizedConsistency?.alignmentHighlights);
  const aiOverallIssues = normalizeList(
    normalizedConsistency?.issues ||
      normalizedConsistency?.issueList ||
      normalizedConsistency?.warnings,
  );
  const aiOverallRecommendations = normalizeList(
    normalizedConsistency?.recommendations ||
      normalizedConsistency?.recommendationList ||
      normalizedConsistency?.suggestions,
  );

  return (
    <View style={styles.stepBody}>
      <WizardSection
        colors={colors}
        isDark={isDark}
        icon="school-outline"
        tint="#0EA5E9"
        title="Mô tả trạng thái hiện tại của bạn"
        description="Điền đủ bối cảnh để các gợi ý ở bước cuối sát hơn với năng lực hiện tại và mục tiêu của bạn."
      >
        {!isGroup ? (
          <FormPanel colors={colors}>
            <Text style={[styles.fieldGuideText, {color: colors.textSecondary}]}>
              Mô tả trình độ hiện tại theo đúng kiến thức và lĩnh vực đã chọn, ví dụ N5 nền tảng hoặc yếu ngữ pháp N4.
            </Text>
            <TextField
              colors={colors}
              label="1. Trình độ hiện tại*"
              value={currentLevel}
              onChangeText={setCurrentLevel}
              dense={isCompactLayout}
              placeholder="Ví dụ: đã biết JavaScript, mới học React Native"
            />
            <SuggestionChips
              colors={colors}
              field="currentLevel"
              items={fieldSuggestions.currentLevelSuggestions}
              onApply={onApplySuggestion}
            />
          </FormPanel>
        ) : null}

        {!isGroup ? (
          <FormPanel colors={colors}>
            <Text style={[styles.panelTitle, {color: colors.heading}]}>2. Điểm mạnh và điểm yếu trong đúng phạm vi này</Text>
            <View style={[styles.guidanceCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <Icon name="sparkles" size={18} color={Colors.primary} />
              <View style={styles.guidanceCopy}>
                <Text style={[styles.guidanceTitle, {color: colors.heading}]}>Bạn đang ở giai đoạn mới bắt đầu</Text>
                <Text style={[styles.guidanceText, {color: colors.textSecondary}]}>
                  Ở giai đoạn này bạn chưa cần có điểm mạnh hoặc điểm yếu rõ ràng. Hãy ghi ngắn là đang bắt đầu từ nền tảng.
                </Text>
              </View>
            </View>
            <TextArea
              colors={colors}
              label="Điểm mạnh"
              placeholder="Ngăn cách bằng dấu phẩy hoặc xuống dòng"
              value={strongAreas}
              onChangeText={setStrongAreas}
            />
            <SuggestionChips
              colors={colors}
              field="strongAreas"
              items={fieldSuggestions.strongAreaSuggestions}
              onApply={onApplySuggestion}
            />

            <TextArea
              colors={colors}
              label="Điểm yếu cần cải thiện"
              placeholder="Ngăn cách bằng dấu phẩy hoặc xuống dòng"
              value={weakAreas}
              onChangeText={setWeakAreas}
            />
            <SuggestionChips
              colors={colors}
              field="weakAreas"
              items={fieldSuggestions.weakAreaSuggestions}
              onApply={onApplySuggestion}
            />
          </FormPanel>
        ) : null}

        <FormPanel colors={colors}>
          <TextArea
            colors={colors}
            label={isGroup ? '3. Mục tiêu học tập chung của nhóm*' : '3. Mục tiêu học tập*'}
            placeholder={isGroup ? 'Ví dụ: cả nhóm nắm vững React Native để làm MVP mobile.' : 'Ví dụ: làm quen cú pháp Java và cấu trúc chương trình.'}
            value={learningGoal}
            onChangeText={setLearningGoal}
            minHeight={104}
          />
          <SuggestionChips
            colors={colors}
            field="learningGoal"
            items={fieldSuggestions.learningGoalSuggestions}
            onApply={onApplySuggestion}
          />
        </FormPanel>

      </WizardSection>

      <WizardSection
        colors={colors}
        isDark={isDark}
        icon="sparkles"
        tint="#06B6D4"
        title="Đánh giá tổng quan sẽ xuất hiện sau khi bạn điền đủ dữ liệu"
        description="Hãy điền trình độ hiện tại, điểm mạnh, điểm yếu và mục tiêu học tập. Sau đó Quizmate AI sẽ kiểm tra xem step 2 có khớp với kiến thức hay chưa."
      >
        <InlineStatus
          colors={colors}
          isDark={isDark}
          status={fieldSuggestionStatus}
          text={
            fieldSuggestionStatus === 'loading'
              ? 'Quizmate AI đang gợi ý dữ liệu phù hợp...'
              : suggestionNote
          }
        />

        <InlineStatus
          colors={colors}
          isDark={isDark}
          status={consistencyStatus}
          text={
            consistencyStatus === 'loading'
              ? 'Quizmate AI đang đánh giá độ khớp tổng thể...'
              : consistencyStatus === 'error'
              ? consistencyNote
              : consistencyStatus === 'success'
              ? consistencyNote
              : ''
          }
        />

        {consistencyStatus === 'success' ? (
          <View
            style={[
              styles.aiReviewCard,
              {
                backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5',
                borderColor: isDark ? 'rgba(16,185,129,0.28)' : '#A7F3D0',
              },
            ]}>
            <Text style={[styles.aiReviewTitle, {color: colors.heading}]}>Gợi ý tham khảo từ Quizmate AI</Text>
            <Text style={[styles.aiReviewDesc, {color: colors.textSecondary}]}>Bạn có thể chỉnh lại theo nhu cầu thực tế.</Text>

            {aiWorkspaceNameSuggestion ? (
              <View style={styles.aiReviewSection}>
                <Text style={[styles.aiReviewSectionLabel, {color: colors.textSecondary}]}>Quizmate AI suggested workspace name</Text>
                <View style={[styles.aiReviewPill, {backgroundColor: isDark ? 'rgba(16,185,129,0.18)' : '#D1FAE5'}]}>
                  <Text style={[styles.aiReviewPillText, {color: isDark ? '#A7F3D0' : '#065F46'}]}>{aiWorkspaceNameSuggestion}</Text>
                </View>
                <Text style={[styles.aiReviewHint, {color: colors.textSecondary}]}>Tên này được tạo từ kiến thức, lĩnh vực và mục tiêu học hiện tại để có thể dùng ngay cho workspace.</Text>
              </View>
            ) : null}

            {aiAlignmentHighlights.length > 0 ? (
              <View style={styles.aiReviewSection}>
                <Text style={[styles.aiReviewSectionLabel, {color: colors.textSecondary}]}>Những điểm đang khớp</Text>
                {aiAlignmentHighlights.map((item, idx) => (
                  <Text key={`align-${idx}`} style={[styles.aiReviewListItem, {color: colors.text}]}>• {item}</Text>
                ))}
              </View>
            ) : null}

            {aiOverallIssues.length > 0 ? (
              <View style={styles.aiReviewSection}>
                <Text style={[styles.aiReviewSectionLabel, {color: colors.textSecondary}]}>Những điểm cần rà soát</Text>
                {aiOverallIssues.map((item, idx) => (
                  <Text key={`issue-${idx}`} style={[styles.aiReviewListItem, {color: colors.text}]}>• {item}</Text>
                ))}
              </View>
            ) : null}

            {aiOverallRecommendations.length > 0 ? (
              <View style={styles.aiReviewSection}>
                <Text style={[styles.aiReviewSectionLabel, {color: colors.textSecondary}]}>Gợi ý tinh chỉnh</Text>
                {aiOverallRecommendations.map((item, idx) => (
                  <Text key={`rec-${idx}`} style={[styles.aiReviewListItem, {color: colors.text}]}>→ {item}</Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </WizardSection>
    </View>
  );
}

function StepThree(props: {
  adaptationMode: 'BALANCED' | 'FLEXIBLE';
  colors: any;
  estimatedMinutesPerDay: string;
  estimatedTotalDays: string;
  isDark: boolean;
  isCompactLayout: boolean;
  knowledgeLoad: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';
  setAdaptationMode: (value: 'BALANCED' | 'FLEXIBLE') => void;
  setEstimatedMinutesPerDay: (value: string) => void;
  setEstimatedTotalDays: (value: string) => void;
  setKnowledgeLoad: (value: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED') => void;
  setSpeedMode: (value: 'STANDARD' | 'SLOW' | 'FAST') => void;
  speedMode: 'STANDARD' | 'SLOW' | 'FAST';
}) {
  const {
    adaptationMode,
    colors,
    estimatedMinutesPerDay,
    estimatedTotalDays,
    isDark,
    isCompactLayout,
    knowledgeLoad,
    setAdaptationMode,
    setEstimatedMinutesPerDay,
    setEstimatedTotalDays,
    setKnowledgeLoad,
    setSpeedMode,
    speedMode,
  } = props;

  return (
    <View style={styles.stepBody}>
      <WizardSection
        colors={colors}
        isDark={isDark}
        icon="shield-check-outline"
        tint="#10B981"
        title="Thiết lập lộ trình"
        description="Thiết lập lượng kiến thức, tốc độ, số ngày dự kiến và số phút mỗi ngày để lộ trình bám đúng mục tiêu của bạn."
      >
        <View style={[styles.aiSuggestCard, {backgroundColor: isDark ? 'rgba(6,182,212,0.1)' : '#ECFEFF', borderColor: isDark ? 'rgba(6,182,212,0.25)' : '#A5F3FC'}]}>
          <View style={styles.aiSuggestHead}>
            <View style={[styles.aiSuggestIcon, {backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF'}]}>
              <Icon name="brain" size={20} color="#0891B2" />
            </View>
            <View style={styles.aiSuggestCopy}>
              <Text style={[styles.aiSuggestTitle, {color: colors.heading}]}>Quizmate AI gợi ý cấu hình lộ trình</Text>
              <Text style={[styles.aiSuggestText, {color: colors.textSecondary}]}>
                Dùng hồ sơ đã lưu ở bước trước để đề xuất lượng kiến thức, nhịp học, số ngày và số phút học mỗi ngày.
              </Text>
            </View>
          </View>
          <Button
            title="Lấy gợi ý AI"
            onPress={() => {
              const suggestedDays = getRecommendedRoadmapDays(knowledgeLoad, speedMode);
              const suggestedMinutes = getRecommendedRoadmapMinutesPerDay(knowledgeLoad, suggestedDays);
              setAdaptationMode('BALANCED');
              setEstimatedTotalDays(String(suggestedDays));
              setEstimatedMinutesPerDay(String(suggestedMinutes));
            }}
            variant="secondary"
            icon="sparkles"
          />
        </View>

        <PickerCards
          colors={colors}
          title="Lượng kiến thức cần học*"
          description="Lượng kiến thức quyết định bạn học bao nhiêu. Tốc độ học quyết định nhịp thời gian, còn hệ thống sẽ chia đều theo số ngày và phút mỗi ngày."
          icon="layers-triple-outline"
          items={KNOWLEDGE_LOADS}
          selected={knowledgeLoad}
          onSelect={value => setKnowledgeLoad(value as 'BASIC' | 'INTERMEDIATE' | 'ADVANCED')}
          tint="#0EA5E9"
        />

        <PickerCards
          colors={colors}
          title="Loại Lộ trình*"
          icon="gauge"
          items={ADAPTATION_MODES}
          selected={adaptationMode}
          onSelect={value => setAdaptationMode(value as 'BALANCED' | 'FLEXIBLE')}
          tint="#10B981"
        />

        <PickerCards
          colors={colors}
          title="Tốc độ Lộ trình*"
          icon="trending-up"
          items={SPEED_MODES}
          selected={speedMode}
          onSelect={value => setSpeedMode(value as 'STANDARD' | 'SLOW' | 'FAST')}
          tint="#0EA5E9"
        />

        <View style={[styles.inlineFields, isCompactLayout && styles.inlineFieldsCompact]}>
          <View style={[styles.inlineField, isCompactLayout && styles.inlineFieldCompact]}>
            <TextField
              colors={colors}
              label="Số ngày dự kiến*"
              value={estimatedTotalDays}
              onChangeText={setEstimatedTotalDays}
              dense={isCompactLayout}
              keyboardType="number-pad"
            />
            <View style={[styles.insightCard, {backgroundColor: isDark ? 'rgba(14,165,233,0.12)' : '#E0F2FE', borderColor: isDark ? 'rgba(14,165,233,0.25)' : '#BAE6FD'}]}>
              <Text style={[styles.insightTitle, {color: colors.heading}]}>Phân tích nhịp học</Text>
              <Text style={[styles.insightText, {color: colors.textSecondary}]}>
                Với lựa chọn hiện tại, Quizmate AI đang gợi ý khoảng {Number(estimatedTotalDays) || 30} ngày ở tốc độ {SPEED_MODES.find(item => item.key === speedMode)?.label || 'Tiêu chuẩn'} để phủ đúng lượng kiến thức đã chọn.
              </Text>
            </View>
          </View>
          <View style={[styles.inlineField, isCompactLayout && styles.inlineFieldCompact]}>
            <TextField
              colors={colors}
              label="Số phút học gợi ý mỗi ngày*"
              value={estimatedMinutesPerDay}
              onChangeText={setEstimatedMinutesPerDay}
              dense={isCompactLayout}
              keyboardType="number-pad"
            />
            <View style={[styles.insightCard, {backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FEF3C7', borderColor: isDark ? 'rgba(245,158,11,0.25)' : '#FDE68A'}]}>
              <Text style={[styles.insightTitle, {color: colors.heading}]}>Phân bổ thời lượng mỗi ngày</Text>
              <Text style={[styles.insightText, {color: colors.textSecondary}]}>
                Để giãn đều lượng kiến thức cần học trong {Number(estimatedTotalDays) || 30} ngày, Quizmate AI gợi ý khoảng {Number(estimatedMinutesPerDay) || 60} phút/ngày.
              </Text>
            </View>
          </View>
        </View>
      </WizardSection>
    </View>
  );
}
function WizardSection({
  children,
  colors,
  description,
  icon,
  isDark,
  tint,
  title,
}: {
  children: React.ReactNode;
  colors: any;
  description: string;
  icon: string;
  isDark: boolean;
  tint: string;
  title: string;
}) {
  return (
    <View style={[styles.wizardSection, {backgroundColor: colors.surface, borderColor: colors.border}]}>
      <View style={styles.sectionHeaderRow}>
        <View
          style={[
            styles.sectionIconBox,
            {backgroundColor: isDark ? `${tint}24` : `${tint}12`},
          ]}>
          <Icon name={icon} size={22} color={tint} />
        </View>
        <View style={styles.sectionHeaderCopy}>
          <Text style={[styles.sectionHeaderTitle, {color: colors.heading}]}>{title}</Text>
          <Text style={[styles.sectionHeaderDesc, {color: colors.textSecondary}]}>{description}</Text>
        </View>
      </View>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function FormPanel({children, colors}: {children: React.ReactNode; colors: any}) {
  return (
    <View style={[styles.formPanel, {backgroundColor: colors.surfaceVariant, borderColor: colors.border}]}>
      {children}
    </View>
  );
}

function TextField({
  colors,
  dense = false,
  label,
  onChangeText,
  placeholder,
  value,
  ...rest
}: {
  colors: any;
  dense?: boolean;
  label: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
  [key: string]: any;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={[styles.fieldLabel, {color: colors.heading}]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={[
          styles.textField,
          dense && styles.textFieldDense,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
        {...rest}
      />
    </View>
  );
}

function TextArea({
  colors,
  label,
  minHeight = 96,
  onChangeText,
  placeholder,
  value,
}: {
  colors: any;
  label: string;
  minHeight?: number;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={[styles.fieldLabel, {color: colors.heading}]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        multiline
        textAlignVertical="top"
        style={[
          styles.textArea,
          {
            minHeight,
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      />
    </View>
  );
}

function OptionGroup({
  colors,
  isDark,
  onSelect,
  options,
  selected,
  title,
  variant = 'default',
}: {
  colors: any;
  isDark: boolean;
  onSelect: (option: DomainOption | KnowledgeOption) => void;
  options: Array<DomainOption | KnowledgeOption>;
  selected: string;
  title: string;
  variant?: 'default' | 'domain';
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <View style={styles.optionGroup}>
      <Text style={[styles.sectionTitle, {color: colors.heading}]}>{title}</Text>
      {options.map((option, index) => {
        const active = selected === option.label;
        const theme = DOMAIN_OPTION_THEMES[index % DOMAIN_OPTION_THEMES.length];
        const accent = variant === 'domain' ? theme.color : Colors.primary;
        const softBackground = variant === 'domain'
          ? isDark
            ? theme.darkSoft
            : theme.soft
          : Colors.primaryLight;
        return (
          <TouchableOpacity
            key={option.id || option.label}
            onPress={() => onSelect(option)}
            style={[
              styles.optionCard,
              active && styles.optionActiveShadow,
              {
                backgroundColor: active ? accent : colors.surface,
                borderColor: active ? accent : colors.border,
              },
            ]}>
            <View style={styles.optionHead}>
              <View
                style={[
                  styles.optionIconBox,
                  {backgroundColor: active ? 'rgba(255,255,255,0.18)' : softBackground},
                ]}>
                <Icon
                  name={active ? 'check-circle-outline' : variant === 'domain' ? theme.icon : 'lightbulb-on-outline'}
                  size={18}
                  color={active ? '#FFFFFF' : accent}
                />
              </View>
              <Text style={[styles.optionTitle, {color: active ? '#FFFFFF' : colors.heading}]}>
                {option.label}
              </Text>
              {!active ? <Icon name="chevron-right" size={18} color={colors.textTertiary} /> : null}
            </View>
            {option.reason ? (
              <Text style={[styles.optionReason, {color: active ? 'rgba(255,255,255,0.84)' : colors.textSecondary}]}>{option.reason}</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SuggestionChips({
  colors,
  field,
  items,
  onApply,
}: {
  colors: any;
  field: string;
  items: string[];
  onApply: (field: string, value: string) => void;
}) {
  if (!items.length) {
    return null;
  }
  return (
    <View style={styles.chipWrap}>
      {items.map(item => (
        <TouchableOpacity
          key={`${field}-${item}`}
          onPress={() => onApply(field, item)}
          style={[styles.chip, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          <Icon name="plus" size={12} color={Colors.primary} />
          <Text style={[styles.chipText, {color: colors.textSecondary}]}>{item}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function InlineStatus({
  colors,
  isDark,
  onRetry,
  status,
  text,
}: {
  colors: any;
  isDark: boolean;
  onRetry?: () => void;
  status: AsyncStatus;
  text?: string;
}) {
  if (!text && status !== 'loading') {
    return null;
  }

  const toneColor =
    status === 'error' ? Colors.error : status === 'success' ? Colors.success : Colors.primary;

  return (
    <View
      style={[
        styles.inlineStatus,
        {
          borderColor:
            status === 'error'
              ? Colors.errorLight
              : status === 'success'
              ? Colors.successLight
              : Colors.primaryLight,
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
        },
      ]}>
      {status === 'loading' ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : (
        <Icon
          name={status === 'error' ? 'alert-circle-outline' : 'check-circle-outline'}
          size={18}
          color={toneColor}
        />
      )}
      <Text style={[styles.inlineStatusText, {color: colors.textSecondary}]}>
        {text}
      </Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} style={styles.retryBtn}>
          <Icon name="refresh" size={16} color={Colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function PickerCards({
  colors,
  description,
  icon = 'check-circle-outline',
  items,
  onSelect,
  selected,
  tint = Colors.primary,
  title,
}: {
  colors: any;
  description?: string;
  icon?: string;
  items: ReadonlyArray<{key: string; label: string; description: string}>;
  onSelect: (value: string) => void;
  selected: string;
  tint?: string;
  title: string;
}) {
  return (
    <View style={styles.pickerBlock}>
      <Text style={[styles.sectionTitle, {color: colors.heading}]}>{title}</Text>
      {description ? (
        <Text style={[styles.fieldGuideText, {color: colors.textSecondary}]}>{description}</Text>
      ) : null}
      {items.map(item => {
        const active = selected === item.key;
        return (
          <TouchableOpacity
            key={item.key}
            onPress={() => onSelect(item.key)}
            style={[
              styles.pickerCard,
              active && styles.optionActiveShadow,
              {
                backgroundColor: active ? tint : colors.surface,
                borderColor: active ? tint : colors.border,
              },
            ]}>
            <View style={styles.pickerHead}>
              <Icon name={icon} size={18} color={active ? '#FFFFFF' : tint} />
              <Text style={[styles.pickerTitle, {color: active ? '#FFFFFF' : colors.heading}]}>
                {item.label}
              </Text>
            </View>
            <Text style={[styles.pickerDesc, {color: active ? 'rgba(255,255,255,0.84)' : colors.textSecondary}]}>
              {item.description}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  loadingWrap: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm},
  loadingText: {fontSize: 13, fontWeight: '500'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {flex: 1},
  headerKicker: {fontSize: 11, fontWeight: '700', textTransform: 'uppercase'},
  headerTitle: {fontSize: 16, fontWeight: '700'},
  stepPill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  stepPillText: {fontSize: 12, color: Colors.primary, fontWeight: '800'},
  content: {flex: 1},
  contentContainer: {padding: Spacing.md, paddingBottom: Spacing['3xl']},
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statusCopy: {flex: 1},
  statusTitle: {fontSize: 13, fontWeight: '700'},
  statusText: {fontSize: 12, lineHeight: 17, marginTop: 2},
  stepper: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  stepItem: {
    width: 44,
    height: 34,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...SURFACE_SHADOW,
  },
  heroEyebrow: {fontSize: 12, fontWeight: '800', textTransform: 'uppercase'},
  heroTitle: {fontSize: 18, lineHeight: 25, fontWeight: '800', marginTop: 4},
  heroMeter: {flexDirection: 'row', gap: 6, marginTop: Spacing.md},
  heroMeterSegment: {flex: 1, height: 5, borderRadius: BorderRadius.full},
  stepBody: {gap: Spacing.md},
  sectionTitle: {fontSize: 14, fontWeight: '700'},
  wizardSection: {
    borderWidth: 1,
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...SURFACE_SHADOW,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  sectionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderCopy: {flex: 1},
  sectionHeaderTitle: {fontSize: 17, lineHeight: 23, fontWeight: '800'},
  sectionHeaderDesc: {fontSize: 13, lineHeight: 19, marginTop: 2},
  sectionContent: {gap: Spacing.md},
  formPanel: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 24,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  panelTitle: {fontSize: 14, fontWeight: '800'},
  modeGrid: {gap: Spacing.sm},
  modeCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  optionActiveShadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 8},
    elevation: 4,
  },
  modeIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeCopy: {flex: 1},
  modeTitle: {fontSize: 14, fontWeight: '700'},
  modeDesc: {fontSize: 12, lineHeight: 17, marginTop: 2},
  fieldBlock: {gap: Spacing.xs},
  fieldLabel: {fontSize: 13, fontWeight: '700'},
  fieldGuideText: {fontSize: 12, lineHeight: 18},
  guidanceCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  guidanceCopy: {flex: 1},
  guidanceTitle: {fontSize: 13, fontWeight: '700'},
  guidanceText: {fontSize: 12, lineHeight: 18, marginTop: 3},
  textField: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: 14,
    lineHeight: 20,
  },
  textFieldDense: {
    paddingVertical: 12,
  },
  textArea: {
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    fontSize: 14,
    lineHeight: 20,
  },
  optionGroup: {gap: Spacing.sm},
  optionCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.md,
  },
  optionHead: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  optionIconBox: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {flex: 1, fontSize: 14, fontWeight: '700'},
  optionReason: {fontSize: 12, lineHeight: 17, marginTop: 6},
  chipWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: -Spacing.xs},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  chipText: {fontSize: 12, fontWeight: '600'},
  inlineStatus: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  inlineStatusText: {flex: 1, fontSize: 12, lineHeight: 17},
  retryBtn: {padding: 2},
  toggleRow: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  toggleCopy: {flex: 1},
  toggleTitle: {fontSize: 14, fontWeight: '700'},
  toggleDesc: {fontSize: 12, lineHeight: 17, marginTop: 2},
  inlineFields: {flexDirection: 'row', gap: Spacing.sm},
  inlineFieldsCompact: {flexDirection: 'column'},
  inlineField: {flex: 1},
  inlineFieldCompact: {width: '100%'},
  pickerBlock: {gap: Spacing.sm},
  aiSuggestCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  aiSuggestHead: {flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm},
  aiSuggestIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSuggestCopy: {flex: 1},
  aiSuggestTitle: {fontSize: 14, fontWeight: '800'},
  aiSuggestText: {fontSize: 12, lineHeight: 18, marginTop: 3},
  pickerCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: Spacing.md,
  },
  pickerHead: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  pickerTitle: {fontSize: 14, fontWeight: '700'},
  pickerDesc: {fontSize: 12, lineHeight: 17, marginTop: 2},
  insightCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  insightTitle: {fontSize: 12, fontWeight: '800'},
  insightText: {fontSize: 12, lineHeight: 18, marginTop: 4},
  segmentRow: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm},
  segmentBtn: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  segmentText: {fontSize: 12, fontWeight: '700'},
  infoCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  infoText: {flex: 1, fontSize: 12, lineHeight: 18},
  aiReviewCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  aiReviewTitle: {fontSize: 14, fontWeight: '800'},
  aiReviewDesc: {fontSize: 12, lineHeight: 17},
  aiReviewSection: {marginTop: Spacing.sm, gap: 6},
  aiReviewSectionLabel: {fontSize: 11, fontWeight: '800', textTransform: 'uppercase'},
  aiReviewPill: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  aiReviewPillText: {fontSize: 13, fontWeight: '700'},
  aiReviewHint: {fontSize: 12, lineHeight: 17},
  aiReviewListItem: {fontSize: 12, lineHeight: 18},
  resultCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  resultTitle: {fontSize: 14, fontWeight: '700'},
  resultLine: {fontSize: 13, lineHeight: 18},
  errorText: {fontSize: 12, fontWeight: '600'},
  bottomSpacer: {height: Spacing.xl},
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  footerBtn: {width: 132},
});
