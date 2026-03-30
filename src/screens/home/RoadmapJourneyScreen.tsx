import React, {useCallback, useEffect, useMemo, useState} from 'react';
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

export default function RoadmapJourneyScreen({navigation, route}: any) {
  const {contextType = 'WORKSPACE', contextId, title, materials = []} = route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();

  const [loading, setLoading] = useState(true);
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<number | null>(null);
  const [structure, setStructure] = useState<any>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);

  const openQuizModeSelector = useCallback(
    (quiz: any) => {
      const quizId = Number(quiz?.quizId || quiz?.id);
      if (!quizId) {
        showToast('Thiếu Quiz ID', 'error');
        return;
      }

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
                },
              },
            }),
        },
        {text: 'Hủy', style: 'cancel'},
      ]);
    },
    [contextId, contextType, navigation, showToast, title],
  );

  const selectedRoadmap = useMemo(
    () => roadmaps.find(item => (item.roadmapId || item.id) === selectedRoadmapId),
    [roadmaps, selectedRoadmapId],
  );

  const fetchRoadmaps = useCallback(async () => {
    try {
      const res =
        contextType === 'GROUP'
          ? await RoadmapAPI.getForGroup(Number(contextId))
          : await RoadmapAPI.getForWorkspace(Number(contextId));

      const list = res.data || [];
      setRoadmaps(list);
      if (list.length > 0) {
        setSelectedRoadmapId(list[0].roadmapId || list[0].id);
      }
    } catch {
      setRoadmaps([]);
      setSelectedRoadmapId(null);
    }
  }, [contextType, contextId]);

  const fetchStructure = useCallback(async (roadmapId: number) => {
    try {
      const res = await RoadmapAPI.getStructure(roadmapId);
      setStructure(res.data || null);
    } catch {
      setStructure(null);
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

  const handleGeneratePhaseContent = async (roadmapId: number, phaseId: number) => {
    const key = `content-${phaseId}`;
    setRunningAction(key);
    try {
      await AIAPI.generateRoadmapPhaseContent({
        roadmapId,
        phaseId,
        skipPreLearning: false,
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

  const toggleMaterial = (id: number) => {
    setSelectedMaterialIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id],
    );
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const phases = structure?.phases || [];
  const activeRoadmapId = selectedRoadmap?.roadmapId || selectedRoadmap?.id;

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
            <Text style={[styles.sectionTitle, {color: colors.heading}]}>Giai đoạn</Text>
            {contextType === 'WORKSPACE' && materials.length > 0 && (
              <>
                <Text style={[styles.materialTitle, {color: colors.textSecondary}]}>Tài liệu dùng để tạo giai đoạn</Text>
                <View style={styles.materialWrap}>
                  {materials.map((material: any) => {
                    const materialId = material.materialId || material.id;
                    const selected = selectedMaterialIds.includes(materialId);
                    return (
                      <TouchableOpacity
                        key={materialId}
                        onPress={() => toggleMaterial(materialId)}
                        style={[
                          styles.materialChip,
                          {
                            borderColor: selected ? Colors.primary : colors.border,
                            backgroundColor: selected
                              ? isDark
                                ? '#1E3A8A30'
                                : '#EFF6FF'
                              : colors.surface,
                          },
                        ]}>
                        <Text
                          style={{
                            color: selected ? Colors.primary : colors.textSecondary,
                            fontSize: 12,
                          }}
                          numberOfLines={1}>
                          {material.title || material.fileName || material.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            <Button
              title="Tạo giai đoạn"
              onPress={() => handleGenerateRoadmapPhases(activeRoadmapId)}
              loading={runningAction === 'phases'}
              icon="timeline-plus-outline"
              size="sm"
              fullWidth={false}
              style={styles.generatePhasesBtn}
            />
            {phases.length === 0 ? (
              <Text style={{color: colors.textSecondary}}>Chưa có dữ liệu giai đoạn.</Text>
            ) : (
              phases.map((phase: any, index: number) => {
                const phaseId = phase.phaseId;
                const knowledges = phase.knowledges || [];
                const preKey = `pre-${phaseId}`;
                const contentKey = `content-${phaseId}`;

                return (
                  <View
                    key={phaseId || index}
                    style={[
                      styles.phaseCard,
                      {borderColor: colors.border, backgroundColor: colors.surface},
                    ]}>
                    <Text style={[styles.phaseTitle, {color: colors.heading}]}>
                      {phase.title || `Giai đoạn ${index + 1}`}
                    </Text>
                    {!!phase.description && (
                      <Text style={[styles.phaseDesc, {color: colors.textSecondary}]}>
                        {phase.description}
                      </Text>
                    )}

                    {(phase.preLearningQuizzes || []).length > 0 && (
                      <View style={styles.quizListWrap}>
                        <Text style={[styles.quizListTitle, {color: colors.heading}]}>Quiz trước học</Text>
                        {(phase.preLearningQuizzes || []).map((quiz: any) => (
                          <TouchableOpacity
                            key={quiz.quizId}
                            style={[styles.quizItem, {borderColor: colors.border}]}
                            onPress={() => openQuizModeSelector(quiz)}>
                            <Text style={[styles.quizItemTitle, {color: colors.text}]}>
                              {quiz.title || `Quiz #${quiz.quizId}`}
                            </Text>
                            <Icon name="chevron-right" size={18} color={colors.textTertiary} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.phaseActions}>
                      <Button
                        title="Trước học"
                        onPress={() => handleGeneratePreLearning(activeRoadmapId, phaseId)}
                        loading={runningAction === preKey}
                        size="sm"
                        variant="secondary"
                        fullWidth={false}
                        style={styles.actionBtn}
                      />
                      <Button
                        title="Nội dung giai đoạn"
                        onPress={() => handleGeneratePhaseContent(activeRoadmapId, phaseId)}
                        loading={runningAction === contentKey}
                        size="sm"
                        fullWidth={false}
                        style={styles.actionBtn}
                      />
                    </View>

                    {knowledges.length > 0 && (
                      <View style={styles.knowledgeList}>
                        {knowledges.map((knowledge: any) => {
                          const knowledgeId = knowledge.knowledgeId;
                          const knowledgeKey = `knowledge-${knowledgeId}`;
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
                                  title="Quiz"
                                  onPress={() =>
                                    handleGenerateKnowledgeQuiz(activeRoadmapId, knowledgeId)
                                  }
                                  loading={runningAction === knowledgeKey}
                                  size="sm"
                                  fullWidth={false}
                                  style={styles.smallBtn}
                                />
                              </View>
                              {(knowledge.quizzes || []).map((quiz: any) => (
                                <TouchableOpacity
                                  key={quiz.quizId}
                                  style={[styles.quizItem, {borderColor: colors.border}]}
                                  onPress={() => openQuizModeSelector(quiz)}>
                                  <Text style={[styles.quizItemTitle, {color: colors.text}]}>
                                    {quiz.title || `Quiz #${quiz.quizId}`}
                                  </Text>
                                  <Icon
                                    name="chevron-right"
                                    size={18}
                                    color={colors.textTertiary}
                                  />
                                </TouchableOpacity>
                              ))}
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
                            onPress={() => openQuizModeSelector(quiz)}>
                            <Text style={[styles.quizItemTitle, {color: colors.text}]}>
                              {quiz.title || `Quiz #${quiz.quizId}`}
                            </Text>
                            <Icon name="chevron-right" size={18} color={colors.textTertiary} />
                          </TouchableOpacity>
                        ))}
                      </View>
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
  generatePhasesBtn: {minWidth: 150, marginBottom: Spacing.sm},
  phaseCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  phaseTitle: {fontSize: 15, fontWeight: '600'},
  phaseDesc: {fontSize: 13, lineHeight: 18},
  phaseActions: {flexDirection: 'row', gap: Spacing.sm},
  actionBtn: {minWidth: 120},
  quizListWrap: {gap: Spacing.xs},
  quizListTitle: {fontSize: 13, fontWeight: '600'},
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
  runningRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  runningText: {fontSize: 13},
});

