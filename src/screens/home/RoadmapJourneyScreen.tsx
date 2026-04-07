import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
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
    () => roadmaps.find(item => (item.roadmapId || item.id) === selectedRoadmapId),
    [roadmaps, selectedRoadmapId],
  );
  const activeRoadmapId = selectedRoadmap?.roadmapId || selectedRoadmap?.id;

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
          list.some((item: any) => (item.roadmapId || item.id) === normalizedRouteRoadmapId);
        setSelectedRoadmapId(
          hasRouteRoadmap ? normalizedRouteRoadmapId : list[0].roadmapId || list[0].id,
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
    } catch {
      setStructure(null);
      setCurrentPhaseProgress(null);
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
      setSelectedPhaseId(normalizedPhaseId);
    }
  }, [routePhaseId]);

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
      setSelectedPhaseId(Number(phases[0]?.phaseId) || null);
    }
  }, [phases, selectedPhaseId]);

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
      const status = String(phases[i]?.status || '').toUpperCase();
      if (status !== 'COMPLETED' && status !== 'SKIPPED') {
        break;
      }
      contiguousFinishedCount += 1;
    }

    return Math.max(0, currentIndex, Math.min(phases.length - 1, contiguousFinishedCount));
  }, [currentPhaseProgress?.phaseId, phases]);

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
              const roadmapId = item.roadmapId || item.id;
              const selected = roadmapId === selectedRoadmapId;
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
            {phaseReviewState.loading && Number(phaseReviewState.phaseId) === Number(activePhase?.phaseId) ? (
              <View style={[styles.reviewCard, {borderColor: colors.border, backgroundColor: colors.surface}]}> 
                <Text style={[styles.reviewSummary, {color: colors.textSecondary}]}>Đang đồng bộ đánh giá AI cho phase hiện tại...</Text>
              </View>
            ) : null}

            {phaseReviewState?.data?.summary && Number(phaseReviewState?.phaseId) === Number(activePhase?.phaseId) ? (
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

            <Text style={[styles.sectionTitle, {color: colors.heading}]}>Giai đoạn</Text>
            {contextType === 'WORKSPACE' && materials.length > 0 && !hasRoadmapPhases && (
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
            {!hasRoadmapPhases ? (
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
            )}
            {!hasRoadmapPhases ? (
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

                const showPhaseDetails = isSelected;

                return (
                  <View
                    key={phaseId || index}
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
                    <TouchableOpacity onPress={() => setSelectedPhaseId(Number(phaseId) || null)}>
                    <View style={styles.phaseTitleRow}>
                      {isLockedPhase ? (
                        <Icon name="lock-outline" size={16} color={colors.textTertiary} />
                      ) : null}
                      <Text style={[styles.phaseTitle, {color: colors.heading}]}>
                        {phase.title || `Giai đoạn ${index + 1}`}
                      </Text>
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
                          const quizzes = Array.isArray(knowledge?.quizzes) ? knowledge.quizzes : [];
                          return (
                            <React.Fragment key={knowledgeId}>
                              <View
                                style={[
                                  styles.knowledgeItem,
                                  {
                                    borderColor: colors.border,
                                    backgroundColor: isDark
                                      ? Colors.dark.surfaceVariant
                                      : '#F8FAFC',
                                  },
                                ]}>
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
                                </View>
                                <Button
                                  title="Tạo quiz"
                                  onPress={() => handleGenerateKnowledgeQuiz(activeRoadmapId, knowledgeId)}
                                  disabled={isLockedPhase}
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
                                              if (!isLockedPhase) {
                                                openQuizModeSelector(quiz, phaseId);
                                              }
                                            }}
                                            disabled={isLockedPhase}
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
                );
              })
            )}
          </View>
        )}

        {runningAction && (
          <View style={styles.runningRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={[styles.runningText, {color: colors.textSecondary}]}>Đang chạy tác vụ...</Text>
          </View>
        )}
      </ScrollView>
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
  phaseCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  phaseTitle: {fontSize: 15, fontWeight: '600'},
  phaseTitleRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.xs},
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
  knowledgeTitle: {fontSize: 13, fontWeight: '600'},
  knowledgeDesc: {fontSize: 12, marginTop: 2},
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
});

