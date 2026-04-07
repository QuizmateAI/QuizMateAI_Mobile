import React, {useState, useEffect, useCallback, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import FloatingInput from '../../components/ui/Input';
import GroupAPI from '../../api/GroupAPI';
import QuizAPI from '../../api/QuizAPI';
import FlashcardAPI from '../../api/FlashcardAPI';
import RoadmapAPI from '../../api/RoadmapAPI';
import useWebSocket from '../../hooks/useWebSocket';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

type BottomTab = 'chat' | 'sources' | 'studio';

const QUICK_ACTIONS = [
  {icon: 'map-outline', label: 'Lộ trình', key: 'roadmap', color: '#059669'},
  {icon: 'head-question-outline', label: 'Quiz', key: 'quiz', color: '#2563EB'},
  {icon: 'cards-outline', label: 'Flashcard', key: 'flashcard', color: '#EA580C'},
  {icon: 'clipboard-text-outline', label: 'Thi thử', key: 'mockTest', color: '#7C3AED'},
];

export default function GroupWorkspaceScreen({navigation, route}: any) {
  const {groupId, title} = route.params;
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [members, setMembers] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [sources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>('chat');
  const [chatMessage, setChatMessage] = useState('');
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

  const openQuizModeSelector = useCallback(
    (quiz: any) => {
      const quizId = Number(quiz?.id || quiz?.quizId);
      if (!quizId) {
        showToast('Thiếu Quiz ID', 'error');
        return;
      }

      const quizTitle = quiz?.name || quiz?.title;
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
                  type: 'group',
                  groupId: Number(groupId),
                  title,
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
                  type: 'group',
                  groupId: Number(groupId),
                  title,
                },
              },
            }),
        },
        {text: 'Hủy', style: 'cancel'},
      ]);
    },
    [groupId, navigation, showToast, title],
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
      });
    },
    [navigation, showToast],
  );

  const fetchData = useCallback(async () => {
    const requestId = ++latestFetchRequestIdRef.current;

    try {
      const [memRes, quizRes, fcRes] = await Promise.all([
        GroupAPI.getMembers(groupId),
        QuizAPI.getByContext('GROUP', groupId),
        FlashcardAPI.getByContext('GROUP', groupId),
      ]);

      if (requestId !== latestFetchRequestIdRef.current) {
        return;
      }

      setMembers(memRes.data || []);
      setQuizzes(quizRes.data || []);
      setFlashcards(fcRes.data || []);

      // Roadmaps
      try {
        const rmRes = await RoadmapAPI.getForGroup(groupId);
        if (requestId !== latestFetchRequestIdRef.current) {
          return;
        }
        setRoadmaps(rmRes.data || []);
      } catch {
        if (requestId !== latestFetchRequestIdRef.current) {
          return;
        }
        setRoadmaps([]);
      }
    } catch {
      if (requestId !== latestFetchRequestIdRef.current) {
        return;
      }
      setMembers([]);
      setQuizzes([]);
      setFlashcards([]);
      setRoadmaps([]);
      showToast('Không thể tải dữ liệu nhóm', 'error');
    } finally {
      if (requestId === latestFetchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [groupId, showToast]);

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

  const {isConnected: wsConnected} = useWebSocket({
    groupId,
    enabled: !!groupId,
    onMaterialUploaded: triggerMaterialRefresh,
    onMaterialDeleted: triggerMaterialRefresh,
    onMaterialUpdated: triggerMaterialRefresh,
    onProgress: triggerMaterialRefresh,
  });

  useEffect(() => {
    if (!wsConnected) {
      return;
    }
    fetchData();
  }, [wsConnected, fetchData]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {return;}
    setInviting(true);
    try {
      await GroupAPI.sendInvitation(groupId, {email: inviteEmail});
      showToast('Đã gửi lời mời!', 'success');
      setInviteVisible(false);
      setInviteEmail('');
    } catch {
      showToast('Không thể gửi lời mời', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleQuickAction = (key: string) => {
    if (key === 'roadmap') {
      navigation.navigate('RoadmapJourney', {
        contextType: 'GROUP',
        contextId: groupId,
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
    setActiveBottomTab('studio');
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top']}>
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
            {title}
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
            {members.length} thành viên
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setInviteVisible(true)}
          style={[styles.inviteBtn, {backgroundColor: Colors.primaryLight}]}>
          <Icon name="account-plus" size={18} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('GroupManagement', {groupId, title})
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
                Tài liệu nhóm ({sources.length})
              </Text>
              <TouchableOpacity
                onPress={() => showToast('File upload coming soon', 'info')}
                onPress={() => showToast('Tính năng tải file sẽ sớm ra mắt', 'info')}
                style={[styles.addSourceBtn, {backgroundColor: Colors.primary}]}>
                <Icon name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.addSourceText}>Thêm</Text>
              </TouchableOpacity>
            </View>

            {sources.length === 0 ? (
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
                  Tải tài liệu lên để chia sẻ với nhóm
                </Text>
                <TouchableOpacity
                  onPress={() => showToast('Tính năng tải file sẽ sớm ra mắt', 'info')}
                  style={[
                    styles.uploadBtn,
                    {backgroundColor: isDark ? Colors.dark.surfaceVariant : Colors.primaryLight},
                  ]}>
                  <Icon name="upload" size={18} color={Colors.primary} />
                  <Text style={[styles.uploadBtnText, {color: Colors.primary}]}>
                    Tải tài liệu lên
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              sources.map((src: any, i: number) => (
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
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ───── STUDIO TAB ───── */}
        {activeBottomTab === 'studio' && (
          <View>
            <Text style={[styles.sectionTitle, {color: colors.heading}]}>
              Studio
            </Text>
            <Text style={[styles.studioSubtitle, {color: colors.textSecondary}]}>
              Tài nguyên học tập của nhóm
            </Text>

            <View style={styles.studioGrid}>
              {[
                {icon: 'map-outline', label: 'Lộ trình', count: roadmaps.length, color: '#059669'},
                {icon: 'head-question-outline', label: 'Quiz', count: quizzes.length, color: '#2563EB'},
                {icon: 'cards-outline', label: 'Flashcard', count: flashcards.length, color: '#EA580C'},
                {icon: 'account-multiple', label: 'Thành viên', count: members.length, color: '#7C3AED'},
              ].map(item => (
                <TouchableOpacity
                  key={item.label}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (item.label === 'Lộ trình') {
                      navigation.navigate('RoadmapJourney', {
                        contextType: 'GROUP',
                        contextId: groupId,
                        title,
                      });
                    }
                  }}
                  style={[
                    styles.studioItem,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={[styles.studioItemIcon, {backgroundColor: `${item.color}15`}]}>
                    <Icon name={item.icon} size={22} color={item.color} />
                  </View>
                  <Text style={[styles.studioCount, {color: colors.heading}]}>
                    {item.count}
                  </Text>
                  <Text style={[styles.studioLabel, {color: colors.textSecondary}]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Recent Items */}
            {(quizzes.length > 0 || flashcards.length > 0) && (
              <>
                <Text style={[styles.sectionTitle, {color: colors.heading, marginTop: Spacing.xl}]}>
                  Mục gần đây
                </Text>
                {quizzes.slice(0, 3).map((quiz: any) => (
                  <TouchableOpacity
                    key={`q-${quiz.id || quiz.quizId}`}
                    onPress={() => openQuizModeSelector(quiz)}
                    style={[
                      styles.recentItem,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <View style={[styles.recentIcon, {backgroundColor: '#2563EB15'}]}>
                      <Icon name="head-question-outline" size={16} color="#2563EB" />
                    </View>
                    <Text style={[styles.recentTitle, {color: colors.heading}]} numberOfLines={1}>
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
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <View style={[styles.recentIcon, {backgroundColor: '#EA580C15'}]}>
                      <Icon name="cards-outline" size={16} color="#EA580C" />
                    </View>
                    <Text style={[styles.recentTitle, {color: colors.heading}]} numberOfLines={1}>
                      {fc.name || fc.title}
                    </Text>
                    <Badge label="Flashcard" variant="warning" size="sm" />
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* ─── Chat Input (Chat tab only) ─── */}
      {activeBottomTab === 'chat' && (
        <View
          style={[
            styles.chatInputBar,
            {backgroundColor: colors.surface, borderTopColor: colors.border},
          ]}>
          <View
            style={[
              styles.chatInputWrap,
              {
                backgroundColor: isDark ? Colors.dark.surfaceVariant : '#F1F5F9',
                borderColor: colors.border,
              },
            ]}>
            <TextInput
              value={chatMessage}
              onChangeText={setChatMessage}
              placeholder="Hỏi AI về tài liệu của nhóm..."
              placeholderTextColor={colors.placeholder}
              style={[styles.chatInput, {color: colors.text}]}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              onPress={() => {
                if (chatMessage.trim()) {
                  showToast('Tính năng chat AI sẽ sớm ra mắt', 'info');
                  setChatMessage('');
                }
              }}
              disabled={!chatMessage.trim()}
              style={[
                styles.sendBtn,
                {
                  backgroundColor: chatMessage.trim()
                    ? Colors.primary
                    : isDark
                    ? Colors.dark.surfaceVariant
                    : '#E2E8F0',
                },
              ]}>
              <Icon
                name="send"
                size={18}
                color={chatMessage.trim() ? '#FFFFFF' : colors.textTertiary}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Bottom Toolbar ─── */}
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
                  ? activeBottomTab === tab ? 'chat' : 'chat-outline'
                  : tab === 'sources'
                  ? activeBottomTab === tab ? 'folder' : 'folder-outline'
                  : activeBottomTab === tab ? 'palette' : 'palette-outline'
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
              {tab === 'chat' ? 'Trò chuyện' : tab === 'sources' ? 'Tài liệu' : 'Công cụ'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
  icon: string; label: string; value: number; color: string; colors: any;
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
