import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  ActivityIndicator,
  Alert,
  Easing,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {useAuth} from '../../context/AuthContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import RoadmapAPI from '../../api/RoadmapAPI';
import AIAPI from '../../api/AIAPI';
import QuizAPI from '../../api/QuizAPI';
import RoadmapPhaseAPI from '../../api/RoadmapPhaseAPI';
import WorkspaceProfileAPI from '../../api/WorkspaceProfileAPI';
import useWebSocket from '../../hooks/useWebSocket';
import {
  hasReadyRoadmapQuiz,
  isReadyRoadmapQuiz,
  mergeRoadmapQuizzesIntoStructure,
  normalizePhaseIndex,
  toArray,
} from '../../utils/roadmapSync';

type ProgressMap = Record<number, number>;
type StageSelectedType = 'roadmap' | 'phase' | 'knowledge';
type RoadmapConfigValues = {
  knowledgeLoad: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';
  adaptationMode: 'FLEXIBLE' | 'STRICT';
  roadmapSpeedMode: 'SLOW' | 'MEDIUM' | 'FAST';
  estimatedTotalDays: string;
  recommendedMinutesPerDay: string;
};

const STAGE_ROADMAP_CARD_WIDTH = 218;
const STAGE_PHASE_CARD_WIDTH = 196;
const STAGE_PHASE_CONNECTOR_WIDTH = 30;
const STAGE_KNOWLEDGE_CARD_WIDTH = 176;
const STAGE_KNOWLEDGE_GAP = 12;

const KNOWLEDGE_LOAD_OPTIONS = [
  {
    key: 'BASIC',
    label: 'Cơ bản',
    description: 'Tập trung vào nền tảng cốt lõi, thuật ngữ chính và các phần bắt buộc phải nắm.',
  },
  {
    key: 'INTERMEDIATE',
    label: 'Trung cấp',
    description: 'Học đầy đủ phần nền tảng và các ứng dụng phổ biến ở mức sử dụng thực tế.',
  },
  {
    key: 'ADVANCED',
    label: 'Nâng cao',
    description: 'Đi sâu vào các tình huống khó, ngoại lệ và phần kiến thức có độ phức tạp cao.',
  },
] as const;

const ADAPTATION_MODE_OPTIONS = [
  {
    key: 'FLEXIBLE',
    label: 'Linh hoạt',
    description: 'Ưu tiên điều chỉnh nhịp học theo quỹ thời gian và mức năng lượng thực tế.',
  },
  {
    key: 'STRICT',
    label: 'Cố định',
    description: 'Giữ kế hoạch học ổn định, bám theo lộ trình đã đặt ra và hạn chế thay đổi nhịp học.',
  },
] as const;

const ROADMAP_SPEED_OPTIONS = [
  {
    key: 'SLOW',
    label: 'Chậm mà chắc',
    description: 'Phù hợp khi bạn cần hiểu sâu và chỉ có ít thời gian học mỗi ngày.',
  },
  {
    key: 'MEDIUM',
    label: 'Tiêu chuẩn',
    description: 'Nhịp học cân bằng, phù hợp với phần lớn người học.',
  },
  {
    key: 'FAST',
    label: 'Nhanh',
    description: 'Tăng tốc để bám sát thời hạn hoặc kỳ thi đang đến gần.',
  },
] as const;

const ROADMAP_DAY_RECOMMENDATIONS = {
  BASIC: {FAST: 20, MEDIUM: 30, SLOW: 45},
  INTERMEDIATE: {FAST: 30, MEDIUM: 60, SLOW: 90},
  ADVANCED: {FAST: 45, MEDIUM: 90, SLOW: 135},
} as const;

const ROADMAP_TOTAL_MINUTES = {
  BASIC: 1800,
  INTERMEDIATE: 4200,
  ADVANCED: 7200,
} as const;

const clampPercent = (value: any) => {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

const normalizePositiveId = (value: any) => {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0;
};

const normalizeKnowledgeLoad = (value: any): RoadmapConfigValues['knowledgeLoad'] => {
  if (value === 'BASIC' || value === 'ADVANCED') {
    return value;
  }
  return 'INTERMEDIATE';
};

const normalizeAdaptationModeValue = (value: any): RoadmapConfigValues['adaptationMode'] => {
  if (value === 'FLEXIBLE') {
    return 'FLEXIBLE';
  }
  return 'STRICT';
};

const normalizeSpeedModeValue = (value: any): RoadmapConfigValues['roadmapSpeedMode'] => {
  if (value === 'SLOW' || value === 'FAST') {
    return value;
  }
  return 'MEDIUM';
};

const getRecommendedRoadmapDays = (
  knowledgeLoad: RoadmapConfigValues['knowledgeLoad'],
  speedMode: RoadmapConfigValues['roadmapSpeedMode'],
) => ROADMAP_DAY_RECOMMENDATIONS[knowledgeLoad]?.[speedMode] || 30;

const getRecommendedRoadmapMinutesPerDay = (
  knowledgeLoad: RoadmapConfigValues['knowledgeLoad'],
  totalDays: number,
) => {
  const safeDays = Number.isFinite(totalDays) && totalDays > 0 ? totalDays : 30;
  const raw = ROADMAP_TOTAL_MINUTES[knowledgeLoad] / safeDays;
  return Math.max(15, Math.round(raw / 5) * 5);
};

const formatMaterialDate = (material: any) => {
  const rawDate =
    material?.createdAt ||
    material?.created_at ||
    material?.uploadedAt ||
    material?.uploadDate ||
    material?.updatedAt;
  if (!rawDate) {
    return '';
  }
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}`;
};

const getMaterialTypeLabel = (material: any) => {
  const name = String(material?.title || material?.fileName || material?.name || '').toLowerCase();
  const type = String(material?.type || material?.mimeType || material?.contentType || '').toLowerCase();
  if (type.includes('pdf') || name.endsWith('.pdf')) {
    return 'PDF';
  }
  if (type.includes('image')) {
    return 'Ảnh';
  }
  if (type.includes('video')) {
    return 'Video';
  }
  if (type.includes('audio')) {
    return 'Audio';
  }
  return 'Tài liệu';
};

const resolveProgressPercent = (payload: any) =>
  clampPercent(
    payload?.progressPercent ??
      payload?.percent ??
      payload?.data?.progressPercent ??
      payload?.data?.percent ??
      payload?.processingObject?.progressPercent ??
      payload?.processingObject?.percent ??
      0,
  );

const isCentralRoadmap = (item: any) => {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const flags = [
    item.isCentral,
    item.isCentralRoadmap,
    item.isMain,
    item.isPrimary,
    item.isCenter,
    item.isCentralized,
    item.central,
    item.centralRoadmap,
  ];

  if (flags.some(Boolean)) {
    return true;
  }

  const rawType =
    item.roadmapType || item.type || item.category || item.scope || item.mode || '';
  const typeLabel = String(rawType).trim().toUpperCase();
  if (['CENTRAL', 'CENTER', 'CORE', 'MAIN', 'PRIMARY'].includes(typeLabel)) {
    return true;
  }

  const title = String(item.title || item.name || '').trim().toLowerCase();
  return title.includes('trung tâm') || title.includes('central') || title.includes('core');
};

const resolveDefaultRoadmapId = (list: any[], preferredId?: number) => {
  const normalizedPreferredId = Number(preferredId);
  if (
    Number.isInteger(normalizedPreferredId) &&
    normalizedPreferredId > 0 &&
    list.some((item: any) => Number(item.roadmapId || item.id || 0) === normalizedPreferredId)
  ) {
    return normalizedPreferredId;
  }

  const central = list.find(isCentralRoadmap);
  if (central) {
    return Number(central.roadmapId || central.id || 0) || null;
  }

  const first = list[0];
  return first ? Number(first.roadmapId || first.id || 0) || null : null;
};

const updateProgressMap = (
  setter: React.Dispatch<React.SetStateAction<ProgressMap>>,
  phaseId: number,
  percent: number,
  options: {allowLower?: boolean} = {},
) => {
  const normalizedPhaseId = normalizePositiveId(phaseId);
  if (!normalizedPhaseId) {
    return;
  }

  const nextPercent = clampPercent(percent);
  setter(current => {
    const currentPercent = clampPercent(current[normalizedPhaseId] ?? 0);
    const effectivePercent = options.allowLower
      ? nextPercent
      : Math.max(currentPercent, nextPercent);
    if (current[normalizedPhaseId] === effectivePercent) {
      return current;
    }
    return {
      ...current,
      [normalizedPhaseId]: effectivePercent,
    };
  });
};

const clearProgressMap = (
  setter: React.Dispatch<React.SetStateAction<ProgressMap>>,
  phaseId: number,
) => {
  const normalizedPhaseId = normalizePositiveId(phaseId);
  if (!normalizedPhaseId) {
    return;
  }

  setter(current => {
    if (!(normalizedPhaseId in current)) {
      return current;
    }
    const next = {...current};
    delete next[normalizedPhaseId];
    return next;
  });
};

const getProgressForPhase = (map: ProgressMap, phaseId: number) =>
  clampPercent(map?.[normalizePositiveId(phaseId)] ?? 0);

const delay = (ms: number) =>
  new Promise(resolve => {
    globalThis.setTimeout(resolve, ms);
  });

export default function RoadmapJourneyScreen({navigation, route}: any) {
  const {
    contextType = 'WORKSPACE',
    contextId,
    title,
    materials = [],
    roadmapId: routeRoadmapId,
    phaseId: routePhaseId,
  } = route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const {user} = useAuth();

  const [loading, setLoading] = useState(true);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<number | null>(null);
  const [structure, setStructure] = useState<any>(null);
  const [profileLearningMode, setProfileLearningMode] = useState<string | null>(null);
  const [profileRoadmapConfig, setProfileRoadmapConfig] = useState<any>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(
    Number.isInteger(Number(routePhaseId)) && Number(routePhaseId) > 0 ? Number(routePhaseId) : null,
  );
  const [currentPhaseProgress, setCurrentPhaseProgress] = useState<any>(null);
  const [currentKnowledgePayload, setCurrentKnowledgePayload] = useState<any>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [generatingPreLearningPhaseIds, setGeneratingPreLearningPhaseIds] = useState<number[]>([]);
  const [generatingKnowledgePhaseIds, setGeneratingKnowledgePhaseIds] = useState<number[]>([]);
  const [generatingKnowledgeQuizPhaseIds, setGeneratingKnowledgeQuizPhaseIds] = useState<number[]>([]);
  const [generatingKnowledgeQuizKnowledgeKeys, setGeneratingKnowledgeQuizKnowledgeKeys] = useState<string[]>([]);
  const [generatingRoadmapPhases, setGeneratingRoadmapPhases] = useState(false);
  const [roadmapPhaseGenerationProgress, setRoadmapPhaseGenerationProgress] = useState(0);
  const [preLearningProgressByPhaseId, setPreLearningProgressByPhaseId] = useState<ProgressMap>({});
  const [knowledgeProgressByPhaseId, setKnowledgeProgressByPhaseId] = useState<ProgressMap>({});
  const [profileAdaptationMode, setProfileAdaptationMode] = useState<string | null>(null);
  const [submittingPreLearningDecision, setSubmittingPreLearningDecision] = useState(false);
  const [handledPreLearningDecisionPhaseIds, setHandledPreLearningDecisionPhaseIds] = useState<number[]>([]);
  const [skipPreLearningPhaseIds, setSkipPreLearningPhaseIds] = useState<number[]>([]);
  const [optimisticUnlockedPhaseIds, setOptimisticUnlockedPhaseIds] = useState<number[]>([]);
  const [unlockingPhaseIds, setUnlockingPhaseIds] = useState<number[]>([]);
  const [submittingRemedialDecision, setSubmittingRemedialDecision] = useState(false);
  const [phaseReviewState, setPhaseReviewState] = useState<{
    loading: boolean;
    data: any;
    phaseId: number | null;
  }>({
    loading: false,
    data: null,
    phaseId: null,
  });
  const reviewCreationAttemptedRef = useRef<Set<string>>(new Set());
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);
  const [roadmapConfigModalVisible, setRoadmapConfigModalVisible] = useState(false);
  const [roadmapConfigConfirmVisible, setRoadmapConfigConfirmVisible] = useState(false);
  const [roadmapConfigValues, setRoadmapConfigValues] = useState<RoadmapConfigValues>({
    knowledgeLoad: 'INTERMEDIATE',
    adaptationMode: 'FLEXIBLE',
    roadmapSpeedMode: 'MEDIUM',
    estimatedTotalDays: '60',
    recommendedMinutesPerDay: '70',
  });
  const [savingRoadmapConfig, setSavingRoadmapConfig] = useState(false);
  const [suggestingRoadmapConfig, setSuggestingRoadmapConfig] = useState(false);
  const [roadmapConfigError, setRoadmapConfigError] = useState('');
  const [roadmapSuggestionMeta, setRoadmapSuggestionMeta] = useState<any>(null);
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<number | null>(null);
  const [knowledgeQuizMap, setKnowledgeQuizMap] = useState<Record<number, any[]>>({});
  const [viewMode] = useState<'overview' | 'detail'>('detail');
  const [roadmapStageCollapsed, setRoadmapStageCollapsed] = useState(false);
  const [stageSelectedType, setStageSelectedType] = useState<StageSelectedType>('phase');
  const [expandedStagePhaseId, setExpandedStagePhaseId] = useState<number | null>(null);
  const [journeyPanelVisible, setJourneyPanelVisible] = useState(false);
  const [followCurrentPhase, setFollowCurrentPhase] = useState(true);
  const userManuallySelectedPhaseRef = useRef(false);
  const journeyPanelScrollRef = useRef<ScrollView | null>(null);
  const panelItemYRef = useRef<Record<number, number>>({});
  const panelEntranceAnim = useRef(new Animated.Value(0)).current;
  const panelAnimationRef = useRef<{stop: () => void} | null>(null);
  const isMountedRef = useRef(true);

  const handleBack = useCallback(() => {
    const normalizedContextId = Number(contextId || 0);
    if (contextType === 'GROUP' && Number.isInteger(normalizedContextId) && normalizedContextId > 0) {
      navigation.navigate('GroupWorkspace', {
        groupId: normalizedContextId,
        title,
      });
      return;
    }
    if (contextType === 'WORKSPACE' && Number.isInteger(normalizedContextId) && normalizedContextId > 0) {
      navigation.navigate('Workspace', {
        workspaceId: normalizedContextId,
        title,
      });
      return;
    }
    navigation.goBack();
  }, [contextId, contextType, navigation, title]);

  useEffect(() => {
    if (
      Platform.OS === 'android' &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }

    return () => {
      isMountedRef.current = false;
      if (panelAnimationRef.current) {
        panelAnimationRef.current.stop();
      }
    };
  }, []);

  const animateLayout = useCallback(() => {
    if (Platform.OS === 'android') {
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, []);

  const handleSelectPhase = useCallback(
    (
      phaseId: number | null,
      options: {
        fromUser?: boolean;
        closePanel?: boolean;
      } = {},
    ) => {
      const {fromUser = true, closePanel = false} = options;

      animateLayout();
      setSelectedPhaseId(phaseId);
      setExpandedStagePhaseId(null);

      if (fromUser) {
        userManuallySelectedPhaseRef.current = true;
        setFollowCurrentPhase(false);
      }

      if (closePanel) {
        setJourneyPanelVisible(false);
      }
    },
    [animateLayout],
  );

  const getPanelTargetPhaseId = useCallback(() => {
    const selected = Number(selectedPhaseId || 0);
    if (Number.isInteger(selected) && selected > 0) {
      return selected;
    }

    const current = Number(currentPhaseProgress?.phaseId || 0);
    if (Number.isInteger(current) && current > 0) {
      return current;
    }

    const firstPhaseId = Number(structure?.phases?.[0]?.phaseId || 0);
    return Number.isInteger(firstPhaseId) && firstPhaseId > 0 ? firstPhaseId : null;
  }, [currentPhaseProgress?.phaseId, selectedPhaseId, structure?.phases]);

  const scrollJourneyPanelToPhase = useCallback((phaseId?: number | null) => {
    const normalizedPhaseId = Number(phaseId || 0);
    if (!journeyPanelScrollRef.current) {
      return;
    }
    if (!Number.isInteger(normalizedPhaseId) || normalizedPhaseId <= 0) {
      return;
    }

    const y = panelItemYRef.current[normalizedPhaseId];
    if (!Number.isFinite(y)) {
      return;
    }

    journeyPanelScrollRef.current.scrollTo({
      y: Math.max(0, y - 72),
      animated: true,
    });
  }, []);

  useEffect(() => {
    if (!journeyPanelVisible) {
      panelEntranceAnim.setValue(0);
      if (panelAnimationRef.current) {
        panelAnimationRef.current.stop();
      }
      return;
    }

    if (!isMountedRef.current) return;

    try {
      if (panelAnimationRef.current) {
        panelAnimationRef.current.stop();
      }
      const anim = Animated.timing(panelEntranceAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      panelAnimationRef.current = anim;
      anim.start();
    } catch (e) {
      console.warn('RoadmapJourneyScreen panel animation error:', e);
    }

    const targetPhaseId = getPanelTargetPhaseId();
    if (targetPhaseId) {
      const timer = setTimeout(() => {
        if (isMountedRef.current) {
          scrollJourneyPanelToPhase(targetPhaseId);
        }
      }, 120);
      return () => clearTimeout(timer);
    }

    return;
  }, [
    getPanelTargetPhaseId,
    journeyPanelVisible,
    panelEntranceAnim,
    scrollJourneyPanelToPhase,
  ]);

  useEffect(() => {
    if (!journeyPanelVisible) {
      return;
    }

    scrollJourneyPanelToPhase(getPanelTargetPhaseId());
  }, [
    currentPhaseProgress?.phaseId,
    getPanelTargetPhaseId,
    journeyPanelVisible,
    selectedPhaseId,
    scrollJourneyPanelToPhase,
  ]);

  const normalizeMaterialStatus = useCallback((material: any) => {
    return String(material?.final_status || material?.status || '').toUpperCase();
  }, []);

  const isBlockedMaterial = useCallback(
    (material: any) => {
      const status = normalizeMaterialStatus(material);
      return (
        status === 'REJECT' ||
        status === 'REJECTED' ||
        status === 'WARN' ||
        status === 'WARNED'
      );
    },
    [normalizeMaterialStatus],
  );

  const openQuizModeSelector = useCallback(
    (quiz: any, phaseId?: number) => {
      const quizId = Number(quiz?.quizId || quiz?.id);
      if (!quizId) {
        showToast('Thiếu Quiz ID', 'error');
        return;
      }

      const activeRoadmapId = Number(selectedRoadmapId || quiz?.roadmapId || 0);
      const normalizedPhaseId = Number(phaseId || quiz?.phaseId || 0);
      const quizIntent = String(quiz?.quizIntent || '').toUpperCase() || undefined;
      const selectedRoadmap = roadmaps.find(
        item => Number(item?.roadmapId || item?.id || 0) === activeRoadmapId,
      );
      const selectedPhase = (structure?.phases || []).find(
        (item: any) => Number(item?.phaseId || item?.id || 0) === normalizedPhaseId,
      );
      const quizTitle = quiz?.title || quiz?.name;
      const backContext = {
        type: 'roadmap',
        contextType,
        contextId: Number(contextId),
        title,
        roadmapId:
          Number.isInteger(activeRoadmapId) && activeRoadmapId > 0
            ? activeRoadmapId
            : undefined,
        phaseId:
          Number.isInteger(normalizedPhaseId) && normalizedPhaseId > 0
            ? normalizedPhaseId
            : undefined,
        quizIntent,
      };

      navigation.navigate('Quiz', {
        screen: 'QuizDetail',
        params: {
          quizId,
          quiz: {
            ...quiz,
            roadmapId: backContext.roadmapId,
            phaseId: backContext.phaseId,
          },
          title: quizTitle,
          backContext,
          contextType,
          contextId: Number(contextId),
          roadmapId: backContext.roadmapId,
          phaseId: backContext.phaseId,
          quizIntent,
          roadmapTitle: selectedRoadmap?.title || selectedRoadmap?.name || title,
          phaseTitle: selectedPhase?.title || selectedPhase?.name,
        },
      });
    },
    [contextId, contextType, navigation, roadmaps, selectedRoadmapId, showToast, structure?.phases, title],
  );

  const selectedRoadmap = useMemo(
    () =>
      roadmaps.find(
        item => Number(item.roadmapId || item.id || 0) === Number(selectedRoadmapId || 0),
      ),
    [roadmaps, selectedRoadmapId],
  );
  const activeRoadmapId = Number(selectedRoadmap?.roadmapId || selectedRoadmap?.id || 0);
  const normalizedContextId = Number(contextId || 0);
  const wsWorkspaceId = contextType === 'WORKSPACE' && Number.isInteger(normalizedContextId) && normalizedContextId > 0
    ? normalizedContextId
    : null;
  const wsGroupId = contextType === 'GROUP' && Number.isInteger(normalizedContextId) && normalizedContextId > 0
    ? normalizedContextId
    : null;
  const selectableMaterials = useMemo(
    () =>
      toArray(materials).filter((material: any) => {
        const materialId = normalizePositiveId(material?.materialId ?? material?.id);
        const status = String(material?.final_status || material?.status || '').toUpperCase();
        return materialId > 0 && !isBlockedMaterial(material) && (!status || status === 'ACTIVE');
      }),
    [isBlockedMaterial, materials],
  );
  const selectableMaterialIds = useMemo(
    () =>
      selectableMaterials
        .map((material: any) => normalizePositiveId(material?.materialId ?? material?.id))
        .filter(Boolean),
    [selectableMaterials],
  );
  const selectedSelectableMaterialCount = selectedMaterialIds.filter(id =>
    selectableMaterialIds.includes(id),
  ).length;
  const canGenerateRoadmapPhases = selectedSelectableMaterialCount > 0;
  const allSelectableMaterialsSelected =
    selectableMaterialIds.length > 0 &&
    selectableMaterialIds.every(id => selectedMaterialIds.includes(id));

  const fetchRoadmaps = useCallback(async () => {
    try {
      if (contextType === 'WORKSPACE') {
        try {
          const profileRes = await WorkspaceProfileAPI.getProfile(Number(contextId));
          const profile = profileRes?.data?.data || profileRes?.data || {};
          const learningMode = String(profile?.learningMode || profile?.workspacePurpose || '').toUpperCase();
          const adaptation = String(
            profile?.adaptationMode || profile?.roadmapAdaptationMode || '',
          ).toUpperCase();
          setProfileLearningMode(learningMode || null);
          setProfileAdaptationMode(adaptation || null);
          setProfileRoadmapConfig(profile || null);
        } catch {
          setProfileLearningMode(null);
          setProfileAdaptationMode(null);
          setProfileRoadmapConfig(null);
        }
      } else {
        setProfileLearningMode(null);
        setProfileAdaptationMode(null);
        setProfileRoadmapConfig(null);
      }

      const res =
        contextType === 'GROUP'
          ? await RoadmapAPI.getForGroup(Number(contextId))
          : await RoadmapAPI.getForWorkspace(Number(contextId));

      const list = res.data || [];
      setRoadmaps(list);
      if (list.length > 0) {
        setSelectedRoadmapId(resolveDefaultRoadmapId(list, Number(routeRoadmapId)));
      }
    } catch {
      setRoadmaps([]);
      setSelectedRoadmapId(null);
    }
  }, [contextType, contextId, routeRoadmapId]);

  const fetchStructure = useCallback(async (roadmapId: number) => {
    try {
      const res = await RoadmapAPI.getStructure(roadmapId);
      const structureData = res.data || null;
      let nextStructure = structureData;

      try {
        const quizRes = await QuizAPI.getByContext('ROADMAP', roadmapId);
        const roadmapQuizzes = Array.isArray(quizRes?.data) ? quizRes.data : [];
        const quizById = roadmapQuizzes.reduce((acc: Record<number, any>, quiz: any) => {
          const quizId = Number(quiz?.quizId || quiz?.id || 0);
          if (Number.isInteger(quizId) && quizId > 0) {
            acc[quizId] = quiz;
          }
          return acc;
        }, {});

        const mergeQuizState = (quiz: any) => {
          const quizId = Number(quiz?.quizId || quiz?.id || 0);
          const liveQuiz = Number.isInteger(quizId) && quizId > 0 ? quizById[quizId] : null;
          return liveQuiz ? {...quiz, ...liveQuiz} : quiz;
        };

        const mergedStructure = mergeRoadmapQuizzesIntoStructure(
          structureData,
          roadmapQuizzes,
          mergeQuizState,
        );

        nextStructure = mergedStructure;
        setStructure(mergedStructure);
      } catch {
        nextStructure = structureData;
        setStructure(structureData);
      }

      try {
        const currentRes = await RoadmapPhaseAPI.getCurrentPhaseProgress(roadmapId);
        setCurrentPhaseProgress(currentRes.data || null);
      } catch {
        setCurrentPhaseProgress(null);
      }

      try {
        const currentKnowledgeRes = await RoadmapAPI.getCurrentRoadmapKnowledgeProgress(roadmapId);
        setCurrentKnowledgePayload(currentKnowledgeRes.data || null);
      } catch {
        setCurrentKnowledgePayload(null);
      }

      return nextStructure;
    } catch {
      setStructure(null);
      setCurrentPhaseProgress(null);
      setCurrentKnowledgePayload(null);
      return null;
    }
  }, []);

  const buildCurrentRoadmapConfigValues = useCallback((): RoadmapConfigValues => {
    const totalDays =
      structure?.estimatedTotalDays ??
      profileRoadmapConfig?.estimatedTotalDays ??
      selectedRoadmap?.estimatedTotalDays ??
      60;
    const minutesPerDay =
      structure?.estimatedMinutesPerDay ??
      profileRoadmapConfig?.estimatedMinutesPerDay ??
      profileRoadmapConfig?.recommendedMinutesPerDay ??
      selectedRoadmap?.estimatedMinutesPerDay ??
      70;

    return {
      knowledgeLoad: normalizeKnowledgeLoad(
        structure?.knowledgeLoad ?? profileRoadmapConfig?.knowledgeLoad,
      ),
      adaptationMode: normalizeAdaptationModeValue(
        structure?.adaptationMode ?? profileRoadmapConfig?.adaptationMode,
      ),
      roadmapSpeedMode: normalizeSpeedModeValue(
        structure?.speedMode ??
          profileRoadmapConfig?.speedMode ??
          profileRoadmapConfig?.roadmapSpeedMode,
      ),
      estimatedTotalDays: String(Number(totalDays) > 0 ? Number(totalDays) : 60),
      recommendedMinutesPerDay: String(
        Number(minutesPerDay) > 0 ? Number(minutesPerDay) : 70,
      ),
    };
  }, [profileRoadmapConfig, selectedRoadmap, structure]);

  const openRoadmapConfigEditor = useCallback(() => {
    if (!activeRoadmapId) {
      showToast('Không tìm thấy lộ trình để chỉnh sửa', 'error');
      return;
    }
    setRoadmapConfigValues(buildCurrentRoadmapConfigValues());
    setRoadmapConfigError('');
    setRoadmapSuggestionMeta(null);
    setRoadmapConfigConfirmVisible(false);
    setRoadmapConfigModalVisible(true);
  }, [activeRoadmapId, buildCurrentRoadmapConfigValues, showToast]);

  const updateRoadmapConfigField = useCallback(
    (field: keyof RoadmapConfigValues, value: string) => {
      setRoadmapConfigValues(current => {
        const next = {...current, [field]: value};
        if (field === 'knowledgeLoad' || field === 'roadmapSpeedMode') {
          const recommendedDays = getRecommendedRoadmapDays(
            next.knowledgeLoad,
            next.roadmapSpeedMode,
          );
          const recommendedMinutes = getRecommendedRoadmapMinutesPerDay(
            next.knowledgeLoad,
            Number(next.estimatedTotalDays) || recommendedDays,
          );
          return {
            ...next,
            estimatedTotalDays: String(recommendedDays),
            recommendedMinutesPerDay: String(recommendedMinutes),
          };
        }
        if (field === 'estimatedTotalDays') {
          return {
            ...next,
            recommendedMinutesPerDay: String(
              getRecommendedRoadmapMinutesPerDay(
                next.knowledgeLoad,
                Number(value) || getRecommendedRoadmapDays(next.knowledgeLoad, next.roadmapSpeedMode),
              ),
            ),
          };
        }
        return next;
      });
      setRoadmapConfigError('');
    },
    [],
  );

  const validateRoadmapConfigValues = useCallback(() => {
    const totalDays = Number(roadmapConfigValues.estimatedTotalDays);
    const minutesPerDay = Number(roadmapConfigValues.recommendedMinutesPerDay);
    if (!Number.isFinite(totalDays) || totalDays <= 0) {
      return 'Vui lòng nhập số ngày dự kiến lớn hơn 0.';
    }
    if (!Number.isFinite(minutesPerDay) || minutesPerDay <= 0) {
      return 'Vui lòng nhập số phút học mỗi ngày lớn hơn 0.';
    }
    return '';
  }, [roadmapConfigValues]);

  const handleSuggestRoadmapConfig = useCallback(async () => {
    const workspaceId = Number(contextId || 0);
    if (contextType !== 'WORKSPACE' || !Number.isInteger(workspaceId) || workspaceId <= 0) {
      showToast('AI gợi ý hiện chỉ hỗ trợ workspace cá nhân', 'info');
      return;
    }

    setSuggestingRoadmapConfig(true);
    setRoadmapConfigError('');
    try {
      const response = await WorkspaceProfileAPI.suggestRoadmapConfig(workspaceId);
      const suggestion = response?.data?.data || response?.data || response || null;
      if (!suggestion || typeof suggestion !== 'object') {
        throw new Error('AI không trả về cấu hình hợp lệ.');
      }
      const nextValues: RoadmapConfigValues = {
        knowledgeLoad: normalizeKnowledgeLoad(
          suggestion?.knowledgeLoad ?? roadmapConfigValues.knowledgeLoad,
        ),
        adaptationMode: normalizeAdaptationModeValue(
          suggestion?.adaptationMode ?? roadmapConfigValues.adaptationMode,
        ),
        roadmapSpeedMode: normalizeSpeedModeValue(
          suggestion?.speedMode ?? suggestion?.roadmapSpeedMode ?? roadmapConfigValues.roadmapSpeedMode,
        ),
        estimatedTotalDays: String(
          Number(suggestion?.estimatedTotalDays) ||
            Number(roadmapConfigValues.estimatedTotalDays) ||
            30,
        ),
        recommendedMinutesPerDay: String(
          Number(suggestion?.estimatedMinutesPerDay ?? suggestion?.recommendedMinutesPerDay) ||
            Number(roadmapConfigValues.recommendedMinutesPerDay) ||
            60,
        ),
      };
      setRoadmapConfigValues(nextValues);
      setRoadmapSuggestionMeta({
        rationale: String(suggestion?.rationale || '').trim(),
        recommendations: toArray(suggestion?.recommendations).filter(Boolean),
      });
    } catch (error: any) {
      setRoadmapConfigError(
        error?.response?.data?.message ||
          error?.message ||
          'Không thể tạo gợi ý AI lúc này.',
      );
    } finally {
      setSuggestingRoadmapConfig(false);
    }
  }, [contextId, contextType, roadmapConfigValues, showToast]);

  const resetRoadmapStructureAfterConfigUpdate = useCallback(async (roadmapId: number) => {
    const normalizedRoadmapId = normalizePositiveId(roadmapId);
    if (!normalizedRoadmapId) {
      return;
    }

    const latestStructure = (await fetchStructure(normalizedRoadmapId)) || structure || {};
    const phasesToDelete = toArray(latestStructure?.phases);

    for (const phase of phasesToDelete) {
      const phaseId = normalizePositiveId(phase?.phaseId ?? phase?.id);
      if (!phaseId) {
        continue;
      }
      for (const knowledge of toArray(phase?.knowledges)) {
        const knowledgeId = normalizePositiveId(knowledge?.knowledgeId ?? knowledge?.id);
        if (!knowledgeId) {
          continue;
        }
        try {
          await RoadmapAPI.deleteKnowledge(knowledgeId, phaseId);
        } catch (error: any) {
          if (Number(error?.response?.status) !== 404) {
            throw error;
          }
        }
      }
      try {
        await RoadmapAPI.deletePhase(normalizedRoadmapId, phaseId);
      } catch (error: any) {
        if (Number(error?.response?.status) !== 404) {
          throw error;
        }
      }
    }

    setStructure((current: any) => ({
      ...(current || latestStructure || {}),
      phases: [],
    }));
    setCurrentPhaseProgress(null);
    setCurrentKnowledgePayload(null);
    setSelectedPhaseId(null);
    setSelectedKnowledgeId(null);
    setGeneratingPreLearningPhaseIds([]);
    setGeneratingKnowledgePhaseIds([]);
    setGeneratingKnowledgeQuizPhaseIds([]);
    setGeneratingKnowledgeQuizKnowledgeKeys([]);
    setPreLearningProgressByPhaseId({});
    setKnowledgeProgressByPhaseId({});
    setSkipPreLearningPhaseIds([]);
    setOptimisticUnlockedPhaseIds([]);
    setUnlockingPhaseIds([]);
  }, [fetchStructure, structure]);

  const handleRequestSaveRoadmapConfig = useCallback(() => {
    const error = validateRoadmapConfigValues();
    if (error) {
      setRoadmapConfigError(error);
      return;
    }
    setRoadmapConfigConfirmVisible(true);
  }, [validateRoadmapConfigValues]);

  const handleConfirmSaveRoadmapConfig = useCallback(async () => {
    const normalizedRoadmapId = normalizePositiveId(activeRoadmapId);
    if (!normalizedRoadmapId || savingRoadmapConfig) {
      return;
    }

    setSavingRoadmapConfig(true);
    setRoadmapConfigError('');
    try {
      await RoadmapAPI.updateConfig(normalizedRoadmapId, roadmapConfigValues);
      await resetRoadmapStructureAfterConfigUpdate(normalizedRoadmapId);
      await fetchRoadmaps();
      setRoadmapConfigConfirmVisible(false);
      setRoadmapConfigModalVisible(false);
      showToast('Đã cập nhật thông tin lộ trình', 'success');
    } catch (error: any) {
      setRoadmapConfigError(
        error?.response?.data?.message ||
          error?.message ||
          'Không thể cập nhật lộ trình.',
      );
    } finally {
      setSavingRoadmapConfig(false);
    }
  }, [
    activeRoadmapId,
    fetchRoadmaps,
    resetRoadmapStructureAfterConfigUpdate,
    roadmapConfigValues,
    savingRoadmapConfig,
    showToast,
  ]);

  const fetchStructureUntilPhaseReady = useCallback(
    async (
      roadmapId: number,
      phaseId: number,
      kind: 'preLearning' | 'knowledge' | 'knowledgeQuiz',
      knowledgeId?: number,
    ) => {
      const normalizedRoadmapId = normalizePositiveId(roadmapId);
      const normalizedPhaseId = normalizePositiveId(phaseId);
      const normalizedKnowledgeId = normalizePositiveId(knowledgeId);
      if (!normalizedRoadmapId) {
        return null;
      }

      let latestStructure: any = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        latestStructure = await fetchStructure(normalizedRoadmapId);
        const phase = toArray(latestStructure?.phases).find(
          (item: any) => normalizePositiveId(item?.phaseId ?? item?.id) === normalizedPhaseId,
        );

        const isReady =
          kind === 'preLearning'
            ? hasReadyRoadmapQuiz(phase?.preLearningQuizzes)
            : kind === 'knowledge'
            ? toArray(phase?.knowledges).length > 0
            : toArray(phase?.knowledges).some((knowledge: any) => {
                const currentKnowledgeId = normalizePositiveId(knowledge?.knowledgeId ?? knowledge?.id);
                return (
                  (!normalizedKnowledgeId || currentKnowledgeId === normalizedKnowledgeId) &&
                  toArray(knowledge?.quizzes).some(isReadyRoadmapQuiz)
                );
              });

        if (!normalizedPhaseId || isReady || attempt === 2) {
          return latestStructure;
        }

        await delay(850);
      }

      return latestStructure;
    },
    [fetchStructure],
  );

  const refreshKnowledgeQuizList = useCallback(async (knowledgeId: number) => {
    const normalizedKnowledgeId = normalizePositiveId(knowledgeId);
    if (!normalizedKnowledgeId) {
      return;
    }

    try {
      const res = await QuizAPI.getByContext('KNOWLEDGE', normalizedKnowledgeId);
      const list = Array.isArray(res?.data) ? res.data : [];
      setKnowledgeQuizMap(prev => ({
        ...prev,
        [normalizedKnowledgeId]: list,
      }));
    } catch {
      setKnowledgeQuizMap(prev => ({
        ...prev,
        [normalizedKnowledgeId]: [],
      }));
    }
  }, []);

  const handleRoadmapProgress = useCallback(async (payload: any) => {
    const processingObject =
      payload?.processingObject && typeof payload.processingObject === 'object'
        ? payload.processingObject
        : payload?.data?.processingObject && typeof payload.data.processingObject === 'object'
        ? payload.data.processingObject
        : {};
    const status = String(
      payload?.status ||
        payload?.final_status ||
        payload?.data?.status ||
        payload?.data?.final_status ||
        '',
    ).toUpperCase();
    const taskType = String(
      processingObject?.taskType ||
        processingObject?.task_type ||
        payload?.taskType ||
        payload?.task_type ||
        payload?.data?.taskType ||
        payload?.data?.task_type ||
        '',
    ).toUpperCase();
    const progressWorkspaceId = normalizePositiveId(
      payload?.workspaceId ||
        payload?.workspace_id ||
        payload?.data?.workspaceId ||
        payload?.data?.workspace_id ||
        processingObject?.workspaceId ||
        processingObject?.workspace_id,
    );
    const progressGroupId = normalizePositiveId(
      payload?.groupId ||
        payload?.group_id ||
        payload?.data?.groupId ||
        payload?.data?.group_id ||
        processingObject?.groupId ||
        processingObject?.group_id,
    );
    const progressRoadmapId = normalizePositiveId(
      payload?.roadmapId ||
        payload?.roadmap_id ||
        payload?.data?.roadmapId ||
        payload?.data?.roadmap_id ||
        processingObject?.roadmapId ||
        processingObject?.roadmap_id,
    );
    const progressPhaseId = normalizePositiveId(
      payload?.phaseId ||
        payload?.phase_id ||
        payload?.data?.phaseId ||
        payload?.data?.phase_id ||
        processingObject?.phaseId ||
        processingObject?.phase_id,
    );
    const progressKnowledgeId = normalizePositiveId(
      payload?.knowledgeId ||
        payload?.knowledge_id ||
        payload?.data?.knowledgeId ||
        payload?.data?.knowledge_id ||
        processingObject?.knowledgeId ||
        processingObject?.knowledge_id,
    );
    const progressPercent = resolveProgressPercent(payload);

    if (wsWorkspaceId && progressWorkspaceId && progressWorkspaceId !== wsWorkspaceId) {
      return;
    }
    if (wsGroupId && progressGroupId && progressGroupId !== wsGroupId) {
      return;
    }
    if (activeRoadmapId > 0 && progressRoadmapId && progressRoadmapId !== activeRoadmapId) {
      return;
    }

    const knownPhaseIds = new Set(
      (Array.isArray(structure?.phases) ? structure.phases : [])
        .map((phase: any) => normalizePositiveId(phase?.phaseId ?? phase?.id))
        .filter(Boolean),
    );
    if (progressPhaseId && knownPhaseIds.size > 0 && !knownPhaseIds.has(progressPhaseId)) {
      return;
    }

    const isKnowledgeQuizTask =
      taskType.includes('KNOWLEDGE_QUIZ') || status.includes('KNOWLEDGE_QUIZ');
    const isPreLearningTask = taskType.includes('PRE_LEARNING') || status.includes('PRE_LEARNING');
    const isPhaseContentTask =
      !isKnowledgeQuizTask &&
      (
        taskType.includes('PHASE_CONTENT') ||
        status.includes('PHASE_CONTENT') ||
        taskType.includes('POST_LEARNING') ||
        status.includes('POST_LEARNING') ||
        (taskType.includes('KNOWLEDGE') && !taskType.includes('QUIZ')) ||
        (status.includes('KNOWLEDGE') && !status.includes('QUIZ') && !status.includes('PRE_LEARNING'))
      );
    const isRoadmapPhasesTask =
      status.includes('ROADMAP_PHASES_') ||
      taskType.includes('ROADMAP_PHASES') ||
      status.includes('ROADMAP_STRUCTURE');
    const isRoadmapTask =
      taskType.includes('ROADMAP') ||
      status.startsWith('ROADMAP_') ||
      Boolean(progressRoadmapId || progressPhaseId) ||
      isPreLearningTask ||
      isPhaseContentTask ||
      isKnowledgeQuizTask;
    if (!isRoadmapTask) {
      return;
    }

    const isProcessing =
      status.includes('STARTED') ||
      status.includes('PROCESSING') ||
      status === 'START' ||
      (progressPercent > 0 && progressPercent < 100);
    const isTerminal =
      status.includes('COMPLETED') ||
      status.includes('SUCCESS') ||
      status.includes('DONE') ||
      status.includes('FINISHED') ||
      status.includes('ERROR') ||
      status.includes('FAILED') ||
      status.includes('CANCEL') ||
      progressPercent >= 100;
    const isFailed =
      status.includes('ERROR') ||
      status.includes('FAILED') ||
      status.includes('CANCEL');
    const activePreLearningIds = generatingPreLearningPhaseIds.filter(
      phaseId => !skipPreLearningPhaseIds.includes(Number(phaseId)),
    );
    const hasLocalRoadmapPhaseTask = generatingRoadmapPhases || runningAction === 'phases';
    const hasExplicitRoadmapOrPhase = Boolean(progressRoadmapId || progressPhaseId);

    if (!hasExplicitRoadmapOrPhase) {
      if (isRoadmapPhasesTask && !hasLocalRoadmapPhaseTask) {
        return;
      }
      if (isPreLearningTask && activePreLearningIds.length !== 1) {
        return;
      }
      if (isPhaseContentTask && generatingKnowledgePhaseIds.length !== 1) {
        return;
      }
      if (isKnowledgeQuizTask && generatingKnowledgeQuizPhaseIds.length !== 1) {
        return;
      }
    }

    const inferredPhaseId =
      progressPhaseId ||
      (isPreLearningTask && activePreLearningIds.length === 1
        ? Number(activePreLearningIds[0])
        : isKnowledgeQuizTask && generatingKnowledgeQuizPhaseIds.length === 1
        ? Number(generatingKnowledgeQuizPhaseIds[0])
        : isPhaseContentTask && generatingKnowledgePhaseIds.length === 1
        ? Number(generatingKnowledgePhaseIds[0])
        : 0);
    const targetRoadmapId = progressRoadmapId || activeRoadmapId;
    const processingPercent = progressPercent > 0 ? progressPercent : 3;

    if (isRoadmapPhasesTask) {
      if (isProcessing && !isTerminal) {
        setGeneratingRoadmapPhases(true);
        setRoadmapPhaseGenerationProgress(current => Math.max(clampPercent(current), processingPercent));
        return;
      }

      if (isTerminal) {
        if (!isFailed) {
          setRoadmapPhaseGenerationProgress(100);
          if (targetRoadmapId) {
            await fetchStructure(targetRoadmapId);
          }
        }
        setGeneratingRoadmapPhases(false);
        setRoadmapPhaseGenerationProgress(0);
        return;
      }
    }

    if (isPreLearningTask && inferredPhaseId > 0) {
      if (isProcessing && !isTerminal) {
        setGeneratingPreLearningPhaseIds(current =>
          current.includes(inferredPhaseId) ? current : [...current, inferredPhaseId],
        );
        updateProgressMap(setPreLearningProgressByPhaseId, inferredPhaseId, processingPercent, {
          allowLower: true,
        });
        return;
      }

      if (isTerminal) {
        if (!isFailed) {
          updateProgressMap(setPreLearningProgressByPhaseId, inferredPhaseId, 100);
          if (targetRoadmapId) {
            await fetchStructureUntilPhaseReady(targetRoadmapId, inferredPhaseId, 'preLearning');
          }
        }
        setGeneratingPreLearningPhaseIds(current => current.filter(id => id !== inferredPhaseId));
        clearProgressMap(setPreLearningProgressByPhaseId, inferredPhaseId);
        return;
      }
    }

    if (isPhaseContentTask && inferredPhaseId > 0) {
      if (isProcessing && !isTerminal) {
        setGeneratingKnowledgePhaseIds(current =>
          current.includes(inferredPhaseId) ? current : [...current, inferredPhaseId],
        );
        updateProgressMap(setKnowledgeProgressByPhaseId, inferredPhaseId, processingPercent, {
          allowLower: true,
        });
        return;
      }

      if (isTerminal) {
        if (!isFailed) {
          updateProgressMap(setKnowledgeProgressByPhaseId, inferredPhaseId, 100);
          if (targetRoadmapId) {
            await fetchStructureUntilPhaseReady(targetRoadmapId, inferredPhaseId, 'knowledge');
          }
        }
        setGeneratingKnowledgePhaseIds(current => current.filter(id => id !== inferredPhaseId));
        setSkipPreLearningPhaseIds(current => current.filter(id => id !== inferredPhaseId));
        clearProgressMap(setKnowledgeProgressByPhaseId, inferredPhaseId);
        return;
      }
    }

    if (isKnowledgeQuizTask && inferredPhaseId > 0) {
      const knowledgeKey = progressKnowledgeId ? `${inferredPhaseId}:${progressKnowledgeId}` : null;

      if (isProcessing && !isTerminal) {
        setGeneratingKnowledgeQuizPhaseIds(current =>
          current.includes(inferredPhaseId) ? current : [...current, inferredPhaseId],
        );
        if (knowledgeKey) {
          setGeneratingKnowledgeQuizKnowledgeKeys(current =>
            current.includes(knowledgeKey) ? current : [...current, knowledgeKey],
          );
        }
        updateProgressMap(setKnowledgeProgressByPhaseId, inferredPhaseId, processingPercent, {
          allowLower: true,
        });
        return;
      }

      if (isTerminal) {
        if (!isFailed) {
          updateProgressMap(setKnowledgeProgressByPhaseId, inferredPhaseId, 100);
          if (targetRoadmapId) {
            await fetchStructureUntilPhaseReady(
              targetRoadmapId,
              inferredPhaseId,
              'knowledgeQuiz',
              progressKnowledgeId,
            );
          }
          if (progressKnowledgeId) {
            await refreshKnowledgeQuizList(progressKnowledgeId);
          }
        }
        setGeneratingKnowledgeQuizPhaseIds(current => current.filter(id => id !== inferredPhaseId));
        setGeneratingKnowledgeQuizKnowledgeKeys(current =>
          knowledgeKey
            ? current.filter(key => key !== knowledgeKey)
            : current.filter(key => !key.startsWith(`${inferredPhaseId}:`)),
        );
        clearProgressMap(setKnowledgeProgressByPhaseId, inferredPhaseId);
        return;
      }
    }

    if (isTerminal && isFailed && progressPhaseId > 0) {
      setGeneratingPreLearningPhaseIds(current => current.filter(id => id !== progressPhaseId));
      setGeneratingKnowledgePhaseIds(current => current.filter(id => id !== progressPhaseId));
      setGeneratingKnowledgeQuizPhaseIds(current => current.filter(id => id !== progressPhaseId));
      setGeneratingKnowledgeQuizKnowledgeKeys(current =>
        current.filter(key => !key.startsWith(`${progressPhaseId}:`)),
      );
      setSkipPreLearningPhaseIds(current => current.filter(id => id !== progressPhaseId));
      clearProgressMap(setPreLearningProgressByPhaseId, progressPhaseId);
      clearProgressMap(setKnowledgeProgressByPhaseId, progressPhaseId);
    }
  }, [
    activeRoadmapId,
    fetchStructure,
    fetchStructureUntilPhaseReady,
    generatingKnowledgePhaseIds,
    generatingKnowledgeQuizPhaseIds,
    generatingPreLearningPhaseIds,
    generatingRoadmapPhases,
    refreshKnowledgeQuizList,
    runningAction,
    skipPreLearningPhaseIds,
    structure?.phases,
    wsGroupId,
    wsWorkspaceId,
  ]);

  const {isConnected: roadmapWsConnected} = useWebSocket({
    workspaceId: wsWorkspaceId,
    groupId: wsGroupId,
    enabled: Boolean(wsWorkspaceId || wsGroupId),
    onProgress: handleRoadmapProgress,
  });

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      await fetchRoadmaps();
      setLoading(false);
    };
    run();
  }, [fetchRoadmaps]);

  useEffect(() => {
    if (!selectedRoadmapId) {
      setStructure(null);
      return;
    }
    fetchStructure(selectedRoadmapId);
  }, [fetchStructure, selectedRoadmapId]);

  useEffect(() => {
    const normalizedPhaseId = Number(routePhaseId);
    if (Number.isInteger(normalizedPhaseId) && normalizedPhaseId > 0) {
      handleSelectPhase(normalizedPhaseId, {fromUser: false});
    }
  }, [handleSelectPhase, routePhaseId]);

  const handleGeneratePreLearningAsync = async (roadmapId: number, phaseId: number) => {
    const normalizedRoadmapId = Number(roadmapId || 0);
    const normalizedPhaseId = Number(phaseId || 0);
    const userId = user?.id;
    
    if (!userId) {
      showToast('Lỗi: Không tìm thấy user ID', 'error');
      return;
    }
    
    if (!Number.isInteger(normalizedRoadmapId) || normalizedRoadmapId <= 0 || !Number.isInteger(normalizedPhaseId) || normalizedPhaseId <= 0) {
      showToast('Invalid roadmap or phase ID', 'error');
      return;
    }

    const key = `pre-${normalizedPhaseId}`;
    setRunningAction(key);
    setGeneratingPreLearningPhaseIds(current => (current.includes(normalizedPhaseId) ? current : [...current, normalizedPhaseId]));
    updateProgressMap(setPreLearningProgressByPhaseId, normalizedPhaseId, 3, {allowLower: true});
    try {
      await AIAPI.generateRoadmapPreLearning({
        roadmapId: normalizedRoadmapId, 
        phaseId: normalizedPhaseId, 
        userId,
        skipPreLearning: false
      });
      showToast('Đã bắt đầu tạo quiz trước học', 'success');
      if (!roadmapWsConnected) {
        updateProgressMap(setPreLearningProgressByPhaseId, normalizedPhaseId, 100);
        await fetchStructureUntilPhaseReady(normalizedRoadmapId, normalizedPhaseId, 'preLearning');
        setGeneratingPreLearningPhaseIds(current => current.filter(id => id !== normalizedPhaseId));
        clearProgressMap(setPreLearningProgressByPhaseId, normalizedPhaseId);
      }
    } catch (error: any) {
      setGeneratingPreLearningPhaseIds(current => current.filter(id => id !== normalizedPhaseId));
      clearProgressMap(setPreLearningProgressByPhaseId, normalizedPhaseId);
      const status = error?.response?.status;
      if (status === 409) {
        showToast('Phase đã có quiz trước học rồi, không thể tạo lại', 'error');
      } else if (status === 400) {
        showToast('Dữ liệu không hợp lệ. Profile có thể chưa đầy đủ thông tin', 'error');
      } else {
        showToast('Không thể tạo quiz trước học', 'error');
      }
    } finally {
      setRunningAction(null);
    }
  };

  const handleGeneratePreLearning = async (roadmapId: number, phaseId: number) => {
    // Nếu learning mode là STUDY_NEW thì show dialog, không thì auto tạo
    if (profileLearningMode === 'STUDY_NEW') {
      // Show dialog để user chọn
      Alert.alert(
        'Bạn đã có nền tảng ở phase này chưa?',
        'Nếu chưa, hệ thống sẽ tạo nội dung phase. Nếu có rồi, hệ thống sẽ tạo pre-learning.',
        [
          {
            text: 'Tôi là người mới',
            onPress: () => handleGeneratePhaseContent(roadmapId, phaseId, true),
          },
          {
            text: 'Tôi đã có nền tảng',
            onPress: () => handleGeneratePreLearningAsync(roadmapId, phaseId),
          },
          {
            text: 'Hủy',
            onPress: () => {},
            style: 'cancel',
          },
        ],
      );
    } else {
      // Auto tạo pre-learning cho REVIEW/REMEDIAL
      await handleGeneratePreLearningAsync(roadmapId, phaseId);
    }
  };

  const handleGeneratePhaseContent = async (
    roadmapId: number,
    phaseId: number,
    skipPreLearning = false,
  ) => {
    const normalizedRoadmapId = Number(roadmapId || 0);
    const normalizedPhaseId = Number(phaseId || 0);
    const userId = user?.id;
    
    if (!userId) {
      showToast('Lỗi: Không tìm thấy user ID', 'error');
      return;
    }
    
    if (!Number.isInteger(normalizedRoadmapId) || normalizedRoadmapId <= 0 || !Number.isInteger(normalizedPhaseId) || normalizedPhaseId <= 0) {
      showToast('Invalid roadmap or phase ID', 'error');
      return;
    }

    const key = `content-${normalizedPhaseId}`;
    setRunningAction(key);
    setGeneratingKnowledgePhaseIds(current => (current.includes(normalizedPhaseId) ? current : [...current, normalizedPhaseId]));
    updateProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId, 3, {allowLower: true});
    if (profileLearningMode === 'STUDY_NEW' && skipPreLearning === true) {
      setSkipPreLearningPhaseIds(current => (current.includes(normalizedPhaseId) ? current : [...current, normalizedPhaseId]));
      setGeneratingPreLearningPhaseIds(current => current.filter(id => id !== normalizedPhaseId));
      clearProgressMap(setPreLearningProgressByPhaseId, normalizedPhaseId);
    }
    try {
      // skipPreLearning chỉ hợp lệ với STUDY_NEW mode
      const payload: any = {
        roadmapId: normalizedRoadmapId,
        phaseId: normalizedPhaseId,
        userId,
      };
      
      // Chỉ gửi skipPreLearning nếu đúng mode và giá trị true
      if (profileLearningMode === 'STUDY_NEW' && skipPreLearning === true) {
        payload.skipPreLearning = true;
      }
      
      await AIAPI.generateRoadmapPhaseContent(payload);
      showToast('Đã bắt đầu tạo nội dung giai đoạn', 'success');
      if (!roadmapWsConnected) {
        updateProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId, 100);
        await fetchStructureUntilPhaseReady(normalizedRoadmapId, normalizedPhaseId, 'knowledge');
        setGeneratingKnowledgePhaseIds(current => current.filter(id => id !== normalizedPhaseId));
        clearProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId);
      }
    } catch (error: any) {
      setGeneratingKnowledgePhaseIds(current => current.filter(id => id !== normalizedPhaseId));
      clearProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId);
      if (skipPreLearning === true) {
        setSkipPreLearningPhaseIds(current => current.filter(id => id !== normalizedPhaseId));
      }
      const status = error?.response?.status;
      if (status === 400) {
        showToast('Phase chưa có quiz trước học hoặc dữ liệu không hợp lệ. Hãy tạo quiz trước học trước', 'error');
      } else if (status === 409) {
        showToast('Phase đã có nội dung rồi, không thể tạo lại', 'error');
      } else {
        showToast('Không thể tạo nội dung giai đoạn', 'error');
      }
    } finally {
      setRunningAction(null);
    }
  };

  const handleGenerateKnowledgeQuiz = async (roadmapId: number, knowledgeId: number) => {
    const normalizedRoadmapId = Number(roadmapId || 0);
    const normalizedKnowledgeId = Number(knowledgeId || 0);
    const normalizedPhaseId =
      normalizePositiveId(selectedPhaseId) ||
      normalizePositiveId(
        (Array.isArray(structure?.phases) ? structure.phases : []).find((phase: any) =>
          toArray(phase?.knowledges).some(
            (knowledge: any) => normalizePositiveId(knowledge?.knowledgeId ?? knowledge?.id) === normalizedKnowledgeId,
          ),
        )?.phaseId,
      );
    const userId = user?.id;
    
    if (!userId) {
      showToast('Lỗi: Không tìm thấy user ID', 'error');
      return;
    }
    
    if (!Number.isInteger(normalizedRoadmapId) || normalizedRoadmapId <= 0 || !Number.isInteger(normalizedKnowledgeId) || normalizedKnowledgeId <= 0) {
      showToast('Invalid roadmap or knowledge ID', 'error');
      return;
    }

    const key = `knowledge-${normalizedKnowledgeId}`;
    const knowledgeQuizKey = normalizedPhaseId ? `${normalizedPhaseId}:${normalizedKnowledgeId}` : null;
    setRunningAction(key);
    if (normalizedPhaseId) {
      setGeneratingKnowledgeQuizPhaseIds(current =>
        current.includes(normalizedPhaseId) ? current : [...current, normalizedPhaseId],
      );
      if (knowledgeQuizKey) {
        setGeneratingKnowledgeQuizKnowledgeKeys(current =>
          current.includes(knowledgeQuizKey) ? current : [...current, knowledgeQuizKey],
        );
      }
      updateProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId, 3, {allowLower: true});
    }
    try {
      await AIAPI.generateRoadmapKnowledgeQuiz({
        roadmapId: normalizedRoadmapId, 
        knowledgeId: normalizedKnowledgeId,
        userId,
      });
      showToast('Đã bắt đầu tạo quiz kiến thức', 'success');
      if (!roadmapWsConnected) {
        if (normalizedPhaseId) {
          updateProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId, 100);
        }
        await Promise.all([
          normalizedPhaseId
            ? fetchStructureUntilPhaseReady(
                normalizedRoadmapId,
                normalizedPhaseId,
                'knowledgeQuiz',
                normalizedKnowledgeId,
              )
            : fetchStructure(normalizedRoadmapId),
          refreshKnowledgeQuizList(normalizedKnowledgeId),
        ]);
        if (normalizedPhaseId) {
          setGeneratingKnowledgeQuizPhaseIds(current => current.filter(id => id !== normalizedPhaseId));
          setGeneratingKnowledgeQuizKnowledgeKeys(current =>
            current.filter(item => item !== knowledgeQuizKey),
          );
          clearProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId);
        }
      }
    } catch (error: any) {
      if (normalizedPhaseId) {
        setGeneratingKnowledgeQuizPhaseIds(current => current.filter(id => id !== normalizedPhaseId));
        setGeneratingKnowledgeQuizKnowledgeKeys(current =>
          current.filter(item => item !== knowledgeQuizKey),
        );
        clearProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId);
      }
      const status = error?.response?.status;
      if (status === 400) {
        showToast('Dữ liệu không hợp lệ', 'error');
      } else {
        showToast('Không thể tạo quiz kiến thức', 'error');
      }
    } finally {
      setRunningAction(null);
    }
  };

  const handleGenerateRoadmapPhases = async (roadmapId: number) => {
    const normalizedRoadmapId = Number(roadmapId || 0);
    const userId = user?.id;
    
    if (!userId) {
      showToast('Lỗi: Không tìm thấy user ID', 'error');
      return;
    }
    
    if (!Number.isInteger(normalizedRoadmapId) || normalizedRoadmapId <= 0) {
      showToast('Invalid roadmap ID', 'error');
      return;
    }

    setRunningAction('phases');
    setGeneratingRoadmapPhases(true);
    setRoadmapPhaseGenerationProgress(0);
    try {
      const validSelectedMaterialIds = selectedMaterialIds.filter(id =>
        selectableMaterialIds.includes(id),
      );
      if (selectableMaterialIds.length === 0) {
        showToast('Vui lòng tải tài liệu ACTIVE trước khi tạo giai đoạn', 'error');
        setGeneratingRoadmapPhases(false);
        setRoadmapPhaseGenerationProgress(0);
        return;
      }
      if (validSelectedMaterialIds.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 tài liệu để tạo giai đoạn', 'error');
        setGeneratingRoadmapPhases(false);
        setRoadmapPhaseGenerationProgress(0);
        return;
      }
      await AIAPI.generateRoadmapPhases({
        roadmapId: normalizedRoadmapId,
        userId,
        materialIds: validSelectedMaterialIds,
      });
      showToast('Đã bắt đầu tạo các giai đoạn lộ trình', 'success');
      if (!roadmapWsConnected) {
        setRoadmapPhaseGenerationProgress(100);
        await fetchStructure(normalizedRoadmapId);
        setGeneratingRoadmapPhases(false);
        setRoadmapPhaseGenerationProgress(0);
      }
    } catch (error: any) {
      setGeneratingRoadmapPhases(false);
      setRoadmapPhaseGenerationProgress(0);
      const status = error?.response?.status;
      if (status === 400) {
        showToast('Dữ liệu không hợp lệ. Kiểm tra lại tài liệu đã chọn', 'error');
      } else {
        showToast('Không thể tạo các giai đoạn lộ trình', 'error');
      }
    } finally {
      setRunningAction(null);
    }
  };

  const handleRefreshRoadmap = async () => {
    const normalizedRoadmapId = Number(activeRoadmapId || 0);
    if (!Number.isInteger(normalizedRoadmapId) || normalizedRoadmapId <= 0) {
      return;
    }

    setRunningAction('refresh-roadmap');
    try {
      await fetchStructure(normalizedRoadmapId);
      showToast('Đã làm mới roadmap', 'success');
    } catch {
      showToast('Không thể làm mới roadmap', 'error');
    } finally {
      setRunningAction(null);
    }
  };

  const handleRemedialDecision = async (phaseId: number, option: 'COMPRESS_TO_KEEP_DEADLINE' | 'EXTEND_DEADLINE') => {
    const normalizedPhaseId = Number(phaseId);
    if (!Number.isInteger(normalizedPhaseId) || normalizedPhaseId <= 0 || submittingRemedialDecision) {
      return;
    }

    setSubmittingRemedialDecision(true);
    try {
      await RoadmapPhaseAPI.submitRemedialDecision(normalizedPhaseId, option);
      showToast('Đã cập nhật lựa chọn remedial cho phase', 'success');
      if (activeRoadmapId) {
        await fetchStructure(activeRoadmapId);
      }
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || error?.message || 'Không thể cập nhật lựa chọn remedial',
        'error',
      );
    } finally {
      setSubmittingRemedialDecision(false);
    }
  };

  const handlePreLearningDecision = async (phaseId: number, skipped: boolean) => {
    const normalizedPhaseId = Number(phaseId);
    const normalizedRoadmapId = Number(activeRoadmapId || 0);
    if (
      !Number.isInteger(normalizedPhaseId) ||
      normalizedPhaseId <= 0 ||
      !Number.isInteger(normalizedRoadmapId) ||
      normalizedRoadmapId <= 0 ||
      submittingPreLearningDecision
    ) {
      return;
    }

    setSubmittingPreLearningDecision(true);
    try {
      await RoadmapPhaseAPI.submitSkipDecision(normalizedPhaseId, skipped);

      if (skipped) {
        showToast('Đã bỏ qua phase hiện tại', 'success');
        await fetchStructure(normalizedRoadmapId);
        setHandledPreLearningDecisionPhaseIds(prev =>
          Array.from(new Set([...prev, normalizedPhaseId])),
        );
        return;
      }

      setGeneratingKnowledgePhaseIds(current =>
        current.includes(normalizedPhaseId) ? current : [...current, normalizedPhaseId],
      );
      updateProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId, 3, {allowLower: true});
      await AIAPI.generateRoadmapPhaseContent({
        roadmapId: normalizedRoadmapId,
        phaseId: normalizedPhaseId,
        skipPreLearning: false,
      });

      showToast('Đã gửi yêu cầu tạo nội dung giai đoạn', 'success');
      setHandledPreLearningDecisionPhaseIds(prev =>
        Array.from(new Set([...prev, normalizedPhaseId])),
      );
      await fetchStructure(normalizedRoadmapId);
      if (!roadmapWsConnected) {
        setGeneratingKnowledgePhaseIds(current => current.filter(id => id !== normalizedPhaseId));
        clearProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId);
      }
    } catch (error: any) {
      setGeneratingKnowledgePhaseIds(current => current.filter(id => id !== normalizedPhaseId));
      clearProgressMap(setKnowledgeProgressByPhaseId, normalizedPhaseId);
      showToast(
        error?.response?.data?.message || error?.message || 'Không thể cập nhật quyết định pre-learning',
        'error',
      );
    } finally {
      setSubmittingPreLearningDecision(false);
    }
  };

  const toggleMaterial = (id: number, disabled = false) => {
    if (disabled) {
      return;
    }
    setSelectedMaterialIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id],
    );
  };

  const toggleSelectAllMaterials = useCallback(() => {
    setSelectedMaterialIds(current => {
      if (allSelectableMaterialsSelected) {
        return current.filter(id => !selectableMaterialIds.includes(id));
      }
      return Array.from(new Set([...current, ...selectableMaterialIds]));
    });
  }, [allSelectableMaterialsSelected, selectableMaterialIds]);

  const phases = useMemo(() => {
    const list = Array.isArray(structure?.phases) ? structure.phases : [];
    return [...list].sort((a: any, b: any) => Number(a?.phaseIndex ?? 0) - Number(b?.phaseIndex ?? 0));
  }, [structure?.phases]);

  useEffect(() => {
    if (!Array.isArray(phases) || phases.length === 0) {
      return;
    }

    const phaseIdsWithPreLearning = phases
      .filter((phase: any) => hasReadyRoadmapQuiz(phase?.preLearningQuizzes))
      .map((phase: any) => normalizePositiveId(phase?.phaseId))
      .filter(Boolean);
    const phaseIdsWithKnowledge = phases
      .filter((phase: any) => toArray(phase?.knowledges).length > 0)
      .map((phase: any) => normalizePositiveId(phase?.phaseId))
      .filter(Boolean);

    if (phaseIdsWithPreLearning.length > 0) {
      setGeneratingPreLearningPhaseIds(current =>
        current.filter(id => !phaseIdsWithPreLearning.includes(id)),
      );
      phaseIdsWithPreLearning.forEach(phaseId =>
        clearProgressMap(setPreLearningProgressByPhaseId, phaseId),
      );
    }

    if (phaseIdsWithKnowledge.length > 0) {
      setGeneratingKnowledgePhaseIds(current =>
        current.filter(id => !phaseIdsWithKnowledge.includes(id)),
      );
      phaseIdsWithKnowledge.forEach(phaseId =>
        clearProgressMap(setKnowledgeProgressByPhaseId, phaseId),
      );
    }
  }, [phases]);

  useEffect(() => {
    if (!Array.isArray(phases) || phases.length === 0) return;
    const normalizedCurrent = Number(selectedPhaseId);
    const hasCurrent =
      Number.isInteger(normalizedCurrent) &&
      normalizedCurrent > 0 &&
      phases.some((phase: any) => Number(phase?.phaseId) === normalizedCurrent);
    if (!hasCurrent) {
      handleSelectPhase(Number(phases[0]?.phaseId) || null, {fromUser: false});
    }
  }, [handleSelectPhase, phases, selectedPhaseId]);

  const adaptationMode = String(
    route?.params?.adaptationMode || profileAdaptationMode || structure?.adaptationMode || '',
  ).toUpperCase();
  const learningMode = String(
    route?.params?.learningMode || profileLearningMode || structure?.learningMode || '',
  ).toUpperCase();
  const isStudyNewRoadmap = learningMode === 'STUDY_NEW';
  const isFlexibleRoadmap = adaptationMode === 'FLEXIBLE';
  const isStrictRoadmap = adaptationMode === 'STRICT' || adaptationMode === 'BALANCED';

  const activePhase = useMemo(() => {
    const normalizedSelected = Number(selectedPhaseId);
    if (!Number.isInteger(normalizedSelected) || normalizedSelected <= 0) {
      return phases[0] || null;
    }
    return phases.find((phase: any) => Number(phase?.phaseId) === normalizedSelected) || phases[0] || null;
  }, [phases, selectedPhaseId]);

  const activePhaseIndex = useMemo(() => {
    const normalizedPhaseId = Number(activePhase?.phaseId || 0);
    return phases.findIndex((phase: any) => Number(phase?.phaseId) === normalizedPhaseId);
  }, [activePhase?.phaseId, phases]);

  useEffect(() => {
    if (!followCurrentPhase) {
      return;
    }

    const currentPhaseId = Number(currentPhaseProgress?.phaseId || 0);
    if (!Number.isInteger(currentPhaseId) || currentPhaseId <= 0) {
      return;
    }

    const existsInRoadmap = phases.some((phase: any) => Number(phase?.phaseId) === currentPhaseId);
    if (!existsInRoadmap) {
      return;
    }

    if (Number(selectedPhaseId) !== currentPhaseId) {
      handleSelectPhase(currentPhaseId, {fromUser: false});
    }
  }, [
    currentPhaseProgress?.phaseId,
    followCurrentPhase,
    handleSelectPhase,
    phases,
    selectedPhaseId,
  ]);

  useEffect(() => {
    userManuallySelectedPhaseRef.current = false;
    setFollowCurrentPhase(true);
  }, [selectedRoadmapId]);

  useEffect(() => {
    const roadmapId = Number(activeRoadmapId || 0);
    const phaseId = Number(activePhase?.phaseId || 0);

    if (!Number.isInteger(roadmapId) || roadmapId <= 0 || !Number.isInteger(phaseId) || phaseId <= 0) {
      setPhaseReviewState({loading: false, data: null, phaseId: null});
      return;
    }

    const hasCompletedPostLearning = (phase: any) => {
      const postLearningQuizzes = Array.isArray(phase?.postLearningQuizzes)
        ? phase.postLearningQuizzes
        : [];
      return postLearningQuizzes.some((quiz: any) => {
        const attempted = quiz?.myAttempted === true;
        const passed = quiz?.myPassed === true;
        const status = String(quiz?.status || '').toUpperCase();
        return attempted || passed || status === 'COMPLETED';
      });
    };

    const hasPassedPostLearning = (phase: any) => {
      const postLearningQuizzes = Array.isArray(phase?.postLearningQuizzes)
        ? phase.postLearningQuizzes
        : [];
      return postLearningQuizzes.some((quiz: any) => quiz?.myPassed === true);
    };

    const canCreateReview = (() => {
      if (isFlexibleRoadmap) return hasCompletedPostLearning(activePhase);
      if (isStrictRoadmap) return hasPassedPostLearning(activePhase);
      return hasPassedPostLearning(activePhase);
    })();

    let cancelled = false;
    setPhaseReviewState({loading: true, data: null, phaseId});

    (async () => {
      try {
        const currentRes = await RoadmapPhaseAPI.getCurrentPhaseProgress(roadmapId);
        const currentPayload = currentRes?.data || null;
        const phaseProgressId = Number(currentPayload?.phaseProgressId || 0);
        const currentPhaseId = Number(currentPayload?.phaseId || 0);

        if (
          Number.isInteger(currentPhaseId) &&
          currentPhaseId === phaseId &&
          Number.isInteger(phaseProgressId) &&
          phaseProgressId > 0 &&
          canCreateReview
        ) {
          const creationKey = `${roadmapId}:${phaseProgressId}`;
          try {
            if (!reviewCreationAttemptedRef.current.has(creationKey)) {
              reviewCreationAttemptedRef.current.add(creationKey);
              await RoadmapPhaseAPI.createProgressReview(phaseProgressId);
            }
          } catch {
            // Review may already exist or current progress may not be ready yet.
          }
        }

        try {
          const reviewRes = await RoadmapPhaseAPI.getPhaseReview(phaseId);
          if (cancelled) return;
          const reviewData = reviewRes?.data || null;
          if (reviewData?.summary && Number(reviewData?.phaseId) === phaseId) {
            setPhaseReviewState({loading: false, data: reviewData, phaseId});
            return;
          }
          setPhaseReviewState({loading: false, data: null, phaseId});
        } catch {
          if (!cancelled) {
            setPhaseReviewState({loading: false, data: null, phaseId});
          }
        }
      } catch {
        if (!cancelled) {
          setPhaseReviewState({loading: false, data: null, phaseId});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePhase, activeRoadmapId, isFlexibleRoadmap, isStrictRoadmap]);

  const phaseReviewConfidencePercent = useMemo(() => {
    const rawScore = Number(phaseReviewState?.data?.confidenceScore);
    if (!Number.isFinite(rawScore)) return null;
    return Math.round(Math.max(0, Math.min(1, rawScore)) * 100);
  }, [phaseReviewState?.data?.confidenceScore]);

  const phaseReviewSegmentFillPercents = useMemo(() => {
    if (typeof phaseReviewConfidencePercent !== 'number') {
      return [0, 0, 0];
    }

    const segmentSize = 100 / 3;
    return [0, 1, 2].map(index => {
      const start = index * segmentSize;
      const end = start + segmentSize;
      if (phaseReviewConfidencePercent <= start) return 0;
      if (phaseReviewConfidencePercent >= end) return 100;
      return Math.max(
        0,
        Math.min(100, ((phaseReviewConfidencePercent - start) / segmentSize) * 100),
      );
    });
  }, [phaseReviewConfidencePercent]);

  const phaseReviewAssessedAtLabel = useMemo(() => {
    const raw = phaseReviewState?.data?.assessedAt;
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;

    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(parsed);
  }, [phaseReviewState?.data?.assessedAt]);

  const getQuizDurationInMinutes = useCallback((quiz: any) => {
    const rawDuration = Number(quiz?.duration) || 0;
    if (!rawDuration) return 0;

    const createVia = String(quiz?.createVia || '').toUpperCase();
    const isAiQuiz = createVia === 'AI';
    const rawTimerMode = quiz?.timerMode;
    const isTotalTimerMode =
      rawTimerMode === true ||
      rawTimerMode === 'true' ||
      rawTimerMode === 1 ||
      rawTimerMode === '1' ||
      rawTimerMode === 'TOTAL';

    if (isAiQuiz) {
      const normalizedSeconds = rawDuration >= 36000 ? Math.floor(rawDuration / 60) : rawDuration;
      return Math.max(1, Math.round(normalizedSeconds / 60));
    }

    const normalizedDurationInSeconds =
      isTotalTimerMode && rawDuration >= 36000 ? Math.floor(rawDuration / 60) : rawDuration;

    if (isTotalTimerMode) {
      return Math.max(1, Math.round(normalizedDurationInSeconds / 60));
    }

    return rawDuration;
  }, []);

  const getQuizOutcomeMeta = useCallback((quiz: any) => {
    const normalizedStatus = String(quiz?.status || '').toUpperCase();
    const myPassed =
      quiz?.myPassed === true ||
      quiz?.passed === true ||
      quiz?.result?.passed === true ||
      normalizedStatus === 'PASSED' ||
      normalizedStatus === 'PASS';
    const myAttempted =
      quiz?.myAttempted === true ||
      quiz?.attempted === true ||
      quiz?.attemptStatus === 'COMPLETED' ||
      normalizedStatus === 'COMPLETED' ||
      normalizedStatus === 'FAILED' ||
      normalizedStatus === 'SUBMITTED';

    if (myPassed) {
      return {
        label: 'Đã đậu',
        tone: 'success',
      } as const;
    }

    if (myAttempted) {
      return {
        label: 'Chưa đậu',
        tone: 'danger',
      } as const;
    }

    return {
      label: 'Chưa làm',
      tone: 'neutral',
    } as const;
  }, []);

  const formatPhaseDurationLabel = useCallback((phase: any) => {
    const estimatedDays = Number(
      phase?.estimatedDays ?? phase?.studyDurationInDay ?? phase?.durationInDay ?? 0,
    );
    const estimatedMinutesPerDay = Number(
      phase?.estimatedMinutesPerDay ?? phase?.recommendedMinutesPerDay ?? phase?.minutesPerDay ?? 0,
    );

    if (estimatedDays > 0 && estimatedMinutesPerDay > 0) {
      return `${estimatedDays} ngày • ${estimatedMinutesPerDay} phút/ngày`;
    }
    if (estimatedDays > 0) {
      return `${estimatedDays} ngày`;
    }
    if (estimatedMinutesPerDay > 0) {
      return `${estimatedMinutesPerDay} phút/ngày`;
    }

    return null;
  }, []);

  const isCompletedQuiz = useCallback((quiz: any) => {
    const normalizedStatus = String(quiz?.status || '').toUpperCase();
    return (
      quiz?.myAttempted === true ||
      quiz?.myPassed === true ||
      normalizedStatus === 'DONE' ||
      normalizedStatus === 'COMPLETED' ||
      normalizedStatus === 'SKIPPED' ||
      normalizedStatus === 'PASSED' ||
      normalizedStatus === 'FINISHED' ||
      normalizedStatus === 'SUBMITTED'
    );
  }, []);

  const isCompletedKnowledge = useCallback((knowledge: any) => {
    const normalizedStatus = String(knowledge?.status || '').toUpperCase();
    return ['DONE', 'COMPLETED', 'SKIPPED'].includes(normalizedStatus);
  }, []);

  const isPhaseEffectivelyDone = useCallback((phase: any) => {
    const phaseStatus = String(phase?.status || '').toUpperCase();
    if (['COMPLETED', 'DONE', 'SKIPPED', 'PASSED', 'FINISHED', 'SUBMITTED'].includes(phaseStatus)) {
      return true;
    }

    const preLearningQuizzes = Array.isArray(phase?.preLearningQuizzes) ? phase.preLearningQuizzes : [];
    const knowledges = Array.isArray(phase?.knowledges) ? phase.knowledges : [];
    const postLearningQuizzes = Array.isArray(phase?.postLearningQuizzes) ? phase.postLearningQuizzes : [];

    const hasAnyChildStage =
      preLearningQuizzes.length > 0 || knowledges.length > 0 || postLearningQuizzes.length > 0;
    if (!hasAnyChildStage) {
      return false;
    }

    const preLearningDone = preLearningQuizzes.length === 0 || preLearningQuizzes.every(isCompletedQuiz);
    const knowledgeDone = knowledges.length === 0 || knowledges.every(isCompletedKnowledge);
    const postLearningDone = postLearningQuizzes.length === 0 || postLearningQuizzes.some(isCompletedQuiz);

    return preLearningDone && knowledgeDone && postLearningDone;
  }, [isCompletedKnowledge, isCompletedQuiz]);

  const isPhaseFinishedStatus = useCallback((phaseStatus: any) => {
    const normalizedStatus = String(phaseStatus || '').toUpperCase();
    return normalizedStatus === 'COMPLETED' || normalizedStatus === 'SKIPPED';
  }, []);

  const isCurrentPayloadFinished = useMemo(
    () => isPhaseFinishedStatus(currentPhaseProgress?.status),
    [currentPhaseProgress?.status, isPhaseFinishedStatus],
  );
  const currentPayloadPhaseId = Number(currentPhaseProgress?.phaseId);
  const currentPayloadPhaseIndex = normalizePhaseIndex(currentPhaseProgress?.phaseIndex);
  const currentPayloadStatus = String(currentPhaseProgress?.status || '').toUpperCase();
  const isCurrentPayloadActiveStatus = ['IN_PROGRESS', 'ACTIVE', 'PROCESSING'].includes(currentPayloadStatus);

  const maxUnlockedPhaseIndex = useMemo(() => {
    if (!Array.isArray(phases) || phases.length === 0) {
      return 0;
    }

    const unlockedByOptimisticIndex = optimisticUnlockedPhaseIds.reduce((maxIndex, phaseId) => {
      const normalizedPhaseId = Number(phaseId);
      if (!Number.isInteger(normalizedPhaseId) || normalizedPhaseId <= 0) {
        return maxIndex;
      }

      const phaseIndex = phases.findIndex((phase: any) => Number(phase?.phaseId) === normalizedPhaseId);
      return phaseIndex >= 0 ? Math.max(maxIndex, phaseIndex) : maxIndex;
    }, -1);

    const currentPhaseId = Number(currentPhaseProgress?.phaseId);
    const currentIndex =
      Number.isInteger(currentPhaseId) && currentPhaseId > 0
        ? phases.findIndex((phase: any) => Number(phase?.phaseId) === currentPhaseId)
        : -1;

    let contiguousFinishedCount = 0;
    for (let i = 0; i < phases.length; i += 1) {
      if (!isPhaseEffectivelyDone(phases[i])) {
        break;
      }
      contiguousFinishedCount += 1;
    }
    const unlockedByStatusIndex = contiguousFinishedCount > 0
      ? Math.min(phases.length - 1, contiguousFinishedCount - 1)
      : -1;

    if (isStudyNewRoadmap) {
      const unlockedByManualProgressIndex = phases.reduce((maxIndex: number, phase: any, index: number) => {
        const hasPreLearning = hasReadyRoadmapQuiz(phase?.preLearningQuizzes);
        const hasKnowledge = Array.isArray(phase?.knowledges) && phase.knowledges.length > 0;
        const hasPostLearning = Array.isArray(phase?.postLearningQuizzes) && phase.postLearningQuizzes.length > 0;
        const isFinished = isPhaseFinishedStatus(phase?.status);

        return hasPreLearning || hasKnowledge || hasPostLearning || isFinished
          ? Math.max(maxIndex, index)
          : maxIndex;
      }, 0);

      return Math.max(0, unlockedByManualProgressIndex, unlockedByOptimisticIndex);
    }

    const unlockedByFinishedPayloadIndex = isCurrentPayloadFinished
      ? (currentPayloadPhaseIndex >= 0 ? currentPayloadPhaseIndex : currentIndex)
      : -1;

    return Math.max(
      0,
      unlockedByStatusIndex,
      unlockedByOptimisticIndex,
      unlockedByFinishedPayloadIndex,
    );
  }, [
    currentPayloadPhaseIndex,
    currentPhaseProgress?.phaseId,
    isCurrentPayloadFinished,
    isPhaseEffectivelyDone,
    isPhaseFinishedStatus,
    isStudyNewRoadmap,
    optimisticUnlockedPhaseIds,
    phases,
  ]);

  const hasRoadmapPhases = useMemo(() => {
    const fromStructure = Array.isArray(structure?.phases) && structure.phases.length > 0;
    const fromSortedPhases = Array.isArray(phases) && phases.length > 0;
    return fromStructure || fromSortedPhases;
  }, [phases, structure?.phases]);
  const shouldShowRoadmapSetupScreen =
    contextType === 'WORKSPACE' && activeRoadmapId > 0 && !hasRoadmapPhases;

  const isKnowledgeFinishedStatus = useCallback((knowledgeStatus: any) => {
    const normalizedStatus = String(knowledgeStatus || '').toUpperCase();
    return normalizedStatus === 'DONE' || normalizedStatus === 'COMPLETED' || normalizedStatus === 'SKIPPED';
  }, []);

  const currentKnowledgePhaseId = Number(currentKnowledgePayload?.phaseId);
  const currentKnowledgeId = Number(currentKnowledgePayload?.knowledgeId);
  const currentKnowledgeStatus = String(currentKnowledgePayload?.status || '').toUpperCase();
  const isCurrentKnowledgeDoneStatus = isKnowledgeFinishedStatus(currentKnowledgeStatus);
  const currentKnowledgePhaseIndex = Number.isInteger(currentKnowledgePhaseId) && currentKnowledgePhaseId > 0
    ? phases.findIndex((phase: any) => Number(phase?.phaseId) === currentKnowledgePhaseId)
    : -1;

  const isCurrentPhaseByPayload = useCallback(
    (phaseId: number | string | null | undefined) => {
      const normalizedPhaseId = Number(phaseId);
      return (
        Number.isInteger(normalizedPhaseId) &&
        normalizedPhaseId > 0 &&
        isCurrentPayloadActiveStatus &&
        Number.isInteger(currentPayloadPhaseId) &&
        currentPayloadPhaseId > 0 &&
        currentPayloadPhaseId === normalizedPhaseId
      );
    },
    [currentPayloadPhaseId, isCurrentPayloadActiveStatus],
  );

  const getPhaseVisualState = useCallback(
    (phase: any, index: number, isLockedPhase: boolean) => {
      if (isLockedPhase) {
        return 'locked';
      }

      if (isPhaseEffectivelyDone(phase)) {
        return 'done';
      }

      const normalizedCurrentPhaseId = Number(currentPhaseProgress?.phaseId);
      if (
        Number.isInteger(normalizedCurrentPhaseId) &&
        normalizedCurrentPhaseId > 0 &&
        Number(phase?.phaseId) === normalizedCurrentPhaseId
      ) {
        return 'current';
      }

      if (index < maxUnlockedPhaseIndex) {
        return 'done';
      }

      if (index === maxUnlockedPhaseIndex) {
        return 'current';
      }

      if (index === maxUnlockedPhaseIndex + 1) {
        return 'next';
      }

      return 'locked';
    },
    [currentPhaseProgress?.phaseId, isPhaseEffectivelyDone, maxUnlockedPhaseIndex],
  );

  const getPhaseVisualMeta = useCallback(
    (state: 'done' | 'current' | 'next' | 'locked') => {
      switch (state) {
        case 'done':
          return {
            icon: 'check-circle-outline',
            label: 'Hoàn thành',
            dotColor: '#10b981',
            badgeBorder: '#86efac',
            badgeBackground: isDark ? 'rgba(22,101,52,0.28)' : '#dcfce7',
            badgeText: isDark ? '#86efac' : '#166534',
          };
        case 'current':
          return {
            icon: 'progress-clock',
            label: 'Hiện tại',
            dotColor: '#0ea5e9',
            badgeBorder: '#7dd3fc',
            badgeBackground: isDark ? 'rgba(3,105,161,0.28)' : '#e0f2fe',
            badgeText: isDark ? '#7dd3fc' : '#075985',
          };
        case 'next':
          return {
            icon: 'clock-outline',
            label: 'Sắp tới',
            dotColor: '#f59e0b',
            badgeBorder: '#fcd34d',
            badgeBackground: isDark ? 'rgba(146,64,14,0.28)' : '#fef3c7',
            badgeText: isDark ? '#fcd34d' : '#92400e',
          };
        default:
          return {
            icon: 'lock-outline',
            label: 'Đã khóa',
            dotColor: '#94a3b8',
            badgeBorder: '#cbd5e1',
            badgeBackground: isDark ? 'rgba(71,85,105,0.35)' : '#e2e8f0',
            badgeText: isDark ? '#cbd5e1' : '#475569',
          };
      }
    },
    [isDark],
  );

  const resolveKnowledgeLockState = useCallback(
    (phase: any, phaseIndex: number, knowledgeIndex: number) => {
      const phaseKnowledges = Array.isArray(phase?.knowledges) ? phase.knowledges : [];
      const hasExistingPreLearning = hasReadyRoadmapQuiz(phase?.preLearningQuizzes);
      const isPhaseLockedForKnowledge =
        phaseIndex > maxUnlockedPhaseIndex &&
        !hasExistingPreLearning &&
        !isCurrentPhaseByPayload(phase?.phaseId);

      const currentKnowledgeIndexInPhase =
        Number.isInteger(currentKnowledgeId) && currentKnowledgeId > 0
          ? phaseKnowledges.findIndex((item: any) => Number(item?.knowledgeId || item?.id || 0) === currentKnowledgeId)
          : -1;

      const shouldUseSequentialFallbackLock =
        !isPhaseEffectivelyDone(phase) &&
        !isPhaseLockedForKnowledge &&
        phaseIndex === maxUnlockedPhaseIndex &&
        currentKnowledgePhaseIndex < 0 &&
        currentKnowledgeIndexInPhase < 0 &&
        phaseKnowledges.length > 0;

      const isKnowledgeLockedBySequence =
        !isPhaseEffectivelyDone(phase) &&
        (
          (
            phaseIndex === currentKnowledgePhaseIndex &&
            currentKnowledgeIndexInPhase >= 0 &&
            knowledgeIndex > currentKnowledgeIndexInPhase + (isCurrentKnowledgeDoneStatus ? 1 : 0)
          ) ||
          (shouldUseSequentialFallbackLock && knowledgeIndex > 0)
        );

      return {
        isPhaseLockedForKnowledge,
        isKnowledgeLockedBySequence,
      };
    },
    [currentKnowledgeId, currentKnowledgePhaseIndex, isCurrentKnowledgeDoneStatus, isCurrentPhaseByPayload, isPhaseEffectivelyDone, maxUnlockedPhaseIndex],
  );

  const activePhaseKnowledges = useMemo(() => {
    return Array.isArray(activePhase?.knowledges) ? activePhase.knowledges : [];
  }, [activePhase?.knowledges]);

  const activePhasePreLearningQuizzes = useMemo(() => {
    return toArray(activePhase?.preLearningQuizzes).filter(isReadyRoadmapQuiz);
  }, [activePhase?.preLearningQuizzes]);

  const activePhasePostLearningQuizzes = useMemo(() => {
    return toArray(activePhase?.postLearningQuizzes).filter(isReadyRoadmapQuiz);
  }, [activePhase?.postLearningQuizzes]);

  const activePhaseId = Number(activePhase?.phaseId || 0);
  const hasActivePhase = Number.isInteger(activePhaseId) && activePhaseId > 0;
  const activePhaseHasKnowledge = activePhaseKnowledges.length > 0;
  const activePhaseIsGeneratingPreLearning = generatingPreLearningPhaseIds.includes(activePhaseId);
  const activePhaseIsGeneratingKnowledge = generatingKnowledgePhaseIds.includes(activePhaseId);
  const activePhaseIsGeneratingKnowledgeQuiz = generatingKnowledgeQuizPhaseIds.includes(activePhaseId);
  const activePhaseSkippedPreLearning = skipPreLearningPhaseIds.includes(activePhaseId);
  const activePhasePreLearningPercent = getProgressForPhase(preLearningProgressByPhaseId, activePhaseId);
  const activePhaseKnowledgePercent = getProgressForPhase(knowledgeProgressByPhaseId, activePhaseId);
  const activePhaseStatus = String(activePhase?.status || '').toUpperCase();
  const activePhaseIsProcessing = activePhaseStatus === 'PROCESSING';
  const activePhaseShouldShowKnowledgePlaceholder =
    hasActivePhase &&
    !activePhaseHasKnowledge &&
    (activePhaseIsGeneratingKnowledge || activePhaseSkippedPreLearning);
  const activePhaseShouldShowPreLearningPlaceholder =
    hasActivePhase &&
    !activePhaseHasKnowledge &&
    activePhasePreLearningQuizzes.length === 0 &&
    !activePhaseShouldShowKnowledgePlaceholder &&
    (activePhaseIsGeneratingPreLearning || activePhaseIsProcessing);

  const selectedKnowledge = useMemo(() => {
    const normalizedKnowledgeId = Number(selectedKnowledgeId || 0);
    if (!Number.isInteger(normalizedKnowledgeId) || normalizedKnowledgeId <= 0) {
      return null;
    }
    return (
      activePhaseKnowledges.find(
        (knowledge: any) => Number(knowledge?.knowledgeId || knowledge?.id || 0) === normalizedKnowledgeId,
      ) || null
    );
  }, [activePhaseKnowledges, selectedKnowledgeId]);

  const selectedKnowledgeQuizzes = useMemo(() => {
    const normalizedKnowledgeId = Number(selectedKnowledgeId || 0);
    const inlineQuizzes = Array.isArray(selectedKnowledge?.quizzes) ? selectedKnowledge.quizzes : [];
    if (inlineQuizzes.length > 0) {
      return inlineQuizzes;
    }
    return knowledgeQuizMap[normalizedKnowledgeId] || [];
  }, [knowledgeQuizMap, selectedKnowledge?.quizzes, selectedKnowledgeId]);
  const selectedKnowledgeQuizGenerationKey =
    hasActivePhase && Number(selectedKnowledgeId || 0) > 0
      ? `${activePhaseId}:${Number(selectedKnowledgeId || 0)}`
      : null;
  const selectedKnowledgeIsGeneratingQuiz =
    activePhaseIsGeneratingKnowledgeQuiz &&
    (
      !selectedKnowledgeQuizGenerationKey ||
      generatingKnowledgeQuizKnowledgeKeys.length === 0 ||
      generatingKnowledgeQuizKnowledgeKeys.includes(selectedKnowledgeQuizGenerationKey)
    );

  const selectedPhaseIndex = useMemo(
    () => phases.findIndex((phase: any) => Number(phase?.phaseId) === Number(selectedPhaseId)),
    [phases, selectedPhaseId],
  );

  const selectedPhaseHasExistingPreLearning = hasReadyRoadmapQuiz(activePhase?.preLearningQuizzes);
  const isSelectedPhaseCurrentByPayload =
    Number.isInteger(currentPayloadPhaseId) &&
    currentPayloadPhaseId > 0 &&
    (
      currentPayloadPhaseId === Number(selectedPhaseId) ||
      (Number.isFinite(currentPayloadPhaseIndex) && currentPayloadPhaseIndex > selectedPhaseIndex)
    );
  const isSelectedPhaseLocked =
    viewMode === 'detail' &&
    Boolean(activePhase) &&
    selectedPhaseIndex > maxUnlockedPhaseIndex &&
    !selectedPhaseHasExistingPreLearning &&
    !isSelectedPhaseCurrentByPayload;
  const selectedPreviousPhaseCompleted = selectedPhaseIndex > 0
    ? isPhaseEffectivelyDone(phases[selectedPhaseIndex - 1])
    : true;
  const isSelectedPhaseUnlocking = unlockingPhaseIds.includes(Number(selectedPhaseId));
  const isSelectedPhaseUnlockable =
    isSelectedPhaseLocked &&
    selectedPhaseIndex === maxUnlockedPhaseIndex + 1 &&
    selectedPreviousPhaseCompleted &&
    !isSelectedPhaseUnlocking;

  const handleUnlockSelectedPhase = async () => {
    const phaseId = Number(activePhase?.phaseId || 0);
    if (!isSelectedPhaseUnlockable || !phaseId || !Number(activeRoadmapId || 0)) {
      return;
    }

    setOptimisticUnlockedPhaseIds(current => (current.includes(phaseId) ? current : [...current, phaseId]));
    setUnlockingPhaseIds(current => (current.includes(phaseId) ? current : [...current, phaseId]));
    try {
      await handleGeneratePreLearning(Number(activeRoadmapId || 0), phaseId);
      await fetchStructure(Number(activeRoadmapId || 0));
    } catch (error) {
      setOptimisticUnlockedPhaseIds(current => current.filter(id => id !== phaseId));
      console.error('Failed to unlock phase:', error);
      showToast('Không thể mở khóa phase', 'error');
    } finally {
      setUnlockingPhaseIds(current => current.filter(id => id !== phaseId));
    }
  };

  const selectedKnowledgeIndex = selectedKnowledge
    ? activePhaseKnowledges.findIndex((knowledge: any) => Number(knowledge?.knowledgeId || knowledge?.id || 0) === Number(selectedKnowledgeId || 0))
    : -1;
  const selectedKnowledgeStatus = String(selectedKnowledge?.status || '').toUpperCase();
  const selectedKnowledgeLockState =
    selectedKnowledge && selectedPhaseIndex >= 0 && selectedKnowledgeIndex >= 0
      ? resolveKnowledgeLockState(activePhase, selectedPhaseIndex, selectedKnowledgeIndex)
      : null;
  const isSelectedKnowledgeLocked =
    viewMode === 'detail' &&
    Boolean(selectedKnowledge) &&
    (
      selectedKnowledgeStatus === 'LOCKED' ||
      selectedKnowledgeLockState?.isPhaseLockedForKnowledge ||
      selectedKnowledgeLockState?.isKnowledgeLockedBySequence
    );
  const activePhaseCurrentKnowledgeIndex =
    Number.isInteger(currentKnowledgeId) && currentKnowledgeId > 0
      ? activePhaseKnowledges.findIndex((knowledge: any) => Number(knowledge?.knowledgeId || knowledge?.id || 0) === currentKnowledgeId)
      : -1;
  const isActivePhaseBeforeCurrentKnowledge =
    currentKnowledgePhaseIndex >= 0 && activePhaseIndex < currentKnowledgePhaseIndex;
  const activePhaseCompletedKnowledgeCount = activePhaseKnowledges.reduce(
    (count: number, _knowledge: any, knowledgeIndex: number) => {
      const isKnowledgeCompleted =
        isPhaseFinishedStatus(activePhase?.status) ||
        isActivePhaseBeforeCurrentKnowledge ||
        (
          activePhaseIndex === currentKnowledgePhaseIndex &&
          activePhaseCurrentKnowledgeIndex >= 0 &&
          (
            knowledgeIndex < activePhaseCurrentKnowledgeIndex ||
            (knowledgeIndex === activePhaseCurrentKnowledgeIndex && isCurrentKnowledgeDoneStatus)
          )
        );
      return isKnowledgeCompleted ? count + 1 : count;
    },
    0,
  );
  const activePhaseShouldLockPostLearning =
    activePhasePostLearningQuizzes.length > 0 &&
    !isPhaseFinishedStatus(activePhase?.status) &&
    activePhaseKnowledges.length > 0 &&
    activePhaseCompletedKnowledgeCount < activePhaseKnowledges.length;
  const activePhaseDecisionHandled = handledPreLearningDecisionPhaseIds.includes(activePhaseId);
  const activePhaseHasPreLearningDecisionState =
    hasActivePhase &&
    Number(currentPhaseProgress?.phaseId) === activePhaseId &&
    (currentPhaseProgress?.skipable === true || currentPhaseProgress?.skipable === false) &&
    !isPhaseFinishedStatus(currentPhaseProgress?.status);
  const canShowActiveSkipDecisionAfterPreLearning =
    activePhasePreLearningQuizzes.length > 0 &&
    !activePhaseHasKnowledge &&
    !isSelectedPhaseLocked &&
    activePhaseHasPreLearningDecisionState &&
    currentPhaseProgress?.skipable === true &&
    !activePhaseDecisionHandled &&
    !activePhaseIsGeneratingKnowledge;
  const canShowActiveGenerateKnowledgeFallback =
    activePhasePreLearningQuizzes.length > 0 &&
    !activePhaseHasKnowledge &&
    !isSelectedPhaseLocked &&
    activePhaseHasPreLearningDecisionState &&
    currentPhaseProgress?.skipable === false &&
    !activePhaseDecisionHandled &&
    !activePhaseIsGeneratingKnowledge;
  const canShowActiveRemedialDecision =
    activePhasePostLearningQuizzes.length > 0 &&
    isFlexibleRoadmap &&
    !isSelectedPhaseLocked &&
    Number(currentPhaseProgress?.phaseId) === activePhaseId &&
    currentPhaseProgress?.needsRemedialDecision === true;

  useEffect(() => {
    if (!Array.isArray(activePhaseKnowledges) || activePhaseKnowledges.length === 0) {
      setSelectedKnowledgeId(null);
      return;
    }

    const normalizedSelectedKnowledgeId = Number(selectedKnowledgeId || 0);
    const exists = activePhaseKnowledges.some(
      (knowledge: any) => Number(knowledge?.knowledgeId || knowledge?.id || 0) === normalizedSelectedKnowledgeId,
    );
    if (exists) {
      return;
    }

    const firstKnowledgeId = Number(activePhaseKnowledges[0]?.knowledgeId || activePhaseKnowledges[0]?.id || 0);
    setSelectedKnowledgeId(Number.isInteger(firstKnowledgeId) && firstKnowledgeId > 0 ? firstKnowledgeId : null);
  }, [activePhaseKnowledges, selectedKnowledgeId]);

  useEffect(() => {
    const normalizedKnowledgeId = Number(selectedKnowledgeId || 0);
    if (!Number.isInteger(normalizedKnowledgeId) || normalizedKnowledgeId <= 0) {
      return;
    }

    if (Array.isArray(selectedKnowledge?.quizzes) && selectedKnowledge.quizzes.length > 0) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await QuizAPI.getByContext('KNOWLEDGE', normalizedKnowledgeId);
        if (cancelled) {
          return;
        }
        const list = Array.isArray(res?.data) ? res.data : [];
        setKnowledgeQuizMap(prev => ({
          ...prev,
          [normalizedKnowledgeId]: list,
        }));
      } catch {
        if (!cancelled) {
          setKnowledgeQuizMap(prev => ({
            ...prev,
            [normalizedKnowledgeId]: [],
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedKnowledge?.quizzes, selectedKnowledgeId]);

  useEffect(() => {
    if (stageSelectedType === 'knowledge' && !selectedKnowledge) {
      setStageSelectedType(activePhase ? 'phase' : 'roadmap');
      return;
    }

    if (stageSelectedType === 'phase' && !activePhase) {
      setStageSelectedType('roadmap');
    }
  }, [activePhase, selectedKnowledge, stageSelectedType]);

  useEffect(() => {
    const normalizedRoutePhaseId = Number(routePhaseId);
    const hasRoutePhase = Number.isInteger(normalizedRoutePhaseId) && normalizedRoutePhaseId > 0;
    setStageSelectedType(hasRoutePhase ? 'phase' : 'roadmap');
    if (!hasRoutePhase) {
      setSelectedPhaseId(null);
    }
    setRoadmapStageCollapsed(false);
    setExpandedStagePhaseId(null);
  }, [activeRoadmapId, phases.length, routePhaseId]);

  const effectiveStageSelectedType: StageSelectedType =
    stageSelectedType === 'knowledge' && selectedKnowledge
      ? 'knowledge'
      : stageSelectedType === 'phase' && activePhase
      ? 'phase'
      : 'roadmap';

  const roadmapStageTitle =
    selectedRoadmap?.title || selectedRoadmap?.name || `Roadmap #${activeRoadmapId}`;
  const roadmapStageDescription =
    selectedRoadmap?.description ||
    structure?.description ||
    structure?.roadmap?.description ||
    'Chọn một phase hoặc knowledge để xem chi tiết học tập.';
  const roadmapStageContextLabel = contextType === 'GROUP' ? 'Nhóm' : 'Workspace';

  const roadmapStageStats = useMemo(() => {
    const knowledgeCount = phases.reduce(
      (count: number, phase: any) => count + toArray(phase?.knowledges).length,
      0,
    );
    const quizCount = phases.reduce((count: number, phase: any) => {
      const phaseQuizCount =
        toArray(phase?.preLearningQuizzes).filter(isReadyRoadmapQuiz).length +
        toArray(phase?.postLearningQuizzes).filter(isReadyRoadmapQuiz).length;
      const knowledgeQuizCount = toArray(phase?.knowledges).reduce(
        (innerCount: number, knowledge: any) =>
          innerCount + toArray(knowledge?.quizzes).filter(isReadyRoadmapQuiz).length,
        0,
      );
      return count + phaseQuizCount + knowledgeQuizCount;
    }, 0);

    return [
      {
        key: 'phase',
        icon: 'layers-outline',
        label: 'Phase',
        value: Number(selectedRoadmap?.stats?.phaseCount ?? phases.length) || phases.length,
        color: '#10b981',
      },
      {
        key: 'knowledge',
        icon: 'source-branch',
        label: 'Knowledge',
        value: Number(selectedRoadmap?.stats?.knowledgeCount ?? knowledgeCount) || knowledgeCount,
        color: '#0ea5e9',
      },
      {
        key: 'quiz',
        icon: 'book-check-outline',
        label: 'Quiz',
        value: Number(selectedRoadmap?.stats?.quizCount ?? quizCount) || quizCount,
        color: '#f59e0b',
      },
    ];
  }, [phases, selectedRoadmap?.stats]);

  const stageMapMinWidth =
    STAGE_ROADMAP_CARD_WIDTH +
    phases.length * (STAGE_PHASE_CARD_WIDTH + STAGE_PHASE_CONNECTOR_WIDTH) +
    Spacing.lg * 2;
  const knowledgeBranchOffset =
    activePhaseIndex >= 0
      ? STAGE_ROADMAP_CARD_WIDTH +
        activePhaseIndex * (STAGE_PHASE_CARD_WIDTH + STAGE_PHASE_CONNECTOR_WIDTH) +
        STAGE_PHASE_CONNECTOR_WIDTH +
        18
      : STAGE_ROADMAP_CARD_WIDTH;
  const knowledgeBranchLineWidth = Math.max(
    STAGE_KNOWLEDGE_CARD_WIDTH,
    activePhaseKnowledges.length * STAGE_KNOWLEDGE_CARD_WIDTH +
      Math.max(0, activePhaseKnowledges.length - 1) * STAGE_KNOWLEDGE_GAP,
  );
  const shouldShowStageKnowledgeBranch =
    !roadmapStageCollapsed &&
    activePhaseId > 0 &&
    Number(expandedStagePhaseId || 0) === activePhaseId &&
    activePhaseKnowledges.length > 0;
  const stageMapContentWidth = Math.max(
    stageMapMinWidth,
    shouldShowStageKnowledgeBranch
      ? knowledgeBranchOffset + knowledgeBranchLineWidth + Spacing.lg * 2
      : 0,
    STAGE_ROADMAP_CARD_WIDTH + Spacing.lg * 2,
  );

  const selectStageRoadmap = useCallback(() => {
    animateLayout();
    setExpandedStagePhaseId(null);
    setSelectedKnowledgeId(null);
    setStageSelectedType('roadmap');
  }, [animateLayout]);

  const selectStagePhase = useCallback(
    (phaseId: number) => {
      const normalizedPhaseId = normalizePositiveId(phaseId);
      if (!normalizedPhaseId) {
        return;
      }
      handleSelectPhase(normalizedPhaseId, {fromUser: true});
      const phase = phases.find(
        (item: any) => normalizePositiveId(item?.phaseId || item?.id) === normalizedPhaseId,
      );
      const hasKnowledge = toArray(phase?.knowledges).length > 0;
      setExpandedStagePhaseId(hasKnowledge ? normalizedPhaseId : null);
      setStageSelectedType('phase');
    },
    [handleSelectPhase, phases],
  );

  const selectStageKnowledge = useCallback(
    (
      phaseId: number,
      knowledgeId: number,
      options: {expandTopBranch?: boolean} = {},
    ) => {
      const normalizedPhaseId = normalizePositiveId(phaseId);
      const normalizedKnowledgeId = normalizePositiveId(knowledgeId);
      if (!normalizedPhaseId || !normalizedKnowledgeId) {
        return;
      }
      if (Number(selectedPhaseId) !== normalizedPhaseId) {
        handleSelectPhase(normalizedPhaseId, {fromUser: true});
      }
      if (options.expandTopBranch) {
        setExpandedStagePhaseId(normalizedPhaseId);
      }
      setSelectedKnowledgeId(normalizedKnowledgeId);
      setStageSelectedType('knowledge');
    },
    [handleSelectPhase, selectedPhaseId],
  );

  const renderStageLoadingCard = (titleText: string, bodyText: string, percent: number) => (
    <View
      style={[
        styles.stageLoadingCard,
        {
          borderColor: colors.border,
          backgroundColor: isDark ? 'rgba(15,23,42,0.72)' : '#f8fafc',
        },
      ]}>
      <View style={styles.stageLoadingHeader}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={[styles.stageLoadingTitle, {color: colors.heading}]}>{titleText}</Text>
      </View>
      <Text style={[styles.stageLoadingText, {color: colors.textSecondary}]}>{bodyText}</Text>
      {renderGenerationProgress(percent)}
    </View>
  );

  const renderStageQuizCard = (
    quiz: any,
    keyPrefix: string,
    phaseId: number,
    disabled = false,
  ) => {
    const quizId = Number(quiz?.quizId || quiz?.id || 0);
    const questionCount =
      Number(quiz?.questionCount ?? quiz?.totalQuestion ?? quiz?.totalQuestions ?? 0) || 0;
    const durationInMinutes = getQuizDurationInMinutes(quiz);
    const difficultyLabel = String(quiz?.overallDifficulty || quiz?.difficulty || '').toUpperCase();
    const statusLabel = String(quiz?.status || 'DRAFT').toUpperCase();
    const outcomeMeta = getQuizOutcomeMeta(quiz);
    const outcomeColor =
      outcomeMeta.tone === 'success'
        ? isDark
          ? '#86efac'
          : '#166534'
        : outcomeMeta.tone === 'danger'
        ? isDark
          ? '#fca5a5'
          : '#b91c1c'
        : colors.textSecondary;

    return (
      <View
        key={`${keyPrefix}-${quizId || quiz?.title || 'quiz'}`}
        style={[
          styles.stageQuizCard,
          {
            borderColor: colors.border,
            backgroundColor: isDark ? Colors.dark.surfaceVariant : '#f8fafc',
            opacity: disabled ? 0.58 : 1,
          },
        ]}>
        <View style={styles.stageQuizTopRow}>
          <View style={styles.stageQuizBody}>
            <Text style={[styles.stageQuizTitle, {color: colors.heading}]} numberOfLines={2}>
              {quiz?.title || `Quiz #${quizId || ''}`}
            </Text>
            <Text style={[styles.stageQuizSubtitle, {color: colors.textSecondary}]} numberOfLines={2}>
              {quiz?.description || 'Quiz trong phase này'}
            </Text>
          </View>
          <Button
            title="Làm quiz"
            onPress={() => openQuizModeSelector(quiz, phaseId)}
            disabled={disabled}
            size="sm"
            fullWidth={false}
            variant="outline"
            style={styles.stageQuizButton}
          />
        </View>
        <View style={styles.stageQuizMetaWrap}>
          <View
            style={[
              styles.stageMetaChip,
              {
                borderColor:
                  outcomeMeta.tone === 'success'
                    ? '#86efac'
                    : outcomeMeta.tone === 'danger'
                    ? '#fecaca'
                    : colors.border,
                backgroundColor:
                  outcomeMeta.tone === 'success'
                    ? isDark
                      ? 'rgba(20,83,45,0.35)'
                      : '#f0fdf4'
                    : outcomeMeta.tone === 'danger'
                    ? isDark
                      ? 'rgba(127,29,29,0.35)'
                      : '#fef2f2'
                    : isDark
                    ? '#0f172a'
                    : '#ffffff',
              },
            ]}>
            <Icon name="checkbox-marked-circle-outline" size={12} color={outcomeColor} />
            <Text style={[styles.stageMetaText, {color: outcomeColor}]}>{outcomeMeta.label}</Text>
          </View>
          <View style={[styles.stageMetaChip, {borderColor: colors.border}]}>
            <Icon name="help-circle-outline" size={12} color={Colors.primary} />
            <Text style={[styles.stageMetaText, {color: colors.textSecondary}]}>
              {questionCount > 0 ? `${questionCount} câu` : 'Chưa có số câu'}
            </Text>
          </View>
          <View style={[styles.stageMetaChip, {borderColor: colors.border}]}>
            <Icon name="timer-outline" size={12} color={Colors.primary} />
            <Text style={[styles.stageMetaText, {color: colors.textSecondary}]}>
              {durationInMinutes > 0 ? `${durationInMinutes} phút` : 'Chưa có thời lượng'}
            </Text>
          </View>
          <View style={[styles.stageMetaChip, {borderColor: colors.border}]}>
            <Icon name="bookmark-check-outline" size={12} color={Colors.primary} />
            <Text style={[styles.stageMetaText, {color: colors.textSecondary}]}>
              {difficultyLabel || statusLabel}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderStageLockCard = (titleText: string, bodyText: string) => (
    <View
      style={[
        styles.stageLockCard,
        {
          borderColor: colors.border,
          backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : '#ffffff',
        },
      ]}>
      <View style={[styles.stageLockIcon, {backgroundColor: isDark ? '#334155' : '#f1f5f9'}]}>
        <Icon name="lock-outline" size={22} color={colors.textSecondary} />
      </View>
      <Text style={[styles.stageLockTitle, {color: colors.heading}]}>{titleText}</Text>
      <Text style={[styles.stageLockText, {color: colors.textSecondary}]}>{bodyText}</Text>
      {titleText.includes('Phase') ? (
        <Button
          title={isSelectedPhaseUnlocking ? 'Đang mở khóa...' : 'Mở khóa Phase'}
          onPress={() => handleUnlockSelectedPhase()}
          disabled={!isSelectedPhaseUnlockable}
          loading={isSelectedPhaseUnlocking}
          size="sm"
          fullWidth
          icon="lock-open-variant-outline"
        />
      ) : null}
    </View>
  );

  const renderStageRoadmapDetail = () => (
    <View style={styles.stageDetailStack}>
      <View style={styles.stageDetailIntro}>
        <Text style={[styles.stageDetailEyebrow, {color: '#10b981'}]}>Lộ trình trung tâm</Text>
        <Text style={[styles.stageDetailTitle, {color: colors.heading}]}>{roadmapStageTitle}</Text>
        <Text style={[styles.stageDetailText, {color: colors.textSecondary}]}>
          {roadmapStageDescription}
        </Text>
      </View>

      <View style={styles.stageStatsGrid}>
        {roadmapStageStats.map(item => (
          <View
            key={item.key}
            style={[
              styles.stageStatCard,
              {
                borderColor: colors.border,
                backgroundColor: isDark ? Colors.dark.surfaceVariant : '#f8fafc',
              },
            ]}>
            <Icon name={item.icon} size={18} color={item.color} />
            <Text style={[styles.stageStatValue, {color: colors.heading}]}>{item.value}</Text>
            <Text style={[styles.stageStatLabel, {color: colors.textSecondary}]}>{item.label}</Text>
          </View>
        ))}
      </View>

      {!hasRoadmapPhases ? (
        <View
          style={[
            styles.stageSectionCard,
            {borderColor: colors.border, backgroundColor: colors.surface},
          ]}>
          <Text style={[styles.stageSectionTitle, {color: colors.heading}]}>
            Chào mừng đến với lộ trình
          </Text>
          <Text style={[styles.stageDetailText, {color: colors.textSecondary}]}>
            Tạo giai đoạn bằng AI để bắt đầu lộ trình học từ các tài liệu đã chọn.
          </Text>
          <Button
            title="Tạo giai đoạn"
            onPress={() => handleGenerateRoadmapPhases(activeRoadmapId)}
            loading={runningAction === 'phases' || generatingRoadmapPhases}
            disabled={!canGenerateRoadmapPhases}
            icon="timeline-plus-outline"
            size="sm"
            fullWidth={false}
            style={styles.stagePrimaryAction}
          />
          {generatingRoadmapPhases ? renderPhaseGenerationLoader() : null}
        </View>
      ) : (
        <Button
          title="Làm mới roadmap"
          onPress={handleRefreshRoadmap}
          loading={runningAction === 'refresh-roadmap'}
          icon="refresh"
          size="sm"
          variant="outline"
          fullWidth={false}
          style={styles.stagePrimaryAction}
        />
      )}
    </View>
  );

  const renderStagePhaseReview = () => {
    const isReviewForActivePhase = Number(phaseReviewState.phaseId) === Number(activePhase?.phaseId);
    if (phaseReviewState.loading && isReviewForActivePhase) {
      return (
        <View
          style={[
            styles.stageReviewCard,
            {borderColor: colors.border, backgroundColor: colors.surface},
          ]}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={[styles.stageReviewText, {color: colors.textSecondary}]}>
            Đang đồng bộ đánh giá AI cho phase hiện tại...
          </Text>
        </View>
      );
    }

    if (!phaseReviewState?.data?.summary || !isReviewForActivePhase) {
      return null;
    }

    return (
      <View
        style={[
          styles.stageReviewCard,
          {
            borderColor: isDark ? '#14532d' : '#86efac',
            backgroundColor: isDark ? 'rgba(20,83,45,0.3)' : '#f0fdf4',
          },
        ]}>
        <Text style={[styles.stageReviewTitle, {color: isDark ? '#bbf7d0' : '#166534'}]}>
          Đánh giá AI cho phase hiện tại
        </Text>
        {typeof phaseReviewConfidencePercent === 'number' ? (
          <Text style={[styles.stageReviewMeta, {color: isDark ? '#dcfce7' : '#166534'}]}>
            Độ tin cậy: {phaseReviewConfidencePercent}%
          </Text>
        ) : null}
        <Text style={[styles.stageReviewText, {color: isDark ? '#dcfce7' : '#166534'}]}>
          {phaseReviewState.data.summary}
        </Text>
        {phaseReviewAssessedAtLabel ? (
          <Text style={[styles.stageReviewMeta, {color: isDark ? '#bbf7d0' : '#166534'}]}>
            Đánh giá lúc: {phaseReviewAssessedAtLabel}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderStageKnowledgeRows = () => {
    if (activePhaseKnowledges.length === 0 && activePhaseShouldShowKnowledgePlaceholder) {
      return null;
    }

    if (activePhaseKnowledges.length === 0) {
      return (
        <Text style={[styles.stageEmptyText, {color: colors.textSecondary}]}>
          Chưa có knowledge trong phase này.
        </Text>
      );
    }

    return activePhaseKnowledges.map((knowledge: any, index: number) => {
      const knowledgeId = normalizePositiveId(knowledge?.knowledgeId || knowledge?.id);
      const knowledgeStatus = String(knowledge?.status || '').toUpperCase();
      const lockState = resolveKnowledgeLockState(activePhase, selectedPhaseIndex, index);
      const isKnowledgeLocked =
        knowledgeStatus === 'LOCKED' ||
        lockState.isPhaseLockedForKnowledge ||
        lockState.isKnowledgeLockedBySequence;
      const isKnowledgeCompleted =
        isCompletedKnowledge(knowledge) ||
        isPhaseFinishedStatus(activePhase?.status) ||
        isActivePhaseBeforeCurrentKnowledge ||
        (
          activePhaseIndex === currentKnowledgePhaseIndex &&
          activePhaseCurrentKnowledgeIndex >= 0 &&
          (
            index < activePhaseCurrentKnowledgeIndex ||
            (index === activePhaseCurrentKnowledgeIndex && isCurrentKnowledgeDoneStatus)
          )
        );
      const isKnowledgeCurrent =
        activePhaseIndex === currentKnowledgePhaseIndex &&
        activePhaseCurrentKnowledgeIndex === index &&
        !isCurrentKnowledgeDoneStatus;
      const isSelected = Number(selectedKnowledgeId || 0) === knowledgeId;
      const quizCount =
        toArray(knowledge?.quizzes).filter(isReadyRoadmapQuiz).length ||
        toArray(knowledgeQuizMap[knowledgeId]).filter(isReadyRoadmapQuiz).length;

      return (
        <TouchableOpacity
          key={`stage-knowledge-row-${knowledgeId || index}`}
          onPress={() => selectStageKnowledge(activePhaseId, knowledgeId)}
          style={[
            styles.stageKnowledgeRowCard,
            {
              borderColor: isSelected ? '#38bdf8' : colors.border,
              backgroundColor: isSelected
                ? isDark
                  ? 'rgba(14,165,233,0.18)'
                  : '#ecfeff'
                : isKnowledgeLocked
                ? isDark
                  ? '#334155'
                  : '#f1f5f9'
                : isDark
                ? Colors.dark.surfaceVariant
                : '#f8fafc',
            },
          ]}>
          <View
            style={[
              styles.stageKnowledgeStatusIcon,
              {
                borderColor: isKnowledgeCompleted
                  ? '#86efac'
                  : isKnowledgeCurrent
                  ? '#7dd3fc'
                  : colors.border,
                backgroundColor: isKnowledgeCompleted
                  ? isDark
                    ? 'rgba(22,101,52,0.28)'
                    : '#dcfce7'
                  : isKnowledgeCurrent
                  ? isDark
                    ? 'rgba(3,105,161,0.28)'
                    : '#e0f2fe'
                  : colors.surface,
              },
            ]}>
            <Icon
              name={
                isKnowledgeCompleted
                  ? 'check'
                  : isKnowledgeLocked
                  ? 'lock-outline'
                  : isKnowledgeCurrent
                  ? 'progress-clock'
                  : 'circle-outline'
              }
              size={13}
              color={
                isKnowledgeCompleted
                  ? '#10b981'
                  : isKnowledgeCurrent
                  ? '#0ea5e9'
                  : isKnowledgeLocked
                  ? colors.textTertiary
                  : colors.textSecondary
              }
            />
          </View>
          <View style={styles.stageKnowledgeRowBody}>
            <Text numberOfLines={2} style={[styles.stageKnowledgeRowTitle, {color: colors.heading}]}>
              {knowledge?.title || `Knowledge ${index + 1}`}
            </Text>
            <Text numberOfLines={2} style={[styles.stageKnowledgeRowText, {color: colors.textSecondary}]}>
              {knowledge?.description || `${quizCount} quiz`}
            </Text>
            <Text
              style={[
                styles.stageKnowledgeStateText,
                {
                  color: isKnowledgeCompleted
                    ? '#10b981'
                    : isKnowledgeCurrent
                    ? '#0ea5e9'
                    : isKnowledgeLocked
                    ? colors.textTertiary
                    : Colors.primary,
                },
              ]}>
              {isKnowledgeCompleted
                ? 'Hoàn thành'
                : isKnowledgeCurrent
                ? 'Đang học'
                : isKnowledgeLocked
                ? 'Đã khóa'
                : 'Sẵn sàng'}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textTertiary} />
        </TouchableOpacity>
      );
    });
  };

  const renderStagePhaseDetail = () => {
    if (!activePhase) {
      return renderStageRoadmapDetail();
    }

    const phaseDurationLabel = formatPhaseDurationLabel(activePhase);
    const phaseVisualState = getPhaseVisualState(activePhase, selectedPhaseIndex, isSelectedPhaseLocked);
    const phaseVisualMeta = getPhaseVisualMeta(phaseVisualState);
    const shouldShowStudyNewPrompt =
      isStudyNewRoadmap &&
      activePhasePreLearningQuizzes.length === 0 &&
      !activePhaseHasKnowledge &&
      !activePhaseShouldShowPreLearningPlaceholder &&
      !activePhaseShouldShowKnowledgePlaceholder;
    const shouldShowReviewPrompt =
      !isStudyNewRoadmap &&
      activePhasePreLearningQuizzes.length === 0 &&
      !activePhaseHasKnowledge &&
      !activePhaseShouldShowPreLearningPlaceholder &&
      !activePhaseShouldShowKnowledgePlaceholder;

    return (
      <View style={styles.stageDetailStack}>
        {isSelectedPhaseLocked
          ? renderStageLockCard(
              'Phase này đang bị khóa',
              'Mở khóa phase để xem pre-learning, knowledge và quiz bên trong.',
            )
          : null}

        <View
          pointerEvents={isSelectedPhaseLocked ? 'none' : 'auto'}
          style={[styles.stageDetailStack, isSelectedPhaseLocked ? styles.stageDimmedContent : null]}>
          <View style={styles.stageDetailIntro}>
            <View style={styles.stageDetailTitleRow}>
              <View style={[styles.stageStatusBadge, {borderColor: phaseVisualMeta.badgeBorder, backgroundColor: phaseVisualMeta.badgeBackground}]}>
                <Icon name={phaseVisualMeta.icon} size={13} color={phaseVisualMeta.badgeText} />
                <Text style={[styles.stageStatusBadgeText, {color: phaseVisualMeta.badgeText}]}>
                  {phaseVisualMeta.label}
                </Text>
              </View>
            </View>
            <Text style={[styles.stageDetailEyebrow, {color: '#0ea5e9'}]}>
              Chi tiết phase
            </Text>
            <Text style={[styles.stageDetailTitle, {color: colors.heading}]}>
              {activePhase?.title || 'Chi tiết giai đoạn'}
            </Text>
            <View style={styles.stageInlineChips}>
              {phaseDurationLabel ? (
                <View style={[styles.stageMetaChip, {borderColor: colors.border}]}>
                  <Icon name="timer-outline" size={12} color={colors.textSecondary} />
                  <Text style={[styles.stageMetaText, {color: colors.textSecondary}]}>
                    {phaseDurationLabel}
                  </Text>
                </View>
              ) : null}
              <View style={[styles.stageMetaChip, {borderColor: colors.border}]}>
                <Icon name="source-branch" size={12} color={colors.textSecondary} />
                <Text style={[styles.stageMetaText, {color: colors.textSecondary}]}>
                  {activePhaseKnowledges.length} knowledge
                </Text>
              </View>
            </View>
            <Text style={[styles.stageDetailText, {color: colors.textSecondary}]}>
              {activePhase?.description || 'Chọn một knowledge hoặc quiz để tiếp tục.'}
            </Text>
          </View>

          {renderStagePhaseReview()}

          {activePhaseShouldShowPreLearningPlaceholder
            ? renderStageLoadingCard(
                'Đang tạo quiz trước học',
                'AI đang chuẩn bị pre-learning cho phase này.',
                activePhasePreLearningPercent,
              )
            : null}

          {activePhasePreLearningQuizzes.length > 0 ? (
            <View
              style={[
                styles.stageSectionCard,
                {borderColor: colors.border, backgroundColor: colors.surface},
              ]}>
              <Text style={[styles.stageSectionTitle, {color: colors.heading}]}>Pre-learning</Text>
              <View style={styles.stageSectionList}>
                {activePhasePreLearningQuizzes.map((quiz: any, index: number) =>
                  renderStageQuizCard(quiz, `stage-prelearning-${index}`, activePhaseId),
                )}
              </View>
            </View>
          ) : null}

          {canShowActiveSkipDecisionAfterPreLearning || canShowActiveGenerateKnowledgeFallback ? (
            <View
              style={[
                styles.stageDecisionCard,
                {
                  borderColor: isDark ? '#1e3a8a' : '#bfdbfe',
                  backgroundColor: isDark ? 'rgba(30,58,138,0.25)' : '#eff6ff',
                },
              ]}>
              <Text style={[styles.stageDecisionTitle, {color: isDark ? '#bfdbfe' : '#1e3a8a'}]}>
                Quyết định sau Pre-learning
              </Text>
              {canShowActiveSkipDecisionAfterPreLearning ? (
                <>
                  <Text style={[styles.stageDecisionText, {color: isDark ? '#dbeafe' : '#1e3a8a'}]}>
                    Bạn đủ điều kiện bỏ qua phase này hoặc tiếp tục học sâu hơn.
                  </Text>
                  <View style={styles.stageActionStack}>
                    <Button
                      title="Bỏ qua phase"
                      onPress={() => handlePreLearningDecision(activePhaseId, true)}
                      loading={submittingPreLearningDecision}
                      variant="outline"
                      size="sm"
                      fullWidth
                      icon="skip-next"
                    />
                    <Button
                      title="Tiếp tục học phase này"
                      onPress={() => handlePreLearningDecision(activePhaseId, false)}
                      loading={submittingPreLearningDecision}
                      size="sm"
                      fullWidth
                      icon="book-open-variant"
                    />
                  </View>
                </>
              ) : null}
              {canShowActiveGenerateKnowledgeFallback ? (
                <Button
                  title="Tạo nội dung cho phase"
                  onPress={() => handlePreLearningDecision(activePhaseId, false)}
                  loading={submittingPreLearningDecision}
                  size="sm"
                  fullWidth
                  icon="lightning-bolt-outline"
                />
              ) : null}
            </View>
          ) : null}

          {shouldShowStudyNewPrompt ? (
            <View
              style={[
                styles.stageDecisionCard,
                {
                  borderColor: isDark ? '#1e3a8a' : '#bfdbfe',
                  backgroundColor: isDark ? 'rgba(30,58,138,0.22)' : '#eff6ff',
                },
              ]}>
              <Text style={[styles.stageDecisionTitle, {color: isDark ? '#dbeafe' : '#1e3a8a'}]}>
                Bạn đã có nền tảng ở phase này chưa?
              </Text>
              <Text style={[styles.stageDecisionText, {color: isDark ? '#c7d2fe' : '#1e3a8a'}]}>
                Nếu chưa, hệ thống sẽ tạo nội dung phase. Nếu có rồi, hệ thống sẽ tạo pre-learning.
              </Text>
              <View style={styles.stageActionStack}>
                <Button
                  title="Tôi đã có nền tảng"
                  onPress={() => handleGeneratePreLearning(Number(activeRoadmapId || 0), activePhaseId)}
                  loading={runningAction === `pre-${activePhaseId}` || activePhaseIsGeneratingPreLearning}
                  variant="outline"
                  size="sm"
                  fullWidth
                  icon="book-open-page-variant-outline"
                />
                <Button
                  title="Tôi là người mới"
                  onPress={() => handleGeneratePhaseContent(Number(activeRoadmapId || 0), activePhaseId, true)}
                  loading={runningAction === `content-${activePhaseId}` || activePhaseIsGeneratingKnowledge}
                  size="sm"
                  fullWidth
                  icon="sparkles"
                />
              </View>
            </View>
          ) : null}

          {shouldShowReviewPrompt ? (
            <View
              style={[
                styles.stageSectionCard,
                {borderColor: colors.border, backgroundColor: colors.surface},
              ]}>
              <Text style={[styles.stageSectionTitle, {color: colors.heading}]}>Bắt đầu phase này</Text>
              <Text style={[styles.stageDetailText, {color: colors.textSecondary}]}>
                Tạo quiz trước học hoặc tạo trực tiếp nội dung giai đoạn.
              </Text>
              <View style={styles.stageActionRow}>
                <Button
                  title="Tạo quiz trước học"
                  onPress={() => handleGeneratePreLearning(Number(activeRoadmapId || 0), activePhaseId)}
                  loading={runningAction === `pre-${activePhaseId}` || activePhaseIsGeneratingPreLearning}
                  size="sm"
                  variant="outline"
                  fullWidth={false}
                  icon="book-open-page-variant-outline"
                />
                <Button
                  title="Tạo nội dung"
                  onPress={() => handleGeneratePhaseContent(Number(activeRoadmapId || 0), activePhaseId)}
                  loading={runningAction === `content-${activePhaseId}` || activePhaseIsGeneratingKnowledge}
                  size="sm"
                  fullWidth={false}
                  icon="sparkles"
                />
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.stageSectionCard,
              {borderColor: colors.border, backgroundColor: colors.surface},
            ]}>
            <View style={styles.stageSectionHeader}>
              <Text style={[styles.stageSectionTitle, {color: colors.heading}]}>Knowledge</Text>
              <Text style={[styles.stageSectionHint, {color: colors.textSecondary}]}>
                {activePhaseCompletedKnowledgeCount}/{activePhaseKnowledges.length}
              </Text>
            </View>
            {activePhaseShouldShowKnowledgePlaceholder
              ? renderStageLoadingCard(
                  'Đang tạo nội dung phase',
                  'AI đang tạo knowledge và quiz luyện tập cho phase này.',
                  activePhaseKnowledgePercent,
                )
              : null}
            <View style={styles.stageSectionList}>{renderStageKnowledgeRows()}</View>
          </View>

          {activePhasePostLearningQuizzes.length > 0 ? (
            <View
              style={[
                styles.stageSectionCard,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  opacity: activePhaseShouldLockPostLearning ? 0.58 : 1,
                },
              ]}>
              <Text style={[styles.stageSectionTitle, {color: colors.heading}]}>Post-learning</Text>
              {activePhaseShouldLockPostLearning ? (
                <Text style={[styles.stageEmptyText, {color: colors.textSecondary}]}>
                  Hoàn thành knowledge trong phase để mở quiz sau học ({activePhaseCompletedKnowledgeCount}/{activePhaseKnowledges.length}).
                </Text>
              ) : null}
              <View style={styles.stageSectionList}>
                {activePhasePostLearningQuizzes.map((quiz: any, index: number) =>
                  renderStageQuizCard(
                    quiz,
                    `stage-postlearning-${index}`,
                    activePhaseId,
                    activePhaseShouldLockPostLearning,
                  ),
                )}
              </View>
            </View>
          ) : null}

          {canShowActiveRemedialDecision ? (
            <View
              style={[
                styles.stageDecisionCard,
                {
                  borderColor: isDark ? '#1e3a8a' : '#bfdbfe',
                  backgroundColor: isDark ? 'rgba(30,58,138,0.25)' : '#eff6ff',
                },
              ]}>
              <Text style={[styles.stageDecisionTitle, {color: isDark ? '#bfdbfe' : '#1e3a8a'}]}>
                Quyết định sau Post-learning
              </Text>
              <Text style={[styles.stageDecisionText, {color: isDark ? '#dbeafe' : '#1e3a8a'}]}>
                Kết quả post-learning chưa đạt. Chọn cách thêm phase remedial cho lộ trình.
              </Text>
              <View style={styles.stageActionStack}>
                <Button
                  title="Tạo remedial và giữ deadline"
                  onPress={() => handleRemedialDecision(activePhaseId, 'COMPRESS_TO_KEEP_DEADLINE')}
                  loading={submittingRemedialDecision}
                  size="sm"
                  fullWidth
                  icon="check-circle-outline"
                />
                <Button
                  title="Tạo remedial và gia hạn deadline"
                  onPress={() => handleRemedialDecision(activePhaseId, 'EXTEND_DEADLINE')}
                  loading={submittingRemedialDecision}
                  size="sm"
                  variant="outline"
                  fullWidth
                  icon="calendar-clock-outline"
                />
              </View>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const renderStageKnowledgeDetail = () => {
    if (!selectedKnowledge || !activePhase) {
      return renderStagePhaseDetail();
    }

    const flashcards = toArray(selectedKnowledge?.flashcards || selectedKnowledge?.flashcardSets);
    const canCreateKnowledgeQuiz =
      Number(activeRoadmapId || 0) > 0 && Number(selectedKnowledgeId || 0) > 0;

    return (
      <View style={styles.stageDetailStack}>
        {isSelectedKnowledgeLocked
          ? renderStageLockCard(
              'Knowledge này đang bị khóa',
              'Hãy hoàn thành knowledge trước đó để mở phần này.',
            )
          : null}

        <View
          pointerEvents={isSelectedKnowledgeLocked ? 'none' : 'auto'}
          style={[styles.stageDetailStack, isSelectedKnowledgeLocked ? styles.stageDimmedContent : null]}>
          <View style={styles.stageDetailIntro}>
            <Text style={[styles.stageDetailEyebrow, {color: '#10b981'}]}>
              Chi tiết knowledge
            </Text>
            <Text style={[styles.stageDetailTitle, {color: colors.heading}]}>
              {selectedKnowledge?.title || 'Knowledge'}
            </Text>
            <Text style={[styles.stageDetailSubText, {color: colors.textSecondary}]}>
              {activePhase?.title || 'Phase hiện tại'}
            </Text>
            <Text style={[styles.stageDetailText, {color: colors.textSecondary}]}>
              {selectedKnowledge?.description || 'Xem quiz và học liệu của knowledge này.'}
            </Text>
          </View>

          <View
            style={[
              styles.stageSectionCard,
              {borderColor: colors.border, backgroundColor: colors.surface},
            ]}>
            <View style={styles.stageSectionHeader}>
              <Text style={[styles.stageSectionTitle, {color: colors.heading}]}>Quiz</Text>
              {selectedKnowledgeQuizzes.length === 0 ? (
                <Button
                  title="Tạo quiz"
                  size="sm"
                  fullWidth={false}
                  onPress={() => {
                    if (canCreateKnowledgeQuiz) {
                      handleGenerateKnowledgeQuiz(
                        Number(activeRoadmapId || 0),
                        Number(selectedKnowledgeId || 0),
                      );
                    }
                  }}
                  loading={
                    runningAction === `knowledge-${Number(selectedKnowledgeId || 0)}` ||
                    selectedKnowledgeIsGeneratingQuiz
                  }
                  disabled={!canCreateKnowledgeQuiz}
                  icon="school-outline"
                />
              ) : null}
            </View>
            {selectedKnowledgeIsGeneratingQuiz
              ? renderStageLoadingCard(
                  'Đang tạo quiz kiến thức',
                  'AI đang tạo quiz cho knowledge này.',
                  activePhaseKnowledgePercent,
                )
              : null}
            {selectedKnowledgeQuizzes.length > 0 ? (
              <View style={styles.stageSectionList}>
                {selectedKnowledgeQuizzes.map((quiz: any, index: number) =>
                  renderStageQuizCard(quiz, `stage-knowledge-quiz-${index}`, activePhaseId),
                )}
              </View>
            ) : selectedKnowledgeIsGeneratingQuiz ? null : (
              <Text style={[styles.stageEmptyText, {color: colors.textSecondary}]}>
                Chưa có quiz cho knowledge này.
              </Text>
            )}
          </View>

          {flashcards.length > 0 ? (
            <View
              style={[
                styles.stageSectionCard,
                {
                  borderColor: isDark ? '#92400e' : '#fde68a',
                  backgroundColor: isDark ? 'rgba(120,53,15,0.24)' : '#fffbeb',
                },
              ]}>
              <Text style={[styles.stageSectionTitle, {color: isDark ? '#fcd34d' : '#92400e'}]}>
                Flashcard
              </Text>
              <View style={styles.stageSectionList}>
                {flashcards.map((flashcard: any, index: number) => (
                  <View key={`stage-flashcard-${flashcard?.flashcardSetId || flashcard?.id || index}`} style={styles.stageFlashcardRow}>
                    <Icon name="cards-outline" size={16} color={isDark ? '#fcd34d' : '#92400e'} />
                    <View style={{flex: 1}}>
                      <Text style={[styles.stageKnowledgeRowTitle, {color: colors.heading}]} numberOfLines={2}>
                        {flashcard?.title || flashcard?.flashcardSetName || `Flashcard ${index + 1}`}
                      </Text>
                      <Text style={[styles.stageKnowledgeRowText, {color: colors.textSecondary}]}>
                        {Number(flashcard?.cardCount ?? flashcard?.itemCount ?? 0) || 0} thẻ
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const renderStageDetailContent = () => {
    if (effectiveStageSelectedType === 'knowledge') {
      return renderStageKnowledgeDetail();
    }
    if (effectiveStageSelectedType === 'phase') {
      return renderStagePhaseDetail();
    }
    return renderStageRoadmapDetail();
  };

  const renderRoadmapStage = () => (
    <View
      style={[
        styles.stageShell,
        {
          borderColor: colors.border,
          backgroundColor: isDark ? 'rgba(15,23,42,0.9)' : '#ffffff',
        },
      ]}>
      <View style={[styles.stageTopBar, {borderBottomColor: colors.border}]}>
        <TouchableOpacity onPress={selectStageRoadmap} style={styles.stageTopTitleWrap}>
          <View style={[styles.stageStatusDot, {backgroundColor: '#10b981'}]} />
          <View style={styles.stageTopTitleBody}>
            <Text style={[styles.stageTopTitle, {color: colors.heading}]}>Lộ trình theo giai đoạn</Text>
            <Text style={[styles.stageTopSubtitle, {color: colors.textSecondary}]} numberOfLines={1}>
              {roadmapStageTitle}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            animateLayout();
            if (!roadmapStageCollapsed) {
              setExpandedStagePhaseId(null);
            }
            setRoadmapStageCollapsed(current => !current);
          }}
          style={[styles.stageIconButton, {borderColor: colors.border}]}>
          <Icon
            name={roadmapStageCollapsed ? 'chevron-down' : 'chevron-up'}
            size={18}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {!roadmapStageCollapsed ? (
        <View
          style={[
            styles.stageMapViewport,
            shouldShowStageKnowledgeBranch
              ? styles.stageMapViewportExpanded
              : styles.stageMapViewportCompact,
            {backgroundColor: isDark ? '#020617' : '#f8fafc'},
          ]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.stageMapContent,
              {minWidth: stageMapContentWidth, width: stageMapContentWidth},
            ]}>
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                styles.stageMapBackdrop,
                {borderColor: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.16)'},
              ]}
            />

            <View style={styles.stageNodeRow}>
              <TouchableOpacity
                onPress={selectStageRoadmap}
                style={[
                  styles.stageRoadmapNode,
                  {
                    width: STAGE_ROADMAP_CARD_WIDTH,
                    borderColor:
                      effectiveStageSelectedType === 'roadmap' ? '#10b981' : colors.border,
                    backgroundColor:
                      effectiveStageSelectedType === 'roadmap'
                        ? isDark
                          ? 'rgba(20,83,45,0.3)'
                          : '#ecfdf5'
                        : isDark
                        ? 'rgba(15,23,42,0.96)'
                        : '#ffffff',
                  },
                ]}>
                <Text style={[styles.stageNodeEyebrow, {color: '#10b981'}]}>
                  Lộ trình trung tâm
                </Text>
                <Text numberOfLines={3} style={[styles.stageNodeTitle, {color: colors.heading}]}>
                  {roadmapStageTitle}
                </Text>
                <Text style={[styles.stageNodeMeta, {color: colors.textSecondary}]}>
                  {phases.length} phase • {roadmapStageContextLabel}
                </Text>
              </TouchableOpacity>

              {phases.map((phase: any, index: number) => {
                const phaseId = normalizePositiveId(phase?.phaseId || phase?.id);
                const hasPreLearningQuiz = hasReadyRoadmapQuiz(phase?.preLearningQuizzes);
                const isLockedPhase =
                  index > maxUnlockedPhaseIndex &&
                  !hasPreLearningQuiz &&
                  !isCurrentPhaseByPayload(phaseId);
                const isGeneratingPreLearningForPhase = generatingPreLearningPhaseIds.includes(phaseId);
                const isGeneratingKnowledgeForPhase =
                  generatingKnowledgePhaseIds.includes(phaseId) ||
                  generatingKnowledgeQuizPhaseIds.includes(phaseId);
                const isProcessingPhase =
                  !isPhaseEffectivelyDone(phase) &&
                  !isLockedPhase &&
                  (
                    String(phase?.status || '').toUpperCase() === 'PROCESSING' ||
                    isGeneratingPreLearningForPhase ||
                    isGeneratingKnowledgeForPhase
                  );
                const progressPercent = isGeneratingPreLearningForPhase
                  ? getProgressForPhase(preLearningProgressByPhaseId, phaseId)
                  : isGeneratingKnowledgeForPhase
                  ? getProgressForPhase(knowledgeProgressByPhaseId, phaseId)
                  : 0;
                const isSelected =
                  effectiveStageSelectedType !== 'roadmap' && Number(selectedPhaseId) === phaseId;
                const isCompletedPhase = isPhaseEffectivelyDone(phase);

                return (
                  <View key={`stage-phase-node-${phaseId || index}`} style={styles.stagePhaseCluster}>
                    <View
                      style={[
                        styles.stageHorizontalConnector,
                        {backgroundColor: isDark ? '#334155' : '#bfdbfe'},
                      ]}
                    />
                    <TouchableOpacity
                      onPress={() => selectStagePhase(phaseId)}
                      style={[
                        styles.stagePhaseNode,
                        {
                          width: STAGE_PHASE_CARD_WIDTH,
                          borderColor: isSelected ? '#0ea5e9' : colors.border,
                          backgroundColor: isSelected
                            ? isDark
                              ? 'rgba(14,165,233,0.2)'
                              : '#e0f2fe'
                            : isLockedPhase
                            ? isDark
                              ? 'rgba(51,65,85,0.72)'
                              : '#f1f5f9'
                            : isDark
                            ? 'rgba(15,23,42,0.96)'
                            : '#ffffff',
                          opacity: isLockedPhase && !isSelected ? 0.82 : 1,
                        },
                      ]}>
                      <View style={styles.stageNodeHeader}>
                        <Text style={[styles.stageNodeEyebrow, {color: '#0ea5e9'}]}>
                          Phase {index + 1}
                        </Text>
                        {isCompletedPhase ? (
                          <Icon name="check-circle-outline" size={16} color="#10b981" />
                        ) : isProcessingPhase ? (
                          <ActivityIndicator size="small" color="#f59e0b" />
                        ) : isLockedPhase ? (
                          <Icon name="lock-outline" size={16} color={colors.textTertiary} />
                        ) : null}
                      </View>
                      <Text numberOfLines={3} style={[styles.stageNodeTitle, {color: colors.heading}]}>
                        {phase?.title || `Giai đoạn ${index + 1}`}
                      </Text>
                      {(isGeneratingPreLearningForPhase || isGeneratingKnowledgeForPhase) ? (
                        <View style={styles.stageNodeProgressWrap}>
                          <View
                            style={[
                              styles.stageNodeProgressTrack,
                              {backgroundColor: isDark ? '#334155' : '#dbeafe'},
                            ]}>
                            <View
                              style={[
                                styles.stageNodeProgressFill,
                                {width: `${progressPercent}%`},
                              ]}
                            />
                          </View>
                          <Text style={[styles.stageNodeProgressText, {color: Colors.primary}]}>
                            {progressPercent}%
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {shouldShowStageKnowledgeBranch ? (
              <View style={[styles.stageKnowledgeBranch, {paddingLeft: knowledgeBranchOffset}]}>
                <View
                  style={[
                    styles.stageBranchStem,
                    {
                      left: knowledgeBranchOffset + 18,
                      backgroundColor: isDark ? '#334155' : '#bfdbfe',
                    },
                  ]}
                />
                <View
                  style={[
                    styles.stageBranchLine,
                    {
                      width: knowledgeBranchLineWidth,
                      backgroundColor: isDark ? '#334155' : '#bfdbfe',
                    },
                  ]}
                />
                <View style={styles.stageKnowledgeNodeRow}>
                  {activePhaseKnowledges.map((knowledge: any, index: number) => {
                    const knowledgeId = normalizePositiveId(knowledge?.knowledgeId || knowledge?.id);
                    const active = effectiveStageSelectedType === 'knowledge' && Number(selectedKnowledgeId) === knowledgeId;
                    const knowledgeStatus = String(knowledge?.status || '').toUpperCase();
                    const knowledgeLockState = resolveKnowledgeLockState(activePhase, selectedPhaseIndex, index);
                    const isLocked =
                      knowledgeStatus === 'LOCKED' ||
                      knowledgeLockState.isPhaseLockedForKnowledge ||
                      knowledgeLockState.isKnowledgeLockedBySequence;
                    const knowledgeQuizRequestKey = `${activePhaseId}:${knowledgeId}`;
                    const isProcessing =
                      !isCompletedKnowledge(knowledge) &&
                      !isLocked &&
                      (
                        knowledgeStatus === 'PROCESSING' ||
                        knowledgeStatus === 'GENERATING' ||
                        generatingKnowledgeQuizKnowledgeKeys.includes(knowledgeQuizRequestKey)
                      );
                    const isCompleted =
                      isCompletedKnowledge(knowledge) ||
                      isPhaseFinishedStatus(activePhase?.status) ||
                      (
                        activePhaseIndex === currentKnowledgePhaseIndex &&
                        activePhaseCurrentKnowledgeIndex >= 0 &&
                        (
                          index < activePhaseCurrentKnowledgeIndex ||
                          (index === activePhaseCurrentKnowledgeIndex && isCurrentKnowledgeDoneStatus)
                        )
                      );

                    return (
                      <TouchableOpacity
                        key={`stage-knowledge-node-${knowledgeId || index}`}
                        onPress={() =>
                          selectStageKnowledge(activePhaseId, knowledgeId, {
                            expandTopBranch: true,
                          })
                        }
                        style={[
                          styles.stageKnowledgeNode,
                          {
                            width: STAGE_KNOWLEDGE_CARD_WIDTH,
                            borderColor: active ? '#10b981' : colors.border,
                            backgroundColor: active
                              ? isDark
                                ? 'rgba(20,83,45,0.26)'
                                : '#ecfdf5'
                              : isLocked
                              ? isDark
                                ? 'rgba(51,65,85,0.72)'
                                : '#f1f5f9'
                              : isDark
                              ? 'rgba(15,23,42,0.96)'
                              : '#ffffff',
                            opacity: isLocked && !active ? 0.82 : 1,
                          },
                        ]}>
                        <View
                          style={[
                            styles.stageKnowledgeStem,
                            {backgroundColor: isDark ? '#334155' : '#bfdbfe'},
                          ]}
                        />
                        <View style={styles.stageNodeHeader}>
                          <Text style={[styles.stageNodeEyebrow, {color: '#10b981'}]}>
                            Knowledge {index + 1}
                          </Text>
                          {isCompleted ? (
                            <Icon name="check-circle-outline" size={15} color="#10b981" />
                          ) : isProcessing ? (
                            <ActivityIndicator size="small" color="#f59e0b" />
                          ) : isLocked ? (
                            <Icon name="lock-outline" size={15} color={colors.textTertiary} />
                          ) : null}
                        </View>
                        <Text numberOfLines={3} style={[styles.stageKnowledgeNodeTitle, {color: colors.heading}]}>
                          {knowledge?.title || `Knowledge ${index + 1}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      <View
        style={[
          styles.stageDetailPanel,
          {borderColor: colors.border, backgroundColor: colors.surface},
        ]}>
        <View style={[styles.stageDetailPanelHeader, {borderBottomColor: colors.border}]}>
          <View style={styles.stageDetailPanelTitleWrap}>
            <Text style={[styles.stagePanelTitle, {color: colors.heading}]}>Chi tiết lộ trình</Text>
            <Text style={[styles.stagePanelHint, {color: colors.textSecondary}]}>
              {effectiveStageSelectedType === 'knowledge'
                ? 'Knowledge, quiz và flashcard liên quan.'
                : effectiveStageSelectedType === 'phase'
                ? 'Pre-learning, knowledge, post-learning và quyết định học.'
                : 'Thông tin tổng quan của roadmap trung tâm.'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setJourneyPanelVisible(true)}
            style={[styles.stageIconButton, {borderColor: colors.border}]}>
            <Icon name="format-list-bulleted" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.stageDetailPanelBody}>{renderStageDetailContent()}</View>
      </View>
    </View>
  );

  const showLegacyDetailList = false;

  const renderGenerationProgress = (percent: number) => {
    const displayPercent = clampPercent(percent);
    return (
      <View style={styles.generationProgressWrap}>
        <View
          style={[
            styles.generationProgressTrack,
            {backgroundColor: isDark ? '#334155' : '#e2e8f0'},
          ]}>
          <View
            style={[
              styles.generationProgressFill,
              {width: `${displayPercent}%`},
            ]}
          />
        </View>
        <Text style={[styles.generationPercentText, {color: colors.textSecondary}]}>
          {displayPercent}%
        </Text>
      </View>
    );
  };

  const renderPhaseGenerationLoader = () => (
    <View
      style={[
        styles.phaseGenerationLoader,
        {borderColor: colors.border, backgroundColor: colors.surface},
      ]}>
      <ActivityIndicator size="small" color={Colors.primary} />
      <Text style={[styles.phaseGenerationTitle, {color: colors.heading}]}>
        Vui lòng chờ AI tạo các giai đoạn
      </Text>
      <Text style={[styles.phaseGenerationText, {color: colors.textSecondary}]}>
        Hệ thống đang tạo danh sách giai đoạn từ các tài liệu đã chọn.
      </Text>
      {renderGenerationProgress(roadmapPhaseGenerationProgress)}
    </View>
  );

  const renderMaterialPickerSection = () => (
    <View
      style={[
        styles.materialPickerCard,
        {borderColor: colors.border, backgroundColor: colors.surface},
      ]}>
      <View style={styles.materialPickerHeader}>
        <View style={{flex: 1}}>
          <Text style={[styles.materialPickerTitle, {color: colors.heading}]}>
            Tài liệu dùng để tạo giai đoạn
          </Text>
          <Text style={[styles.materialPickerSubtitle, {color: colors.textSecondary}]}>
            Chọn các tài liệu AI sẽ dùng khi soạn các giai đoạn lộ trình cho workspace này.
          </Text>
        </View>
        <View style={styles.materialPickerCounter}>
          <Text style={styles.materialPickerCounterText}>
            {selectedSelectableMaterialCount}/{selectableMaterialIds.length} đã chọn
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={toggleSelectAllMaterials}
        disabled={selectableMaterialIds.length === 0}
        style={[
          styles.selectAllButton,
          {
            borderColor: colors.border,
            opacity: selectableMaterialIds.length === 0 ? 0.45 : 1,
          },
        ]}>
        <Icon
          name={allSelectableMaterialsSelected ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
          size={18}
          color={Colors.primary}
        />
        <Text style={styles.selectAllText}>
          {allSelectableMaterialsSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
        </Text>
      </TouchableOpacity>

      {selectableMaterials.length === 0 ? (
        <View style={[styles.materialEmptyState, {backgroundColor: isDark ? '#0f172a' : '#f8fafc'}]}>
          <Text style={[styles.materialEmptyText, {color: colors.textSecondary}]}>
            Chưa có tài liệu để tạo giai đoạn.
          </Text>
        </View>
      ) : (
        <View style={styles.materialList}>
          {selectableMaterials.map((material: any) => {
            const materialId = normalizePositiveId(material?.materialId ?? material?.id);
            const selected = selectedMaterialIds.includes(materialId);
            const dateLabel = formatMaterialDate(material);
            return (
              <TouchableOpacity
                key={materialId || material?.title || material?.name}
                onPress={() => toggleMaterial(materialId, false)}
                style={[
                  styles.materialListItem,
                  {
                    borderColor: selected ? Colors.primary : colors.border,
                    backgroundColor: selected
                      ? isDark
                        ? 'rgba(37,99,235,0.18)'
                        : '#eff6ff'
                      : isDark
                      ? '#0f172a'
                      : '#ffffff',
                  },
                ]}>
                <Icon
                  name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                  size={22}
                  color={selected ? Colors.primary : colors.textTertiary}
                />
                <View style={{flex: 1}}>
                  <Text style={[styles.materialListName, {color: colors.heading}]} numberOfLines={2}>
                    {material?.title || material?.fileName || material?.name || `Tài liệu #${materialId}`}
                  </Text>
                  <View style={styles.materialMetaRow}>
                    <Text style={[styles.materialMetaText, {color: colors.textSecondary}]}>
                      {getMaterialTypeLabel(material)}
                    </Text>
                    {dateLabel ? (
                      <Text style={[styles.materialMetaText, {color: colors.textSecondary}]}>
                        {dateLabel}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderRoadmapConfigOption = (
    group: keyof RoadmapConfigValues,
    option: {key: string; label: string; description: string},
  ) => {
    const selected = roadmapConfigValues[group] === option.key;
    return (
      <TouchableOpacity
        key={option.key}
        onPress={() => updateRoadmapConfigField(group, option.key)}
        style={[
          styles.configOption,
          {
            borderColor: selected ? Colors.primary : colors.border,
            backgroundColor: selected
              ? isDark
                ? 'rgba(37,99,235,0.18)'
                : '#eff6ff'
              : colors.surface,
          },
        ]}>
        <View style={[styles.configRadio, {borderColor: selected ? Colors.primary : colors.border}]}>
          {selected ? <View style={styles.configRadioDot} /> : null}
        </View>
        <View style={{flex: 1}}>
          <Text style={[styles.configOptionTitle, {color: colors.heading}]}>{option.label}</Text>
          <Text style={[styles.configOptionText, {color: colors.textSecondary}]}>
            {option.description}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderRoadmapSetupScreen = () => (
    <View
      style={[
        styles.roadmapSetupScreen,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
      ]}>
      <View style={styles.roadmapSetupWelcome}>
        <View
          style={[
            styles.roadmapSetupIcon,
            {backgroundColor: isDark ? 'rgba(37,99,235,0.22)' : '#dbeafe'},
          ]}>
          <Icon name="book-open-page-variant-outline" size={34} color={Colors.primary} />
        </View>
        <Text style={[styles.roadmapSetupTitle, {color: colors.heading}]}>
          Chào mừng đến với lộ trình
        </Text>
        <Text style={[styles.roadmapSetupText, {color: colors.textSecondary}]}>
          Tạo giai đoạn bằng AI để bắt đầu lộ trình học từ các tài liệu đã chọn.
        </Text>
        <Button
          title="Tạo giai đoạn"
          onPress={() => handleGenerateRoadmapPhases(activeRoadmapId)}
          loading={runningAction === 'phases' || generatingRoadmapPhases}
          disabled={!canGenerateRoadmapPhases}
          icon="timeline-plus-outline"
          size="md"
          fullWidth={false}
          style={styles.roadmapSetupButton}
        />
        {generatingRoadmapPhases ? renderPhaseGenerationLoader() : null}
      </View>

      {renderMaterialPickerSection()}
    </View>
  );

  const totalDaysNumber = Number(roadmapConfigValues.estimatedTotalDays) || 0;
  const minutesPerDayNumber = Number(roadmapConfigValues.recommendedMinutesPerDay) || 0;
  const recommendedDays = getRecommendedRoadmapDays(
    roadmapConfigValues.knowledgeLoad,
    roadmapConfigValues.roadmapSpeedMode,
  );
  const recommendedMinutes = getRecommendedRoadmapMinutesPerDay(
    roadmapConfigValues.knowledgeLoad,
    totalDaysNumber || recommendedDays,
  );
  const selectedSpeedLabel =
    ROADMAP_SPEED_OPTIONS.find(option => option.key === roadmapConfigValues.roadmapSpeedMode)
      ?.label || 'Tiêu chuẩn';

  const renderRoadmapConfigModal = () => (
    <Modal
      visible={roadmapConfigModalVisible}
      animationType="slide"
      transparent
      onRequestClose={() => setRoadmapConfigModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.configModal, {backgroundColor: colors.surface}]}>
          <View style={[styles.configModalHeader, {borderBottomColor: colors.border}]}>
            <View style={{flex: 1}}>
              <Text style={[styles.configModalTitle, {color: colors.heading}]}>
                Chỉnh sửa lộ trình
              </Text>
              <Text style={[styles.configModalDescription, {color: colors.textSecondary}]}>
                Cập nhật lượng kiến thức, nhịp học, số ngày dự kiến và số phút mỗi ngày cho lộ trình hiện tại.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setRoadmapConfigModalVisible(false)}
              disabled={savingRoadmapConfig}
              style={[styles.stageIconButton, {borderColor: colors.border}]}>
              <Icon name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.configModalBody}>
            <View
              style={[
                styles.aiSuggestCard,
                {
                  borderColor: colors.border,
                  backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                },
              ]}>
              <View style={styles.aiSuggestTop}>
                <View style={styles.aiSuggestIcon}>
                  <Icon name="sparkles" size={20} color="#0891b2" />
                </View>
                <View style={{flex: 1}}>
                  <Text style={[styles.aiSuggestTitle, {color: colors.heading}]}>
                    Use AI to prefill this roadmap
                  </Text>
                  <Text style={[styles.aiSuggestText, {color: colors.textSecondary}]}>
                    The suggestion uses the saved workspace profile to estimate depth, pacing, study days, and daily workload.
                  </Text>
                </View>
              </View>
              <Button
                title={suggestingRoadmapConfig ? 'Đang gợi ý...' : 'Suggest with AI'}
                onPress={handleSuggestRoadmapConfig}
                loading={suggestingRoadmapConfig}
                disabled={savingRoadmapConfig || suggestingRoadmapConfig}
                icon="brain"
                size="sm"
                fullWidth={false}
                variant="outline"
              />
              {roadmapSuggestionMeta ? (
                <View style={[styles.suggestionResult, {borderColor: colors.border}]}>
                  <Icon name="check-circle-outline" size={18} color="#10b981" />
                  <View style={{flex: 1}}>
                    {roadmapSuggestionMeta.rationale ? (
                      <Text style={[styles.suggestionText, {color: colors.textSecondary}]}>
                        {roadmapSuggestionMeta.rationale}
                      </Text>
                    ) : null}
                    {toArray(roadmapSuggestionMeta.recommendations).map((item: any, index: number) => (
                      <Text key={`${item}-${index}`} style={[styles.suggestionText, {color: colors.textSecondary}]}>
                        • {String(item)}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>

            <Text style={[styles.configFieldLabel, {color: colors.heading}]}>
              Lượng kiến thức cần học*
            </Text>
            <Text style={[styles.configHint, {color: colors.textSecondary}]}>
              Lượng kiến thức quyết định bạn học bao nhiêu. Tốc độ học quyết định nhịp thời gian, còn hệ thống sẽ chia đều theo số ngày và phút mỗi ngày.
            </Text>
            {KNOWLEDGE_LOAD_OPTIONS.map(option =>
              renderRoadmapConfigOption('knowledgeLoad', option),
            )}

            <Text style={[styles.configFieldLabel, {color: colors.heading}]}>Loại Lộ trình*</Text>
            {ADAPTATION_MODE_OPTIONS.map(option =>
              renderRoadmapConfigOption('adaptationMode', option),
            )}

            <Text style={[styles.configFieldLabel, {color: colors.heading}]}>Tốc độ Lộ trình*</Text>
            {ROADMAP_SPEED_OPTIONS.map(option =>
              renderRoadmapConfigOption('roadmapSpeedMode', option),
            )}

            <Text style={[styles.configFieldLabel, {color: colors.heading}]}>Số ngày dự kiến*</Text>
            <TextInput
              value={roadmapConfigValues.estimatedTotalDays}
              onChangeText={value => updateRoadmapConfigField('estimatedTotalDays', value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              style={[
                styles.configInput,
                {
                  color: colors.heading,
                  borderColor: colors.border,
                  backgroundColor: isDark ? '#0f172a' : '#ffffff',
                },
              ]}
              placeholder="30"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={[styles.analysisCard, {backgroundColor: isDark ? '#1e293b' : '#f8fafc'}]}>
              <Text style={[styles.analysisTitle, {color: colors.heading}]}>Phân tích nhịp học</Text>
              <Text style={[styles.analysisText, {color: colors.textSecondary}]}>
                Bạn đang nhập {totalDaysNumber || 0} ngày nên hệ thống tự quy đổi về tốc độ {selectedSpeedLabel}. Mốc gợi ý gần nhất là {recommendedDays} ngày.
              </Text>
            </View>

            <Text style={[styles.configFieldLabel, {color: colors.heading}]}>
              Số phút học gợi ý mỗi ngày*
            </Text>
            <TextInput
              value={roadmapConfigValues.recommendedMinutesPerDay}
              onChangeText={value => updateRoadmapConfigField('recommendedMinutesPerDay', value.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              style={[
                styles.configInput,
                {
                  color: colors.heading,
                  borderColor: colors.border,
                  backgroundColor: isDark ? '#0f172a' : '#ffffff',
                },
              ]}
              placeholder="60"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={[styles.analysisCard, {backgroundColor: isDark ? '#1e293b' : '#f8fafc'}]}>
              <Text style={[styles.analysisTitle, {color: colors.heading}]}>Phân bổ thời lượng mỗi ngày</Text>
              <Text style={[styles.analysisText, {color: colors.textSecondary}]}>
                Bạn đang đặt {minutesPerDayNumber || 0} phút/ngày. Với cấu hình hiện tại, mốc gợi ý để giãn đều khối lượng học là khoảng {recommendedMinutes} phút/ngày.
              </Text>
            </View>

            {roadmapConfigError ? (
              <Text style={styles.configErrorText}>{roadmapConfigError}</Text>
            ) : null}
          </ScrollView>

          <View style={[styles.configModalFooter, {borderTopColor: colors.border}]}>
            <Button
              title="Đóng"
              onPress={() => setRoadmapConfigModalVisible(false)}
              disabled={savingRoadmapConfig || suggestingRoadmapConfig}
              variant="outline"
              size="sm"
              fullWidth={false}
              style={styles.configFooterButton}
            />
            <Button
              title="Lưu thay đổi"
              onPress={handleRequestSaveRoadmapConfig}
              loading={savingRoadmapConfig}
              disabled={savingRoadmapConfig || suggestingRoadmapConfig}
              icon="content-save-outline"
              size="sm"
              fullWidth={false}
              style={styles.configFooterButton}
            />
          </View>
        </View>
      </View>

      {roadmapConfigConfirmVisible ? (
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmDialog, {backgroundColor: colors.surface}]}>
            <View style={styles.confirmIcon}>
              <Icon name="alert-outline" size={24} color="#f59e0b" />
            </View>
            <Text style={[styles.confirmTitle, {color: colors.heading}]}>
              Bạn đang có lộ trình đang sử dụng
            </Text>
            <Text style={[styles.confirmText, {color: colors.textSecondary}]}>
              Nếu cập nhật, lộ trình đang sử dụng sẽ bị mất đi. Bạn chắc chắn với quyết định cập nhật thông tin lộ trình không?
            </Text>
            {roadmapConfigError ? (
              <Text style={styles.configErrorText}>{roadmapConfigError}</Text>
            ) : null}
            <View style={styles.confirmActions}>
              <Button
                title="Quay lại"
                onPress={() => setRoadmapConfigConfirmVisible(false)}
                disabled={savingRoadmapConfig}
                variant="outline"
                size="sm"
                fullWidth={false}
                style={styles.confirmButton}
              />
              <Button
                title="Xác nhận cập nhật"
                onPress={handleConfirmSaveRoadmapConfig}
                loading={savingRoadmapConfig}
                disabled={savingRoadmapConfig}
                variant="destructive"
                size="sm"
                fullWidth={false}
                style={styles.confirmButton}
              />
            </View>
          </View>
        </View>
      ) : null}
    </Modal>
  );

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}>
      <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, {color: colors.heading}]}>Hành trình lộ trình</Text>
          <Text style={[styles.headerSub, {color: colors.textSecondary}]}>
            {title || (contextType === 'GROUP' ? 'Nhóm' : 'Workspace')}
          </Text>
        </View>
        {contextType === 'WORKSPACE' && activeRoadmapId > 0 ? (
          <TouchableOpacity
            onPress={openRoadmapConfigEditor}
            style={[styles.headerEditButton, {borderColor: colors.border}]}>
            <Icon name="pencil-outline" size={16} color={Colors.primary} />
            <Text style={styles.headerEditText}>Chỉnh sửa</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>

      {renderRoadmapConfigModal()}

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {!shouldShowRoadmapSetupScreen ? (
          <>
            <Text style={[styles.sectionTitle, {color: colors.heading}]}>Lộ trình</Text>
            {roadmaps.length === 0 ? (
              <View style={[styles.emptyBox, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <Icon name="map-outline" size={28} color={colors.textTertiary} />
                <Text style={[styles.emptyText, {color: colors.textSecondary}]}>Chưa có lộ trình nào</Text>
              </View>
            ) : (
              <View style={styles.chipsWrap}>
                {roadmaps.map(item => {
                  const roadmapId = Number(item.roadmapId || item.id || 0);
                  const selected = roadmapId > 0 && roadmapId === Number(selectedRoadmapId || 0);
                  return (
                    <TouchableOpacity
                      key={roadmapId}
                      onPress={() => setSelectedRoadmapId(roadmapId)}
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? Colors.primary : colors.border,
                          backgroundColor: selected
                            ? isDark
                              ? '#1E3A8A30'
                              : '#DBEAFE'
                            : colors.surface,
                        },
                      ]}>
                      <Text
                        style={{
                          color: selected ? Colors.primary : colors.textSecondary,
                          fontWeight: '600',
                        }}>
                        {item.title || item.name || `Lộ trình #${roadmapId}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        ) : null}

        {!!activeRoadmapId && (
          <View style={styles.phaseWrap}>
            {shouldShowRoadmapSetupScreen ? renderRoadmapSetupScreen() : renderRoadmapStage()}

            <View
              style={[
                styles.phaseWrapHidden,
                styles.roadmapHeroCard,
                {
                  borderColor: colors.border,
                  backgroundColor: isDark ? 'rgba(15,23,42,0.9)' : '#f8fafc',
                },
              ]}>
              <Text style={[styles.roadmapHeroTag, {color: colors.textTertiary}]}>Central roadmap</Text>
              <Text style={[styles.roadmapHeroTitle, {color: colors.heading}]}>
                {selectedRoadmap?.title || selectedRoadmap?.name || `Roadmap #${activeRoadmapId}`}
              </Text>
              <Text style={[styles.roadmapHeroMeta, {color: colors.textSecondary}]}> 
                {phases.length} phase • {contextType === 'GROUP' ? 'Group' : 'Workspace'}
              </Text>
            </View>

            {showLegacyDetailList && viewMode === 'detail' ? (
              <View style={[styles.detailBoardWrap, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                <Text style={[styles.detailBoardTitle, {color: colors.heading}]}>Lộ trình theo giai đoạn</Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.detailRailTrack}>
                  <View
                    style={[
                      styles.detailPhaseBaseLine,
                      {backgroundColor: isDark ? '#334155' : '#cbd5e1'},
                    ]}
                  />
                  {phases.map((phase: any, index: number) => {
                    const phaseId = Number(phase?.phaseId || 0);
                    const hasPreLearningQuiz = hasReadyRoadmapQuiz(phase?.preLearningQuizzes);
                    const isGeneratingPreLearningForPhase = generatingPreLearningPhaseIds.includes(phaseId);
                    const isGeneratingKnowledgeForPhase =
                      generatingKnowledgePhaseIds.includes(phaseId) ||
                      generatingKnowledgeQuizPhaseIds.includes(phaseId);
                    const phaseProgressPercent = isGeneratingPreLearningForPhase
                      ? getProgressForPhase(preLearningProgressByPhaseId, phaseId)
                      : isGeneratingKnowledgeForPhase
                      ? getProgressForPhase(knowledgeProgressByPhaseId, phaseId)
                      : 0;
                    const isLockedPhase =
                      index > maxUnlockedPhaseIndex &&
                      !hasPreLearningQuiz &&
                      !isCurrentPhaseByPayload(phaseId);
                    const isSelectedPhase = Number(selectedPhaseId) === phaseId;
                    return (
                      <TouchableOpacity
                        key={`detail-phase-${phaseId || index}`}
                        onPress={() => handleSelectPhase(phaseId || null, {fromUser: true})}
                        style={styles.detailPhaseStepWrap}>
                        <View
                          style={[
                            styles.detailPhaseNode,
                            {
                              borderColor: isSelectedPhase ? '#7dd3fc' : colors.border,
                              backgroundColor: isSelectedPhase
                                ? isDark
                                  ? 'rgba(14,165,233,0.24)'
                                  : '#ecfeff'
                                : colors.surface,
                            },
                          ]}>
                          <Text style={[styles.detailPhaseNodeText, {color: isSelectedPhase ? Colors.primary : colors.textSecondary}]}> 
                            {index + 1}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.detailPhaseCard,
                            {
                              borderColor: isSelectedPhase ? '#93c5fd' : colors.border,
                              backgroundColor: isSelectedPhase
                                ? isDark
                                  ? 'rgba(30,58,138,0.24)'
                                  : '#eff6ff'
                                : isDark
                                ? Colors.dark.surfaceVariant
                                : '#f8fafc',
                            },
                          ]}>
                          <Text style={[styles.detailPhaseTag, {color: colors.textTertiary}]}>GIAI ĐOẠN {index + 1}</Text>
                          <Text numberOfLines={2} style={[styles.detailPhaseName, {color: colors.heading}]}> 
                            {phase?.title || `Giai đoạn ${index + 1}`}
                          </Text>
                          {isLockedPhase ? (
                            <Icon name="lock-outline" size={14} color={colors.textTertiary} />
                          ) : null}
                          {(isGeneratingPreLearningForPhase || isGeneratingKnowledgeForPhase) ? (
                            <View style={styles.detailPhaseProgressWrap}>
                              <View
                                style={[
                                  styles.detailPhaseProgressTrack,
                                  {backgroundColor: isDark ? '#334155' : '#dbeafe'},
                                ]}>
                                <View
                                  style={[
                                    styles.detailPhaseProgressFill,
                                    {width: `${phaseProgressPercent}%`},
                                  ]}
                                />
                              </View>
                              <Text style={[styles.detailPhaseProgressText, {color: Colors.primary}]}>
                                {phaseProgressPercent}%
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.detailRail}>
                  {activePhaseKnowledges.map((knowledge: any, index: number) => {
                    const knowledgeId = Number(knowledge?.knowledgeId || 0);
                    const normalizedStatus = String(knowledge?.status || '').toUpperCase();
                    const knowledgeLockState = resolveKnowledgeLockState(activePhase, selectedPhaseIndex, index);
                    const isLocked =
                      normalizedStatus === 'LOCKED' ||
                      knowledgeLockState.isPhaseLockedForKnowledge ||
                      knowledgeLockState.isKnowledgeLockedBySequence;
                    const isSelectedKnowledge = knowledgeId > 0 && Number(selectedKnowledgeId) === knowledgeId;
                    return (
                      <TouchableOpacity
                        key={`detail-knowledge-${knowledgeId || index}`}
                        onPress={() => {
                          if (!isLocked && knowledgeId > 0) {
                            setSelectedKnowledgeId(knowledgeId);
                          }
                        }}
                        style={[
                          styles.detailKnowledgeCard,
                          {
                            borderColor: isSelectedKnowledge ? '#93c5fd' : colors.border,
                            backgroundColor: isLocked
                              ? isDark
                                ? '#334155'
                                : '#f1f5f9'
                              : isSelectedKnowledge
                              ? isDark
                                ? 'rgba(30,58,138,0.24)'
                                : '#eff6ff'
                              : isDark
                              ? Colors.dark.surfaceVariant
                              : '#f8fafc',
                          },
                        ]}>
                        <Text style={[styles.detailKnowledgeTag, {color: colors.textTertiary}]}>KIẾN THỨC {index + 1}</Text>
                        <Text numberOfLines={2} style={[styles.detailKnowledgeName, {color: colors.heading}]}> 
                          {knowledge?.title || `Kiến thức ${index + 1}`}
                        </Text>
                        {isLocked ? (
                          <Icon name="lock-outline" size={14} color={colors.textTertiary} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {isSelectedPhaseLocked ? (
                  <View style={[styles.detailQuizSection, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                    <Text style={[styles.detailQuizTitle, {color: colors.heading}]}>Phase này đang bị khóa</Text>
                    <Text style={[styles.detailEmptyText, {color: colors.textSecondary}]}>Hãy mở khóa phase trước khi xem knowledge và quiz bên trong.</Text>
                    <Button
                      title={isSelectedPhaseUnlocking ? 'Đang mở khóa...' : 'Mở khóa Phase'}
                      onPress={() => void handleUnlockSelectedPhase()}
                      disabled={!isSelectedPhaseUnlockable}
                      loading={isSelectedPhaseUnlocking}
                      size="sm"
                      fullWidth={false}
                      icon="lock-open-variant-outline"
                    />
                  </View>
                ) : null}

                {!isSelectedPhaseLocked && selectedKnowledge ? (
                  <View style={[styles.detailQuizSection, {borderColor: colors.border, opacity: isSelectedKnowledgeLocked ? 0.4 : 1}]}> 
                    <Text style={[styles.detailQuizTitle, {color: colors.heading}]}> 
                      Quiz của {selectedKnowledge?.title || 'knowledge'}
                    </Text>
                    {isSelectedKnowledgeLocked ? (
                      <View style={styles.detailKnowledgeLockHint}>
                        <Icon name="lock-outline" size={14} color={colors.textTertiary} />
                        <Text style={[styles.detailEmptyText, {color: colors.textSecondary}]}>Hãy hoàn thành knowledge trước đó để mở khóa phần này.</Text>
                      </View>
                    ) : null}
                    {selectedKnowledgeIsGeneratingQuiz ? (
                      <View style={[styles.generationCard, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                        <View style={styles.generationHeaderRow}>
                          <ActivityIndicator size="small" color={Colors.primary} />
                          <Text style={[styles.generationTitle, {color: colors.heading}]}>Đang tạo quiz kiến thức</Text>
                        </View>
                        <Text style={[styles.generationText, {color: colors.textSecondary}]}>
                          AI đang tạo quiz cho knowledge này.
                        </Text>
                        {renderGenerationProgress(activePhaseKnowledgePercent)}
                      </View>
                    ) : null}
                    {selectedKnowledgeQuizzes.length > 0 ? (
                      selectedKnowledgeQuizzes.map((quiz: any, index: number) => {
                        const quizId = Number(quiz?.quizId || quiz?.id || 0);
                        return (
                          <View
                            key={`detail-quiz-${quizId || index}`}
                            style={[styles.detailQuizCard, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                            <View style={{flex: 1}}>
                              <Text style={[styles.detailQuizName, {color: colors.heading}]}> 
                                {quiz?.title || `Quiz #${quizId || index + 1}`}
                              </Text>
                              <Text style={[styles.detailQuizMeta, {color: colors.textSecondary}]}> 
                                {String(quiz?.status || 'DRAFT').toUpperCase()}
                              </Text>
                            </View>
                            <Button
                              title="Làm quiz"
                              onPress={() => openQuizModeSelector(quiz, Number(activePhase?.phaseId || 0))}
                              size="sm"
                              fullWidth={false}
                              variant="outline"
                              style={styles.detailQuizActionBtn}
                            />
                          </View>
                        );
                      })
                    ) : selectedKnowledgeIsGeneratingQuiz ? null : (
                      <View style={styles.detailEmptyWrap}>
                        <Text style={[styles.detailEmptyText, {color: colors.textSecondary}]}>Chưa có quiz cho knowledge này.</Text>
                        <Button
                          title="Tạo quiz"
                          size="sm"
                          fullWidth={false}
                          onPress={() => {
                            const normalizedRoadmapId = Number(activeRoadmapId || 0);
                            const normalizedKnowledgeId = Number(selectedKnowledgeId || 0);
                            if (
                              Number.isInteger(normalizedRoadmapId) &&
                              normalizedRoadmapId > 0 &&
                              Number.isInteger(normalizedKnowledgeId) &&
                              normalizedKnowledgeId > 0
                            ) {
                              handleGenerateKnowledgeQuiz(normalizedRoadmapId, normalizedKnowledgeId);
                            }
                          }}
                          loading={
                            runningAction === `knowledge-${Number(selectedKnowledgeId || 0)}` ||
                            selectedKnowledgeIsGeneratingQuiz
                          }
                        />
                      </View>
                    )}
                  </View>
                ) : null}

                {!isSelectedPhaseLocked && activePhase ? (
                  <View style={[styles.detailInspector, {borderColor: colors.border}]}> 
                    <Text style={[styles.detailInspectorTitle, {color: colors.heading}]}> 
                      {activePhase?.title || 'Chi tiết giai đoạn'}
                    </Text>
                    <Text style={[styles.detailInspectorText, {color: colors.textSecondary}]}> 
                      {activePhase?.description || 'Chọn một giai đoạn để xem chi tiết.'}
                    </Text>
                  </View>
                ) : null}

                {!isSelectedPhaseLocked && activePhaseShouldShowPreLearningPlaceholder ? (
                  <View style={[styles.generationCard, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                    <View style={styles.generationHeaderRow}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={[styles.generationTitle, {color: colors.heading}]}>Đang tạo quiz trước học</Text>
                    </View>
                    <Text style={[styles.generationText, {color: colors.textSecondary}]}>
                      AI đang chuẩn bị pre-learning cho phase này.
                    </Text>
                    {renderGenerationProgress(activePhasePreLearningPercent)}
                  </View>
                ) : null}

                {!isSelectedPhaseLocked && activePhaseShouldShowKnowledgePlaceholder ? (
                  <View style={[styles.generationCard, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                    <View style={styles.generationHeaderRow}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={[styles.generationTitle, {color: colors.heading}]}>Đang tạo nội dung phase</Text>
                    </View>
                    <Text style={[styles.generationText, {color: colors.textSecondary}]}>
                      AI đang tạo knowledge và quiz luyện tập cho phase này.
                    </Text>
                    {renderGenerationProgress(activePhaseKnowledgePercent)}
                  </View>
                ) : null}

                {!isSelectedPhaseLocked && activePhasePreLearningQuizzes.length > 0 ? (
                  <View style={[styles.detailQuizSection, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                    <Text style={[styles.detailQuizTitle, {color: colors.heading}]}>Quiz trước học</Text>
                    {activePhasePreLearningQuizzes.map((quiz: any, index: number) => {
                      const quizId = Number(quiz?.quizId || quiz?.id || 0);
                      return (
                        <View
                          key={`detail-prelearning-quiz-${quizId || index}`}
                          style={[styles.detailQuizCard, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                          <View style={{flex: 1}}>
                            <Text style={[styles.detailQuizName, {color: colors.heading}]}>
                              {quiz?.title || `Quiz #${quizId || index + 1}`}
                            </Text>
                            <Text style={[styles.detailQuizMeta, {color: colors.textSecondary}]}>
                              {String(quiz?.status || 'DRAFT').toUpperCase()}
                            </Text>
                          </View>
                          <Button
                            title="Làm quiz"
                            onPress={() => openQuizModeSelector(quiz, Number(activePhase?.phaseId || 0))}
                            size="sm"
                            fullWidth={false}
                            variant="outline"
                            style={styles.detailQuizActionBtn}
                          />
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {canShowActiveSkipDecisionAfterPreLearning || canShowActiveGenerateKnowledgeFallback ? (
                  <View
                    style={[
                      styles.preLearningDecisionCard,
                      {
                        borderColor: isDark ? '#1e3a8a' : '#bfdbfe',
                        backgroundColor: isDark ? 'rgba(30,58,138,0.25)' : '#eff6ff',
                      },
                    ]}>
                    <Text style={[styles.preLearningDecisionTitle, {color: isDark ? '#bfdbfe' : '#1e3a8a'}]}>
                      Lựa chọn sau Pre-learning
                    </Text>
                    {canShowActiveSkipDecisionAfterPreLearning ? (
                      <>
                        <Text style={[styles.preLearningDecisionText, {color: isDark ? '#dbeafe' : '#1e3a8a'}]}>
                          Bạn đủ điều kiện bỏ qua phase này hoặc tiếp tục học sâu hơn.
                        </Text>
                        <Button
                          title="Bỏ qua phase"
                          onPress={() => handlePreLearningDecision(activePhaseId, true)}
                          loading={submittingPreLearningDecision}
                          variant="outline"
                          size="sm"
                          fullWidth
                          icon="skip-next"
                        />
                        <Button
                          title="Tiếp tục học phase này"
                          onPress={() => handlePreLearningDecision(activePhaseId, false)}
                          loading={submittingPreLearningDecision}
                          size="sm"
                          fullWidth
                          icon="book-open-variant"
                        />
                      </>
                    ) : null}
                    {canShowActiveGenerateKnowledgeFallback ? (
                      <Button
                        title="Tạo nội dung cho phase"
                        onPress={() => handlePreLearningDecision(activePhaseId, false)}
                        loading={submittingPreLearningDecision}
                        size="sm"
                        fullWidth
                        icon="lightning-bolt-outline"
                      />
                    ) : null}
                  </View>
                ) : null}

                {!isSelectedPhaseLocked && activePhase && isStudyNewRoadmap && activePhasePreLearningQuizzes.length === 0 && !activePhaseHasKnowledge && !activePhaseShouldShowPreLearningPlaceholder && !activePhaseShouldShowKnowledgePlaceholder ? (
                  <View style={[styles.quickActionCard, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                    <Text style={[styles.quickActionTitle, {color: colors.heading}]}>Bạn đã có nền tảng ở phase này chưa?</Text>
                    <Text style={[styles.quickActionSubtitle, {color: colors.textSecondary}]}>Nếu chưa, hệ thống sẽ tạo nội dung phase. Nếu có rồi, hệ thống sẽ tạo pre-learning.</Text>

                    <View style={styles.quickActionSection}>
                      <View style={styles.quickActionRow}>
                        <Button
                          title="Tôi đã có nền tảng"
                          onPress={() => {
                            if (Number(activeRoadmapId || 0) > 0 && Number(activePhase?.phaseId || 0) > 0) {
                              handleGeneratePreLearning(Number(activeRoadmapId || 0), Number(activePhase?.phaseId || 0));
                            }
                          }}
                          loading={
                            runningAction === `pre-${Number(activePhase?.phaseId || 0)}` ||
                            generatingPreLearningPhaseIds.includes(Number(activePhase?.phaseId || 0))
                          }
                          size="sm"
                          variant="outline"
                          fullWidth={false}
                          icon="book-open-page-variant-outline"
                        />
                        <Button
                          title="Tôi là người mới"
                          onPress={() => {
                            if (Number(activeRoadmapId || 0) > 0 && Number(activePhase?.phaseId || 0) > 0) {
                              handleGeneratePhaseContent(Number(activeRoadmapId || 0), Number(activePhase?.phaseId || 0), true);
                            }
                          }}
                          loading={
                            runningAction === `content-${Number(activePhase?.phaseId || 0)}` ||
                            generatingKnowledgePhaseIds.includes(Number(activePhase?.phaseId || 0))
                          }
                          size="sm"
                          fullWidth={false}
                          icon="sparkles"
                        />
                      </View>
                    </View>

                    <View style={styles.quickActionSection}>
                      <Text style={[styles.quickActionSectionTitle, {color: colors.heading}]}>Knowledge hiện tại</Text>
                      {selectedKnowledge ? (
                        <Button
                          title="Tạo quiz kiến thức"
                          onPress={() => {
                            const roadmapId = Number(activeRoadmapId || 0);
                            const knowledgeId = Number(selectedKnowledgeId || 0);
                            if (roadmapId > 0 && knowledgeId > 0) {
                              handleGenerateKnowledgeQuiz(roadmapId, knowledgeId);
                            }
                          }}
                          loading={runningAction === `knowledge-${Number(selectedKnowledgeId || 0)}`}
                          size="sm"
                          variant="outline"
                          fullWidth={false}
                          icon="school-outline"
                        />
                      ) : (
                        <Text style={[styles.quickActionSubtitle, {color: colors.textSecondary}]}>Chọn một knowledge ở phía dưới để hiện nút tạo quiz.</Text>
                      )}
                    </View>
                  </View>
                ) : null}

                {!isSelectedPhaseLocked && activePhase && !isStudyNewRoadmap && activePhasePreLearningQuizzes.length === 0 && !activePhaseHasKnowledge && !activePhaseShouldShowPreLearningPlaceholder && !activePhaseShouldShowKnowledgePlaceholder ? (
                  <View style={[styles.quickActionCard, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                    <Text style={[styles.quickActionTitle, {color: colors.heading}]}>Bắt đầu phase này</Text>
                    <Text style={[styles.quickActionSubtitle, {color: colors.textSecondary}]}>
                      Tạo quiz trước học hoặc tạo trực tiếp nội dung giai đoạn.
                    </Text>
                    <View style={styles.quickActionRow}>
                      <Button
                        title="Tạo quiz trước học"
                        onPress={() => handleGeneratePreLearning(Number(activeRoadmapId || 0), Number(activePhase?.phaseId || 0))}
                        loading={
                          runningAction === `pre-${Number(activePhase?.phaseId || 0)}` ||
                          generatingPreLearningPhaseIds.includes(Number(activePhase?.phaseId || 0))
                        }
                        size="sm"
                        variant="outline"
                        fullWidth={false}
                        icon="book-open-page-variant-outline"
                      />
                      <Button
                        title="Tạo nội dung"
                        onPress={() => handleGeneratePhaseContent(Number(activeRoadmapId || 0), Number(activePhase?.phaseId || 0))}
                        loading={
                          runningAction === `content-${Number(activePhase?.phaseId || 0)}` ||
                          generatingKnowledgePhaseIds.includes(Number(activePhase?.phaseId || 0))
                        }
                        size="sm"
                        fullWidth={false}
                        icon="sparkles"
                      />
                    </View>
                  </View>
                ) : null}

                {!isSelectedPhaseLocked && activePhasePostLearningQuizzes.length > 0 ? (
                  <View
                    style={[
                      styles.detailQuizSection,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        opacity: activePhaseShouldLockPostLearning ? 0.55 : 1,
                      },
                    ]}>
                    <Text style={[styles.detailQuizTitle, {color: colors.heading}]}>Quiz sau học</Text>
                    {activePhaseShouldLockPostLearning ? (
                      <Text style={[styles.detailEmptyText, {color: colors.textSecondary}]}>
                        Hoàn thành knowledge trong phase để mở quiz sau học ({activePhaseCompletedKnowledgeCount}/{activePhaseKnowledges.length}).
                      </Text>
                    ) : null}
                    {activePhasePostLearningQuizzes.map((quiz: any, index: number) => {
                      const quizId = Number(quiz?.quizId || quiz?.id || 0);
                      return (
                        <View
                          key={`detail-postlearning-quiz-${quizId || index}`}
                          style={[styles.detailQuizCard, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                          <View style={{flex: 1}}>
                            <Text style={[styles.detailQuizName, {color: colors.heading}]}>
                              {quiz?.title || `Quiz #${quizId || index + 1}`}
                            </Text>
                            <Text style={[styles.detailQuizMeta, {color: colors.textSecondary}]}>
                              {String(quiz?.status || 'DRAFT').toUpperCase()}
                            </Text>
                          </View>
                          <Button
                            title="Làm quiz"
                            onPress={() => openQuizModeSelector(quiz, Number(activePhase?.phaseId || 0))}
                            disabled={activePhaseShouldLockPostLearning}
                            size="sm"
                            fullWidth={false}
                            variant="outline"
                            style={styles.detailQuizActionBtn}
                          />
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {canShowActiveRemedialDecision ? (
                  <View
                    style={[
                      styles.remedialCard,
                      {
                        borderColor: isDark ? '#1e3a8a' : '#bfdbfe',
                        backgroundColor: isDark ? 'rgba(30,58,138,0.25)' : '#eff6ff',
                      },
                    ]}>
                    <Text style={[styles.remedialTitle, {color: isDark ? '#bfdbfe' : '#1e3a8a'}]}>
                      Quyết định sau Post-learning
                    </Text>
                    <Text style={[styles.remedialText, {color: isDark ? '#dbeafe' : '#1e3a8a'}]}>
                      Kết quả post-learning chưa đạt. Chọn cách thêm phase remedial cho lộ trình.
                    </Text>
                    <Button
                      title="Tạo remedial và giữ deadline"
                      onPress={() => handleRemedialDecision(activePhaseId, 'COMPRESS_TO_KEEP_DEADLINE')}
                      loading={submittingRemedialDecision}
                      size="sm"
                      fullWidth
                      icon="check-circle-outline"
                    />
                    <Button
                      title="Tạo remedial và gia hạn deadline"
                      onPress={() => handleRemedialDecision(activePhaseId, 'EXTEND_DEADLINE')}
                      loading={submittingRemedialDecision}
                      size="sm"
                      variant="outline"
                      fullWidth
                      icon="calendar-clock-outline"
                    />
                  </View>
                ) : null}

                {!isSelectedPhaseLocked && (!Array.isArray(phases) || phases.length === 0) ? (
                  <View style={[styles.quickActionCard, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                    <Text style={[styles.quickActionTitle, {color: colors.heading}]}>Chưa có phase</Text>
                    <Text style={[styles.quickActionSubtitle, {color: colors.textSecondary}]}>Tạo giai đoạn để bắt đầu roadmap từ tài liệu đã chọn.</Text>
                    <Button
                      title="Tạo giai đoạn"
                      onPress={() => handleGenerateRoadmapPhases(activeRoadmapId)}
                      loading={runningAction === 'phases' || generatingRoadmapPhases}
                      disabled={!canGenerateRoadmapPhases}
                      icon="timeline-plus-outline"
                      size="sm"
                      fullWidth={false}
                      style={styles.generatePhasesBtn}
                    />
                    {generatingRoadmapPhases ? renderPhaseGenerationLoader() : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {showLegacyDetailList && viewMode === 'detail' && phaseReviewState.loading && Number(phaseReviewState.phaseId) === Number(activePhase?.phaseId) ? (
              <View style={[styles.reviewCard, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                <Text style={[styles.reviewSummary, {color: colors.textSecondary}]}>Đang đồng bộ đánh giá AI cho phase hiện tại...</Text>
              </View>
            ) : null}

            {showLegacyDetailList && viewMode === 'detail' && phaseReviewState?.data?.summary && Number(phaseReviewState?.phaseId) === Number(activePhase?.phaseId) ? (
              <View
                style={[
                  styles.reviewCard,
                  {
                    borderColor: isDark ? '#14532d' : '#86efac',
                    backgroundColor: isDark ? 'rgba(20,83,45,0.3)' : '#f0fdf4',
                  },
                ]}>
                <Text style={[styles.reviewTitle, {color: isDark ? '#bbf7d0' : '#166534'}]}>
                  Đánh giá AI cho phase hiện tại
                </Text>
                {typeof phaseReviewConfidencePercent === 'number' ? (
                  <View style={styles.reviewConfidenceWrap}>
                    <Text style={[styles.reviewConfidence, {color: isDark ? '#dcfce7' : '#166534'}]}>
                      Độ tin cậy: {phaseReviewConfidencePercent}%
                    </Text>
                    <View style={styles.reviewSegmentsRow}>
                      {[
                        {color: '#ef4444', fill: phaseReviewSegmentFillPercents[0]},
                        {color: '#f59e0b', fill: phaseReviewSegmentFillPercents[1]},
                        {color: '#22c55e', fill: phaseReviewSegmentFillPercents[2]},
                      ].map((segment, index) => (
                        <View
                          key={`phase-review-segment-${index}`}
                          style={[
                            styles.reviewSegmentTrack,
                            {
                              borderColor: isDark ? '#334155' : '#cbd5e1',
                              backgroundColor: '#ffffff',
                            },
                          ]}>
                          <View
                            style={[
                              styles.reviewSegmentFill,
                              {
                                backgroundColor: segment.color,
                                width: `${segment.fill}%`,
                              },
                            ]}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
                <Text style={[styles.reviewSummary, {color: isDark ? '#dcfce7' : '#166534'}]}>
                  {phaseReviewState.data.summary}
                </Text>
                {phaseReviewAssessedAtLabel ? (
                  <Text style={[styles.reviewAssessedAt, {color: isDark ? '#bbf7d0' : '#166534'}]}>
                    Đánh giá lúc: {phaseReviewAssessedAtLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {showLegacyDetailList && viewMode === 'detail' ? (
              <Text style={[styles.sectionTitle, {color: colors.heading}]}>Giai đoạn</Text>
            ) : null}
            {showLegacyDetailList && viewMode === 'detail' && contextType === 'WORKSPACE' && materials.length > 0 && !hasRoadmapPhases && (
              <>
                <Text style={[styles.materialTitle, {color: colors.textSecondary}]}>Tài liệu dùng để tạo giai đoạn</Text>
                <View style={styles.materialWrap}>
                  {materials.map((material: any) => {
                    const materialId = material.materialId || material.id;
                    const selected = selectedMaterialIds.includes(materialId);
                    const disabled = isBlockedMaterial(material);
                    return (
                      <TouchableOpacity
                        key={materialId}
                        onPress={() => toggleMaterial(materialId, disabled)}
                        disabled={disabled}
                        style={[
                          styles.materialChip,
                          {
                            borderColor: disabled
                              ? colors.border
                              : selected
                              ? Colors.primary
                              : colors.border,
                            backgroundColor: selected
                              ? isDark
                                ? '#1E3A8A30'
                                : '#EFF6FF'
                              : disabled
                              ? isDark
                                ? '#33415555'
                                : '#F1F5F9'
                              : colors.surface,
                            opacity: disabled ? 0.7 : 1,
                          },
                        ]}>
                        <Text
                          style={{
                            color: disabled
                              ? Colors.error
                              : selected
                              ? Colors.primary
                              : colors.textSecondary,
                            fontSize: 12,
                          }}
                          numberOfLines={1}>
                          {material.title || material.fileName || material.name}
                          {disabled ? ' (Bị cảnh báo/từ chối)' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            {showLegacyDetailList && viewMode === 'detail' ? (
              !hasRoadmapPhases ? (
                <Button
                  title="Tạo giai đoạn"
                  onPress={() => handleGenerateRoadmapPhases(activeRoadmapId)}
                  loading={runningAction === 'phases' || generatingRoadmapPhases}
                  disabled={!canGenerateRoadmapPhases}
                  icon="timeline-plus-outline"
                  size="sm"
                  fullWidth={false}
                  style={styles.generatePhasesBtn}
                />
              ) : (
                <Button
                  title="Làm mới roadmap"
                  onPress={handleRefreshRoadmap}
                  loading={runningAction === 'refresh-roadmap'}
                  icon="refresh"
                  size="sm"
                  variant="outline"
                  fullWidth={false}
                  style={styles.generatePhasesBtn}
                />
              )
            ) : null}
            {showLegacyDetailList && viewMode === 'detail' ? (
              !hasRoadmapPhases ? (
                <Text style={{color: colors.textSecondary}}>Chưa có dữ liệu giai đoạn.</Text>
              ) : (
              phases.map((phase: any, index: number) => {
                const phaseId = Number(phase.phaseId);
                const isSelected = phaseId === Number(selectedPhaseId);
                const knowledges = phase.knowledges || [];
                const preKey = `pre-${phaseId}`;
                const contentKey = `content-${phaseId}`;
                const hasPreLearningQuiz = hasReadyRoadmapQuiz(phase?.preLearningQuizzes);
                const isLockedPhase =
                  index > maxUnlockedPhaseIndex &&
                  !hasPreLearningQuiz &&
                  !isCurrentPhaseByPayload(phaseId);
                const previousPhaseCompleted = index > 0
                  ? (() => {
                      const previousPhase = phases[index - 1] || null;
                      const previousPhaseId = Number(previousPhase?.phaseId);
                      const previousFromPhaseList = isPhaseFinishedStatus(previousPhase?.status);
                      const previousFromCurrentPayloadById =
                        isCurrentPayloadFinished &&
                        Number.isInteger(currentPayloadPhaseId) &&
                        currentPayloadPhaseId > 0 &&
                        currentPayloadPhaseId === previousPhaseId;
                      const previousFromCurrentPayloadByIndex =
                        isCurrentPayloadFinished &&
                        Number.isFinite(currentPayloadPhaseIndex) &&
                        currentPayloadPhaseIndex >= 0 &&
                        currentPayloadPhaseIndex >= index - 1;

                      return (
                        previousFromPhaseList ||
                        previousFromCurrentPayloadById ||
                        previousFromCurrentPayloadByIndex
                      );
                    })()
                  : true;
                const isUnlockingPhase = unlockingPhaseIds.includes(phaseId);
                const isUnlockable =
                  isLockedPhase &&
                  index === maxUnlockedPhaseIndex + 1 &&
                  previousPhaseCompleted &&
                  !isUnlockingPhase;
                const hasPostLearning =
                  Array.isArray(phase?.postLearningQuizzes) && phase.postLearningQuizzes.length > 0;
                const hasPreLearning = hasReadyRoadmapQuiz(phase?.preLearningQuizzes);
                const isCurrentPhase = Number(currentPhaseProgress?.phaseId) === phaseId;
                const hasKnowledge = knowledges.length > 0;
                const isSkipPreLearningPhase = skipPreLearningPhaseIds.includes(phaseId);
                const isGeneratingPreLearningForPhase = generatingPreLearningPhaseIds.includes(phaseId);
                const isGeneratingKnowledgeForPhase = generatingKnowledgePhaseIds.includes(phaseId);
                const showStudyNewPromptCard =
                  isStudyNewRoadmap &&
                  isCurrentPhase &&
                  !isLockedPhase &&
                  !hasPreLearning &&
                  !hasKnowledge &&
                  !isSkipPreLearningPhase &&
                  !isGeneratingPreLearningForPhase &&
                  !isGeneratingKnowledgeForPhase;
                const isPreLearningDecisionHandled = handledPreLearningDecisionPhaseIds.includes(
                  phaseId,
                );
                const canShowSkipDecisionAfterPreLearning =
                  hasPreLearning &&
                  !hasKnowledge &&
                  !isLockedPhase &&
                  isCurrentPhase &&
                  currentPhaseProgress?.skipable === true &&
                  !isPreLearningDecisionHandled;
                const canShowGenerateKnowledgeFallback =
                  hasPreLearning &&
                  !hasKnowledge &&
                  !isLockedPhase &&
                  isCurrentPhase &&
                  !canShowSkipDecisionAfterPreLearning &&
                  currentPhaseProgress?.skipable === false &&
                  !isPreLearningDecisionHandled;
                const canShowRemedialDecision =
                  hasPostLearning &&
                  isFlexibleRoadmap &&
                  !isLockedPhase &&
                  Number(currentPhaseProgress?.phaseId) === phaseId &&
                  currentPhaseProgress?.needsRemedialDecision === true;
                const phaseVisualState = getPhaseVisualState(phase, index, isLockedPhase);
                const phaseVisualMeta = getPhaseVisualMeta(phaseVisualState);
                const phaseDurationLabel = formatPhaseDurationLabel(phase);
                const normalizedPhaseStatus = String(phase?.status || '').toUpperCase();
                const isProcessingPhase =
                  !isPhaseFinishedStatus(phase?.status) &&
                  (
                    normalizedPhaseStatus === 'PROCESSING' ||
                    isUnlockingPhase ||
                    runningAction === preKey ||
                    runningAction === contentKey ||
                    isGeneratingPreLearningForPhase ||
                    isGeneratingKnowledgeForPhase
                  );
                const isInProgressPhase =
                  !isPhaseFinishedStatus(phase?.status) &&
                  !isProcessingPhase &&
                  !isLockedPhase &&
                  (
                    normalizedPhaseStatus === 'IN_PROGRESS' ||
                    normalizedPhaseStatus === 'INPROGRESS' ||
                    normalizedPhaseStatus === 'STARTED' ||
                    normalizedPhaseStatus === 'ONGOING'
                  );

                let phaseStatusText = 'Đang hoạt động';
                let phaseStatusColor: string = Colors.primary;
                if (isPhaseFinishedStatus(phase?.status)) {
                  phaseStatusText = 'Hoàn thành';
                  phaseStatusColor = '#10b981';
                } else if (isProcessingPhase) {
                  phaseStatusText = 'Đang xử lý';
                  phaseStatusColor = '#f59e0b';
                } else if (isInProgressPhase) {
                  phaseStatusText = 'Đang học';
                  phaseStatusColor = Colors.primary;
                } else if (isLockedPhase) {
                  phaseStatusText = 'Đã khóa';
                  phaseStatusColor = colors.textTertiary;
                }

                const showPhaseDetails = isSelected;

                return (
                  <View
                    key={phaseId || index}
                    style={styles.phaseTimelineItem}>
                    {index < phases.length - 1 ? (
                      <View
                        style={[
                          styles.phaseTimelineLine,
                          {backgroundColor: isDark ? '#334155' : '#cbd5e1'},
                        ]}
                      />
                    ) : null}
                    <View style={styles.phaseTimelineNodeWrap}>
                      {isPhaseFinishedStatus(phase?.status) ? (
                        <View style={styles.phaseTimelineDoneNode}>
                          <Icon name="check" size={12} color="#10b981" />
                        </View>
                      ) : isProcessingPhase ? (
                        <View
                          style={[
                            styles.phaseTimelineIdleNode,
                            {
                              borderColor: isDark ? '#475569' : '#cbd5e1',
                              backgroundColor: isDark ? '#1e293b' : '#ffffff',
                            },
                          ]}>
                          <ActivityIndicator size="small" color="#f59e0b" />
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.phaseTimelineIdleNode,
                            {
                              borderColor: isLockedPhase
                                ? isDark
                                  ? '#475569'
                                  : '#cbd5e1'
                                : isSelected
                                ? '#bfdbfe'
                                : isDark
                                ? '#64748b'
                                : '#cbd5e1',
                              backgroundColor: isLockedPhase
                                ? isDark
                                  ? '#334155'
                                  : '#f1f5f9'
                                : isDark
                                ? '#0f172a'
                                : '#ffffff',
                            },
                          ]}>
                          <Text
                            style={[
                              styles.phaseTimelineOrderText,
                              {
                                color: isLockedPhase
                                  ? colors.textTertiary
                                  : isSelected
                                  ? Colors.primary
                                  : colors.textSecondary,
                              },
                            ]}>
                            {index + 1}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View
                      style={[
                        styles.phaseCard,
                        {borderColor: colors.border, backgroundColor: colors.surface},
                        isSelected
                          ? {
                              borderColor: Colors.primary,
                              borderWidth: 1.5,
                            }
                          : null,
                      ]}>
                      <TouchableOpacity
                        onPress={() => handleSelectPhase(Number(phaseId) || null, {fromUser: true})}>
                      <View style={styles.phaseHeaderRow}>
                        <View style={styles.phaseHeaderMain}>
                          <View style={styles.phaseTitleRow}>
                            <Text style={[styles.phaseTitle, {color: colors.heading}]}>
                              {phase.title || `Giai đoạn ${index + 1}`}
                            </Text>
                            <Icon
                              name={showPhaseDetails ? 'chevron-up' : 'chevron-down'}
                              size={16}
                              color={colors.textTertiary}
                            />
                          </View>
                          <Text style={[styles.phaseStatusText, {color: phaseStatusColor}]}> 
                            {phaseStatusText}
                          </Text>
                          <View style={styles.phaseMetaRow}>
                            <View
                              style={[
                                styles.phaseStateBadge,
                                {
                                  borderColor: phaseVisualMeta.badgeBorder,
                                  backgroundColor: phaseVisualMeta.badgeBackground,
                                },
                              ]}>
                              <Icon
                                name={phaseVisualMeta.icon}
                                size={12}
                                color={phaseVisualMeta.badgeText}
                              />
                              <Text
                                style={[
                                  styles.phaseStateBadgeText,
                                  {color: phaseVisualMeta.badgeText},
                                ]}>
                                {phaseVisualMeta.label}
                              </Text>
                            </View>
                            {phaseDurationLabel ? (
                              <View
                                style={[
                                  styles.phaseDurationChip,
                                  {
                                    borderColor: colors.border,
                                    backgroundColor: isDark
                                      ? Colors.dark.surfaceVariant
                                      : '#f8fafc',
                                  },
                                ]}>
                                <Icon name="timer-outline" size={12} color={colors.textSecondary} />
                                <Text style={[styles.phaseDurationText, {color: colors.textSecondary}]}>
                                  {phaseDurationLabel}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                      {!!phase.description && (
                        <Text style={[styles.phaseDesc, {color: colors.textSecondary}]}>
                          {phase.description}
                        </Text>
                      )}
                      </TouchableOpacity>

                    {showPhaseDetails ? (
                      <>
                    {(phase.preLearningQuizzes || []).length > 0 && (
                      <View style={styles.quizListWrap}>
                        <Text style={[styles.quizListTitle, {color: colors.heading}]}>Quiz trước học</Text>
                        {(phase.preLearningQuizzes || []).map((quiz: any) => (
                          <TouchableOpacity
                            key={quiz.quizId}
                            style={[styles.quizItem, {borderColor: colors.border}]}
                            onPress={() => {
                              if (!isLockedPhase) {
                                openQuizModeSelector(quiz, phaseId);
                              }
                            }}>
                            <View style={styles.quizItemContent}>
                              <Text style={[styles.quizItemTitle, {color: colors.text}]}>
                                {quiz.title || `Quiz #${quiz.quizId}`}
                              </Text>
                              <View style={[styles.quizOutcomeChip, {
                                borderColor: getQuizOutcomeMeta(quiz).tone === 'success'
                                  ? '#86efac'
                                  : getQuizOutcomeMeta(quiz).tone === 'danger'
                                    ? '#fecaca'
                                    : colors.border,
                                backgroundColor: getQuizOutcomeMeta(quiz).tone === 'success'
                                  ? isDark ? 'rgba(20,83,45,0.35)' : '#f0fdf4'
                                  : getQuizOutcomeMeta(quiz).tone === 'danger'
                                    ? isDark ? 'rgba(127,29,29,0.35)' : '#fef2f2'
                                    : isDark ? Colors.dark.surfaceVariant : '#f8fafc',
                              }]}>
                                <Text style={[styles.quizOutcomeText, {
                                  color: getQuizOutcomeMeta(quiz).tone === 'success'
                                    ? isDark ? '#86efac' : '#166534'
                                    : getQuizOutcomeMeta(quiz).tone === 'danger'
                                      ? isDark ? '#fca5a5' : '#b91c1c'
                                      : colors.textSecondary,
                                }]}>
                                  {getQuizOutcomeMeta(quiz).label}
                                </Text>
                              </View>
                            </View>
                            <Icon name="chevron-right" size={18} color={colors.textTertiary} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {canShowSkipDecisionAfterPreLearning ? (
                      <View
                        style={[
                          styles.preLearningDecisionCard,
                          {
                            borderColor: isDark ? '#1e3a8a' : '#bfdbfe',
                            backgroundColor: isDark ? 'rgba(30,58,138,0.25)' : '#eff6ff',
                          },
                        ]}>
                        <Text style={[styles.preLearningDecisionTitle, {color: isDark ? '#bfdbfe' : '#1e3a8a'}]}>
                          Lựa chọn sau Pre-learning
                        </Text>
                        <Text style={[styles.preLearningDecisionText, {color: isDark ? '#dbeafe' : '#1e3a8a'}]}>
                          Bạn có thể bỏ qua phase này hoặc tiếp tục tạo nội dung để học sâu hơn.
                        </Text>
                        <Button
                          title="Bỏ qua phase"
                          onPress={() => handlePreLearningDecision(phaseId, true)}
                          loading={submittingPreLearningDecision}
                          variant="outline"
                          size="sm"
                          fullWidth
                          icon="skip-next"
                        />
                        <Button
                          title="Tiếp tục học phase này"
                          onPress={() => handlePreLearningDecision(phaseId, false)}
                          loading={submittingPreLearningDecision}
                          size="sm"
                          fullWidth
                          icon="book-open-variant"
                        />
                      </View>
                    ) : null}

                    {canShowGenerateKnowledgeFallback ? (
                      <View style={styles.preLearningFallbackWrap}>
                        <Button
                          title="Tạo nội dung cho phase"
                          onPress={() => handlePreLearningDecision(phaseId, false)}
                          loading={submittingPreLearningDecision}
                          size="sm"
                          fullWidth
                          icon="lightning-bolt-outline"
                        />
                      </View>
                    ) : null}

                    {showStudyNewPromptCard ? (
                      <View
                        style={[
                          styles.studyNewPromptCard,
                          {
                            borderColor: isDark ? '#bfdbfe' : '#bfdbfe',
                            backgroundColor: isDark ? 'rgba(30,58,138,0.22)' : '#eff6ff',
                          },
                        ]}>
                        <Text style={[styles.studyNewPromptTitle, {color: isDark ? '#dbeafe' : '#1e3a8a'}]}>
                          Bạn đã có nền tảng ở phase này chưa?
                        </Text>
                        <Text style={[styles.studyNewPromptText, {color: isDark ? '#c7d2fe' : '#1e3a8a'}]}>
                          Nếu chưa, hệ thống sẽ tạo nội dung phase. Nếu có rồi, hệ thống sẽ tạo pre-learning.
                        </Text>
                        <Button
                          title="Tôi đã có nền tảng"
                          onPress={() => handleGeneratePreLearning(Number(activeRoadmapId || 0), phaseId)}
                          loading={runningAction === preKey || generatingPreLearningPhaseIds.includes(phaseId)}
                          variant="outline"
                          size="sm"
                          fullWidth
                          icon="book-open-page-variant-outline"
                        />
                        <Button
                          title="Tôi là người mới"
                          onPress={() => handleGeneratePhaseContent(Number(activeRoadmapId || 0), phaseId, true)}
                          loading={runningAction === contentKey || generatingKnowledgePhaseIds.includes(phaseId)}
                          size="sm"
                          fullWidth
                          icon="sparkles"
                        />
                      </View>
                    ) : null}

                    <View style={styles.phaseActions}>
                      {isLockedPhase ? (
                        <Button
                          title="Mở khóa phase"
                          onPress={async () => {
                            if (!isUnlockable) return;

                            setUnlockingPhaseIds(current =>
                              current.includes(phaseId)
                                ? current
                                : [...current, phaseId],
                            );

                            try {
                              await handleGeneratePreLearning(Number(activeRoadmapId || 0), phaseId);
                              await fetchStructure(Number(activeRoadmapId || 0));
                            } finally {
                              setUnlockingPhaseIds(current =>
                                current.filter(id => id !== phaseId),
                              );
                            }
                          }}
                          loading={isUnlockingPhase || runningAction === preKey || generatingPreLearningPhaseIds.includes(phaseId)}
                          disabled={!isUnlockable}
                          size="sm"
                          fullWidth={false}
                          style={styles.actionBtn}
                          icon="lock-open-variant-outline"
                        />
                      ) : null}
                      {!isStudyNewRoadmap ? (
                        <>
                          <Button
                            title="Trước học"
                            onPress={() => handleGeneratePreLearning(Number(activeRoadmapId || 0), phaseId)}
                            disabled={isLockedPhase}
                            loading={runningAction === preKey || generatingPreLearningPhaseIds.includes(phaseId)}
                            size="sm"
                            variant="secondary"
                            fullWidth={false}
                            style={styles.actionBtn}
                          />
                          <Button
                            title="Nội dung giai đoạn"
                            onPress={() => handleGeneratePhaseContent(Number(activeRoadmapId || 0), phaseId)}
                            disabled={isLockedPhase}
                            loading={runningAction === contentKey || generatingKnowledgePhaseIds.includes(phaseId)}
                            size="sm"
                            fullWidth={false}
                            style={styles.actionBtn}
                          />
                        </>
                      ) : null}
                    </View>

                    {hasKnowledge && (
                      <View style={styles.knowledgeList}>
                        {knowledges.map((knowledge: any) => {
                          const knowledgeId = knowledge.knowledgeId;
                          const knowledgeIndex = knowledges.findIndex(
                            (item: any) => Number(item?.knowledgeId) === Number(knowledgeId),
                          );
                          const normalizedKnowledgeStatus = String(knowledge?.status || '').toUpperCase();
                          const currentKnowledgeIndexInPhase =
                            Number.isInteger(currentKnowledgePhaseId) &&
                            currentKnowledgePhaseId === Number(phaseId)
                              ? knowledges.findIndex(
                                  (item: any) => Number(item?.knowledgeId) === currentKnowledgeId,
                                )
                              : -1;
                          let contiguousCompletedKnowledgeCount = 0;
                          for (let idx = 0; idx < knowledges.length; idx += 1) {
                            if (!isCompletedKnowledge(knowledges[idx])) {
                              break;
                            }
                            contiguousCompletedKnowledgeCount += 1;
                          }
                          const shouldUseSequentialFallbackLock =
                            !isLockedPhase &&
                            !isPhaseEffectivelyDone(phase) &&
                            index === maxUnlockedPhaseIndex &&
                            currentKnowledgePhaseIndex < 0 &&
                            currentKnowledgeIndexInPhase < 0 &&
                            knowledges.length > 0;
                          const isKnowledgeLockedBySequence =
                            !isPhaseEffectivelyDone(phase) &&
                            ((index === currentKnowledgePhaseIndex &&
                              currentKnowledgeIndexInPhase >= 0 &&
                              knowledgeIndex >
                                currentKnowledgeIndexInPhase + (isCurrentKnowledgeDoneStatus ? 1 : 0)) ||
                              (shouldUseSequentialFallbackLock &&
                                knowledgeIndex > contiguousCompletedKnowledgeCount));
                          const isKnowledgeLocked =
                            normalizedKnowledgeStatus === 'LOCKED' || isLockedPhase || isKnowledgeLockedBySequence;
                          const isKnowledgeCompleted =
                            isCompletedKnowledge(knowledge) ||
                            isPhaseEffectivelyDone(phase) ||
                            (Number.isInteger(currentKnowledgePhaseId) &&
                              currentKnowledgePhaseId === Number(phaseId) &&
                              currentKnowledgeIndexInPhase >= 0 &&
                              knowledgeIndex < currentKnowledgeIndexInPhase);
                          const isKnowledgeCurrent =
                            Number.isInteger(currentKnowledgePhaseId) &&
                            currentKnowledgePhaseId === Number(phaseId) &&
                            currentKnowledgeIndexInPhase === knowledgeIndex &&
                            !isCurrentKnowledgeDoneStatus;
                          const quizzes = Array.isArray(knowledge?.quizzes) ? knowledge.quizzes : [];
                          return (
                            <React.Fragment key={knowledgeId}>
                              <View
                                style={[
                                  styles.knowledgeItem,
                                  {
                                    borderColor: colors.border,
                                    backgroundColor: isKnowledgeLocked
                                      ? isDark
                                        ? 'rgba(51,65,85,0.6)'
                                        : '#F1F5F9'
                                      : isDark
                                      ? Colors.dark.surfaceVariant
                                      : '#F8FAFC',
                                    opacity: isKnowledgeLocked && !isKnowledgeCompleted ? 0.86 : 1,
                                  },
                                ]}>
                                <View style={styles.knowledgeStatusIconWrap}>
                                  <View
                                    style={[
                                      styles.knowledgeStatusIcon,
                                      {
                                        borderColor: isKnowledgeLocked
                                          ? isDark
                                            ? '#64748b'
                                            : '#cbd5e1'
                                          : isKnowledgeCompleted
                                          ? '#86efac'
                                          : isKnowledgeCurrent
                                          ? '#7dd3fc'
                                          : colors.border,
                                        backgroundColor: isKnowledgeCompleted
                                          ? isDark
                                            ? 'rgba(22,101,52,0.28)'
                                            : '#dcfce7'
                                          : isKnowledgeCurrent
                                          ? isDark
                                            ? 'rgba(3,105,161,0.28)'
                                            : '#e0f2fe'
                                          : isKnowledgeLocked
                                          ? isDark
                                            ? '#334155'
                                            : '#e2e8f0'
                                          : colors.surface,
                                      },
                                    ]}>
                                    <Icon
                                      name={
                                        isKnowledgeCompleted
                                          ? 'check'
                                          : isKnowledgeLocked
                                          ? 'lock-outline'
                                          : isKnowledgeCurrent
                                          ? 'progress-clock'
                                          : 'circle-outline'
                                      }
                                      size={12}
                                      color={
                                        isKnowledgeCompleted
                                          ? '#10b981'
                                          : isKnowledgeCurrent
                                          ? '#0ea5e9'
                                          : isKnowledgeLocked
                                          ? colors.textTertiary
                                          : colors.textSecondary
                                      }
                                    />
                                  </View>
                                </View>
                                <View style={{flex: 1}}>
                                  <Text style={[styles.knowledgeTitle, {color: colors.heading}]}>
                                    {knowledge.title || 'Kiến thức'}
                                  </Text>
                                  {!!knowledge.description && (
                                    <Text
                                      style={[styles.knowledgeDesc, {color: colors.textSecondary}]}
                                      numberOfLines={2}>
                                      {knowledge.description}
                                    </Text>
                                  )}
                                  <Text style={[styles.knowledgeStateText, {color: isKnowledgeLocked ? colors.textTertiary : Colors.primary}]}>
                                    {isKnowledgeCompleted
                                      ? 'Hoàn thành'
                                      : isKnowledgeLocked
                                      ? 'Đã khóa'
                                      : isKnowledgeCurrent
                                      ? 'Đang học'
                                      : 'Sẵn sàng'}
                                  </Text>
                                </View>
                              </View>
                              {quizzes.length > 0 ? (
                                <View style={styles.knowledgeQuizList}>
                                  {quizzes.map((quiz: any) => {
                                    const quizId = Number(quiz?.quizId || quiz?.id || 0);
                                    const questionCount =
                                      Number(quiz?.questionCount ?? quiz?.totalQuestion ?? quiz?.totalQuestions ?? 0) || 0;
                                    const durationInMinutes = getQuizDurationInMinutes(quiz);
                                    const statusLabel = String(quiz?.status || 'DRAFT').toUpperCase();
                                    const difficultyLabel = String(
                                      quiz?.overallDifficulty || quiz?.difficulty || '',
                                    ).toUpperCase();
                                    const outcomeMeta = getQuizOutcomeMeta(quiz);

                                    return (
                                      <View
                                        key={quizId || quiz.title}
                                        style={[
                                          styles.quizDetailCard,
                                          {
                                            borderColor: colors.border,
                                            backgroundColor: isDark
                                              ? Colors.dark.surfaceVariant
                                              : '#F8FAFC',
                                          },
                                        ]}>
                                        <View style={styles.quizDetailHeader}>
                                          <View style={{flex: 1}}>
                                            <Text style={[styles.quizItemTitle, {color: colors.heading}]}>
                                              {quiz.title || `Quiz #${quizId}`}
                                            </Text>
                                            <Text style={[styles.quizDetailSubText, {color: colors.textSecondary}]} numberOfLines={2}>
                                              {quiz.description || 'Quiz trong knowledge này'}
                                            </Text>
                                          </View>
                                          <Button
                                            title="Làm quiz"
                                            onPress={() => {
                                              if (!isKnowledgeLocked) {
                                                openQuizModeSelector(quiz, phaseId);
                                              }
                                            }}
                                            disabled={isKnowledgeLocked}
                                            size="sm"
                                            fullWidth={false}
                                            variant="outline"
                                            style={styles.quizActionBtn}
                                          />
                                        </View>

                                        <View style={styles.quizMetaWrap}>
                                          <View style={[styles.quizMetaChip, {
                                            borderColor: outcomeMeta.tone === 'success'
                                              ? '#86efac'
                                              : outcomeMeta.tone === 'danger'
                                                ? '#fecaca'
                                                : colors.border,
                                            backgroundColor: outcomeMeta.tone === 'success'
                                              ? isDark ? 'rgba(20,83,45,0.35)' : '#f0fdf4'
                                              : outcomeMeta.tone === 'danger'
                                                ? isDark ? 'rgba(127,29,29,0.35)' : '#fef2f2'
                                                : isDark ? Colors.dark.surfaceVariant : '#f8fafc',
                                          }]}>
                                            <Icon name="checkbox-marked-circle-outline" size={12} color={
                                              outcomeMeta.tone === 'success'
                                                ? isDark ? '#86efac' : '#166534'
                                                : outcomeMeta.tone === 'danger'
                                                  ? isDark ? '#fca5a5' : '#b91c1c'
                                                  : colors.textSecondary
                                            } />
                                            <Text style={[styles.quizMetaText, {
                                              color: outcomeMeta.tone === 'success'
                                                ? isDark ? '#86efac' : '#166534'
                                                : outcomeMeta.tone === 'danger'
                                                  ? isDark ? '#fca5a5' : '#b91c1c'
                                                  : colors.textSecondary,
                                            }]}>
                                              {outcomeMeta.label}
                                            </Text>
                                          </View>
                                          <View style={[styles.quizMetaChip, {borderColor: colors.border}]}> 
                                            <Icon name="help-circle-outline" size={12} color={Colors.primary} />
                                            <Text style={[styles.quizMetaText, {color: colors.textSecondary}]}>
                                              {questionCount > 0 ? `${questionCount} câu` : 'Chưa có số câu'}
                                            </Text>
                                          </View>
                                          <View style={[styles.quizMetaChip, {borderColor: colors.border}]}> 
                                            <Icon name="timer-outline" size={12} color={Colors.primary} />
                                            <Text style={[styles.quizMetaText, {color: colors.textSecondary}]}>
                                              {durationInMinutes > 0 ? `${durationInMinutes} phút` : 'Chưa có thời lượng'}
                                            </Text>
                                          </View>
                                          <View style={[styles.quizMetaChip, {borderColor: colors.border}]}> 
                                            <Icon name="chart-bar" size={12} color={Colors.primary} />
                                            <Text style={[styles.quizMetaText, {color: colors.textSecondary}]}>
                                              {difficultyLabel || 'Tùy chỉnh'}
                                            </Text>
                                          </View>
                                          {statusLabel !== 'ACTIVE' ? (
                                            <View style={[styles.quizMetaChip, {borderColor: colors.border}]}> 
                                              <Icon name="bookmark-check-outline" size={12} color={Colors.primary} />
                                              <Text style={[styles.quizMetaText, {color: colors.textSecondary}]}>
                                                {statusLabel}
                                              </Text>
                                            </View>
                                          ) : null}
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              ) : (
                                <Text style={[styles.knowledgeDesc, {color: colors.textTertiary}]}>Chưa có quiz cho knowledge này.</Text>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </View>
                    )}

                    {(phase.postLearningQuizzes || []).length > 0 && (
                      <View style={styles.quizListWrap}>
                        <Text style={[styles.quizListTitle, {color: colors.heading}]}>Quiz sau học</Text>
                        {(phase.postLearningQuizzes || []).map((quiz: any) => (
                          <TouchableOpacity
                            key={quiz.quizId}
                            style={[styles.quizItem, {borderColor: colors.border}]}
                            onPress={() => {
                              if (!isLockedPhase) {
                                openQuizModeSelector(quiz, phaseId);
                              }
                            }}>
                            <View style={styles.quizItemContent}>
                              <Text style={[styles.quizItemTitle, {color: colors.text}]}>
                                {quiz.title || `Quiz #${quiz.quizId}`}
                              </Text>
                              <View style={[styles.quizOutcomeChip, {
                                borderColor: getQuizOutcomeMeta(quiz).tone === 'success'
                                  ? '#86efac'
                                  : getQuizOutcomeMeta(quiz).tone === 'danger'
                                    ? '#fecaca'
                                    : colors.border,
                                backgroundColor: getQuizOutcomeMeta(quiz).tone === 'success'
                                  ? isDark ? 'rgba(20,83,45,0.35)' : '#f0fdf4'
                                  : getQuizOutcomeMeta(quiz).tone === 'danger'
                                    ? isDark ? 'rgba(127,29,29,0.35)' : '#fef2f2'
                                    : isDark ? Colors.dark.surfaceVariant : '#f8fafc',
                              }]}>
                                <Text style={[styles.quizOutcomeText, {
                                  color: getQuizOutcomeMeta(quiz).tone === 'success'
                                    ? isDark ? '#86efac' : '#166534'
                                    : getQuizOutcomeMeta(quiz).tone === 'danger'
                                      ? isDark ? '#fca5a5' : '#b91c1c'
                                      : colors.textSecondary,
                                }]}>
                                  {getQuizOutcomeMeta(quiz).label}
                                </Text>
                              </View>
                            </View>
                            <Icon name="chevron-right" size={18} color={colors.textTertiary} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {canShowRemedialDecision ? (
                      <View
                        style={[
                          styles.remedialCard,
                          {
                            borderColor: isDark ? '#1e3a8a' : '#bfdbfe',
                            backgroundColor: isDark ? 'rgba(30,58,138,0.25)' : '#eff6ff',
                          },
                        ]}>
                        <Text style={[styles.remedialTitle, {color: isDark ? '#bfdbfe' : '#1e3a8a'}]}>
                          Quyết định sau Post-learning
                        </Text>
                        <Text style={[styles.remedialText, {color: isDark ? '#dbeafe' : '#1e3a8a'}]}>
                          Kết quả post-learning chưa đạt. Chọn cách thêm phase remedial cho lộ trình.
                        </Text>
                        <Button
                          title="Tạo remedial và giữ deadline"
                          onPress={() => handleRemedialDecision(phaseId, 'COMPRESS_TO_KEEP_DEADLINE')}
                          loading={submittingRemedialDecision}
                          size="sm"
                          fullWidth
                          icon="check-circle-outline"
                        />
                        <Button
                          title="Tạo remedial và gia hạn deadline"
                          onPress={() => handleRemedialDecision(phaseId, 'EXTEND_DEADLINE')}
                          loading={submittingRemedialDecision}
                          size="sm"
                          variant="outline"
                          fullWidth
                          icon="calendar-clock-outline"
                        />
                      </View>
                    ) : null}
                      </>
                    ) : (
                      <Text style={[styles.phaseCollapsedHint, {color: colors.textSecondary}]}>Chạm vào phase để xem pre-learning, knowledge và quiz.</Text>
                    )}
                    </View>
                  </View>
                );
              })
              )
            ) : null}
          </View>
        )}

        {runningAction && (
          <View style={styles.runningRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={[styles.runningText, {color: colors.textSecondary}]}>Đang chạy tác vụ...</Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={journeyPanelVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setJourneyPanelVisible(false)}>
        <View style={styles.panelOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setJourneyPanelVisible(false)}
          />

          <View
            style={[
              styles.journeyPanel,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}>
            <View style={styles.journeyPanelHeader}>
              <View>
                <Text style={[styles.journeyPanelTitle, {color: colors.heading}]}>Roadmap Panel</Text>
                <Text style={[styles.journeyPanelSubtitle, {color: colors.textSecondary}]}>Chọn phase để mở nhanh</Text>
              </View>
              <TouchableOpacity
                onPress={() => setJourneyPanelVisible(false)}
                style={styles.journeyPanelCloseBtn}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={ref => {
                journeyPanelScrollRef.current = ref;
              }}
              style={styles.journeyPanelList}
              contentContainerStyle={styles.journeyPanelListContent}
              showsVerticalScrollIndicator={false}>
              {phases.map((phase: any, index: number) => {
                const phaseId = Number(phase?.phaseId || 0);
                const hasPreLearningQuiz = hasReadyRoadmapQuiz(phase?.preLearningQuizzes);
                const isLockedPhase =
                  index > maxUnlockedPhaseIndex &&
                  !hasPreLearningQuiz &&
                  !isCurrentPhaseByPayload(phaseId);
                const phaseVisualState = getPhaseVisualState(phase, index, isLockedPhase);
                const phaseVisualMeta = getPhaseVisualMeta(phaseVisualState);
                const selected = Number(selectedPhaseId) === phaseId;
                const itemStart = Math.min(index * 0.08, 0.56);
                const itemEnd = Math.min(itemStart + 0.28, 1);
                const animatedOpacity = panelEntranceAnim.interpolate({
                  inputRange: [itemStart, itemEnd],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                });
                const animatedTranslateY = panelEntranceAnim.interpolate({
                  inputRange: [itemStart, itemEnd],
                  outputRange: [10, 0],
                  extrapolate: 'clamp',
                });

                return (
                  <Animated.View
                    key={`panel-${phaseId || index}`}
                    style={{
                      opacity: animatedOpacity,
                      transform: [{translateY: animatedTranslateY}],
                    }}>
                    <TouchableOpacity
                      onLayout={event => {
                        if (Number.isInteger(phaseId) && phaseId > 0) {
                          panelItemYRef.current[phaseId] = event.nativeEvent.layout.y;
                        }
                      }}
                      onPress={() => handleSelectPhase(phaseId || null, {fromUser: true, closePanel: true})}
                      style={[
                        styles.journeyPanelItem,
                        {
                          borderColor: selected ? '#93c5fd' : colors.border,
                          backgroundColor: selected
                            ? isDark
                              ? 'rgba(30,58,138,0.28)'
                              : '#eff6ff'
                            : isDark
                            ? Colors.dark.surfaceVariant
                            : '#f8fafc',
                        },
                      ]}>
                      <View
                        style={[
                          styles.journeyPanelItemIcon,
                          {
                            borderColor: phaseVisualMeta.badgeBorder,
                            backgroundColor: phaseVisualMeta.badgeBackground,
                          },
                        ]}>
                        <Icon name={phaseVisualMeta.icon} size={14} color={phaseVisualMeta.badgeText} />
                      </View>

                      <View style={styles.journeyPanelItemBody}>
                        <Text numberOfLines={1} style={[styles.journeyPanelItemTitle, {color: colors.heading}]}> 
                          {phase?.title || `Giai đoạn ${index + 1}`}
                        </Text>
                        <Text style={[styles.journeyPanelItemStatus, {color: phaseVisualMeta.badgeText}]}> 
                          {phaseVisualMeta.label}
                        </Text>
                      </View>

                      <Icon name="chevron-right" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {width: 32, alignItems: 'center', justifyContent: 'center'},
  headerCenter: {flex: 1, marginHorizontal: Spacing.sm},
  headerTitle: {fontSize: 17, fontWeight: '600'},
  headerSub: {fontSize: 12, marginTop: 2},
  headerEditButton: {
    minWidth: 94,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  headerEditText: {fontSize: 12, fontWeight: '700', color: Colors.primary},
  content: {flex: 1},
  contentContainer: {padding: Spacing.lg, paddingBottom: Spacing['3xl']},
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyText: {fontSize: 13},
  chipsWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm},
  materialTitle: {fontSize: 12, marginBottom: Spacing.xs},
  materialWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm},
  materialChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  materialPickerCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  materialPickerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  materialPickerTitle: {fontSize: 14, fontWeight: '700'},
  materialPickerSubtitle: {fontSize: 12, lineHeight: 18, marginTop: 3},
  materialPickerCounter: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
  },
  materialPickerCounterText: {fontSize: 11, fontWeight: '800', color: Colors.primary},
  selectAllButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectAllText: {fontSize: 12, fontWeight: '700', color: Colors.primary},
  materialList: {gap: Spacing.xs},
  materialListItem: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  materialListName: {fontSize: 13, fontWeight: '700', lineHeight: 18},
  materialMetaRow: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 3},
  materialMetaText: {fontSize: 11, fontWeight: '700', textTransform: 'uppercase'},
  materialEmptyState: {borderRadius: BorderRadius.md, padding: Spacing.md},
  materialEmptyText: {fontSize: 12, lineHeight: 18},
  chip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  phaseWrap: {marginTop: Spacing.lg, gap: Spacing.sm},
  stageShell: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  stageTopBar: {
    minHeight: 62,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  stageTopTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stageStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stageTopTitleBody: {
    flex: 1,
    minWidth: 0,
  },
  stageTopTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  stageTopSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  stageIconButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageMapViewport: {
    paddingVertical: Spacing.sm,
  },
  stageMapViewportCompact: {
    minHeight: 154,
  },
  stageMapViewportExpanded: {
    minHeight: 300,
  },
  stageMapContent: {
    position: 'relative',
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  stageMapBackdrop: {
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.7,
  },
  stageNodeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 116,
  },
  stageRoadmapNode: {
    minHeight: 104,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: 6,
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 3,
  },
  stagePhaseCluster: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stageHorizontalConnector: {
    width: STAGE_PHASE_CONNECTOR_WIDTH,
    height: 2,
    marginTop: 34,
  },
  stagePhaseNode: {
    minHeight: 104,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    gap: 6,
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 2,
  },
  stageNodeHeader: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  stageNodeEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  stageNodeTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  stageNodeMeta: {
    fontSize: 11,
    fontWeight: '600',
  },
  stageNodeProgressWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  stageNodeProgressTrack: {
    flex: 1,
    height: 5,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  stageNodeProgressFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  stageNodeProgressText: {
    minWidth: 30,
    textAlign: 'right',
    fontSize: 10,
    fontWeight: '700',
  },
  stageKnowledgeBranch: {
    position: 'relative',
    minHeight: 122,
    paddingTop: 20,
  },
  stageBranchStem: {
    position: 'absolute',
    top: 0,
    left: 18,
    width: 2,
    height: 22,
    borderRadius: 1,
  },
  stageBranchLine: {
    height: 2,
    borderRadius: 1,
    marginBottom: 14,
  },
  stageKnowledgeNodeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: STAGE_KNOWLEDGE_GAP,
  },
  stageKnowledgeNode: {
    position: 'relative',
    minHeight: 88,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 6,
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  stageKnowledgeStem: {
    position: 'absolute',
    top: -14,
    left: 20,
    width: 2,
    height: 14,
    borderRadius: 1,
  },
  stageKnowledgeNodeTitle: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  stageDetailPanel: {
    margin: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  stageDetailPanelHeader: {
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  stageDetailPanelTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  stagePanelTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  stagePanelHint: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
  stageDetailPanelBody: {
    padding: Spacing.md,
  },
  stageDetailStack: {
    gap: Spacing.md,
  },
  stageDetailIntro: {
    gap: Spacing.xs,
  },
  stageDetailEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  stageDetailTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  stageDetailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  stageDetailSubText: {
    fontSize: 12,
    lineHeight: 18,
  },
  stageDetailText: {
    fontSize: 13,
    lineHeight: 20,
  },
  stageInlineChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stageStatusBadge: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stageStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stageStatsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  stageStatCard: {
    flex: 1,
    minHeight: 82,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    justifyContent: 'center',
    gap: 4,
  },
  stageStatValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  stageStatLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  stageSectionBlock: {
    gap: Spacing.sm,
  },
  stageSectionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  stageSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  stageSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  stageSectionHint: {
    fontSize: 12,
    fontWeight: '700',
  },
  stageSectionList: {
    gap: Spacing.sm,
  },
  stagePrimaryAction: {
    alignSelf: 'flex-start',
    minWidth: 150,
  },
  stageLoadingCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  stageLoadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stageLoadingTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  stageLoadingText: {
    fontSize: 12,
    lineHeight: 18,
  },
  stageLockCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  stageLockIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageLockTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  stageLockText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  stageDimmedContent: {
    opacity: 0.34,
  },
  stageReviewCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  stageReviewTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  stageReviewText: {
    fontSize: 12,
    lineHeight: 19,
  },
  stageReviewMeta: {
    fontSize: 11,
    fontWeight: '600',
  },
  stageDecisionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  stageDecisionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  stageDecisionText: {
    fontSize: 12,
    lineHeight: 19,
  },
  stageActionStack: {
    gap: Spacing.sm,
  },
  stageActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  stageKnowledgeRowCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stageKnowledgeStatusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageKnowledgeRowBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  stageKnowledgeRowTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  stageKnowledgeRowText: {
    fontSize: 12,
    lineHeight: 17,
  },
  stageKnowledgeStateText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stageQuizCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  stageQuizTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stageQuizBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  stageQuizTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  stageQuizSubtitle: {
    fontSize: 12,
    lineHeight: 17,
  },
  stageQuizButton: {
    minWidth: 82,
  },
  stageQuizMetaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stageMetaChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stageMetaText: {
    fontSize: 10,
    fontWeight: '700',
  },
  stageEmptyText: {
    fontSize: 12,
    lineHeight: 18,
  },
  stageFlashcardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  roadmapHeroCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base,
    gap: 4,
  },
  roadmapHeroTag: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  roadmapHeroTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  roadmapHeroMeta: {
    fontSize: 12,
  },
  roadmapActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roadmapActionChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roadmapActionChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  viewModeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  viewModeToggleChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewModeToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  viewModeUtilityBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasBoardWrap: {
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  canvasBoardHeader: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  canvasBoardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  canvasBoardSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  canvasBoardPill: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  canvasBoardPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  overviewControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overviewControlBtn: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasStrip: {
    gap: 12,
    paddingBottom: 4,
  },
  overviewCanvasInner: {
    position: 'relative',
  },
  overviewNode: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  overviewNodeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  overviewBone: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
    zIndex: 2,
  },
  overviewPhaseCard: {
    position: 'absolute',
    width: 224,
    minHeight: 118,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 5,
    zIndex: 3,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 3,
  },
  overviewPhaseTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  overviewPhaseTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  overviewPhaseStatus: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  overviewArrowBtn: {
    position: 'absolute',
    top: '50%',
    width: 32,
    height: 32,
    marginTop: -16,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  overviewArrowLeft: {
    left: 10,
  },
  overviewArrowRight: {
    right: 10,
  },
  overviewLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  overviewLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  overviewLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  overviewLegendText: {
    fontSize: 11,
    fontWeight: '600',
  },
  canvasCard: {
    width: 220,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  canvasCardTopRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  canvasCardNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasCardTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  canvasCardStatus: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  canvasCardDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  canvasCardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  canvasCardMetaChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  canvasCardMetaText: {
    fontSize: 10,
    fontWeight: '600',
  },
  canvasDetailCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  canvasDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  canvasDetailTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  canvasDetailSubtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  canvasDetailBadge: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  canvasDetailBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  canvasDetailText: {
    fontSize: 12,
    lineHeight: 18,
  },
  canvasDetailAction: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  canvasDetailActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  detailBoardWrap: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  detailBoardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  detailRail: {
    gap: 10,
    paddingBottom: 4,
  },
  detailRailTrack: {
    gap: 10,
    paddingBottom: 6,
    position: 'relative',
    alignItems: 'flex-start',
    paddingTop: 8,
  },
  detailPhaseBaseLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 20,
    height: 2,
  },
  detailPhaseStepWrap: {
    width: 190,
    alignItems: 'flex-start',
    gap: 8,
  },
  detailPhaseNode: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    zIndex: 3,
  },
  detailPhaseNodeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  detailPhaseCard: {
    width: 190,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 6,
  },
  detailPhaseTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  detailPhaseName: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  detailPhaseProgressWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  detailPhaseProgressTrack: {
    flex: 1,
    height: 5,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  detailPhaseProgressFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  detailPhaseProgressText: {
    minWidth: 32,
    textAlign: 'right',
    fontSize: 10,
    fontWeight: '700',
  },
  detailKnowledgeCard: {
    width: 190,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 6,
  },
  detailKnowledgeTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  detailKnowledgeName: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  detailInspector: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 4,
  },
  detailInspectorTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  detailInspectorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  detailQuizSection: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 8,
  },
  detailQuizTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  detailQuizCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailQuizName: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailQuizMeta: {
    marginTop: 2,
    fontSize: 11,
  },
  detailQuizActionBtn: {
    minWidth: 82,
  },
  detailKnowledgeLockHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  detailEmptyWrap: {
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  detailEmptyText: {
    fontSize: 12,
  },
  generationCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
    alignItems: 'flex-start',
  },
  generationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  generationTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  generationText: {
    fontSize: 12,
    lineHeight: 18,
  },
  generationProgressWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  generationProgressTrack: {
    flex: 1,
    height: 8,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  generationProgressFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  generationPercentText: {
    minWidth: 42,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
  },
  phaseGenerationLoader: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  phaseGenerationTitle: {fontSize: 14, fontWeight: '800', textAlign: 'center'},
  phaseGenerationText: {fontSize: 12, lineHeight: 18, textAlign: 'center'},
  roadmapSetupScreen: {
    borderWidth: 1,
    borderRadius: 28,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  roadmapSetupWelcome: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  roadmapSetupIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  roadmapSetupTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  roadmapSetupText: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  roadmapSetupButton: {
    minWidth: 170,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  configModal: {
    maxHeight: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  configModalHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  configModalTitle: {fontSize: 20, fontWeight: '800'},
  configModalDescription: {fontSize: 13, lineHeight: 19, marginTop: 5},
  configModalBody: {padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.xl},
  aiSuggestCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  aiSuggestTop: {flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm},
  aiSuggestIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecfeff',
  },
  aiSuggestTitle: {fontSize: 14, fontWeight: '800'},
  aiSuggestText: {fontSize: 12, lineHeight: 18, marginTop: 3},
  suggestionResult: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  suggestionText: {fontSize: 12, lineHeight: 18},
  configFieldLabel: {fontSize: 14, fontWeight: '800', marginTop: Spacing.sm},
  configHint: {fontSize: 12, lineHeight: 18},
  configOption: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  configRadio: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  configRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  configOptionTitle: {fontSize: 13, fontWeight: '800'},
  configOptionText: {fontSize: 12, lineHeight: 18, marginTop: 3},
  configInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    fontWeight: '700',
  },
  analysisCard: {borderRadius: BorderRadius.md, padding: Spacing.sm, gap: 3},
  analysisTitle: {fontSize: 12, fontWeight: '800'},
  analysisText: {fontSize: 12, lineHeight: 18},
  configErrorText: {fontSize: 12, lineHeight: 18, fontWeight: '700', color: Colors.error},
  configModalFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  configFooterButton: {minWidth: 122},
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  confirmDialog: {
    width: '100%',
    borderRadius: 22,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  confirmIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffbeb',
  },
  confirmTitle: {fontSize: 18, fontWeight: '800'},
  confirmText: {fontSize: 13, lineHeight: 20},
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  confirmButton: {minWidth: 118},
  quickActionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  quickActionSubtitle: {
    fontSize: 12,
    lineHeight: 18,
  },
  quickActionSection: {
    gap: Spacing.xs,
  },
  quickActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  quickActionSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  phaseWrapHidden: {display: 'none'},
  reviewCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  reviewTitle: {fontSize: 14, fontWeight: '700'},
  reviewConfidenceWrap: {gap: Spacing.xs},
  reviewConfidence: {fontSize: 12, fontWeight: '600'},
  reviewSegmentsRow: {flexDirection: 'row', gap: 4},
  reviewSegmentTrack: {
    flex: 1,
    height: 10,
    borderWidth: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  reviewSegmentFill: {
    height: '100%',
  },
  reviewSummary: {fontSize: 12, lineHeight: 18},
  reviewAssessedAt: {fontSize: 11, textAlign: 'right'},
  studyNewPromptCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  studyNewPromptTitle: {fontSize: 13, fontWeight: '700'},
  studyNewPromptText: {fontSize: 12, lineHeight: 18},
  preLearningDecisionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  preLearningDecisionTitle: {fontSize: 13, fontWeight: '700'},
  preLearningDecisionText: {fontSize: 12, lineHeight: 18},
  preLearningFallbackWrap: {marginTop: Spacing.xs},
  generatePhasesBtn: {minWidth: 150, marginBottom: Spacing.sm},
  phaseTimelineItem: {
    position: 'relative',
    paddingLeft: 34,
    marginBottom: Spacing.sm,
  },
  phaseTimelineLine: {
    position: 'absolute',
    left: 10,
    top: 26,
    bottom: -14,
    width: 2,
    borderRadius: 1,
  },
  phaseTimelineNodeWrap: {
    position: 'absolute',
    left: 0,
    top: 10,
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  phaseTimelineDoneNode: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  phaseTimelineIdleNode: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  phaseTimelineOrderText: {
    fontSize: 10,
    fontWeight: '700',
  },
  phaseCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  phaseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  phaseHeaderMain: {
    flex: 1,
    gap: 6,
  },
  phaseStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  phaseStateDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  phaseTitle: {fontSize: 15, fontWeight: '600'},
  phaseTitleRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.xs},
  phaseMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  phaseStateBadge: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phaseStateBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  phaseDurationChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phaseDurationText: {
    fontSize: 11,
    fontWeight: '500',
  },
  phaseDesc: {fontSize: 13, lineHeight: 18},
  phaseActions: {flexDirection: 'row', gap: Spacing.sm},
  actionBtn: {minWidth: 120},
  quizListWrap: {gap: Spacing.xs},
  quizListTitle: {fontSize: 13, fontWeight: '600'},
  knowledgeQuizList: {gap: Spacing.sm},
  quizItemContent: {flex: 1, gap: 6},
  quizDetailCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  quizDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  quizDetailSubText: {fontSize: 11, marginTop: 2, lineHeight: 16},
  quizActionBtn: {minWidth: 88},
  quizMetaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quizMetaChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quizOutcomeChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quizOutcomeText: {fontSize: 11, fontWeight: '600'},
  quizMetaText: {fontSize: 11, fontWeight: '500'},
  phaseCollapsedHint: {fontSize: 12, fontStyle: 'italic'},
  quizItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: 8,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  quizItemTitle: {fontSize: 12, flex: 1},
  knowledgeList: {gap: Spacing.sm},
  knowledgeItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  knowledgeStatusIconWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knowledgeStatusIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  knowledgeTitle: {fontSize: 13, fontWeight: '600'},
  knowledgeDesc: {fontSize: 12, marginTop: 2},
  knowledgeStateText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  smallBtn: {minWidth: 74},
  remedialCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  remedialTitle: {fontSize: 13, fontWeight: '700'},
  remedialText: {fontSize: 12, lineHeight: 18},
  runningRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  runningText: {fontSize: 13},
  journeyFab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  panelOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2,6,23,0.35)',
  },
  journeyPanel: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '68%',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  journeyPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  journeyPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  journeyPanelSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  journeyPanelCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyPanelList: {
    flex: 1,
  },
  journeyPanelListContent: {
    paddingBottom: Spacing['2xl'],
    gap: Spacing.xs,
  },
  journeyPanelItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  journeyPanelItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  journeyPanelItemBody: {
    flex: 1,
  },
  journeyPanelItemTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  journeyPanelItemStatus: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
});

