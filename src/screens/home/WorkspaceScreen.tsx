import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Dimensions,
  ActivityIndicator,
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
import WorkspaceAPI from '../../api/WorkspaceAPI';
import MaterialAPI from '../../api/MaterialAPI';
import QuizAPI from '../../api/QuizAPI';
import FlashcardAPI from '../../api/FlashcardAPI';
import RoadmapAPI from '../../api/RoadmapAPI';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

type BottomTab = 'chat' | 'sources' | 'studio';

/* ──── Quick‑action data ──── */
const QUICK_ACTIONS = [
  {icon: 'map-outline', label: 'Roadmap', key: 'roadmap', color: '#059669'},
  {icon: 'head-question-outline', label: 'Quiz', key: 'quiz', color: '#2563EB'},
  {icon: 'cards-outline', label: 'Flashcard', key: 'flashcard', color: '#EA580C'},
  {icon: 'clipboard-text-outline', label: 'Mock Test', key: 'mockTest', color: '#7C3AED'},
];

/* ──── Studio item data ──── */
const STUDIO_ITEMS = (counts: {q: number; f: number; s: number; r: number}) => [
  {icon: 'map-outline', label: 'Roadmaps', count: counts.r, color: '#059669', key: 'roadmap'},
  {icon: 'head-question-outline', label: 'Quizzes', count: counts.q, color: '#2563EB', key: 'quiz'},
  {icon: 'cards-outline', label: 'Flashcards', count: counts.f, color: '#EA580C', key: 'flashcard'},
  {icon: 'file-document-outline', label: 'Sources', count: counts.s, color: '#64748B', key: 'sources'},
];

export default function WorkspaceScreen({navigation, route}: any) {
  const {workspaceId, title} = route.params;
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [workspace, setWorkspace] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>('chat');
  const [chatMessage, setChatMessage] = useState('');
  const [deletingMaterial, setDeletingMaterial] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [wsRes, matRes, quizRes, fcRes] = await Promise.all([
        WorkspaceAPI.getById(workspaceId),
        MaterialAPI.getByWorkspace(workspaceId),
        QuizAPI.getByContext('WORKSPACE', workspaceId),
        FlashcardAPI.getByContext('WORKSPACE', workspaceId),
      ]);
      setWorkspace(wsRes.data);
      setMaterials(matRes.data || []);
      setQuizzes(quizRes.data || []);
      setFlashcards(fcRes.data || []);

      // Roadmaps – separate try/catch so it doesn't block others
      try {
        const rmRes = await RoadmapAPI.getForWorkspace(workspaceId);
        setRoadmaps(rmRes.data || []);
      } catch {
        setRoadmaps([]);
      }
    } catch {
      // ──── MOCK DATA for UI testing ────
      setWorkspace({name: title, topicName: 'Computer Science'});
      setMaterials([
        {id: 1, title: 'Chapter 1 - Introduction.pdf', materialType: 'PDF', status: 'READY', uploadedAt: '2026-03-01T10:00:00Z'},
        {id: 2, title: 'Lecture Notes Week 3.pdf', materialType: 'PDF', status: 'READY', uploadedAt: '2026-03-03T14:00:00Z'},
        {id: 3, title: 'Practice Problems.docx', materialType: 'DOC', status: 'PROCESSING', uploadedAt: '2026-03-08T09:00:00Z'},
      ]);
      setQuizzes([
        {id: 1, name: 'Midterm Practice Quiz', questionCount: 25},
        {id: 2, name: 'Chapter 1-3 Review', questionCount: 15},
      ]);
      setFlashcards([
        {id: 1, name: 'Key Definitions', itemCount: 30},
        {id: 2, name: 'Algorithm Complexity Cards', itemCount: 18},
      ]);
      setRoadmaps([{id: 1, name: 'Learning Path'}]);
      // ──── END MOCK ────
    } finally {
      setLoading(false);
    }
  }, [workspaceId, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ──── Delete Material ──── */
  const handleDeleteMaterial = (mat: any) => {
    const matId = mat.materialId || mat.id;
    Alert.alert(
      'Delete Source',
      `Are you sure you want to delete "${mat.title || mat.fileName || mat.name}"?`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingMaterial(matId);
            try {
              await MaterialAPI.delete(matId);
              setMaterials(prev => prev.filter(m => (m.materialId || m.id) !== matId));
              showToast('Source deleted', 'success');
            } catch {
              showToast('Failed to delete source', 'error');
            } finally {
              setDeletingMaterial(null);
            }
          },
        },
      ],
    );
  };

  /* ──── Status badge colors ──── */
  const getStatusBadge = (status?: string) => {
    switch (status?.toUpperCase()) {
      case 'ACTIVE':
      case 'READY':
      case 'COMPLETED':
        return {variant: 'success' as const, label: 'Ready'};
      case 'PROCESSING':
      case 'PENDING':
        return {variant: 'warning' as const, label: 'Processing'};
      case 'FAILED':
      case 'ERROR':
        return {variant: 'error' as const, label: 'Failed'};
      default:
        return {variant: 'default' as const, label: status || 'Unknown'};
    }
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
            {title || workspace?.name || workspace?.title}
          </Text>
          {workspace?.topicName && (
            <Text
              style={[styles.headerSub, {color: colors.textSecondary}]}
              numberOfLines={1}>
              {workspace.topicName}
            </Text>
          )}
        </View>
        <TouchableOpacity style={styles.headerAction}>
          <Icon name="dots-vertical" size={22} color={colors.icon} />
        </TouchableOpacity>
      </View>

      {/* ─── Main Content ─── */}
      <ScrollView
        style={styles.mainContent}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* ───────── CHAT TAB ───────── */}
        {activeBottomTab === 'chat' && (
          <View style={styles.chatArea}>
            {/* Quick Actions */}
            <Text style={[styles.sectionTitle, {color: colors.heading}]}>
              Quick Actions
            </Text>
            <View style={styles.quickActions}>
              {QUICK_ACTIONS.map(action => (
                <TouchableOpacity
                  key={action.key}
                  activeOpacity={0.7}
                  onPress={() => {
                    // Navigate to specific creation or list
                    // For now, switch to Studio tab
                    setActiveBottomTab('studio');
                  }}
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
              Overview
            </Text>
            <View style={styles.overviewRow}>
              <OverviewCard
                icon="file-document-outline"
                label="Sources"
                value={materials.length}
                color="#64748B"
                colors={colors}
                isDark={isDark}
              />
              <OverviewCard
                icon="head-question-outline"
                label="Quizzes"
                value={quizzes.length}
                color="#2563EB"
                colors={colors}
                isDark={isDark}
              />
              <OverviewCard
                icon="cards-outline"
                label="Cards"
                value={flashcards.length}
                color="#EA580C"
                colors={colors}
                isDark={isDark}
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
                    onPress={() =>
                      navigation.navigate('Quiz', {
                        screen: 'PracticeQuiz',
                        params: {
                          quizId: quiz.id || quiz.quizId,
                          title: quiz.name || quiz.title,
                        },
                      })
                    }
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
                        questions
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
                          {fc.itemCount} cards
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
                Sources ({materials.length})
              </Text>
              <TouchableOpacity
                onPress={() => {
                  // TODO: Implement file picker upload
                  showToast('File upload coming soon', 'info');
                }}
                style={[
                  styles.addSourceBtn,
                  {backgroundColor: Colors.primary},
                ]}>
                <Icon name="plus" size={16} color="#FFFFFF" />
                <Text style={styles.addSourceText}>Add</Text>
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
                  No sources yet
                </Text>
                <Text
                  style={[
                    styles.emptySubtitle,
                    {color: colors.textTertiary},
                  ]}>
                  Upload documents to get started with AI-powered learning
                </Text>
                <TouchableOpacity
                  onPress={() => showToast('File upload coming soon', 'info')}
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
                    Upload Sources
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              materials.map((mat: any) => {
                const matId = mat.materialId || mat.id;
                const status = getStatusBadge(mat.status);
                return (
                  <View
                    key={matId}
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
                  </View>
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
              Create and manage your learning materials
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
                    }
                    // Future: navigate to specific list screens
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
                  Recent Items
                </Text>
                {quizzes.slice(0, 3).map((quiz: any) => (
                  <TouchableOpacity
                    key={`q-${quiz.id || quiz.quizId}`}
                    onPress={() =>
                      navigation.navigate('Quiz', {
                        screen: 'PracticeQuiz',
                        params: {
                          quizId: quiz.id || quiz.quizId,
                          title: quiz.name || quiz.title,
                        },
                      })
                    }
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
      </ScrollView>

      {/* ─── Chat Input (only on Chat tab) ─── */}
      {activeBottomTab === 'chat' && (
        <View
          style={[
            styles.chatInputBar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          ]}>
          <View
            style={[
              styles.chatInputWrap,
              {
                backgroundColor: isDark
                  ? Colors.dark.surfaceVariant
                  : '#F1F5F9',
                borderColor: colors.border,
              },
            ]}>
            <TextInput
              value={chatMessage}
              onChangeText={setChatMessage}
              placeholder="Ask AI about your materials..."
              placeholderTextColor={colors.placeholder}
              style={[styles.chatInput, {color: colors.text}]}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              onPress={() => {
                if (chatMessage.trim()) {
                  showToast('AI chat coming soon', 'info');
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
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}>
        <ToolbarTab
          icon="chat-outline"
          label="Chat"
          active={activeBottomTab === 'chat'}
          onPress={() => setActiveBottomTab('chat')}
          colors={colors}
        />
        <ToolbarTab
          icon="folder-outline"
          label="Sources"
          active={activeBottomTab === 'sources'}
          onPress={() => setActiveBottomTab('sources')}
          colors={colors}
          badge={materials.length > 0 ? materials.length : undefined}
        />
        <ToolbarTab
          icon="palette-outline"
          label="Studio"
          active={activeBottomTab === 'studio'}
          onPress={() => setActiveBottomTab('studio')}
          colors={colors}
        />
      </View>
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
  isDark,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
  colors: any;
  isDark: boolean;
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
  headerTitle: {fontSize: 16, fontWeight: '600'},
  headerSub: {fontSize: 12, marginTop: 1},
  headerAction: {padding: Spacing.sm},

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
});
