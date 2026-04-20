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
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Svg, {Path} from 'react-native-svg';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import RoadmapAPI from '../../api/RoadmapAPI';
import AIAPI from '../../api/AIAPI';
import QuizAPI from '../../api/QuizAPI';
import RoadmapPhaseAPI from '../../api/RoadmapPhaseAPI';
import WorkspaceProfileAPI from '../../api/WorkspaceProfileAPI';

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

  const [loading, setLoading] = useState(true);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<number | null>(null);
  const [structure, setStructure] = useState<any>(null);
  const [profileLearningMode, setProfileLearningMode] = useState<string | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(
    Number.isInteger(Number(routePhaseId)) && Number(routePhaseId) > 0 ? Number(routePhaseId) : null,
  );
  const [currentPhaseProgress, setCurrentPhaseProgress] = useState<any>(null);
  const [currentKnowledgePayload, setCurrentKnowledgePayload] = useState<any>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [profileAdaptationMode, setProfileAdaptationMode] = useState<string | null>(null);
  const [submittingPreLearningDecision, setSubmittingPreLearningDecision] = useState(false);
  const [handledPreLearningDecisionPhaseIds, setHandledPreLearningDecisionPhaseIds] = useState<number[]>([]);
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
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<number | null>(null);
  const [knowledgeQuizMap, setKnowledgeQuizMap] = useState<Record<number, any[]>>({});
  const [viewMode, setViewMode] = useState<'overview' | 'detail'>('overview');
  const [journeyPanelVisible, setJourneyPanelVisible] = useState(false);
  const [followCurrentPhase, setFollowCurrentPhase] = useState(true);
  const userManuallySelectedPhaseRef = useRef(false);
  const journeyPanelScrollRef = useRef<ScrollView | null>(null);
  const panelItemYRef = useRef<Record<number, number>>({});
  const panelEntranceAnim = useRef(new Animated.Value(0)).current;
  const overviewScrollRef = useRef<ScrollView | null>(null);
  const [overviewZoom, setOverviewZoom] = useState(1);
  const panelAnimationRef = useRef<{stop: () => void} | null>(null);
  const isMountedRef = useRef(true);

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

      const quizTitle = quiz?.title || quiz?.name;
      Alert.alert('Chọn chế độ làm quiz', 'Bạn muốn làm quiz theo cách nào?', [
        {
          text: 'Luyện tập',
          onPress: () =>
            navigation.navigate('Quiz', {
              screen: 'PracticeQuiz',
              params: {
                quizId,
                title: quizTitle,
                backContext: {
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
                },
              },
            }),
        },
        {
          text: 'Thi thử',
          onPress: () =>
            navigation.navigate('Quiz', {
              screen: 'ExamQuiz',
              params: {
                quizId,
                title: quizTitle,
                backContext: {
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
                },
              },
            }),
        },
        {text: 'Hủy', style: 'cancel'},
      ]);
    },
    [contextId, contextType, navigation, selectedRoadmapId, showToast, title],
  );

  const selectedRoadmap = useMemo(
    () =>
      roadmaps.find(
        item => Number(item.roadmapId || item.id || 0) === Number(selectedRoadmapId || 0),
      ),
    [roadmaps, selectedRoadmapId],
  );
  const activeRoadmapId = Number(selectedRoadmap?.roadmapId || selectedRoadmap?.id || 0);

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
        } catch {
          setProfileLearningMode(null);
          setProfileAdaptationMode(null);
        }
      } else {
        setProfileLearningMode(null);
        setProfileAdaptationMode(null);
      }

      const res =
        contextType === 'GROUP'
          ? await RoadmapAPI.getForGroup(Number(contextId))
          : await RoadmapAPI.getForWorkspace(Number(contextId));

      const list = res.data || [];
      setRoadmaps(list);
      if (list.length > 0) {
        const normalizedRouteRoadmapId = Number(routeRoadmapId);
        const hasRouteRoadmap =
          Number.isInteger(normalizedRouteRoadmapId) &&
          normalizedRouteRoadmapId > 0 &&
          list.some((item: any) => Number(item.roadmapId || item.id || 0) === normalizedRouteRoadmapId);
        setSelectedRoadmapId(
          hasRouteRoadmap ? normalizedRouteRoadmapId : Number(list[0].roadmapId || list[0].id || 0),
        );
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

        const mergedStructure = {
          ...structureData,
          phases: Array.isArray(structureData?.phases)
            ? structureData.phases.map((phase: any) => ({
                ...phase,
                preLearningQuizzes: Array.isArray(phase?.preLearningQuizzes)
                  ? phase.preLearningQuizzes.map(mergeQuizState)
                  : [],
                postLearningQuizzes: Array.isArray(phase?.postLearningQuizzes)
                  ? phase.postLearningQuizzes.map(mergeQuizState)
                  : [],
                knowledges: Array.isArray(phase?.knowledges)
                  ? phase.knowledges.map((knowledge: any) => ({
                      ...knowledge,
                      quizzes: Array.isArray(knowledge?.quizzes)
                        ? knowledge.quizzes.map(mergeQuizState)
                        : [],
                    }))
                  : [],
              }))
            : structureData?.phases,
        };

        setStructure(mergedStructure);
      } catch {
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
    } catch {
      setStructure(null);
      setCurrentPhaseProgress(null);
      setCurrentKnowledgePayload(null);
    }
  }, []);

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

  const handleGeneratePreLearning = async (roadmapId: number, phaseId: number) => {
    const key = `pre-${phaseId}`;
    setRunningAction(key);
    try {
      await AIAPI.generateRoadmapPreLearning({roadmapId, phaseId});
      showToast('Đã bắt đầu tạo quiz trước học', 'success');
    } catch {
      showToast('Không thể tạo quiz trước học', 'error');
    } finally {
      setRunningAction(null);
    }
  };

  const handleGeneratePhaseContent = async (
    roadmapId: number,
    phaseId: number,
    skipPreLearning = false,
  ) => {
    const key = `content-${phaseId}`;
    setRunningAction(key);
    try {
      await AIAPI.generateRoadmapPhaseContent({
        roadmapId,
        phaseId,
        skipPreLearning,
      });
      showToast('Đã bắt đầu tạo nội dung giai đoạn', 'success');
    } catch {
      showToast('Không thể tạo nội dung giai đoạn', 'error');
    } finally {
      setRunningAction(null);
    }
  };

  const handleGenerateKnowledgeQuiz = async (roadmapId: number, knowledgeId: number) => {
    const key = `knowledge-${knowledgeId}`;
    setRunningAction(key);
    try {
      await AIAPI.generateRoadmapKnowledgeQuiz({roadmapId, knowledgeId});
      showToast('Đã bắt đầu tạo quiz kiến thức', 'success');
    } catch {
      showToast('Không thể tạo quiz kiến thức', 'error');
    } finally {
      setRunningAction(null);
    }
  };

  const handleGenerateRoadmapPhases = async (roadmapId: number) => {
    setRunningAction('phases');
    try {
      await AIAPI.generateRoadmapPhases({
        roadmapId,
        materialIds: selectedMaterialIds,
      });
      showToast('Đã bắt đầu tạo các giai đoạn lộ trình', 'success');
    } catch {
      showToast('Không thể tạo các giai đoạn lộ trình', 'error');
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
    } catch (error: any) {
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

  const phases = useMemo(() => {
    const list = Array.isArray(structure?.phases) ? structure.phases : [];
    return [...list].sort((a: any, b: any) => Number(a?.phaseIndex ?? 0) - Number(b?.phaseIndex ?? 0));
  }, [structure?.phases]);

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
  const isStrictRoadmap = adaptationMode === 'STRICT';

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

  const maxUnlockedPhaseIndex = useMemo(() => {
    if (!Array.isArray(phases) || phases.length === 0) {
      return 0;
    }

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

    return Math.max(0, currentIndex, Math.min(phases.length - 1, contiguousFinishedCount));
  }, [currentPhaseProgress?.phaseId, isPhaseEffectivelyDone, phases]);

  const hasRoadmapPhases = useMemo(() => {
    const fromStructure = Array.isArray(structure?.phases) && structure.phases.length > 0;
    const fromSortedPhases = Array.isArray(phases) && phases.length > 0;
    const fromCurrentProgress = Number.isInteger(Number(currentPhaseProgress?.phaseId)) && Number(currentPhaseProgress?.phaseId) > 0;
    return fromStructure || fromSortedPhases || fromCurrentProgress;
  }, [currentPhaseProgress?.phaseId, phases, structure?.phases]);

  const isPhaseFinishedStatus = useCallback((phaseStatus: any) => {
    const normalizedStatus = String(phaseStatus || '').toUpperCase();
    return normalizedStatus === 'COMPLETED' || normalizedStatus === 'SKIPPED';
  }, []);

  const isCurrentPayloadFinished = useMemo(
    () => isPhaseFinishedStatus(currentPhaseProgress?.status),
    [currentPhaseProgress?.status, isPhaseFinishedStatus],
  );
  const currentPayloadPhaseId = Number(currentPhaseProgress?.phaseId);
  const currentPayloadPhaseIndex = Number(currentPhaseProgress?.phaseIndex);
  const currentKnowledgePhaseId = Number(currentKnowledgePayload?.phaseId);
  const currentKnowledgeId = Number(currentKnowledgePayload?.knowledgeId);
  const currentKnowledgeStatus = String(currentKnowledgePayload?.status || '').toUpperCase();
  const isCurrentKnowledgeDoneStatus = ['DONE', 'COMPLETED', 'SKIPPED'].includes(currentKnowledgeStatus);
  const currentKnowledgePhaseIndex = Number.isInteger(currentKnowledgePhaseId) && currentKnowledgePhaseId > 0
    ? phases.findIndex((phase: any) => Number(phase?.phaseId) === currentKnowledgePhaseId)
    : -1;

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

  const activePhaseVisualMeta = useMemo(() => {
    return getPhaseVisualMeta(getPhaseVisualState(activePhase, Math.max(0, activePhaseIndex), false));
  }, [activePhase, activePhaseIndex, getPhaseVisualMeta, getPhaseVisualState]);

  const activePhaseKnowledges = useMemo(() => {
    return Array.isArray(activePhase?.knowledges) ? activePhase.knowledges : [];
  }, [activePhase?.knowledges]);

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

  const showLegacyDetailList = false;

  const overviewWave = useMemo(() => {
    const count = Math.max(1, phases.length);
    const phaseGap = 210 * overviewZoom;
    const pad = 130 * overviewZoom;
    const width = Math.max(920, pad * 2 + (count - 1) * phaseGap + 120);
    const height = 420;
    const centerY = 230;
    const amplitude = 58 * overviewZoom;

    const points = Array.from({length: count}, (_, index) => ({
      x: pad + index * phaseGap,
      y: centerY + (index % 2 === 0 ? -amplitude : amplitude),
    }));

    const path = points.reduce((acc, point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`;
      }
      const prev = points[index - 1];
      const midX = (prev.x + point.x) / 2;
      return `${acc} C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
    }, '');

    return {
      width,
      height,
      centerY,
      points,
      path,
    };
  }, [overviewZoom, phases.length]);

  const zoomOverviewIn = useCallback(() => {
    setOverviewZoom(prev => Math.min(1.45, Number((prev + 0.1).toFixed(2))));
  }, []);

  const zoomOverviewOut = useCallback(() => {
    setOverviewZoom(prev => Math.max(0.8, Number((prev - 0.1).toFixed(2))));
  }, []);

  const resetOverviewViewport = useCallback(() => {
    setOverviewZoom(1);
    overviewScrollRef.current?.scrollTo({x: 0, animated: true});
  }, []);

  const scrollOverviewBy = useCallback((offset: number) => {
    if (!overviewScrollRef.current) {
      return;
    }
    overviewScrollRef.current.scrollTo({x: Math.max(0, offset), animated: true});
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}>
      <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, {color: colors.heading}]}>Hành trình lộ trình</Text>
          <Text style={[styles.headerSub, {color: colors.textSecondary}]}>
            {title || (contextType === 'GROUP' ? 'Nhóm' : 'Workspace')}
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
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

        {!!activeRoadmapId && (
          <View style={styles.phaseWrap}>
            <View
              style={[
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

            <View style={styles.viewModeToggleRow}>
              <TouchableOpacity
                onPress={() => setViewMode('detail')}
                style={[
                  styles.viewModeToggleChip,
                  {
                    borderColor: viewMode === 'detail' ? '#93c5fd' : colors.border,
                    backgroundColor: viewMode === 'detail'
                      ? isDark
                        ? 'rgba(30,58,138,0.3)'
                        : '#dbeafe'
                      : colors.surface,
                  },
                ]}>
                <Icon
                  name="view-list"
                  size={14}
                  color={viewMode === 'detail' ? Colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.viewModeToggleText,
                    {color: viewMode === 'detail' ? Colors.primary : colors.textSecondary},
                  ]}>
                  Chi tiết
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setViewMode('overview')}
                style={[
                  styles.viewModeToggleChip,
                  {
                    borderColor: viewMode === 'overview' ? '#93c5fd' : colors.border,
                    backgroundColor: viewMode === 'overview'
                      ? isDark
                        ? 'rgba(30,58,138,0.3)'
                        : '#dbeafe'
                      : colors.surface,
                  },
                ]}>
                <Icon
                  name="map-outline"
                  size={14}
                  color={viewMode === 'overview' ? Colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.viewModeToggleText,
                    {color: viewMode === 'overview' ? Colors.primary : colors.textSecondary},
                  ]}>
                  Tổng quan
                </Text>
              </TouchableOpacity>

            </View>

            {viewMode === 'overview' ? (
              <View style={styles.canvasBoardWrap}>
                <View style={[styles.canvasBoardHeader, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                  <View>
                    <Text style={[styles.canvasBoardTitle, {color: colors.heading}]}>Canvas roadmap</Text>
                    <Text style={[styles.canvasBoardSubtitle, {color: colors.textSecondary}]}>Lộ trình dạng sơ đồ như FE</Text>
                  </View>
                  <View style={styles.overviewControlsRow}>
                    <TouchableOpacity
                      onPress={zoomOverviewOut}
                      style={[styles.overviewControlBtn, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                      <Icon name="magnify-minus-outline" size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={zoomOverviewIn}
                      style={[styles.overviewControlBtn, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                      <Icon name="magnify-plus-outline" size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={resetOverviewViewport}
                      style={[styles.overviewControlBtn, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                      <Icon name="fit-to-page-outline" size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView
                  ref={ref => {
                    overviewScrollRef.current = ref;
                  }}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.canvasStrip}>
                  <View style={[styles.overviewCanvasInner, {width: overviewWave.width, height: overviewWave.height}]}> 
                    <Svg width={overviewWave.width} height={overviewWave.height} style={StyleSheet.absoluteFillObject}>
                      <Path d={overviewWave.path} stroke={isDark ? '#0ea5e9' : '#86efac'} strokeWidth={22} fill="none" opacity={0.22} />
                      <Path d={overviewWave.path} stroke={isDark ? '#22d3ee' : '#10b981'} strokeWidth={5} fill="none" />
                    </Svg>

                    {phases.map((phase: any, index: number) => {
                      const point = overviewWave.points[index];
                      if (!point) return null;

                      const phaseId = Number(phase?.phaseId || 0);
                      const hasPreLearningQuiz =
                        Array.isArray(phase?.preLearningQuizzes) && phase.preLearningQuizzes.length > 0;
                      const isLockedPhase = index > maxUnlockedPhaseIndex && !hasPreLearningQuiz;
                      const visualState = getPhaseVisualState(phase, index, isLockedPhase);
                      const visualMeta = getPhaseVisualMeta(visualState);
                      const isSelected = Number(selectedPhaseId) === phaseId;
                      const isTopCard = index % 2 === 0;
                      const cardTop = isTopCard ? Math.max(12, point.y - 160) : point.y + 30;

                      return (
                        <React.Fragment key={`overview-phase-${phaseId || index}`}>
                          <View
                            style={[
                              styles.overviewNode,
                              {
                                left: point.x - 12,
                                top: point.y - 12,
                                borderColor: visualMeta.badgeBorder,
                                backgroundColor: visualMeta.badgeBackground,
                              },
                            ]}>
                            <Text style={[styles.overviewNodeText, {color: visualMeta.badgeText}]}> 
                              {index + 1}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.overviewBone,
                              {
                                left: point.x - 1,
                                top: isTopCard ? cardTop + 124 : point.y + 12,
                                height: isTopCard ? point.y - (cardTop + 124) : cardTop - (point.y + 12),
                                backgroundColor: isDark ? '#475569' : '#cbd5e1',
                              },
                            ]}
                          />

                          <TouchableOpacity
                            onPress={() => handleSelectPhase(phaseId || null, {fromUser: true})}
                            style={[
                              styles.overviewPhaseCard,
                              {
                                left: point.x - 112,
                                top: cardTop,
                                borderColor: isSelected ? '#7dd3fc' : colors.border,
                                backgroundColor: isSelected
                                  ? isDark
                                    ? 'rgba(14,165,233,0.18)'
                                    : '#ecfeff'
                                  : colors.surface,
                                shadowColor: isSelected ? '#0ea5e9' : '#0f172a',
                              },
                            ]}>
                            <Text style={[styles.overviewPhaseTag, {color: colors.textTertiary}]}>GIAI ĐOẠN {index + 1}</Text>
                            <Text numberOfLines={2} style={[styles.overviewPhaseTitle, {color: colors.heading}]}> 
                              {phase?.title || `Giai đoạn ${index + 1}`}
                            </Text>
                            <Text style={[styles.overviewPhaseStatus, {color: visualMeta.badgeText}]}> 
                              {visualMeta.label}
                            </Text>
                          </TouchableOpacity>
                        </React.Fragment>
                      );
                    })}

                    <TouchableOpacity
                      onPress={() => scrollOverviewBy(Math.max(0, (overviewWave.points[0]?.x || 0) - 260))}
                      style={[styles.overviewArrowBtn, styles.overviewArrowLeft, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                      <Icon name="chevron-left" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => scrollOverviewBy(Math.max(0, (overviewWave.points[overviewWave.points.length - 1]?.x || 0) - 260))}
                      style={[styles.overviewArrowBtn, styles.overviewArrowRight, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                      <Icon name="chevron-right" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </ScrollView>

                <View style={styles.overviewLegendRow}>
                  {[
                    {label: 'Hoàn thành', color: '#10b981'},
                    {label: 'Hiện tại', color: '#0ea5e9'},
                    {label: 'Next', color: '#f59e0b'},
                    {label: 'Đã khóa', color: '#94a3b8'},
                  ].map(item => (
                    <View key={item.label} style={styles.overviewLegendItem}>
                      <View style={[styles.overviewLegendDot, {backgroundColor: item.color}]} />
                      <Text style={[styles.overviewLegendText, {color: colors.textSecondary}]}>{item.label}</Text>
                    </View>
                  ))}
                </View>

                {!!activePhase ? (
                  <View style={[styles.canvasDetailCard, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                    <View style={styles.canvasDetailHeader}>
                      <View style={{flex: 1}}>
                        <Text style={[styles.canvasDetailTitle, {color: colors.heading}]}> 
                          {activePhase?.title || 'Phase hiện tại'}
                        </Text>
                        <Text style={[styles.canvasDetailSubtitle, {color: colors.textSecondary}]}> 
                          {formatPhaseDurationLabel(activePhase) || 'Không có thời lượng dự kiến'}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.canvasDetailBadge,
                          {
                            borderColor: activePhaseVisualMeta.badgeBorder,
                            backgroundColor: activePhaseVisualMeta.badgeBackground,
                          },
                        ]}>
                        <Text style={[styles.canvasDetailBadgeText, {color: activePhaseVisualMeta.badgeText}]}> 
                          {activePhaseVisualMeta.label}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.canvasDetailText, {color: colors.textSecondary}]} numberOfLines={3}> 
                      {activePhase?.description || 'Canvas view đang hiển thị phase hiện tại.'}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {viewMode === 'detail' ? (
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
                    const hasPreLearningQuiz =
                      Array.isArray(phase?.preLearningQuizzes) && phase.preLearningQuizzes.length > 0;
                    const isLockedPhase = index > maxUnlockedPhaseIndex && !hasPreLearningQuiz;
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
                    const isLocked = normalizedStatus === 'LOCKED';
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

                {!!selectedKnowledge ? (
                  <View style={[styles.detailQuizSection, {borderColor: colors.border}]}> 
                    <Text style={[styles.detailQuizTitle, {color: colors.heading}]}> 
                      Quiz của {selectedKnowledge?.title || 'knowledge'}
                    </Text>
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
                    ) : (
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
                          loading={runningAction === `knowledge-${Number(selectedKnowledgeId || 0)}`}
                        />
                      </View>
                    )}
                  </View>
                ) : null}

                {!!activePhase ? (
                  <View style={[styles.detailInspector, {borderColor: colors.border}]}> 
                    <Text style={[styles.detailInspectorTitle, {color: colors.heading}]}> 
                      {activePhase?.title || 'Chi tiết giai đoạn'}
                    </Text>
                    <Text style={[styles.detailInspectorText, {color: colors.textSecondary}]}> 
                      {activePhase?.description || 'Chọn một giai đoạn để xem chi tiết.'}
                    </Text>
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
                  loading={runningAction === 'phases'}
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
                const phaseId = phase.phaseId;
                const isSelected = Number(phaseId) === Number(selectedPhaseId);
                const knowledges = phase.knowledges || [];
                const preKey = `pre-${phaseId}`;
                const contentKey = `content-${phaseId}`;
                const hasPreLearningQuiz =
                  Array.isArray(phase?.preLearningQuizzes) && phase.preLearningQuizzes.length > 0;
                const isLockedPhase = index > maxUnlockedPhaseIndex && !hasPreLearningQuiz;
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
                const isUnlockingPhase = unlockingPhaseIds.includes(Number(phaseId));
                const isUnlockable =
                  isLockedPhase &&
                  index === maxUnlockedPhaseIndex + 1 &&
                  previousPhaseCompleted &&
                  !isUnlockingPhase;
                const hasPostLearning =
                  Array.isArray(phase?.postLearningQuizzes) && phase.postLearningQuizzes.length > 0;
                const hasPreLearning =
                  Array.isArray(phase?.preLearningQuizzes) && phase.preLearningQuizzes.length > 0;
                const isCurrentPhase = Number(currentPhaseProgress?.phaseId) === Number(phaseId);
                const hasKnowledge = knowledges.length > 0;
                const showStudyNewPromptCard =
                  isStudyNewRoadmap && isCurrentPhase && !isLockedPhase && !hasPreLearning && !hasKnowledge;
                const isPreLearningDecisionHandled = handledPreLearningDecisionPhaseIds.includes(
                  Number(phaseId),
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
                  !isPreLearningDecisionHandled;
                const canShowRemedialDecision =
                  hasPostLearning &&
                  isFlexibleRoadmap &&
                  !isLockedPhase &&
                  Number(currentPhaseProgress?.phaseId) === Number(phaseId) &&
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
                    runningAction === contentKey
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
                          onPress={() => handleGeneratePreLearning(activeRoadmapId, phaseId)}
                          loading={runningAction === preKey}
                          variant="outline"
                          size="sm"
                          fullWidth
                          icon="book-open-page-variant-outline"
                        />
                        <Button
                          title="Tôi là người mới"
                          onPress={() => handleGeneratePhaseContent(activeRoadmapId, phaseId, true)}
                          loading={runningAction === contentKey}
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
                              current.includes(Number(phaseId))
                                ? current
                                : [...current, Number(phaseId)],
                            );

                            try {
                              await handleGeneratePreLearning(activeRoadmapId, phaseId);
                              await fetchStructure(Number(activeRoadmapId));
                            } finally {
                              setUnlockingPhaseIds(current =>
                                current.filter(id => id !== Number(phaseId)),
                              );
                            }
                          }}
                          loading={isUnlockingPhase || runningAction === preKey}
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
                            onPress={() => handleGeneratePreLearning(activeRoadmapId, phaseId)}
                            disabled={isLockedPhase}
                            loading={runningAction === preKey}
                            size="sm"
                            variant="secondary"
                            fullWidth={false}
                            style={styles.actionBtn}
                          />
                          <Button
                            title="Nội dung giai đoạn"
                            onPress={() => handleGeneratePhaseContent(activeRoadmapId, phaseId)}
                            disabled={isLockedPhase}
                            loading={runningAction === contentKey}
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
                                <Button
                                  title={isKnowledgeLocked ? 'Đã khóa' : 'Tạo quiz'}
                                  onPress={() => {
                                    if (!isKnowledgeLocked) {
                                      handleGenerateKnowledgeQuiz(activeRoadmapId, knowledgeId);
                                    }
                                  }}
                                  disabled={isKnowledgeLocked}
                                  loading={runningAction === `knowledge-${knowledgeId}`}
                                  size="sm"
                                  fullWidth={false}
                                  style={styles.smallBtn}
                                />
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
                const hasPreLearningQuiz =
                  Array.isArray(phase?.preLearningQuizzes) && phase.preLearningQuizzes.length > 0;
                const isLockedPhase = index > maxUnlockedPhaseIndex && !hasPreLearningQuiz;
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
  chip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  phaseWrap: {marginTop: Spacing.lg, gap: Spacing.sm},
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
  detailEmptyWrap: {
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  detailEmptyText: {
    fontSize: 12,
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

