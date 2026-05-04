import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {useAuth} from '../../context/AuthContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import FloatingInput from '../../components/ui/Input';
import WelcomeBackground from '../../components/ui/WelcomeBackground';
import GroupAPI from '../../api/GroupAPI';
import MaterialAPI from '../../api/MaterialAPI';
import QuizAPI from '../../api/QuizAPI';
import FlashcardAPI from '../../api/FlashcardAPI';
import RoadmapAPI from '../../api/RoadmapAPI';
import ChallengeAPI from '../../api/ChallengeAPI';
import useWebSocket from '../../hooks/useWebSocket';
import {isDeletedMaterial} from '../../api/MaterialAPI';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

type BottomTab = 'chat' | 'sources' | 'studio' | 'challenge' | 'ranking' | 'notifications';

const QUICK_ACTIONS = [
  {icon: 'map-outline', label: 'Lộ trình', key: 'roadmap', color: '#059669'},
  {icon: 'head-question-outline', label: 'Quiz', key: 'quiz', color: '#2563EB'},
  {icon: 'cards-outline', label: 'Flashcard', key: 'flashcard', color: '#EA580C'},
  {icon: 'clipboard-text-outline', label: 'Thi thử', key: 'mockTest', color: '#7C3AED'},
  {icon: 'sword-cross', label: 'Thử thách', key: 'challenge', color: '#F97316'},
  {icon: 'trophy-outline', label: 'Xếp hạng', key: 'ranking', color: '#F59E0B'},
  {icon: 'bell-outline', label: 'Thông báo', key: 'notifications', color: '#0EA5E9'},
];

const CHALLENGE_STATUS_TABS = [
  {key: 'SCHEDULED', label: 'Sắp diễn ra'},
  {key: 'LIVE', label: 'Đang live'},
  {key: 'FINISHED', label: 'Đã kết thúc'},
];

const CHALLENGE_MODE_TABS = [
  {key: 'ALL', label: 'Tất cả'},
  {key: 'FREE_FOR_ALL', label: 'Tự do'},
  {key: 'TEAM_BATTLE', label: 'Đội'},
  {key: 'SOLO_BRACKET', label: '1v1'},
];

function formatCompactDate(value: any) {
  if (!value) {
    return 'Chưa rõ';
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

function formatRoleLabel(value: any) {
  const role = String(value || '').toUpperCase();
  if (role === 'LEADER') {
    return 'Trưởng nhóm';
  }
  if (role === 'CONTRIBUTOR') {
    return 'Cộng tác viên';
  }
  return 'Thành viên';
}

function formatChallengeStatus(value: any) {
  const status = String(value || '').toUpperCase();
  if (status === 'LIVE') {
    return 'Đang live';
  }
  if (status === 'FINISHED') {
    return 'Đã kết thúc';
  }
  if (status === 'CANCELLED' || status === 'CANCELED') {
    return 'Đã hủy';
  }
  return 'Sắp diễn ra';
}

function formatPoints(value: any) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return '0';
  }
  return String(Math.round(numberValue));
}

function getChallengeId(challenge: any) {
  return Number(challenge?.challengeEventId || challenge?.eventId || challenge?.id || 0);
}

export default function GroupWorkspaceScreen({navigation, route}: any) {
  const {groupId, title} = route.params;
  const normalizedGroupId = Number(groupId || route?.params?.workspaceId || 0);
  const {isDark, colors} = useTheme();
  const screenBackground = isDark ? colors.backgroundSecondary : colors.background;
  const {showToast} = useToast();
  const {user} = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [groupDetail, setGroupDetail] = useState<any>(null);
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [pendingReviewMaterials, setPendingReviewMaterials] = useState<any[]>([]);
  const [canReviewMaterials, setCanReviewMaterials] = useState(false);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [rankingData, setRankingData] = useState<any>(null);
  const [rankingDetail, setRankingDetail] = useState<any>(null);
  const [rankingDetailLoading, setRankingDetailLoading] = useState(false);
  const [groupLogs, setGroupLogs] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [challengeStatus, setChallengeStatus] = useState('SCHEDULED');
  const [challengeMode, setChallengeMode] = useState('ALL');
  const [selectedChallenge, setSelectedChallenge] = useState<any>(null);
  const [challengeDetail, setChallengeDetail] = useState<any>(null);
  const [challengeDetailLoading, setChallengeDetailLoading] = useState(false);
  const [challengeActionLoading, setChallengeActionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const detailKey = String(route?.params?.detailKey || '').trim() as any;
  const isDetailPage = detailKey === 'challenge' || detailKey === 'ranking' || detailKey === 'notifications';
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>(() => {
    if (detailKey === 'challenge' || detailKey === 'ranking' || detailKey === 'notifications') {
      return detailKey;
    }
    return 'chat';
  });
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [reviewingMaterialId, setReviewingMaterialId] = useState<number | null>(null);
  const latestFetchRequestIdRef = useRef(0);
  const refreshRetryTimer1Ref = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const refreshRetryTimer2Ref = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Invite
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const normalizeArray = useCallback((payload: any): any[] => {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload?.content)) {
      return payload.content;
    }
    if (Array.isArray(payload?.items)) {
      return payload.items;
    }
    if (Array.isArray(payload?.data)) {
      return payload.data;
    }
    if (Array.isArray(payload?.data?.content)) {
      return payload.data.content;
    }
    if (Array.isArray(payload?.data?.items)) {
      return payload.data.items;
    }
    if (Array.isArray(payload?.data?.data)) {
      return payload.data.data;
    }
    return [];
  }, []);

  const navigateToQuizDetail = useCallback(
    (params: any) => {
      const routeNames = navigation.getState?.()?.routeNames || [];
      if (routeNames.includes('QuizDetail')) {
        navigation.navigate('QuizDetail', params);
        return;
      }

      navigation.navigate('Quiz', {
        screen: 'QuizDetail',
        params,
      });
    },
    [navigation],
  );

  const navigateToExamQuiz = useCallback(
    (params: any) => {
      const routeNames = navigation.getState?.()?.routeNames || [];
      if (routeNames.includes('ExamQuiz')) {
        navigation.navigate('ExamQuiz', params);
        return;
      }

      navigation.navigate('Quiz', {
        screen: 'ExamQuiz',
        params,
      });
    },
    [navigation],
  );

  const openQuizModeSelector = useCallback(
    (quiz: any) => {
      const quizId = Number(quiz?.id || quiz?.quizId);
      if (!quizId) {
        showToast('Thiếu Quiz ID', 'error');
        return;
      }

      const quizTitle = quiz?.name || quiz?.title;
      const backContext = {
        type: 'group',
        groupId: normalizedGroupId,
        title,
      };

      navigateToQuizDetail({
        quizId,
        quiz,
        title: quizTitle,
        backContext,
        contextType: 'GROUP',
        contextId: normalizedGroupId,
        groupId: normalizedGroupId,
      });
    },
    [navigateToQuizDetail, normalizedGroupId, showToast, title],
  );

  const openFlashcardDetail = useCallback(
    (flashcard: any) => {
      const flashcardId = Number(flashcard?.id || flashcard?.flashcardSetId || 0);
      if (!Number.isInteger(flashcardId) || flashcardId <= 0) {
        showToast('Thiếu Flashcard ID', 'error');
        return;
      }

      navigation.navigate('FlashcardStudy', {
        flashcardId,
        title: flashcard?.name || flashcard?.title,
        contextType: 'GROUP',
        contextId: normalizedGroupId,
        groupId: normalizedGroupId,
        backTitle: title,
      });
    },
    [navigation, normalizedGroupId, showToast, title],
  );

  const fetchData = useCallback(async () => {
    const requestId = ++latestFetchRequestIdRef.current;

    if (!Number.isInteger(normalizedGroupId) || normalizedGroupId <= 0) {
      setLoading(false);
      setMembers([]);
      return;
    }

    try {
      // Use allSettled so that partial data loads even if one API fails
      const results = await Promise.allSettled([
        GroupAPI.getWorkspaceDetail(normalizedGroupId),
        GroupAPI.getDashboardSummary(normalizedGroupId),
        GroupAPI.getMembers(normalizedGroupId),
        MaterialAPI.getByWorkspace(normalizedGroupId),
        GroupAPI.getMyPermissions(normalizedGroupId),
        QuizAPI.getByContext('GROUP', normalizedGroupId),
        FlashcardAPI.getByContext('GROUP', normalizedGroupId),
        RoadmapAPI.getForGroup(normalizedGroupId),
        GroupAPI.getOverallRanking(normalizedGroupId),
        GroupAPI.getGroupLogs(normalizedGroupId),
        ChallengeAPI.list(normalizedGroupId),
      ]);

      if (requestId !== latestFetchRequestIdRef.current) {
        return;
      }

      // Extract results, handling both fulfilled and rejected states
      const groupRes = results[0].status === 'fulfilled' ? results[0].value : {data: null};
      const summaryRes = results[1].status === 'fulfilled' ? results[1].value : {data: null};
      const memRes = results[2].status === 'fulfilled' ? results[2].value : {data: []};
      const materialRes = results[3].status === 'fulfilled' ? results[3].value : {data: []};
      const permissionRes = results[4].status === 'fulfilled' ? results[4].value : {data: null};
      const quizRes = results[5].status === 'fulfilled' ? results[5].value : {data: []};
      const fcRes = results[6].status === 'fulfilled' ? results[6].value : {data: []};
      const rmRes = results[7].status === 'fulfilled' ? results[7].value : {data: []};
      const rankingRes = results[8].status === 'fulfilled' ? results[8].value : {data: null};
      const logsRes = results[9].status === 'fulfilled' ? results[9].value : {data: []};
      const challengeRes = results[10].status === 'fulfilled' ? results[10].value : {data: []};

      const permissionPayload = permissionRes?.data?.data || permissionRes?.data || {};
      const role = String(
        permissionPayload?.role ||
          permissionPayload?.memberRole ||
          permissionPayload?.groupRole ||
          '',
      ).toUpperCase();
      const canReviewFlagRaw = permissionPayload?.canReviewMaterials;
      const canReviewFlag =
        canReviewFlagRaw === true ||
        String(canReviewFlagRaw || '').toLowerCase() === 'true';
      const canReview = canReviewFlag || role === 'LEADER';

      setGroupDetail(groupRes?.data || null);
      setDashboardSummary(summaryRes?.data || null);
      setMembers(normalizeArray(memRes?.data));
      setMaterials(normalizeArray(materialRes?.data));
      setCanReviewMaterials(canReview);
      setQuizzes(normalizeArray(quizRes?.data));
      setFlashcards(normalizeArray(fcRes?.data));
      setRoadmaps(normalizeArray(rmRes?.data));
      setRankingData(
        Array.isArray(rankingRes?.data)
          ? {members: rankingRes.data}
          : rankingRes?.data || null,
      );
      setGroupLogs(normalizeArray(logsRes?.data));
      setChallenges(normalizeArray(challengeRes?.data));

      if (canReview) {
        try {
          const pendingRes = await MaterialAPI.getPendingGroupMaterials(normalizedGroupId);
          if (requestId !== latestFetchRequestIdRef.current) {
            return;
          }
          setPendingReviewMaterials(
            normalizeArray(pendingRes?.data).filter(item => !isDeletedMaterial(item)),
          );
        } catch {
          setPendingReviewMaterials([]);
        }
      } else {
        setPendingReviewMaterials([]);
      }

      // Keep screen usable even if member endpoint is flaky.
      if (results[2].status === 'rejected') {
        setMembers([]);
      }
    } catch (error) {
      if (requestId !== latestFetchRequestIdRef.current) {
        return;
      }
      console.error('GroupWorkspaceScreen fetchData error:', error);
      setMembers([]);
      setGroupDetail(null);
      setDashboardSummary(null);
      setMaterials([]);
      setPendingReviewMaterials([]);
      setQuizzes([]);
      setFlashcards([]);
      setRoadmaps([]);
      setRankingData(null);
      setGroupLogs([]);
      setChallenges([]);
      showToast('Không thể tải dữ liệu nhóm', 'error');
    } finally {
      if (requestId === latestFetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [normalizedGroupId, showToast, normalizeArray]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  useEffect(() => {
    return () => {
      if (refreshRetryTimer1Ref.current) {
        clearTimeout(refreshRetryTimer1Ref.current);
      }
      if (refreshRetryTimer2Ref.current) {
        clearTimeout(refreshRetryTimer2Ref.current);
      }
    };
  }, []);

  const refreshChallenges = useCallback(async () => {
    try {
      const response = await ChallengeAPI.list(normalizedGroupId);
      setChallenges(normalizeArray(response?.data));
    } catch {
      setChallenges([]);
    }
  }, [normalizeArray, normalizedGroupId]);

  const {isConnected: wsConnected} = useWebSocket({
    groupId: normalizedGroupId,
    enabled: Number.isInteger(normalizedGroupId) && normalizedGroupId > 0,
    onMaterialUploaded: triggerMaterialRefresh,
    onMaterialDeleted: triggerMaterialRefresh,
    onMaterialUpdated: triggerMaterialRefresh,
    onProgress: triggerMaterialRefresh,
    onChallengeUpdate: refreshChallenges,
  });

  useEffect(() => {
    if (!wsConnected) {
      return;
    }
    fetchData();
  }, [wsConnected, fetchData]);

  const currentMember = useMemo(() => {
    const currentUserId = Number((user as any)?.id || (user as any)?.userID || 0);
    return (
      members.find(member => member?.isCurrentUser) ||
      members.find(member => Number(member?.userId || member?.user?.userId || 0) === currentUserId) ||
      null
    );
  }, [members, user]);

  const currentRoleLabel = String(
    currentMember?.role ||
      currentMember?.memberRole ||
      (canReviewMaterials ? 'LEADER' : 'MEMBER'),
  ).toUpperCase();

  const isLeader = canReviewMaterials || currentRoleLabel === 'LEADER';

  const rankingRows = useMemo(() => {
    if (Array.isArray(rankingData?.members)) {
      return rankingData.members;
    }
    if (Array.isArray(rankingData?.content)) {
      return rankingData.content;
    }
    if (Array.isArray(rankingData)) {
      return rankingData;
    }
    return [];
  }, [rankingData]);

  const visibleChallenges = useMemo(() => {
    return challenges.filter(item => {
      const status = String(
        item?.status || item?.eventStatus || item?.state || '',
      ).toUpperCase();
      const mode = String(item?.matchMode || item?.mode || 'FREE_FOR_ALL').toUpperCase();
      const statusMatches = !challengeStatus || status === challengeStatus;
      const modeMatches = challengeMode === 'ALL' || mode === challengeMode;
      return statusMatches && modeMatches;
    });
  }, [challengeMode, challengeStatus, challenges]);

  const refreshRanking = useCallback(async () => {
    try {
      const response = await GroupAPI.getOverallRanking(normalizedGroupId);
      setRankingData(
        Array.isArray(response?.data)
          ? {members: response.data}
          : response?.data || null,
      );
    } catch {
      setRankingData(null);
    }
  }, [normalizedGroupId]);

  const openRankingDetail = useCallback(
    async (member: any) => {
      const userId = Number(member?.userId || member?.id || member?.user?.userId || 0);
      if (!Number.isInteger(userId) || userId <= 0) {
        return;
      }
      setRankingDetailLoading(true);
      try {
        const response = await GroupAPI.getRankingMemberDetail(normalizedGroupId, userId);
        setRankingDetail(response?.data || member);
      } catch {
        setRankingDetail(member);
      } finally {
        setRankingDetailLoading(false);
      }
    },
    [normalizedGroupId],
  );

  const openChallengeDetail = useCallback(
    async (challenge: any) => {
      const eventId = Number(challenge?.challengeEventId || challenge?.eventId || challenge?.id || 0);
      if (!Number.isInteger(eventId) || eventId <= 0) {
        showToast('Thiếu Challenge ID', 'error');
        return;
      }
      setSelectedChallenge(challenge);
      setChallengeDetailLoading(true);
      try {
        const response = await ChallengeAPI.detail(normalizedGroupId, eventId);
        setChallengeDetail(response?.data || challenge);
      } catch {
        setChallengeDetail(challenge);
      } finally {
        setChallengeDetailLoading(false);
      }
    },
    [normalizedGroupId, showToast],
  );

  const selectedChallengeEventId = Number(
    challengeDetail?.challengeEventId ||
      challengeDetail?.eventId ||
      selectedChallenge?.challengeEventId ||
      selectedChallenge?.eventId ||
      selectedChallenge?.id ||
      0,
  );
  const selectedChallengeQuiz = useMemo(
    () =>
      challengeDetail?.quiz ||
      challengeDetail?.snapshotQuiz ||
      challengeDetail?.challengeQuiz ||
      selectedChallenge?.quiz ||
      selectedChallenge?.snapshotQuiz ||
      {},
    [challengeDetail, selectedChallenge],
  );
  const selectedChallengeQuizId = Number(
    selectedChallengeQuiz?.quizId ||
      selectedChallengeQuiz?.id ||
      challengeDetail?.quizId ||
      selectedChallenge?.quizId ||
      0,
  );
  const selectedChallengeStatus = String(
    challengeDetail?.status ||
      challengeDetail?.eventStatus ||
      selectedChallenge?.status ||
      selectedChallenge?.eventStatus ||
      '',
  ).toUpperCase();
  const selectedParticipantStatus = String(
    challengeDetail?.myParticipantStatus ||
      selectedChallenge?.myParticipantStatus ||
      challengeDetail?.participantStatus ||
      selectedChallenge?.participantStatus ||
      '',
  ).toUpperCase();
  const selectedInvitationStatus = String(
    challengeDetail?.myInvitationStatus ||
      selectedChallenge?.myInvitationStatus ||
      challengeDetail?.invitationStatus ||
      selectedChallenge?.invitationStatus ||
      '',
  ).toUpperCase();
  const canRegisterSelectedChallenge =
    selectedChallengeStatus === 'SCHEDULED' &&
    !['REGISTERED', 'WAITING', 'PLAYING', 'FINISHED'].includes(selectedParticipantStatus) &&
    selectedInvitationStatus !== 'PENDING';
  const canAcceptSelectedChallengeInvite =
    selectedChallengeStatus === 'SCHEDULED' && selectedInvitationStatus === 'PENDING';
  const canStartSelectedChallengeAttempt =
    selectedChallengeStatus === 'LIVE' &&
    ['REGISTERED', 'WAITING', 'PLAYING', ''].includes(selectedParticipantStatus);

  const handleRegisterChallenge = useCallback(async () => {
    if (!selectedChallengeEventId || challengeActionLoading) {
      return;
    }
    setChallengeActionLoading(true);
    try {
      await ChallengeAPI.register(normalizedGroupId, selectedChallengeEventId);
      showToast('Đã đăng ký thử thách', 'success');
      await Promise.all([
        refreshChallenges(),
        openChallengeDetail(challengeDetail || selectedChallenge),
      ]);
    } catch {
      showToast('Không thể đăng ký thử thách', 'error');
    } finally {
      setChallengeActionLoading(false);
    }
  }, [
    challengeActionLoading,
    challengeDetail,
    normalizedGroupId,
    openChallengeDetail,
    refreshChallenges,
    selectedChallenge,
    selectedChallengeEventId,
    showToast,
  ]);

  const handleAcceptChallengeInvitation = useCallback(async () => {
    if (!selectedChallengeEventId || challengeActionLoading) {
      return;
    }
    setChallengeActionLoading(true);
    try {
      await ChallengeAPI.acceptInvitation(normalizedGroupId, selectedChallengeEventId);
      showToast('Đã chấp nhận lời mời thử thách', 'success');
      await Promise.all([
        refreshChallenges(),
        openChallengeDetail(selectedChallenge || challengeDetail),
      ]);
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || 'Không thể chấp nhận lời mời',
        'error',
      );
    } finally {
      setChallengeActionLoading(false);
    }
  }, [
    challengeActionLoading,
    challengeDetail,
    normalizedGroupId,
    openChallengeDetail,
    refreshChallenges,
    selectedChallenge,
    selectedChallengeEventId,
    showToast,
  ]);

  const handleOpenChallengeQuiz = useCallback(() => {
    const quiz = selectedChallengeQuiz;
    const quizId = selectedChallengeQuizId;
    if (!Number.isInteger(quizId) || quizId <= 0) {
      showToast('Thử thách chưa có quiz khả dụng', 'error');
      return;
    }

    navigateToQuizDetail({
      quizId,
      quiz: {
        ...quiz,
        quizId,
        title:
          quiz?.title ||
          challengeDetail?.quizTitle ||
          selectedChallenge?.quizTitle ||
          'Quiz challenge',
      },
      title:
        quiz?.title ||
        challengeDetail?.quizTitle ||
        selectedChallenge?.quizTitle ||
        'Quiz challenge',
      contextType: 'GROUP',
      contextId: normalizedGroupId,
      groupId: normalizedGroupId,
      backContext: {
        type: 'group',
        groupId: normalizedGroupId,
        title,
      },
    });
  }, [
    challengeDetail,
    navigateToQuizDetail,
    normalizedGroupId,
    selectedChallenge,
    selectedChallengeQuiz,
    selectedChallengeQuizId,
    showToast,
    title,
  ]);

  const handleStartChallengeAttempt = useCallback(() => {
    if (!selectedChallengeEventId || !selectedChallengeQuizId) {
      showToast('Thử thách chưa có bài thi khả dụng', 'error');
      return;
    }

    const challengeTitle =
      selectedChallengeQuiz?.title ||
      challengeDetail?.quizTitle ||
      selectedChallenge?.quizTitle ||
      challengeDetail?.title ||
      selectedChallenge?.title ||
      'Quiz challenge';

    const quizDetailParams = {
      quizId: selectedChallengeQuizId,
      quiz: {
        ...selectedChallengeQuiz,
        quizId: selectedChallengeQuizId,
        title: challengeTitle,
      },
      title: challengeTitle,
      contextType: 'GROUP',
      contextId: normalizedGroupId,
      groupId: normalizedGroupId,
      backContext: {
        type: 'group',
        groupId: normalizedGroupId,
        title,
      },
    };

    navigateToExamQuiz({
      quizId: selectedChallengeQuizId,
      title: challengeTitle,
      backContext: {
        type: 'group',
        groupId: normalizedGroupId,
        title,
      },
      quizDetailParams,
      challengeContext: {
        workspaceId: normalizedGroupId,
        eventId: selectedChallengeEventId,
        participantId: Number(
          challengeDetail?.myParticipantId ||
            selectedChallenge?.myParticipantId ||
            challengeDetail?.participantId ||
            0,
        ) || undefined,
      },
    });
  }, [
    challengeDetail,
    navigateToExamQuiz,
    normalizedGroupId,
    selectedChallenge,
    selectedChallengeEventId,
    selectedChallengeQuiz,
    selectedChallengeQuizId,
    showToast,
    title,
  ]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {return;}
    setInviting(true);
    try {
      await GroupAPI.sendInvitation(normalizedGroupId, {email: inviteEmail});
      showToast('Đã gửi lời mời!', 'success');
      setInviteVisible(false);
      setInviteEmail('');
    } catch {
      showToast('Không thể gửi lời mời', 'error');
    } finally {
      setInviting(false);
    }
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

      setUploadingMaterial(true);
      const formData = new FormData();
      formData.append('file', {
        uri: picked.uri,
        type: picked.type || 'application/octet-stream',
        name: picked.name || `group-upload-${Date.now()}`,
      } as any);
      formData.append('workspaceID', String(normalizedGroupId));

      await MaterialAPI.uploadGroupPending(formData);
      showToast('Đã tải tài liệu lên, leader sẽ duyệt trước khi dùng chung', 'success');
      fetchData();
    } catch (error: any) {
      if (DocumentPicker.isCancel(error)) {
        return;
      }
      showToast('Không thể tải tài liệu lên', 'error');
    } finally {
      setUploadingMaterial(false);
    }
  };

  const handleReviewMaterial = async (material: any, isApproved: boolean) => {
    const materialId = Number(material?.materialId || material?.id || 0);
    if (!materialId) {
      return;
    }

    if (isDeletedMaterial(material)) {
      showToast('Tài liệu đã bị xóa', 'error');
      triggerMaterialRefresh();
      return;
    }

    setReviewingMaterialId(materialId);
    try {
      await MaterialAPI.reviewGroupMaterial(materialId, isApproved);
      showToast(isApproved ? 'Đã duyệt tài liệu' : 'Đã từ chối tài liệu', 'success');
      fetchData();
    } catch {
      showToast('Không thể xử lý duyệt tài liệu', 'error');
    } finally {
      setReviewingMaterialId(null);
    }
  };

  const handleQuickAction = (key: string) => {
    if (key === 'roadmap') {
      navigation.navigate('RoadmapJourney', {
        contextType: 'GROUP',
        contextId: normalizedGroupId,
        title,
      });
      return;
    }
    if (key === 'flashcard') {
      showToast('Tạo flashcard AI hiện chỉ hỗ trợ trong workspace cá nhân', 'info');
      return;
    }
    if (key === 'quiz' || key === 'mockTest') {
      showToast('Hiện tại hãy dùng các quiz sẵn có trong nhóm này', 'info');
      setActiveBottomTab('studio');
      return;
    }
    if (key === 'challenge') {
      navigation.push('GroupWorkspace', {
        groupId: normalizedGroupId,
        title,
        detailKey: 'challenge',
      });
      return;
    }
    if (key === 'ranking') {
      navigation.push('GroupWorkspace', {
        groupId: normalizedGroupId,
        title,
        detailKey: 'ranking',
      });
      return;
    }
    if (key === 'notifications') {
      navigation.push('GroupWorkspace', {
        groupId: normalizedGroupId,
        title,
        detailKey: 'notifications',
      });
      return;
    }
    setActiveBottomTab('studio');
  };

  useEffect(() => {
    if (!isDetailPage) {
      return;
    }

    if (detailKey === 'ranking') {
      refreshRanking();
    }
    if (detailKey === 'challenge') {
      refreshChallenges();
    }
  }, [detailKey, isDetailPage, refreshChallenges, refreshRanking]);

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
          onPress={() => navigation.goBack()}
          style={styles.backBtn}>
          <Icon name="chevron-left" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text
            style={[styles.headerTitle, {color: colors.heading}]}
            numberOfLines={1}>
            {isDetailPage
              ? detailKey === 'challenge'
                ? 'Thử thách'
                : detailKey === 'ranking'
                ? 'Xếp hạng'
                : 'Thông báo'
              : title}
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
          <Text style={[styles.memberCount, {color: colors.textSecondary}]}>
            {isDetailPage ? title : `${members.length} thành viên`}
          </Text>
        </View>
        {canReviewMaterials && (
          <TouchableOpacity
            onPress={() => setInviteVisible(true)}
            style={[
              styles.inviteBtn,
              {
                backgroundColor: isDark
                  ? 'rgba(37, 99, 235, 0.18)'
                  : Colors.primaryLight,
              },
            ]}>
            <Icon name="account-plus" size={18} color={Colors.primary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('GroupManagement', {groupId: normalizedGroupId, title})
          }
          style={styles.headerAction}>
          <Icon name="cog-outline" size={22} color={colors.icon} />
        </TouchableOpacity>
      </View>

      {/* ─── Content ─── */}
      <ScrollView
        style={styles.mainContent}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* ───── CHAT TAB ───── */}
        {activeBottomTab === 'chat' && (
          <View>
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

            {/* Overview */}
            <Text style={[styles.sectionTitle, {color: colors.heading}]}>
              Tổng quan
            </Text>
            <View style={styles.overviewRow}>
              <OverviewCard
                icon="account-multiple"
                label="Thành viên"
                value={members.length}
                color="#2563EB"
                colors={colors}
              />
              <OverviewCard
                icon="head-question-outline"
                label="Quiz"
                value={quizzes.length}
                color="#7C3AED"
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

            {canReviewMaterials ? (
              <>
                <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                  Quản trị nhóm
                </Text>
                <View style={styles.adminQuickGrid}>
                  <TouchableOpacity
                    onPress={() => setActiveBottomTab('sources')}
                    style={[styles.adminQuickBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                    <Icon name="file-check-outline" size={18} color={Colors.primary} />
                    <Text style={[styles.adminQuickLabel, {color: colors.heading}]}>Duyệt tài liệu</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('GroupManagement', {
                        groupId: normalizedGroupId,
                        title,
                        initialTab: 'members',
                      })
                    }
                    style={[styles.adminQuickBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                    <Icon name="account-group-outline" size={18} color="#2563EB" />
                    <Text style={[styles.adminQuickLabel, {color: colors.heading}]}>Thành viên</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('GroupManagement', {
                        groupId: normalizedGroupId,
                        title,
                        initialTab: 'ranking',
                      })
                    }
                    style={[styles.adminQuickBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                    <Icon name="trophy-outline" size={18} color="#F59E0B" />
                    <Text style={[styles.adminQuickLabel, {color: colors.heading}]}>Xếp hạng</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('GroupManagement', {
                        groupId: normalizedGroupId,
                        title,
                        initialTab: 'logs',
                      })
                    }
                    style={[styles.adminQuickBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                    <Icon name="history" size={18} color="#64748B" />
                    <Text style={[styles.adminQuickLabel, {color: colors.heading}]}>Hoạt động</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('GroupManagement', {
                        groupId: normalizedGroupId,
                        title,
                        initialTab: 'dashboard',
                      })
                    }
                    style={[styles.adminQuickBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                    <Icon name="chart-line" size={18} color="#10B981" />
                    <Text style={[styles.adminQuickLabel, {color: colors.heading}]}>Tổng quan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('GroupManagement', {
                        groupId: normalizedGroupId,
                        title,
                        initialTab: 'settings',
                      })
                    }
                    style={[styles.adminQuickBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                    <Icon name="cog-outline" size={18} color="#8B5CF6" />
                    <Text style={[styles.adminQuickLabel, {color: colors.heading}]}>Cài đặt</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {/* Quizzes */}
            {quizzes.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                    Quizzes
                  </Text>
                  <Badge label={`${quizzes.length}`} variant="info" size="sm" />
                </View>
                {quizzes.map((quiz: any) => (
                  <TouchableOpacity
                    key={quiz.id || quiz.quizId}
                    onPress={() => openQuizModeSelector(quiz)}
                    style={[
                      styles.listItem,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <View style={[styles.listItemIcon, {backgroundColor: '#2563EB15'}]}>
                      <Icon name="head-question-outline" size={18} color="#2563EB" />
                    </View>
                    <View style={styles.listItemContent}>
                      <Text
                        style={[styles.listItemTitle, {color: colors.heading}]}
                        numberOfLines={1}>
                        {quiz.name || quiz.title}
                      </Text>
                      <Text style={[styles.listItemSub, {color: colors.textSecondary}]}>
                        {quiz.questionCount || 0} câu hỏi
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={colors.textTertiary} />
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
                  <Badge label={`${flashcards.length}`} variant="warning" size="sm" />
                </View>
                {flashcards.map((fc: any) => (
                  <TouchableOpacity
                    key={fc.id || fc.flashcardSetId}
                    onPress={() => openFlashcardDetail(fc)}
                    style={[
                      styles.listItem,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <View style={[styles.listItemIcon, {backgroundColor: '#EA580C15'}]}>
                      <Icon name="cards-outline" size={18} color="#EA580C" />
                    </View>
                    <View style={styles.listItemContent}>
                      <Text
                        style={[styles.listItemTitle, {color: colors.heading}]}
                        numberOfLines={1}>
                        {fc.name || fc.title}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={20} color={colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {/* ───── SOURCES TAB ───── */}
        {activeBottomTab === 'sources' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                Tài liệu nhóm ({materials.length})
              </Text>
              <TouchableOpacity
                onPress={handleUploadMaterial}
                style={[styles.addSourceBtn, {backgroundColor: Colors.primary}]}>
                <Icon name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.addSourceText}>
                  {uploadingMaterial ? 'Đang tải...' : 'Thêm'}
                </Text>
              </TouchableOpacity>
            </View>

            {canReviewMaterials && (
              <View
                style={[
                  styles.pendingReviewCard,
                  {backgroundColor: colors.surface, borderColor: colors.border},
                ]}>
                <View style={styles.pendingReviewHeader}>
                  <Text style={[styles.pendingReviewTitle, {color: colors.heading}]}>Duyệt tài liệu chờ</Text>
                  <Badge
                    label={`${pendingReviewMaterials.length}`}
                    variant={pendingReviewMaterials.length > 0 ? 'warning' : 'default'}
                    size="sm"
                  />
                </View>
                {pendingReviewMaterials.length === 0 ? (
                  <Text style={[styles.pendingReviewEmpty, {color: colors.textSecondary}]}>Không có tài liệu cần duyệt</Text>
                ) : (
                  pendingReviewMaterials.filter(mat => !isDeletedMaterial(mat)).map((mat: any) => {
                    const matId = Number(mat?.materialId || mat?.id || 0);
                    const isLoading = reviewingMaterialId === matId;
                    return (
                      <View key={String(matId || mat?.title)} style={[styles.pendingReviewItem, {borderBottomColor: colors.border}]}>
                        <View style={[styles.pendingReviewIcon, {backgroundColor: '#F59E0B20'}]}>
                          <Icon name="alert-circle-outline" size={16} color="#F59E0B" />
                        </View>
                        <View style={styles.pendingReviewInfo}>
                          <Text style={[styles.pendingReviewName, {color: colors.heading}]} numberOfLines={1}>
                            {mat?.title || mat?.fileName || `Material #${matId}`}
                          </Text>
                          <Text style={[styles.pendingReviewMeta, {color: colors.textSecondary}]}>Trạng thái: {String(mat?.status || 'PENDING')}</Text>
                        </View>
                        <View style={styles.pendingReviewActions}>
                          <Button
                            title="Duyệt"
                            size="sm"
                            fullWidth={false}
                            loading={isLoading}
                            onPress={() => handleReviewMaterial(mat, true)}
                            style={styles.reviewActionBtn}
                          />
                          <Button
                            title="Từ chối"
                            variant="destructive"
                            size="sm"
                            fullWidth={false}
                            loading={isLoading}
                            onPress={() => handleReviewMaterial(mat, false)}
                            style={styles.reviewActionBtn}
                          />
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {materials.length === 0 ? (
              <View style={styles.emptySection}>
                <View
                  style={[
                    styles.emptyIconWrap,
                    {backgroundColor: isDark ? Colors.dark.surfaceVariant : '#F1F5F9'},
                  ]}>
                  <Icon name="folder-outline" size={36} color={colors.textTertiary} />
                </View>
                <Text style={[styles.emptyTitle, {color: colors.textSecondary}]}>
                  Chưa có tài liệu
                </Text>
                <Text style={[styles.emptySubtitle, {color: colors.textTertiary}]}>
                  Tải tài liệu lên để chia sẻ với nhóm và chờ leader duyệt
                </Text>
                <TouchableOpacity
                  onPress={handleUploadMaterial}
                  style={[
                    styles.uploadBtn,
                    {backgroundColor: isDark ? Colors.dark.surfaceVariant : Colors.primaryLight},
                  ]}>
                  <Icon name="upload" size={18} color={Colors.primary} />
                  <Text style={[styles.uploadBtnText, {color: Colors.primary}]}>
                    {uploadingMaterial ? 'Đang tải...' : 'Tải tài liệu lên'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              materials.filter(src => !isDeletedMaterial(src)).map((src: any, i: number) => (
                <View
                  key={src.id || i}
                  style={[
                    styles.sourceItem,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={[styles.sourceIcon, {backgroundColor: `${Colors.primary}15`}]}>
                    <Icon name="file-document" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.sourceInfo}>
                    <Text style={[styles.sourceName, {color: colors.heading}]} numberOfLines={1}>
                      {src.title || src.name}
                    </Text>
                    <Text style={[styles.sourceMeta, {color: colors.textSecondary}]}>Trạng thái: {String(src.status || 'N/A')}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ───── STUDIO TAB ───── */}
        {activeBottomTab === 'studio' && (
          <View>
            {isLeader ? (
              <>
                <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                  Tổng quan
                </Text>
                <Text style={[styles.studioSubtitle, {color: colors.textSecondary}]}>
                  Theo dõi nhanh tình trạng nhóm và truy cập công cụ quản trị.
                </Text>

                <View
                  style={[
                    styles.dashboardHero,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.dashboardBadgeRow}>
                    <View
                      style={[
                        styles.dashboardBadge,
                        {
                          backgroundColor: isDark
                            ? 'rgba(37, 99, 235, 0.18)'
                            : Colors.primaryLight,
                        },
                      ]}>
                      <Text style={[styles.dashboardBadgeText, {color: Colors.primary}]}>
                        Quản trị nhóm
                      </Text>
                    </View>
                    <View style={[styles.dashboardBadge, {backgroundColor: colors.surfaceVariant}]}>
                      <Text style={[styles.dashboardBadgeText, {color: colors.textSecondary}]}>
                        Trưởng nhóm
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.dashboardTitle, {color: colors.heading}]}>
                    {groupDetail?.groupName || groupDetail?.name || title || 'Nhóm học tập'}
                  </Text>
                  <Text style={[styles.dashboardDescription, {color: colors.textSecondary}]}>
                    {groupDetail?.description ||
                      'Xem tổng quan tài nguyên, thành viên và các hạng mục cần xử lý trong nhóm.'}
                  </Text>

                  <View style={styles.dashboardActions}>
                    <TouchableOpacity
                      activeOpacity={0.78}
                      onPress={() =>
                        navigation.navigate('GroupManagement', {
                          groupId: normalizedGroupId,
                          title,
                          initialTab: 'dashboard',
                        })
                      }
                      style={[styles.dashboardPrimaryButton, {backgroundColor: Colors.primary}]}>
                      <Icon name="chart-line" size={17} color="#FFFFFF" />
                      <Text style={styles.dashboardPrimaryText}>Mở quản trị</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.78}
                      onPress={() => setActiveBottomTab('sources')}
                      style={[
                        styles.dashboardSecondaryButton,
                        {backgroundColor: colors.surfaceVariant, borderColor: colors.border},
                      ]}>
                      <Icon name="file-check-outline" size={17} color={colors.icon} />
                      <Text style={[styles.dashboardSecondaryText, {color: colors.text}]}>
                        Duyệt tài liệu
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.studioGrid}>
                  <OverviewCard
                    icon="account-multiple"
                    label="Thành viên"
                    value={members.length}
                    color="#2563EB"
                    colors={colors}
                  />
                  <OverviewCard
                    icon="file-document-outline"
                    label="Tài liệu"
                    value={materials.filter(src => !isDeletedMaterial(src)).length}
                    color="#64748B"
                    colors={colors}
                  />
                  <OverviewCard
                    icon="head-question-outline"
                    label="Quiz"
                    value={dashboardSummary?.totalQuizzes ?? quizzes.length}
                    color="#7C3AED"
                    colors={colors}
                  />
                  <OverviewCard
                    icon="cards-outline"
                    label="Flashcard"
                    value={dashboardSummary?.totalFlashcards ?? flashcards.length}
                    color="#EA580C"
                    colors={colors}
                  />
                  <OverviewCard
                    icon="map-outline"
                    label="Lộ trình"
                    value={dashboardSummary?.totalRoadmaps ?? roadmaps.length}
                    color="#059669"
                    colors={colors}
                  />
                  <OverviewCard
                    icon="file-check-outline"
                    label="Chờ duyệt"
                    value={pendingReviewMaterials.length}
                    color="#10B981"
                    colors={colors}
                  />
                </View>

                {pendingReviewMaterials.length > 0 ? (
                  <View
                    style={[
                      styles.dashboardReadCard,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <Text style={[styles.dashboardCardEyebrow, {color: colors.textTertiary}]}>
                      CẦN XỬ LÝ
                    </Text>
                    <Text style={[styles.dashboardSectionHeading, {color: colors.heading}]}>
                      {pendingReviewMaterials.length} tài liệu đang chờ duyệt
                    </Text>
                    <View style={styles.dashboardReadGrid}>
                      <DashboardReadItem
                        label="Chuyển đến"
                        value="Tài liệu"
                        colors={colors}
                      />
                      <DashboardReadItem
                        label="Hành động"
                        value="Duyệt / Từ chối"
                        colors={colors}
                      />
                      <DashboardReadItem
                        label="Mẹo"
                        value="Nhấn “Duyệt tài liệu” để xử lý"
                        colors={colors}
                      />
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                  Dashboard cá nhân
                </Text>
                <Text style={[styles.studioSubtitle, {color: colors.textSecondary}]}>
                  Theo dõi vai trò, tài nguyên, hoạt động và tiến độ học của bạn trong nhóm.
                </Text>

                <View
                  style={[
                    styles.dashboardHero,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.dashboardBadgeRow}>
                    <View style={[styles.dashboardBadge, {backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : '#ECFDF5'}]}>
                      <Text style={[styles.dashboardBadgeText, {color: isDark ? '#6EE7B7' : '#047857'}]}>
                        Không gian nhóm
                      </Text>
                    </View>
                    <View style={[styles.dashboardBadge, {backgroundColor: colors.surfaceVariant}]}>
                      <Text style={[styles.dashboardBadgeText, {color: colors.textSecondary}]}>
                        {formatRoleLabel(currentRoleLabel)}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.dashboardTitle, {color: colors.heading}]}>
                    Xin chào, {currentMember?.fullName || (user as any)?.fullName || 'thành viên'}
                  </Text>
                  <Text style={[styles.dashboardDescription, {color: colors.textSecondary}]}>
                    {groupDetail?.description ||
                      `Bạn đang học trong ${groupDetail?.groupName || groupDetail?.name || title || 'nhóm này'}. Mở lộ trình, xem hoạt động hoặc kiểm tra thử thách ngay từ dashboard.`}
                  </Text>
                  <View style={styles.dashboardActions}>
                    <TouchableOpacity
                      activeOpacity={0.78}
                      onPress={() =>
                        navigation.navigate('RoadmapJourney', {
                          contextType: 'GROUP',
                          contextId: normalizedGroupId,
                          title,
                        })
                      }
                      style={[styles.dashboardPrimaryButton, {backgroundColor: '#0891B2'}]}>
                      <Icon name="map-outline" size={17} color="#FFFFFF" />
                      <Text style={styles.dashboardPrimaryText}>Mở lộ trình</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.78}
                      onPress={() =>
                        navigation.push('GroupWorkspace', {
                          groupId: normalizedGroupId,
                          title,
                          detailKey: 'notifications',
                        })
                      }
                      style={[
                        styles.dashboardSecondaryButton,
                        {backgroundColor: colors.surfaceVariant, borderColor: colors.border},
                      ]}>
                      <Icon name="history" size={17} color={colors.icon} />
                      <Text style={[styles.dashboardSecondaryText, {color: colors.text}]}>
                        Hoạt động
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.studioGrid}>
                  <OverviewCard
                    icon="shield-check-outline"
                    label="Vai trò"
                    value={formatRoleLabel(currentRoleLabel)}
                    color="#0EA5E9"
                    colors={colors}
                  />
                  <OverviewCard
                    icon="account-multiple"
                    label="Thành viên"
                    value={members.length}
                    color="#2563EB"
                    colors={colors}
                  />
                </View>
              </>
            )}
            {!isLeader ? (
              <>
                <View style={styles.studioGrid}>
                  <OverviewCard
                    icon="folder-open-outline"
                    label="Tài liệu"
                    value={materials.length}
                    color="#059669"
                    colors={colors}
                  />
                  <OverviewCard
                    icon="calendar-outline"
                    label="Ngày vào"
                    value={formatCompactDate(currentMember?.joinedAt).split(' ')[0]}
                    color="#7C3AED"
                    colors={colors}
                  />
                </View>

                <View
                  style={[
                    styles.dashboardReadCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <Text style={[styles.dashboardCardEyebrow, {color: colors.textTertiary}]}>
                    GROUP QUICK READ
                  </Text>
                  <View style={styles.dashboardReadGrid}>
                    <DashboardReadItem
                      label="Tên nhóm"
                      value={groupDetail?.groupName || groupDetail?.name || title || 'Nhóm'}
                      colors={colors}
                    />
                    <DashboardReadItem
                      label="Lộ trình"
                      value={roadmaps.length > 0 ? `${roadmaps.length} lộ trình` : 'Chưa có'}
                      colors={colors}
                    />
                    <DashboardReadItem
                      label="Thử thách"
                      value={`${challenges.length} thử thách`}
                      colors={colors}
                    />
                  </View>
                </View>

                <View
                  style={[
                    styles.dashboardReadCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.panelTitleRow}>
                    <Icon name="chart-line" size={18} color={Colors.primary} />
                    <Text style={[styles.dashboardSectionHeading, {color: colors.heading}]}>
                      Learning snapshot
                    </Text>
                  </View>
                  <View style={styles.snapshotGrid}>
                    {[
                      {
                        label: 'Quiz',
                        value: dashboardSummary?.totalQuizzes ?? quizzes.length,
                        icon: 'head-question-outline',
                        color: '#2563EB',
                      },
                      {
                        label: 'Flashcard',
                        value: dashboardSummary?.totalFlashcards ?? flashcards.length,
                        icon: 'cards-outline',
                        color: '#EA580C',
                      },
                      {
                        label: 'Xếp hạng',
                        value: rankingRows.length ? `Top ${rankingRows.length}` : 'N/A',
                        icon: 'trophy-outline',
                        color: '#F59E0B',
                      },
                    ].map(item => (
                      <View
                        key={item.label}
                        style={[
                          styles.snapshotTile,
                          {backgroundColor: colors.surfaceVariant, borderColor: colors.border},
                        ]}>
                        <Icon name={item.icon} size={18} color={item.color} />
                        <Text style={[styles.snapshotValue, {color: colors.heading}]}>
                          {String(item.value)}
                        </Text>
                        <Text style={[styles.snapshotLabel, {color: colors.textSecondary}]}>
                          {item.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {groupLogs.length > 0 ? (
                  <View
                    style={[
                      styles.dashboardReadCard,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <View style={styles.panelTitleRow}>
                      <Icon name="history" size={18} color="#0EA5E9" />
                      <Text style={[styles.dashboardSectionHeading, {color: colors.heading}]}>
                        Hoạt động gần đây
                      </Text>
                    </View>
                    {groupLogs.slice(0, 3).map((log: any, index: number) => (
                      <ActivityFeedItem
                        key={`${log?.logId || index}:${log?.logTime || log?.createdAt || ''}`}
                        log={log}
                        colors={colors}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        )}

        {activeBottomTab === 'challenge' && (
          <View>
            {!isDetailPage ? (
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                    Thử thách
                  </Text>
                  <Text style={[styles.studioSubtitle, {color: colors.textSecondary}]}>
                    Theo dõi challenge của nhóm, đăng ký và mở quiz challenge khi đã sẵn sàng.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={refreshChallenges}
                  style={[styles.refreshCircle, {backgroundColor: colors.surfaceVariant}]}>
                  <Icon name="refresh" size={18} color={colors.icon} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.sectionHeader, {justifyContent: 'flex-end'}]}>
                <TouchableOpacity
                  onPress={refreshChallenges}
                  style={[styles.refreshCircle, {backgroundColor: colors.surfaceVariant}]}>
                  <Icon name="refresh" size={18} color={colors.icon} />
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.segmentWrap, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              {CHALLENGE_STATUS_TABS.map(tab => {
                const active = challengeStatus === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setChallengeStatus(tab.key)}
                    style={[
                      styles.segmentButton,
                      active && {backgroundColor: isDark ? 'rgba(249,115,22,0.18)' : '#FFF7ED'},
                    ]}>
                    <Text style={[styles.segmentText, {color: active ? '#EA580C' : colors.textSecondary}]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipRow}>
              {CHALLENGE_MODE_TABS.map(tab => {
                const active = challengeMode === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setChallengeMode(tab.key)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active
                          ? isDark ? 'rgba(20,184,166,0.18)' : '#F0FDFA'
                          : colors.surface,
                        borderColor: active ? '#14B8A6' : colors.border,
                      },
                    ]}>
                    <Text style={[styles.filterChipText, {color: active ? '#0F766E' : colors.textSecondary}]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {selectedChallenge ? (
              <View
                style={[
                  styles.challengeDetailCard,
                  {backgroundColor: colors.surface, borderColor: colors.border},
                ]}>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedChallenge(null);
                    setChallengeDetail(null);
                  }}
                  style={styles.inlineBackButton}>
                  <Icon name="chevron-left" size={18} color={colors.icon} />
                  <Text style={[styles.inlineBackText, {color: colors.textSecondary}]}>
                    Danh sách thử thách
                  </Text>
                </TouchableOpacity>

                {challengeDetailLoading ? (
                  <View style={styles.inlineLoader}>
                    <ActivityIndicator color={Colors.primary} />
                  </View>
                ) : (
                  <>
                    <View style={styles.challengeTitleRow}>
                      <View style={[styles.challengeIcon, {backgroundColor: '#F9731618'}]}>
                        <Icon name="sword-cross" size={24} color="#F97316" />
                      </View>
                      <View style={styles.listItemContent}>
                        <Text style={[styles.challengeDetailTitle, {color: colors.heading}]}>
                          {challengeDetail?.title || selectedChallenge?.title || selectedChallenge?.name || 'Thử thách'}
                        </Text>
                        <Text style={[styles.listItemSub, {color: colors.textSecondary}]}>
                          {formatChallengeStatus(challengeDetail?.status || selectedChallenge?.status)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.challengeMetaGrid}>
                      <DashboardReadItem
                        label="Chế độ"
                        value={challengeDetail?.matchMode || selectedChallenge?.matchMode || 'FREE_FOR_ALL'}
                        colors={colors}
                      />
                      <DashboardReadItem
                        label="Bắt đầu"
                        value={formatCompactDate(challengeDetail?.startTime || selectedChallenge?.startTime)}
                        colors={colors}
                      />
                      <DashboardReadItem
                        label="Người tham gia"
                        value={String(
                          challengeDetail?.participantCount ||
                            selectedChallenge?.participantCount ||
                            challengeDetail?.registeredCount ||
                            0,
                        )}
                        colors={colors}
                      />
                    </View>

                    <View style={styles.challengeActionRow}>
                      {canRegisterSelectedChallenge ? (
                        <TouchableOpacity
                          onPress={handleRegisterChallenge}
                          disabled={challengeActionLoading}
                          style={[
                            styles.challengeActionButton,
                            {backgroundColor: '#F97316'},
                            challengeActionLoading && styles.disabledAction,
                          ]}>
                          <Icon name="account-plus-outline" size={17} color="#FFFFFF" />
                          <Text style={styles.challengeActionText}>
                            {challengeActionLoading ? 'Đang xử lý...' : 'Đăng ký'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {canAcceptSelectedChallengeInvite ? (
                        <TouchableOpacity
                          onPress={handleAcceptChallengeInvitation}
                          disabled={challengeActionLoading}
                          style={[
                            styles.challengeActionButton,
                            {backgroundColor: '#F97316'},
                            challengeActionLoading && styles.disabledAction,
                          ]}>
                          <Icon name="check-circle-outline" size={17} color="#FFFFFF" />
                          <Text style={styles.challengeActionText}>
                            {challengeActionLoading ? 'Đang xử lý...' : 'Nhận lời mời'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {canStartSelectedChallengeAttempt ? (
                        <TouchableOpacity
                          onPress={handleStartChallengeAttempt}
                          style={[
                            styles.challengeActionButton,
                            {backgroundColor: '#16A34A'},
                          ]}>
                          <Icon name="play-outline" size={17} color="#FFFFFF" />
                          <Text style={styles.challengeActionText}>
                            {selectedParticipantStatus === 'PLAYING'
                              ? 'Tiếp tục làm bài'
                              : 'Làm bài'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        onPress={handleOpenChallengeQuiz}
                        style={[
                          styles.challengeActionButton,
                          {
                            backgroundColor: colors.surfaceVariant,
                            borderColor: colors.border,
                            borderWidth: 1,
                          },
                        ]}>
                        <Icon name="clipboard-text-outline" size={17} color={Colors.primary} />
                        <Text style={[styles.challengeActionText, {color: Colors.primary}]}>
                          Mở quiz
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ) : visibleChallenges.length === 0 ? (
              <EmptyPanel
                icon="sword-cross"
                title="Chưa có thử thách"
                subtitle="Các challenge của nhóm sẽ xuất hiện tại đây khi leader tạo hoặc xuất bản."
                colors={colors}
              />
            ) : (
              visibleChallenges.map((challenge, index) => (
                <TouchableOpacity
                  key={`${getChallengeId(challenge) || index}:${challenge?.title || challenge?.name || ''}`}
                  onPress={() => openChallengeDetail(challenge)}
                  style={[
                    styles.challengeCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={[styles.challengeIcon, {backgroundColor: '#F9731618'}]}>
                    <Icon name="sword-cross" size={20} color="#F97316" />
                  </View>
                  <View style={styles.listItemContent}>
                    <Text style={[styles.listItemTitle, {color: colors.heading}]} numberOfLines={1}>
                      {challenge?.title || challenge?.name || `Challenge #${getChallengeId(challenge)}`}
                    </Text>
                    <Text style={[styles.listItemSub, {color: colors.textSecondary}]}>
                      {formatChallengeStatus(challenge?.status || challenge?.eventStatus)} • {challenge?.matchMode || 'FREE_FOR_ALL'}
                    </Text>
                    <Text style={[styles.listItemSub, {color: colors.textSecondary}]}>
                      {formatCompactDate(challenge?.startTime || challenge?.startedAt)}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.textTertiary} />
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {activeBottomTab === 'ranking' && (
          <View>
            {!isDetailPage ? (
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                    Xếp hạng nhóm
                  </Text>
                  <Text style={[styles.studioSubtitle, {color: colors.textSecondary}]}>
                    Bảng điểm RP tổng hợp từ quiz thường, quiz roadmap và thi thử.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={refreshRanking}
                  style={[styles.refreshCircle, {backgroundColor: colors.surfaceVariant}]}>
                  <Icon name="refresh" size={18} color={colors.icon} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.sectionHeader, {justifyContent: 'flex-end'}]}>
                <TouchableOpacity
                  onPress={refreshRanking}
                  style={[styles.refreshCircle, {backgroundColor: colors.surfaceVariant}]}>
                  <Icon name="refresh" size={18} color={colors.icon} />
                </TouchableOpacity>
              </View>
            )}

            {rankingRows.length === 0 ? (
              <EmptyPanel
                icon="trophy-outline"
                title="Chưa có dữ liệu xếp hạng"
                subtitle="Hoàn thành quiz trong nhóm để bắt đầu tích điểm RP."
                colors={colors}
              />
            ) : (
              <>
                <View style={styles.podiumGrid}>
                  {rankingRows.slice(0, 3).map((row: any, index: number) => (
                    <TouchableOpacity
                      key={`podium-${row?.userId || index}`}
                      onPress={() => openRankingDetail(row)}
                      style={[
                        styles.podiumCard,
                        {
                          backgroundColor:
                            index === 0
                              ? isDark ? 'rgba(245,158,11,0.16)' : '#FFFBEB'
                              : colors.surface,
                          borderColor: index === 0 ? '#F59E0B' : colors.border,
                        },
                      ]}>
                      <Icon
                        name={index === 0 ? 'crown-outline' : 'medal-outline'}
                        size={22}
                        color={index === 0 ? '#F59E0B' : colors.icon}
                      />
                      <Text style={[styles.podiumRank, {color: colors.heading}]}>
                        #{index + 1}
                      </Text>
                      <Text style={[styles.podiumName, {color: colors.heading}]} numberOfLines={1}>
                        {row?.fullName || row?.username || row?.email || 'Thành viên'}
                      </Text>
                      <Text style={[styles.podiumPoints, {color: index === 0 ? '#F59E0B' : Colors.primary}]}>
                        {formatPoints(row?.rankingPoints || row?.points)} RP
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {rankingDetailLoading ? (
                  <View style={styles.inlineLoader}>
                    <ActivityIndicator color={Colors.primary} />
                  </View>
                ) : rankingDetail ? (
                  <View
                    style={[
                      styles.rankingDetailCard,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <View style={styles.panelTitleRow}>
                      <Icon name="account-star-outline" size={18} color="#F59E0B" />
                      <Text style={[styles.dashboardSectionHeading, {color: colors.heading}]}>
                        Chi tiết thành viên
                      </Text>
                    </View>
                    <Text style={[styles.rankingDetailName, {color: colors.heading}]}>
                      {rankingDetail?.fullName || rankingDetail?.username || rankingDetail?.email || 'Thành viên'}
                    </Text>
                    <View style={styles.challengeMetaGrid}>
                      <DashboardReadItem label="Tổng RP" value={`${formatPoints(rankingDetail?.rankingPoints)} RP`} colors={colors} />
                      <DashboardReadItem label="Quiz thường" value={`${formatPoints(rankingDetail?.regularQuizPoints)} RP`} colors={colors} />
                      <DashboardReadItem label="Roadmap" value={`${formatPoints(rankingDetail?.roadmapQuizPoints)} RP`} colors={colors} />
                    </View>
                  </View>
                ) : null}

                {rankingRows.map((row: any, index: number) => (
                  <TouchableOpacity
                    key={`${row?.userId || row?.id || index}`}
                    onPress={() => openRankingDetail(row)}
                    style={[
                      styles.rankingRow,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <View style={styles.rankingPosition}>
                      <Text style={[styles.rankingNum, {color: colors.heading}]}>
                        #{row?.rank || index + 1}
                      </Text>
                    </View>
                    <View style={styles.rankingMemberInfo}>
                      <Text style={[styles.rankingMemberName, {color: colors.heading}]} numberOfLines={1}>
                        {row?.fullName || row?.username || row?.email || 'Thành viên'}
                      </Text>
                      <Text style={[styles.rankingMemberEmail, {color: colors.textSecondary}]} numberOfLines={1}>
                        {row?.email || row?.username || 'QuizMateAI'}
                      </Text>
                    </View>
                    <View style={styles.rankingScore}>
                      <Text style={[styles.rankingScoreValue, {color: '#F59E0B'}]}>
                        {formatPoints(row?.rankingPoints || row?.points)}
                      </Text>
                      <Text style={[styles.rankingScoreLabel, {color: colors.textSecondary}]}>
                        RP
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}

        {activeBottomTab === 'notifications' && (
          <View>
            {!isDetailPage ? (
              <>
                <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                  Thông báo nhóm
                </Text>
                <Text style={[styles.studioSubtitle, {color: colors.textSecondary}]}>
                  Dòng hoạt động realtime của nhóm: tài liệu, quiz, thành viên và các cập nhật học tập.
                </Text>
              </>
            ) : null}
            {groupLogs.length === 0 ? (
              <EmptyPanel
                icon="bell-outline"
                title="Chưa có thông báo"
                subtitle="Khi nhóm có hoạt động mới, thông báo sẽ xuất hiện tại đây."
                colors={colors}
              />
            ) : (
              groupLogs.map((log: any, index: number) => (
                <ActivityFeedItem
                  key={`${log?.logId || index}:${log?.logTime || log?.createdAt || ''}`}
                  log={log}
                  colors={colors}
                  expanded
                />
              ))
            )}
          </View>
        )}
      </ScrollView>

      {!isDetailPage ? (
        <View
          style={[
            styles.bottomToolbar,
            {backgroundColor: colors.surface, borderTopColor: colors.border},
          ]}>
          {(['chat', 'sources', 'studio'] as BottomTab[]).map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveBottomTab(tab)}
              activeOpacity={0.7}
              style={styles.toolbarTab}>
              <Icon
                name={
                  tab === 'chat'
                    ? activeBottomTab === tab ? 'view-dashboard' : 'view-dashboard-outline'
                    : tab === 'sources'
                    ? activeBottomTab === tab ? 'folder' : 'folder-outline'
                    : activeBottomTab === tab ? 'chart-box' : 'chart-box-outline'
                }
                size={22}
                color={activeBottomTab === tab ? Colors.primary : colors.textTertiary}
              />
              <Text
                style={[
                  styles.toolbarLabel,
                  {
                    color: activeBottomTab === tab ? Colors.primary : colors.textTertiary,
                    fontWeight: activeBottomTab === tab ? '600' : '400',
                  },
                ]}>
                {tab === 'chat'
                  ? 'Tổng quan'
                  : tab === 'sources'
                  ? 'Tài liệu'
                  : isLeader
                  ? 'Tổng quan'
                  : 'Dashboard'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* ─── Invite Dialog ─── */}
      <Dialog
        visible={inviteVisible}
        onClose={() => setInviteVisible(false)}
        title="Mời thành viên">
        <FloatingInput
          label="Email"
          value={inviteEmail}
          onChangeText={setInviteEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <View style={styles.dialogActions}>
          <Button
            title="Cancel"
            variant="outline"
            size="md"
            onPress={() => setInviteVisible(false)}
            fullWidth={false}
            style={{flex: 1}}
          />
          <Button
            title="Invite"
            size="md"
            onPress={handleInvite}
            loading={inviting}
            fullWidth={false}
            style={{flex: 1}}
          />
        </View>
      </Dialog>
    </SafeAreaView>
  );
}

/* ──── Sub-components ──── */
function OverviewCard({
  icon, label, value, color, colors,
}: {
  icon: string; label: string; value: number | string; color: string; colors: any;
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
      <Text style={[styles.overviewValue, {color: colors.heading}]}>{value}</Text>
      <Text style={[styles.overviewLabel, {color: colors.textSecondary}]}>{label}</Text>
    </View>
  );
}

function DashboardReadItem({
  label,
  value,
  colors,
}: {
  label: string;
  value: any;
  colors: any;
}) {
  return (
    <View style={styles.readItem}>
      <Text style={[styles.readLabel, {color: colors.textSecondary}]}>
        {label}
      </Text>
      <Text style={[styles.readValue, {color: colors.heading}]} numberOfLines={2}>
        {String(value || '—')}
      </Text>
    </View>
  );
}

function ActivityFeedItem({
  log,
  colors,
  expanded = false,
}: {
  log: any;
  colors: any;
  expanded?: boolean;
}) {
  const action = String(log?.action || log?.type || 'GROUP_UPDATE').replace(/_/g, ' ');
  const description =
    log?.description ||
    log?.message ||
    log?.content ||
    `${log?.actorEmail || 'Hệ thống'} cập nhật ${action.toLowerCase()}`;
  return (
    <View
      style={[
        styles.activityItem,
        {backgroundColor: colors.surfaceVariant, borderColor: colors.border},
      ]}>
      <View style={[styles.activityIcon, {backgroundColor: '#0EA5E918'}]}>
        <Icon name="bell-outline" size={16} color="#0EA5E9" />
      </View>
      <View style={styles.listItemContent}>
        <Text style={[styles.activityTitle, {color: colors.heading}]} numberOfLines={expanded ? 3 : 2}>
          {description}
        </Text>
        <Text style={[styles.activityMeta, {color: colors.textSecondary}]}>
          {action} • {formatCompactDate(log?.logTime || log?.createdAt || log?.updatedAt)}
        </Text>
      </View>
    </View>
  );
}

function EmptyPanel({
  icon,
  title,
  subtitle,
  colors,
}: {
  icon: string;
  title: string;
  subtitle: string;
  colors: any;
}) {
  return (
    <View
      style={[
        styles.emptyPanel,
        {backgroundColor: colors.surface, borderColor: colors.border},
      ]}>
      <View style={[styles.emptyIconWrap, {backgroundColor: colors.surfaceVariant}]}>
        <Icon name={icon} size={34} color={colors.textTertiary} />
      </View>
      <Text style={[styles.emptyTitle, {color: colors.heading}]}>{title}</Text>
      <Text style={[styles.emptySubtitle, {color: colors.textSecondary}]}>
        {subtitle}
      </Text>
    </View>
  );
}

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
  memberCount: {fontSize: 12, marginTop: 1},
  inviteBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 4,
  },
  headerAction: {padding: Spacing.sm},

  mainContent: {flex: 1},
  scrollContent: {padding: Spacing.lg, paddingBottom: 160},

  sectionTitle: {fontSize: 16, fontWeight: '600', marginBottom: Spacing.md, marginTop: Spacing.lg},
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md,
  },

  // Quick Actions
  quickActions: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm},
  quickAction: {
    flex: 1, minWidth: '45%',
    paddingVertical: Spacing.base, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md, alignItems: 'center', gap: 6,
  },
  quickActionLabel: {fontSize: 12, fontWeight: '600'},

  // Overview
  overviewRow: {flexDirection: 'row', gap: Spacing.sm},
  overviewCard: {
    flex: 1, alignItems: 'center',
    paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1, gap: 4,
  },
  overviewIcon: {
    width: 32, height: 32, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center', marginBottom: 2,
  },
  overviewValue: {fontSize: 18, fontWeight: '700'},
  overviewLabel: {fontSize: 10},

  adminQuickGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm},
  adminQuickBtn: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: 6,
  },
  adminQuickLabel: {fontSize: 12, fontWeight: '600'},

  // List Items
  listItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1, marginBottom: Spacing.sm, gap: 12,
  },
  listItemIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  listItemContent: {flex: 1},
  listItemTitle: {fontSize: 14, fontWeight: '500'},
  listItemSub: {fontSize: 12, marginTop: 2},

  // Sources
  addSourceBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, gap: 4,
  },
  addSourceText: {color: '#FFFFFF', fontSize: 13, fontWeight: '600'},
  emptySection: {alignItems: 'center', paddingVertical: Spacing['3xl'], gap: 12},
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  emptyTitle: {fontSize: 16, fontWeight: '600'},
  emptySubtitle: {fontSize: 13, textAlign: 'center', paddingHorizontal: 24},
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md, gap: 8, marginTop: Spacing.sm,
  },
  uploadBtnText: {fontSize: 14, fontWeight: '600'},
  sourceItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1, marginBottom: Spacing.sm, gap: 12,
  },
  sourceIcon: {
    width: 40, height: 40, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  sourceInfo: {flex: 1},
  sourceName: {fontSize: 14, fontWeight: '500'},
  sourceMeta: {fontSize: 12, marginTop: 2},

  pendingReviewCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  pendingReviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingReviewTitle: {fontSize: 14, fontWeight: '700'},
  pendingReviewEmpty: {fontSize: 12},
  pendingReviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: Spacing.sm,
  },
  pendingReviewIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingReviewInfo: {flex: 1},
  pendingReviewName: {fontSize: 13, fontWeight: '600'},
  pendingReviewMeta: {fontSize: 11, marginTop: 1},
  pendingReviewActions: {flexDirection: 'row', gap: 6},
  reviewActionBtn: {minWidth: 70},

  // Studio
  studioSubtitle: {fontSize: 13, marginTop: -Spacing.sm, marginBottom: Spacing.md},
  studioGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm},
  studioItem: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2,
    alignItems: 'center',
    paddingVertical: Spacing.lg, borderRadius: BorderRadius.md,
    borderWidth: 1, gap: 6,
  },
  studioItemIcon: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  studioCount: {fontSize: 22, fontWeight: '700'},
  studioLabel: {fontSize: 12},

  recentItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1, marginBottom: Spacing.sm, gap: 10,
  },
  recentIcon: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  recentTitle: {fontSize: 13, fontWeight: '500', flex: 1},

  dashboardHero: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  dashboardBadgeRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  dashboardBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dashboardBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  dashboardTitle: {fontSize: 22, fontWeight: '800', lineHeight: 28},
  dashboardDescription: {fontSize: 13, lineHeight: 20},
  dashboardActions: {flexDirection: 'row', gap: Spacing.sm, marginTop: 4},
  dashboardPrimaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dashboardPrimaryText: {color: '#FFFFFF', fontSize: 13, fontWeight: '700'},
  dashboardSecondaryButton: {
    minHeight: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.md,
  },
  dashboardSecondaryText: {fontSize: 13, fontWeight: '700'},
  dashboardReadCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  dashboardCardEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  dashboardReadGrid: {gap: Spacing.md},
  dashboardSectionHeading: {fontSize: 15, fontWeight: '700'},
  readItem: {gap: 3},
  readLabel: {fontSize: 12},
  readValue: {fontSize: 14, fontWeight: '700', lineHeight: 19},
  snapshotGrid: {flexDirection: 'row', gap: Spacing.sm},
  snapshotTile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 4,
  },
  snapshotValue: {fontSize: 16, fontWeight: '800'},
  snapshotLabel: {fontSize: 11},
  panelTitleRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 10,
    marginTop: Spacing.sm,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: {fontSize: 13, fontWeight: '600', lineHeight: 19},
  activityMeta: {fontSize: 11, marginTop: 3},
  refreshCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentWrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: 4,
    marginBottom: Spacing.sm,
  },
  segmentButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: 9,
    alignItems: 'center',
  },
  segmentText: {fontSize: 12, fontWeight: '700'},
  filterChipRow: {gap: 8, paddingVertical: Spacing.sm},
  filterChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipText: {fontSize: 12, fontWeight: '700'},
  challengeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 12,
    marginBottom: Spacing.sm,
  },
  challengeIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeDetailCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  inlineBackButton: {flexDirection: 'row', alignItems: 'center', gap: 4},
  inlineBackText: {fontSize: 12, fontWeight: '700'},
  inlineLoader: {paddingVertical: Spacing.xl, alignItems: 'center'},
  challengeTitleRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  challengeDetailTitle: {fontSize: 18, fontWeight: '800', lineHeight: 24},
  challengeMetaGrid: {gap: Spacing.md},
  challengeActionRow: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm},
  challengeActionButton: {
    flex: 1,
    minWidth: 140,
    minHeight: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  challengeActionText: {color: '#FFFFFF', fontSize: 13, fontWeight: '800'},
  disabledAction: {opacity: 0.65},
  podiumGrid: {flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md},
  podiumCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 5,
  },
  podiumRank: {fontSize: 14, fontWeight: '800'},
  podiumName: {fontSize: 11, fontWeight: '700', textAlign: 'center'},
  podiumPoints: {fontSize: 12, fontWeight: '800'},
  rankingDetailCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  rankingDetailName: {fontSize: 16, fontWeight: '800'},
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 12,
    marginBottom: Spacing.sm,
  },
  rankingPosition: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,158,11,0.14)',
  },
  rankingNum: {fontSize: 12, fontWeight: '800'},
  rankingMemberInfo: {flex: 1},
  rankingMemberName: {fontSize: 14, fontWeight: '700'},
  rankingMemberEmail: {fontSize: 12, marginTop: 2},
  rankingScore: {alignItems: 'flex-end'},
  rankingScoreValue: {fontSize: 16, fontWeight: '800'},
  rankingScoreLabel: {fontSize: 10, fontWeight: '700'},
  emptyPanel: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: 10,
    marginTop: Spacing.md,
  },

  // Chat Input
  chatInputBar: {
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs, borderTopWidth: StyleSheet.hairlineWidth,
  },
  chatInputWrap: {
    flexDirection: 'row', alignItems: 'flex-end',
    borderRadius: BorderRadius.xl, borderWidth: 1,
    paddingHorizontal: Spacing.md, paddingVertical: 6, gap: 8,
  },
  chatInput: {flex: 1, fontSize: 14, maxHeight: 100, paddingVertical: 6},
  sendBtn: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: 'center', alignItems: 'center',
  },

  // Bottom Toolbar
  bottomToolbar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.sm,
    paddingBottom: Spacing.base,
  },
  toolbarTab: {flex: 1, alignItems: 'center', gap: 2},
  toolbarLabel: {fontSize: 11},

  dialogActions: {flexDirection: 'row', gap: 12, marginTop: Spacing.lg},
});
