import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import WelcomeBackground from '../../components/ui/WelcomeBackground';
import WorkspaceStatisticsPanel from '../../components/features/WorkspaceStatisticsPanel';
import WorkspaceAPI from '../../api/WorkspaceAPI';
import MaterialAPI from '../../api/MaterialAPI';
import QuizAPI from '../../api/QuizAPI';
import FlashcardAPI from '../../api/FlashcardAPI';
import RoadmapAPI from '../../api/RoadmapAPI';
import useWebSocket from '../../hooks/useWebSocket';
import WorkspaceProfileAPI from '../../api/WorkspaceProfileAPI';
import {isDeletedMaterial} from '../../api/MaterialAPI';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

type BottomTab = 'chat' | 'sources' | 'stats' | 'studio';
type WorkspaceActivity = {
  name: string;
  type: string;
  actionKey: string;
  accessedAt: string;
};

/* ──── Quick‑action data ──── */
const QUICK_ACTIONS = [
  {icon: 'map-outline', label: 'Lộ trình', key: 'roadmap', color: '#059669'},
  {icon: 'head-question-outline', label: 'Quiz', key: 'quiz', color: '#2563EB'},
  {icon: 'cards-outline', label: 'Flashcard', key: 'flashcard', color: '#EA580C'},
  {icon: 'clipboard-text-outline', label: 'Thi thử', key: 'mockTest', color: '#7C3AED'},
];

/* ──── Studio item data ──── */
const STUDIO_ITEMS = (counts: {q: number; f: number; s: number; r: number}) => [
  {icon: 'map-outline', label: 'Lộ trình', count: counts.r, color: '#059669', key: 'roadmap'},
  {icon: 'head-question-outline', label: 'Quiz', count: counts.q, color: '#2563EB', key: 'quiz'},
  {icon: 'cards-outline', label: 'Flashcard', count: counts.f, color: '#EA580C', key: 'flashcard'},
  {icon: 'file-document-outline', label: 'Tài liệu', count: counts.s, color: '#64748B', key: 'sources'},
];

export default function WorkspaceScreen({navigation, route}: any) {
  const {workspaceId, title} = route.params;
  const {isDark, colors} = useTheme();
  const screenBackground = isDark ? colors.backgroundSecondary : colors.background;
  const {showToast} = useToast();
  const [workspace, setWorkspace] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [profileStatusLoading, setProfileStatusLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>('chat');
  const [, setAccessHistory] = useState<WorkspaceActivity[]>([]);
  const [deletingMaterial, setDeletingMaterial] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const hasAutoOpenedWizardRef = useRef(false);
  const lastQuizProgressEventKeyRef = useRef<string | null>(null);
  const latestFetchRequestIdRef = useRef(0);
  const processingPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const refreshRetryTimer1Ref = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const refreshRetryTimer2Ref = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleBackToWorkspaceList = useCallback(() => {
    navigation.navigate('HomeMain');
  }, [navigation]);

  const addAccessHistory = useCallback(
    (name: string, type: string, actionKey: string) => {
      setAccessHistory(prev => {
        const filtered = prev.filter(item => item.actionKey !== actionKey);
        return [
          {
            name,
            type,
            actionKey,
            accessedAt: new Date().toISOString(),
          },
          ...filtered,
        ].slice(0, 20);
      });
    },
    [],
  );

  const openQuizModeSelector = useCallback(
    (quiz: any) => {
      const quizId = Number(quiz?.id || quiz?.quizId);
      if (!quizId) {
        showToast('Thiếu Quiz ID', 'error');
        return;
      }

      const quizTitle = quiz?.name || quiz?.title;
      addAccessHistory(quizTitle || 'Quiz', 'quiz', `quiz:${quizId}`);
      const backContext = {
        type: 'workspace',
        workspaceId: Number(workspaceId),
        title,
      };

      navigation.navigate('Quiz', {
        screen: 'QuizDetail',
        params: {
          quizId,
          quiz,
          title: quizTitle,
          backContext,
          contextType: 'WORKSPACE',
          contextId: Number(workspaceId),
          workspaceId: Number(workspaceId),
        },
      });
    },
    [addAccessHistory, navigation, showToast, title, workspaceId],
  );

  const openFlashcardDetail = useCallback(
    (flashcard: any) => {
      const flashcardId = Number(flashcard?.id || flashcard?.flashcardSetId || 0);
      if (!Number.isInteger(flashcardId) || flashcardId <= 0) {
        showToast('Thiếu Flashcard ID', 'error');
        return;
      }

      addAccessHistory(
        flashcard?.name || flashcard?.title || 'Flashcard',
        'flashcard',
        `flashcard:${flashcardId}`,
      );
      navigation.navigate('FlashcardStudy', {
        flashcardId,
        title: flashcard?.name || flashcard?.title,
        contextType: 'WORKSPACE',
        contextId: Number(workspaceId),
        workspaceId: Number(workspaceId),
        backTitle: title,
      });
    },
    [addAccessHistory, navigation, showToast, title, workspaceId],
  );

  const handleChangeBottomTab = useCallback(
    (tab: BottomTab) => {
      const activityMap: Record<BottomTab, {name: string; type: string}> = {
        chat: {name: 'Tổng quan', type: 'overview'},
        sources: {name: 'Tài liệu', type: 'sources'},
        stats: {name: 'Dashboard', type: 'dashboard'},
        studio: {name: 'Studio', type: 'studio'},
      };
      const activity = activityMap[tab];
      addAccessHistory(activity.name, activity.type, tab);
      setActiveBottomTab(tab);
    },
    [addAccessHistory],
  );

  const handleOpenMaterialDetail = useCallback(
    (material: any) => {
      const materialId = Number(material?.materialId || material?.id || 0);
      addAccessHistory(
        material?.title || material?.fileName || material?.name || 'Tài liệu',
        'source',
        `source:${materialId || material?.title || 'unknown'}`,
      );
      navigation.navigate('MaterialDetail', {
        material,
      });
    },
    [addAccessHistory, navigation],
  );

  const fetchData = useCallback(async () => {
    const requestId = ++latestFetchRequestIdRef.current;
    const normalizedWorkspaceId = Number(workspaceId);

    if (!Number.isInteger(normalizedWorkspaceId) || normalizedWorkspaceId <= 0) {
      if (requestId === latestFetchRequestIdRef.current) {
        setWorkspace(null);
        setMaterials([]);
        setQuizzes([]);
        setFlashcards([]);
        setRoadmaps([]);
        setOnboardingCompleted(null);
        setProfileStatusLoading(false);
        setLoading(false);
      }
      return;
    }

    try {
      const [wsRes, matRes] = await Promise.allSettled([
        WorkspaceAPI.getById(normalizedWorkspaceId),
        MaterialAPI.getByWorkspace(normalizedWorkspaceId),
      ]);

      if (requestId !== latestFetchRequestIdRef.current) {
        return;
      }

      if (wsRes.status === 'fulfilled') {
        setWorkspace(wsRes.value.data || null);
      } else {
        setWorkspace(null);
      }

      if (matRes.status === 'fulfilled') {
        setMaterials(Array.isArray(matRes.value.data) ? matRes.value.data : matRes.value.data?.data || []);
      } else {
        setMaterials([]);
      }

      try {
        setProfileStatusLoading(true);
        const profileRes = await WorkspaceProfileAPI.getProfile(normalizedWorkspaceId);
        if (requestId !== latestFetchRequestIdRef.current) {
          return;
        }
        const profile = profileRes.data?.data || profileRes.data || {};
        const done =
          profile?.onboardingCompleted === true ||
          String(profile?.workspaceSetupStatus || '').toUpperCase() === 'DONE';
        setOnboardingCompleted(Boolean(done));
      } catch {
        if (requestId !== latestFetchRequestIdRef.current) {
          return;
        }
        setOnboardingCompleted(null);
      } finally {
        if (requestId === latestFetchRequestIdRef.current) {
          setProfileStatusLoading(false);
        }
      }

      const [quizRes, fcRes] = await Promise.allSettled([
        QuizAPI.getByContext('WORKSPACE', normalizedWorkspaceId),
        FlashcardAPI.getByContext('WORKSPACE', normalizedWorkspaceId),
      ]);

      if (requestId !== latestFetchRequestIdRef.current) {
        return;
      }

      setQuizzes(quizRes.status === 'fulfilled' ? quizRes.value.data || [] : []);
      setFlashcards(fcRes.status === 'fulfilled' ? fcRes.value.data || [] : []);

      // Roadmaps – separate try/catch so it doesn't block others
      try {
        const rmRes = await RoadmapAPI.getForWorkspace(normalizedWorkspaceId);
        if (requestId !== latestFetchRequestIdRef.current) {
          return;
        }
        setRoadmaps(rmRes.data || []);
      } catch (error) {
        if (requestId !== latestFetchRequestIdRef.current) {
          return;
        }
        setRoadmaps([]);
        console.warn('Workspace roadmap load failed:', error);
      }
    } finally {
      if (requestId === latestFetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (loading || profileStatusLoading) {
      return;
    }
    if (hasAutoOpenedWizardRef.current) {
      return;
    }
    if (onboardingCompleted === false) {
      hasAutoOpenedWizardRef.current = true;
      navigation.navigate('WorkspaceProfileWizard', {
        workspaceId,
        title,
      });
    }
  }, [loading, profileStatusLoading, onboardingCompleted, navigation, workspaceId, title]);

  const triggerMaterialRefresh = useCallback(() => {
    fetchData();

    if (refreshRetryTimer1Ref.current) {
      clearTimeout(refreshRetryTimer1Ref.current);
    }
    if (refreshRetryTimer2Ref.current) {
      clearTimeout(refreshRetryTimer2Ref.current);
    }

    // Retry refreshes because WS broadcast can arrive before REST state is fully committed.
    refreshRetryTimer1Ref.current = setTimeout(() => {
      fetchData();
    }, 1000);
    refreshRetryTimer2Ref.current = setTimeout(() => {
      fetchData();
    }, 2500);
  }, [fetchData]);

  const extractMaterialEvent = useCallback((payload: any) => {
    const materialId =
      payload?.materialId ||
      payload?.id ||
      payload?.data?.materialId ||
      payload?.data?.id;

    const status =
      payload?.final_status ||
      payload?.status ||
      payload?.data?.final_status ||
      payload?.data?.status;

    const eventType = String(payload?.type || payload?.data?.type || '').toUpperCase();

    return {
      materialId: materialId != null ? String(materialId) : null,
      status: status != null ? String(status).toUpperCase() : null,
      eventType,
    };
  }, []);

  const applyMaterialWsEvent = useCallback(
    (payload: any) => {
      const {materialId, status, eventType} = extractMaterialEvent(payload);

      if (!materialId) {
        triggerMaterialRefresh();
        return;
      }

      if (eventType === 'DELETED' || status === 'DELETED') {
        setMaterials(prev =>
          prev.filter(item => String(item.materialId || item.id) !== materialId),
        );
        triggerMaterialRefresh();
        return;
      }

      setMaterials(prev =>
        prev.map(item => {
          if (String(item.materialId || item.id) !== materialId) {
            return item;
          }

          return {
            ...item,
            ...(status ? {status} : {}),
            ...(status ? {final_status: status} : {}),
          };
        }),
      );

      triggerMaterialRefresh();
    },
    [extractMaterialEvent, triggerMaterialRefresh],
  );

  const handleProgressEvent = useCallback(
    (payload: any) => {
      const status = String(payload?.status || payload?.data?.status || '').toUpperCase();
      if (status === 'QUIZ_COMPLETED' || status === 'MOCKTEST_COMPLETED') {
        const quizData = payload?.data && typeof payload.data === 'object' ? payload.data : {};
        const eventWorkspaceId = Number(
          quizData?.workspaceId || payload?.workspaceId || workspaceId,
        );

        if (eventWorkspaceId && Number(workspaceId) && eventWorkspaceId !== Number(workspaceId)) {
          return;
        }

        const quizId = quizData?.quizId || quizData?.id || 'unknown';
        const eventKey = `${status}:${eventWorkspaceId || 'na'}:${quizId}`;

        if (lastQuizProgressEventKeyRef.current !== eventKey) {
          lastQuizProgressEventKeyRef.current = eventKey;
          showToast(
            status === 'MOCKTEST_COMPLETED'
              ? 'Bài thi thử AI đã sẵn sàng'
              : 'Quiz AI đã sẵn sàng',
            'success',
          );
        }

        fetchData();
        return;
      }

      applyMaterialWsEvent(payload);
    },
    [applyMaterialWsEvent, fetchData, showToast, workspaceId],
  );

  useEffect(() => {
    return () => {
      if (refreshRetryTimer1Ref.current) {
        clearTimeout(refreshRetryTimer1Ref.current);
      }
      if (refreshRetryTimer2Ref.current) {
        clearTimeout(refreshRetryTimer2Ref.current);
      }
      if (processingPollTimerRef.current) {
        clearInterval(processingPollTimerRef.current);
      }
    };
  }, []);

  const {isConnected: wsConnected} = useWebSocket({
    workspaceId,
    enabled: !!workspaceId,
    onMaterialUploaded: applyMaterialWsEvent,
    onMaterialDeleted: applyMaterialWsEvent,
    onMaterialUpdated: applyMaterialWsEvent,
    onProgress: handleProgressEvent,
  });

  useEffect(() => {
    if (!wsConnected) {
      return;
    }
    fetchData();
  }, [wsConnected, fetchData]);

  useEffect(() => {
    const hasProcessingMaterial = materials.some(item => {
      const status = String(
        item?.final_status || item?.status || item?.processingStatus || '',
      ).toUpperCase();

      return [
        'PROCESSING',
        'PROCECCSING',
        'PENDING',
        'IN_PROGRESS',
        'ACTIVE',
      ].includes(status);
    });

    if (!hasProcessingMaterial) {
      if (processingPollTimerRef.current) {
        clearInterval(processingPollTimerRef.current);
        processingPollTimerRef.current = null;
      }
      return;
    }

    if (processingPollTimerRef.current) {
      return;
    }

    processingPollTimerRef.current = setInterval(() => {
      fetchData();
    }, 4000);

    return () => {
      if (processingPollTimerRef.current) {
        clearInterval(processingPollTimerRef.current);
        processingPollTimerRef.current = null;
      }
    };
  }, [materials, fetchData]);

  /* ──── Delete Material ──── */
  const handleDeleteMaterial = (mat: any) => {
    const matId = mat.materialId || mat.id;
    Alert.alert(
      'Xóa tài liệu',
      `Bạn có chắc muốn xóa "${mat.title || mat.fileName || mat.name}" không?`,
      [
        {text: 'Hủy', style: 'cancel'},
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            setDeletingMaterial(matId);
            try {
              await MaterialAPI.delete(matId);
              setMaterials(prev => prev.filter(m => (m.materialId || m.id) !== matId));
              showToast('Đã xóa tài liệu', 'success');
            } catch {
              showToast('Không thể xóa tài liệu', 'error');
            } finally {
              setDeletingMaterial(null);
            }
          },
        },
      ],
    );
  };

  const handleUploadMaterial = async () => {
    try {
      const picked = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
        presentationStyle: 'fullScreen',
      });

      if (!picked?.uri) {
        return;
      }

      setUploading(true);
      const formData = new FormData();
      formData.append('file', {
        uri: picked.uri,
        type: picked.type || 'application/octet-stream',
        name: picked.name || `upload-${Date.now()}`,
      } as any);
      formData.append('workspaceID', String(workspaceId));

      await MaterialAPI.upload(formData);
      addAccessHistory(
        picked.name || 'Tài liệu mới',
        'upload',
        `upload:${picked.name || Date.now()}`,
      );
      showToast('Đã bắt đầu tải lên, hệ thống đang xử lý nền', 'success');
      fetchData();
    } catch (error: any) {
      if (DocumentPicker.isCancel(error)) {
        return;
      }
      showToast('Không thể tải tài liệu lên', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleQuickAction = (key: string) => {
    const labelMap: Record<string, string> = {
      roadmap: 'Lộ trình',
      quiz: 'Quiz',
      flashcard: 'Flashcard',
      mockTest: 'Thi thử',
    };
    addAccessHistory(labelMap[key] || 'Tác vụ nhanh', 'quick-action', `quick:${key}`);
    if (key === 'quiz' || key === 'mockTest') {
      navigation.navigate('CreateAIQuiz', {
        workspaceId,
        materials,
      });
      return;
    }
    if (key === 'roadmap') {
      navigation.navigate('RoadmapJourney', {
        contextType: 'WORKSPACE',
        contextId: Number(workspaceId),
        title,
        materials,
      });
      return;
    }
    if (key === 'flashcard') {
      navigation.navigate('CreateAIFlashcard', {
        workspaceId,
        materials,
      });
      return;
    }
    handleChangeBottomTab('stats');
  };

  /* ──── Status badge colors ──── */
  const getStatusBadge = (status?: string) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE':
      case 'READY':
      case 'COMPLETED':
        return {variant: 'success' as const, label: 'Sẵn sàng'};
      case 'PROCESSING':
      case 'PROCECCSING':
      case 'PENDING':
        return {variant: 'warning' as const, label: 'Đang xử lý'};
      case 'REJECT':
      case 'REJECTED':
        return {variant: 'error' as const, label: 'Bị từ chối'};
      case 'WARN':
      case 'WARNED':
        return {variant: 'warning' as const, label: 'Cảnh báo'};
      case 'FAILED':
      case 'ERROR':
        return {variant: 'error' as const, label: 'Thất bại'};
      default:
        return {variant: 'default' as const, label: status || 'Không xác định'};
    }
  };

  const visibleMaterials = materials.filter(material => !isDeletedMaterial(material));

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: screenBackground}]}
      edges={['top']}>
      <WelcomeBackground isDark={isDark} />
      {/* ─── Header ─── */}
      <View
        style={[
          styles.header,
          {backgroundColor: colors.surface, borderBottomColor: colors.border},
        ]}>
        <TouchableOpacity
          onPress={handleBackToWorkspaceList}
          style={styles.backBtn}>
          <Icon name="chevron-left" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text
            style={[styles.headerTitle, {color: colors.heading}]}
            numberOfLines={1}>
            {title || workspace?.name || workspace?.title}
          </Text>
          <View style={styles.headerMetaRow}>
            <View
              style={[
                styles.wsDot,
                {backgroundColor: wsConnected ? '#10B981' : '#94A3B8'},
              ]}
            />
            <Text style={[styles.wsText, {color: colors.textSecondary}]}>Live</Text>
          </View>
          {workspace?.topicName && (
            <Text
              style={[styles.headerSub, {color: colors.textSecondary}]}
              numberOfLines={1}>
              {workspace.topicName}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() =>
            navigation.navigate('WorkspaceProfileWizard', {
              workspaceId,
              title,
            })
          }>
          <Icon name="dots-vertical" size={22} color={colors.icon} />
        </TouchableOpacity>
      </View>

      {/* ─── Main Content ─── */}
      <ScrollView
        style={styles.mainContent}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {onboardingCompleted === false && (
          <View
            style={[
              styles.onboardingBanner,
              {
                backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                borderColor: isDark ? '#334155' : '#BFDBFE',
              },
            ]}>
            <View style={styles.onboardingBannerHead}>
              <Icon name="account-cog-outline" size={18} color={Colors.primary} />
              <Text style={[styles.onboardingBannerTitle, {color: colors.heading}]}>Workspace Profile Setup Required</Text>
            </View>
            <Text style={[styles.onboardingBannerText, {color: colors.textSecondary}]}>Complete onboarding profile so roadmap, AI quiz, and mock-test flows can run correctly.</Text>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('WorkspaceProfileWizard', {
                  workspaceId,
                  title,
                })
              }
              style={styles.onboardingBannerAction}>
              <Text style={styles.onboardingBannerActionText}>Open Setup</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ───────── CHAT TAB ───────── */}
        {activeBottomTab === 'chat' && (
          <View style={styles.chatArea}>
            {/* Quick Actions */}
            <Text style={[styles.sectionTitle, {color: colors.heading}]}>
              Tác vụ nhanh
            </Text>
            <View style={styles.quickActions}>
              {QUICK_ACTIONS.map(action => (
                <TouchableOpacity
                  key={action.key}
                  activeOpacity={0.7}
                  onPress={() => handleQuickAction(action.key)}
                  style={[
                    styles.quickAction,
                    {
                      backgroundColor: isDark
                        ? `${action.color}15`
                        : `${action.color}10`,
                    },
                  ]}>
                  <Icon name={action.icon} size={22} color={action.color} />
                  <Text
                    style={[styles.quickActionLabel, {color: action.color}]}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Overview cards */}
            <Text style={[styles.sectionTitle, {color: colors.heading}]}>
              Tổng quan
            </Text>
            <View style={styles.overviewRow}>
              <OverviewCard
                icon="file-document-outline"
                label="Tài liệu"
                value={materials.length}
                color="#64748B"
                colors={colors}
              />
              <OverviewCard
                icon="head-question-outline"
                label="Quizzes"
                value={quizzes.length}
                color="#2563EB"
                colors={colors}
              />
              <OverviewCard
                icon="cards-outline"
                label="Thẻ"
                value={flashcards.length}
                color="#EA580C"
                colors={colors}
              />
            </View>

            {/* Quizzes */}
            {quizzes.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                    Quizzes
                  </Text>
                  <Badge
                    label={`${quizzes.length}`}
                    variant="info"
                    size="sm"
                  />
                </View>
                {quizzes.map((quiz: any) => (
                  <TouchableOpacity
                    key={quiz.id || quiz.quizId}
                    onPress={() => openQuizModeSelector(quiz)}
                    style={[
                      styles.listItem,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}>
                    <View
                      style={[
                        styles.listItemIcon,
                        {backgroundColor: '#2563EB15'},
                      ]}>
                      <Icon
                        name="head-question-outline"
                        size={18}
                        color="#2563EB"
                      />
                    </View>
                    <View style={styles.listItemContent}>
                      <Text
                        style={[styles.listItemTitle, {color: colors.heading}]}
                        numberOfLines={1}>
                        {quiz.name || quiz.title}
                      </Text>
                      <Text
                        style={[
                          styles.listItemSub,
                          {color: colors.textSecondary},
                        ]}>
                        {quiz.questionCount || quiz.totalQuestions || 0}{' '}
                            câu hỏi
                      </Text>
                    </View>
                    <Icon
                      name="chevron-right"
                      size={20}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                ))}
              </>
            )}

            {/* Flashcards */}
            {flashcards.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                    Flashcards
                  </Text>
                  <Badge
                    label={`${flashcards.length}`}
                    variant="info"
                    size="sm"
                  />
                </View>
                {flashcards.map((fc: any) => (
                  <TouchableOpacity
                    key={fc.id || fc.flashcardSetId}
                    onPress={() => openFlashcardDetail(fc)}
                    style={[
                      styles.listItem,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}>
                    <View
                      style={[
                        styles.listItemIcon,
                        {backgroundColor: '#EA580C15'},
                      ]}>
                      <Icon name="cards-outline" size={18} color="#EA580C" />
                    </View>
                    <View style={styles.listItemContent}>
                      <Text
                        style={[styles.listItemTitle, {color: colors.heading}]}
                        numberOfLines={1}>
                        {fc.name || fc.title}
                      </Text>
                      {fc.itemCount != null && (
                        <Text
                          style={[
                            styles.listItemSub,
                            {color: colors.textSecondary},
                          ]}>
                          {fc.itemCount} thẻ
                        </Text>
                      )}
                    </View>
                    <Icon
                      name="chevron-right"
                      size={20}
                      color={colors.textTertiary}
                    />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {/* ───────── SOURCES TAB ───────── */}
        {activeBottomTab === 'sources' && (
          <View style={styles.sourcesArea}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                Tài liệu ({materials.length})
              </Text>
              <TouchableOpacity
                onPress={handleUploadMaterial}
                disabled={uploading}
                style={[
                  styles.addSourceBtn,
                  {backgroundColor: Colors.primary},
                ]}>
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="plus" size={16} color="#FFFFFF" />
                    <Text style={styles.addSourceText}>Thêm</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {materials.length === 0 ? (
              <View style={styles.emptySection}>
                <View
                  style={[
                    styles.emptyIconWrap,
                    {
                      backgroundColor: isDark
                        ? Colors.dark.surfaceVariant
                        : '#F1F5F9',
                    },
                  ]}>
                  <Icon
                    name="file-document-outline"
                    size={36}
                    color={colors.textTertiary}
                  />
                </View>
                <Text
                  style={[styles.emptyTitle, {color: colors.textSecondary}]}>
                  Chưa có tài liệu
                </Text>
                <Text
                  style={[
                    styles.emptySubtitle,
                    {color: colors.textTertiary},
                  ]}>
                  Tải tài liệu lên để bắt đầu học cùng AI
                </Text>
                <TouchableOpacity
                  onPress={handleUploadMaterial}
                  disabled={uploading}
                  style={[
                    styles.uploadBtn,
                    {
                      backgroundColor: isDark
                        ? Colors.dark.surfaceVariant
                        : Colors.primaryLight,
                    },
                  ]}>
                  <Icon name="upload" size={18} color={Colors.primary} />
                  <Text style={[styles.uploadBtnText, {color: Colors.primary}]}>
                    Tải tài liệu lên
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              visibleMaterials.map((mat: any) => {
                const matId = mat.materialId || mat.id;
                const status = getStatusBadge(mat.final_status || mat.status);
                return (
                  <TouchableOpacity
                    key={matId}
                    onPress={() => handleOpenMaterialDetail(mat)}
                    style={[
                      styles.sourceItem,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}>
                    <View
                      style={[
                        styles.sourceIcon,
                        {
                          backgroundColor: isDark
                            ? `${Colors.primary}15`
                            : '#EFF6FF',
                        },
                      ]}>
                      <Icon
                        name={
                          mat.materialType === 'PDF'
                            ? 'file-pdf-box'
                            : mat.materialType === 'IMAGE'
                            ? 'file-image'
                            : 'file-document'
                        }
                        size={20}
                        color={Colors.primary}
                      />
                    </View>
                    <View style={styles.sourceInfo}>
                      <Text
                        style={[styles.sourceName, {color: colors.heading}]}
                        numberOfLines={1}>
                        {mat.title || mat.fileName || mat.name}
                      </Text>
                      <View style={styles.sourceMetaRow}>
                        <Badge
                          label={status.label}
                          variant={status.variant}
                          size="sm"
                        />
                        {mat.uploadedAt && (
                          <Text
                            style={[
                              styles.sourceDate,
                              {color: colors.textTertiary},
                            ]}>
                            {new Date(mat.uploadedAt).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteMaterial(mat)}
                      disabled={deletingMaterial === matId}
                      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                      {deletingMaterial === matId ? (
                        <ActivityIndicator
                          size="small"
                          color={Colors.error}
                        />
                      ) : (
                        <Icon
                          name="close-circle-outline"
                          size={20}
                          color={colors.textTertiary}
                        />
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* ───────── STUDIO TAB ───────── */}
        {activeBottomTab === 'studio' && (
          <View style={styles.studioArea}>
            <Text style={[styles.sectionTitle, {color: colors.heading}]}>
              Studio
            </Text>
            <Text
              style={[styles.studioSubtitle, {color: colors.textSecondary}]}>
              Tạo và quản lý tài nguyên học tập
            </Text>

            <View style={styles.studioGrid}>
              {STUDIO_ITEMS({
                q: quizzes.length,
                f: flashcards.length,
                s: materials.length,
                r: roadmaps.length,
              }).map(item => (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (item.key === 'sources') {
                      setActiveBottomTab('sources');
                    } else if (item.key === 'quiz') {
                      navigation.navigate('CreateAIQuiz', {
                        workspaceId,
                        materials,
                      });
                    } else if (item.key === 'roadmap') {
                      navigation.navigate('RoadmapJourney', {
                        contextType: 'WORKSPACE',
                        contextId: Number(workspaceId),
                        title,
                        materials,
                      });
                    } else if (item.key === 'flashcard') {
                      navigation.navigate('CreateAIFlashcard', {
                        workspaceId,
                        materials,
                      });
                    }
                  }}
                  style={[
                    styles.studioItem,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}>
                  <View
                    style={[
                      styles.studioItemIcon,
                      {backgroundColor: `${item.color}15`},
                    ]}>
                    <Icon name={item.icon} size={22} color={item.color} />
                  </View>
                  <Text style={[styles.studioCount, {color: colors.heading}]}>
                    {item.count}
                  </Text>
                  <Text
                    style={[
                      styles.studioLabel,
                      {color: colors.textSecondary},
                    ]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Recent Activity */}
            {(quizzes.length > 0 || flashcards.length > 0) && (
              <>
                <Text
                  style={[
                    styles.sectionTitle,
                    {color: colors.heading, marginTop: Spacing.xl},
                  ]}>
                  Mục gần đây
                </Text>
                {quizzes.slice(0, 3).map((quiz: any) => (
                  <TouchableOpacity
                    key={`q-${quiz.id || quiz.quizId}`}
                    onPress={() => openQuizModeSelector(quiz)}
                    style={[
                      styles.recentItem,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}>
                    <View
                      style={[
                        styles.recentIcon,
                        {backgroundColor: '#2563EB15'},
                      ]}>
                      <Icon
                        name="head-question-outline"
                        size={16}
                        color="#2563EB"
                      />
                    </View>
                    <Text
                      style={[styles.recentTitle, {color: colors.heading}]}
                      numberOfLines={1}>
                      {quiz.name || quiz.title}
                    </Text>
                    <Badge label="Quiz" variant="info" size="sm" />
                  </TouchableOpacity>
                ))}
                {flashcards.slice(0, 3).map((fc: any) => (
                  <TouchableOpacity
                    key={`f-${fc.id || fc.flashcardSetId}`}
                    onPress={() => openFlashcardDetail(fc)}
                    style={[
                      styles.recentItem,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}>
                    <View
                      style={[
                        styles.recentIcon,
                        {backgroundColor: '#EA580C15'},
                      ]}>
                      <Icon name="cards-outline" size={16} color="#EA580C" />
                    </View>
                    <Text
                      style={[styles.recentTitle, {color: colors.heading}]}
                      numberOfLines={1}>
                      {fc.name || fc.title}
                    </Text>
                    <Badge label="Flashcard" variant="warning" size="sm" />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {activeBottomTab === 'stats' && (
          <WorkspaceStatisticsPanel
            workspaceId={Number(workspaceId)}
            colors={colors}
          />
        )}
      </ScrollView>


      {/* ─── Bottom Toolbar ─── */}
      <View
        style={[
          styles.bottomToolbar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}>
        <ToolbarTab
          icon="view-dashboard-outline"
          label="Tổng quan"
          active={activeBottomTab === 'chat'}
          onPress={() => handleChangeBottomTab('chat')}
          colors={colors}
        />
        <ToolbarTab
          icon="folder-outline"
          label="Tài liệu"
          active={activeBottomTab === 'sources'}
          onPress={() => handleChangeBottomTab('sources')}
          colors={colors}
          badge={materials.length > 0 ? materials.length : undefined}
        />
        <ToolbarTab
          icon="chart-box-outline"
          label="Dashboard"
          active={activeBottomTab === 'stats'}
          onPress={() => handleChangeBottomTab('stats')}
          colors={colors}
        />
      </View>

      {uploading && (
        <View style={styles.blockingOverlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.blockingText}>Đang tải tài liệu lên...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

/* ──── Sub‑components ──── */

function OverviewCard({
  icon,
  label,
  value,
  color,
  colors,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
  colors: any;
}) {
  return (
    <View
      style={[
        styles.overviewCard,
        {backgroundColor: colors.surface, borderColor: colors.border},
      ]}>
      <View style={[styles.overviewIcon, {backgroundColor: `${color}15`}]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.overviewValue, {color: colors.heading}]}>
        {value}
      </Text>
      <Text style={[styles.overviewLabel, {color: colors.textSecondary}]}>
        {label}
      </Text>
    </View>
  );
}

function ToolbarTab({
  icon,
  label,
  active,
  onPress,
  colors,
  badge,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
  badge?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.toolbarTab}>
      <View style={styles.toolbarIconWrap}>
        <Icon
          name={active ? icon.replace('-outline', '') : icon}
          size={22}
          color={active ? Colors.primary : colors.textTertiary}
        />
        {badge != null && badge > 0 && (
          <View style={styles.toolbarBadge}>
            <Text style={styles.toolbarBadgeText}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.toolbarLabel,
          {
            color: active ? Colors.primary : colors.textTertiary,
            fontWeight: active ? '600' : '400',
          },
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ──── Styles ──── */
const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {padding: Spacing.sm},
  headerCenter: {flex: 1, marginHorizontal: Spacing.sm},
  headerMetaRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2},
  wsDot: {width: 8, height: 8, borderRadius: 99},
  wsText: {fontSize: 11, fontWeight: '500'},
  headerTitle: {fontSize: 16, fontWeight: '600'},
  headerSub: {fontSize: 12, marginTop: 1},
  headerAction: {padding: Spacing.sm},
  onboardingBanner: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  onboardingBannerHead: {flexDirection: 'row', alignItems: 'center', gap: Spacing.xs},
  onboardingBannerTitle: {fontSize: 13, fontWeight: '700'},
  onboardingBannerText: {fontSize: 12, lineHeight: 17},
  onboardingBannerAction: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  onboardingBannerActionText: {color: '#FFFFFF', fontSize: 12, fontWeight: '700'},

  mainContent: {flex: 1},
  scrollContent: {padding: Spacing.lg, paddingBottom: 160},

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },

  /* Quick Actions */
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  quickAction: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    gap: 6,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  /* Overview Cards */
  overviewRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  overviewCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 4,
  },
  overviewIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  overviewValue: {fontSize: 18, fontWeight: '700'},
  overviewLabel: {fontSize: 10},

  /* List Items */
  chatArea: {},
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: 12,
  },
  listItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listItemContent: {flex: 1},
  listItemTitle: {fontSize: 14, fontWeight: '500'},
  listItemSub: {fontSize: 12, marginTop: 2},

  /* Sources */
  sourcesArea: {},
  addSourceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  addSourceText: {color: '#FFFFFF', fontSize: 13, fontWeight: '600'},
  emptySection: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emptyTitle: {fontSize: 16, fontWeight: '600'},
  emptySubtitle: {fontSize: 13, textAlign: 'center', paddingHorizontal: 24},
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 8,
    marginTop: Spacing.sm,
  },
  uploadBtnText: {fontSize: 14, fontWeight: '600'},

  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: 12,
  },
  sourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceInfo: {flex: 1},
  sourceName: {fontSize: 14, fontWeight: '500'},
  sourceMetaRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4},
  sourceDate: {fontSize: 11},

  /* Studio */
  studioArea: {},
  studioSubtitle: {fontSize: 13, marginTop: -Spacing.sm, marginBottom: Spacing.md},
  studioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  studioItem: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 6,
  },
  studioItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  studioCount: {fontSize: 22, fontWeight: '700'},
  studioLabel: {fontSize: 12},

  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: 10,
  },
  recentIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentTitle: {fontSize: 13, fontWeight: '500', flex: 1},

  /* Chat Input */
  chatInputBar: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatInputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    gap: 8,
  },
  chatInput: {
    flex: 1,
    fontSize: 14,
    maxHeight: 100,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Bottom Toolbar */
  bottomToolbar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.base,
  },
  toolbarTab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  toolbarIconWrap: {
    position: 'relative',
  },
  toolbarBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  toolbarBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  toolbarLabel: {fontSize: 11},
  blockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000030',
    gap: Spacing.sm,
  },
  blockingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
