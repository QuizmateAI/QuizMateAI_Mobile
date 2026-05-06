import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import QuizAPI from '../../api/QuizAPI';
import QuizCollectionAPI from '../../api/QuizCollectionAPI';

type DetailTab = 'questions' | 'importQuiz' | 'importQuestion';

const getCollectionId = (collection: any) =>
  Number(collection?.collectionId || collection?.id || 0);

const getQuestionCount = (collection: any) =>
  Number(collection?.totalQuestion ?? collection?.questionCount ?? 0) || 0;

const getQuizId = (quiz: any) => Number(quiz?.quizId || quiz?.id || 0);

const formatShortDate = (value?: string) => {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleDateString('vi-VN');
};

export default function QuizCollectionScreen({navigation, route}: any) {
  const {
    workspaceId,
    title,
    canCreateCollection = true,
    initialCollectionId,
  } = route.params || {};
  const normalizedWorkspaceId = Number(workspaceId);
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [collections, setCollections] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [questionCatalog, setQuestionCatalog] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('questions');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [selectedQuizIds, setSelectedQuizIds] = useState<number[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [hasHandledInitialCollection, setHasHandledInitialCollection] = useState(false);

  const collectionId = getCollectionId(selectedCollection);

  const filteredCollections = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return collections;
    }
    return collections.filter(collection =>
      [collection?.title, collection?.description].some(value =>
        String(value || '').toLowerCase().includes(query),
      ),
    );
  }, [collections, search]);

  const importableQuizzes = useMemo(
    () =>
      quizzes.filter(quiz => {
        if (quiz?.collectionBacking === true) {
          return false;
        }
        return getQuizId(quiz) > 0;
      }),
    [quizzes],
  );
  const importableQuestions = useMemo(() => {
    const currentIds = new Set(
      questions.map(question => Number(question?.questionId)).filter(Boolean),
    );
    const practiceQuizId = Number(selectedCollection?.practiceQuizId || 0);
    return questionCatalog.filter(question => {
      const questionId = Number(question?.questionId || 0);
      const sourceQuizId = Number(question?.quizId || question?.sourceQuizId || 0);
      if (!questionId || currentIds.has(questionId)) {
        return false;
      }
      if (practiceQuizId && sourceQuizId === practiceQuizId) {
        return false;
      }
      return true;
    });
  }, [questionCatalog, questions, selectedCollection]);

  const loadCollections = useCallback(async () => {
    if (!Number.isInteger(normalizedWorkspaceId) || normalizedWorkspaceId <= 0) {
      setCollections([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [collectionRes, quizRes] = await Promise.allSettled([
        QuizCollectionAPI.getByWorkspace(normalizedWorkspaceId),
        QuizAPI.getByContext('WORKSPACE', normalizedWorkspaceId, {
          includeRoadmapLinkedQuizzes: true,
          includeMockTest: true,
        }),
      ]);

      const nextCollections =
        collectionRes.status === 'fulfilled' ? collectionRes.value.data || [] : [];
      setCollections(nextCollections);
      setQuizzes(quizRes.status === 'fulfilled' ? quizRes.value.data || [] : []);

    } catch (error: any) {
      showToast(
        error?.response?.data?.message ||
          error?.message ||
          'Không thể tải bộ sưu tập',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [normalizedWorkspaceId, showToast]);

  const loadDetail = useCallback(
    async (collection: any) => {
      const nextCollectionId = getCollectionId(collection);
      if (!nextCollectionId) {
        return;
      }
      setSelectedCollection(collection);
      setSelectedQuizIds([]);
      setSelectedQuestionIds([]);
      setDetailLoading(true);
      try {
        const [collectionRes, questionRes, questionCatalogRes] =
          await Promise.allSettled([
          QuizCollectionAPI.getById(nextCollectionId),
          QuizCollectionAPI.getQuestions(nextCollectionId),
          QuizAPI.getWorkspaceQuestionsCatalog(normalizedWorkspaceId),
        ]);
        if (collectionRes.status === 'fulfilled') {
          setSelectedCollection(collectionRes.value.data || collection);
        }
        setQuestions(
          questionRes.status === 'fulfilled' ? questionRes.value.data || [] : [],
        );
        setQuestionCatalog(
          questionCatalogRes.status === 'fulfilled'
            ? questionCatalogRes.value.data || []
            : [],
        );
      } catch (error: any) {
        showToast(
          error?.response?.data?.message ||
            error?.message ||
            'Không thể tải chi tiết bộ sưu tập',
          'error',
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [normalizedWorkspaceId, showToast],
  );

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    if (hasHandledInitialCollection) {
      return;
    }
    const targetCollectionId = Number(initialCollectionId || 0);
    if (!targetCollectionId || collections.length === 0) {
      return;
    }
    const matchedCollection = collections.find(
      item => getCollectionId(item) === targetCollectionId,
    );
    if (!matchedCollection) {
      setHasHandledInitialCollection(true);
      return;
    }
    setHasHandledInitialCollection(true);
    loadDetail(matchedCollection);
  }, [
    collections,
    hasHandledInitialCollection,
    initialCollectionId,
    loadDetail,
  ]);

  const openCreate = () => {
    if (!canCreateCollection) {
      showToast('Cần ít nhất 1 tài liệu ACTIVE để tạo bộ sưu tập.', 'info');
      return;
    }
    setFormTitle('');
    setFormDescription('');
    setCreateOpen(true);
  };

  const openEdit = () => {
    setFormTitle(selectedCollection?.title || '');
    setFormDescription(selectedCollection?.description || '');
    setEditOpen(true);
  };

  const handleCreate = async () => {
    const nextTitle = formTitle.trim();
    if (!nextTitle || saving || !canCreateCollection) {
      return;
    }
    setSaving(true);
    try {
      const res = await QuizCollectionAPI.create({
        workspaceId: normalizedWorkspaceId,
        title: nextTitle,
        description: formDescription.trim(),
      });
      setCreateOpen(false);
      showToast('Đã tạo bộ sưu tập.', 'success');
      await loadCollections();
      if (res.data) {
        loadDetail(res.data);
      }
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || error?.message || 'Không thể tạo bộ sưu tập',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    const nextTitle = formTitle.trim();
    if (!nextTitle || !collectionId || saving) {
      return;
    }
    setSaving(true);
    try {
      const res = await QuizCollectionAPI.update(collectionId, {
        title: nextTitle,
        description: formDescription.trim(),
      });
      setEditOpen(false);
      setSelectedCollection(res.data || selectedCollection);
      setCollections(prev =>
        prev.map(item => (getCollectionId(item) === collectionId ? res.data : item)),
      );
      showToast('Đã cập nhật bộ sưu tập.', 'success');
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ||
          error?.message ||
          'Không thể cập nhật bộ sưu tập',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCollection = () => {
    if (!collectionId) {
      return;
    }
    Alert.alert(
      'Xóa bộ sưu tập',
      'Bộ sưu tập và quiz luyện tập phía sau sẽ được xóa khỏi danh sách.',
      [
        {text: 'Quay lại', style: 'cancel'},
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await QuizCollectionAPI.delete(collectionId);
              showToast('Đã xóa bộ sưu tập.', 'success');
              setSelectedCollection(null);
              setQuestions([]);
              await loadCollections();
            } catch (error: any) {
              showToast(
                error?.response?.data?.message ||
                  error?.message ||
                  'Không thể xóa bộ sưu tập',
                'error',
              );
            }
          },
        },
      ],
    );
  };

  const handleDeleteQuestion = (questionId: number) => {
    if (!collectionId || !questionId) {
      return;
    }
    Alert.alert('Xóa câu hỏi', 'Bạn muốn xóa câu hỏi này khỏi bộ sưu tập?', [
      {text: 'Quay lại', style: 'cancel'},
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await QuizCollectionAPI.deleteQuestion(collectionId, questionId);
            setQuestions(prev =>
              prev.filter(item => Number(item?.questionId) !== questionId),
            );
            setSelectedCollection((prev: any) =>
              prev
                ? {
                    ...prev,
                    totalQuestion: Math.max(0, getQuestionCount(prev) - 1),
                  }
                : prev,
            );
            showToast('Đã xóa câu hỏi khỏi bộ sưu tập.', 'success');
          } catch (error: any) {
            showToast(
              error?.response?.data?.message ||
                error?.message ||
                'Không thể xóa câu hỏi',
              'error',
            );
          }
        },
      },
    ]);
  };

  const toggleQuizSelection = (quizId: number) => {
    setSelectedQuizIds(prev =>
      prev.includes(quizId)
        ? prev.filter(item => item !== quizId)
        : [...prev, quizId],
    );
  };

  const toggleQuestionSelection = (questionId: number) => {
    setSelectedQuestionIds(prev =>
      prev.includes(questionId)
        ? prev.filter(item => item !== questionId)
        : [...prev, questionId],
    );
  };

  const handleImportQuizzes = async () => {
    if (!collectionId || selectedQuizIds.length === 0 || importing) {
      return;
    }
    setImporting(true);
    try {
      const res = await QuizCollectionAPI.importQuizzes(collectionId, selectedQuizIds);
      setSelectedQuizIds([]);
      showToast('Đã import quiz vào bộ sưu tập.', 'success');
      await loadDetail(res.data || selectedCollection);
      await loadCollections();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ||
          error?.message ||
          'Không thể import quiz vào bộ sưu tập',
        'error',
      );
    } finally {
      setImporting(false);
    }
  };

  const handleImportQuestions = async () => {
    if (!collectionId || selectedQuestionIds.length === 0 || importing) {
      return;
    }
    setImporting(true);
    try {
      const res = await QuizCollectionAPI.importQuestions(
        collectionId,
        selectedQuestionIds,
      );
      setSelectedQuestionIds([]);
      showToast('Đã import câu hỏi vào bộ sưu tập.', 'success');
      await loadDetail(res.data || selectedCollection);
      await loadCollections();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ||
          error?.message ||
          'Không thể import câu hỏi vào bộ sưu tập',
        'error',
      );
    } finally {
      setImporting(false);
    }
  };

  const handlePractice = async () => {
    let practiceQuizId = Number(selectedCollection?.practiceQuizId || 0);
    if (!practiceQuizId && collectionId) {
      try {
        const res = await QuizCollectionAPI.getPracticeFull(collectionId);
        practiceQuizId = Number(res.data?.quizId || res.data?.id || 0);
      } catch {
        practiceQuizId = 0;
      }
    }

    if (!practiceQuizId) {
      showToast('Không xác định được quiz luyện tập.', 'error');
      return;
    }

    navigation.navigate('PracticeQuiz', {
      quizId: practiceQuizId,
      title: selectedCollection?.title || 'Bộ sưu tập',
      backContext: {
        type: 'collection',
        workspaceId: normalizedWorkspaceId,
        title,
        collectionId,
        collectionTitle: selectedCollection?.title || 'Bộ sưu tập',
        canCreateCollection,
      },
    });
  };

  const renderCollectionList = () => (
    <>
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchBox,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <Icon name="magnify" size={18} color={colors.textTertiary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm kiếm bộ sưu tập..."
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, {color: colors.text}]}
          />
        </View>
        <TouchableOpacity
          onPress={loadCollections}
          style={[styles.iconButton, {borderColor: colors.border}]}>
          <Icon name="refresh" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {!canCreateCollection ? (
        <View
          style={[
            styles.lockBanner,
            {
              backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
              borderColor: colors.border,
            },
          ]}>
          <Icon name="lock-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.lockBannerText, {color: colors.textSecondary}]}>
            Cần ít nhất 1 tài liệu ACTIVE để tạo bộ sưu tập mới.
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={openCreate}
        activeOpacity={canCreateCollection ? 0.75 : 1}
        style={[
          styles.primaryButton,
          !canCreateCollection && styles.disabledButton,
        ]}>
        <Icon name="plus" size={18} color="#FFFFFF" />
        <Text style={styles.primaryButtonText}>Tạo bộ sưu tập</Text>
      </TouchableOpacity>

      {filteredCollections.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="archive-outline" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, {color: colors.heading}]}>
            Chưa có bộ sưu tập
          </Text>
          <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
            Tạo bộ sưu tập để gom quiz và câu hỏi cho các buổi ôn tập riêng.
          </Text>
        </View>
      ) : (
        filteredCollections.map(collection => {
          const id = getCollectionId(collection);
          const questionCount = getQuestionCount(collection);
          return (
            <TouchableOpacity
              key={id || collection?.title}
              onPress={() => loadDetail(collection)}
              style={[
                styles.collectionCard,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <View style={styles.collectionCardHead}>
                <View style={styles.collectionIcon}>
                  <Icon name="folder-multiple-outline" size={22} color={Colors.primary} />
                </View>
                <View style={styles.collectionTitleWrap}>
                  <Text
                    style={[styles.collectionTitle, {color: colors.heading}]}
                    numberOfLines={2}>
                    {collection?.title || 'Bộ sưu tập'}
                  </Text>
                  <Text
                    style={[styles.collectionDescription, {color: colors.textSecondary}]}
                    numberOfLines={2}>
                    {collection?.description || 'Thêm ghi chú ngắn cho mục tiêu ôn tập...'}
                  </Text>
                </View>
                <Icon name="chevron-right" size={22} color={colors.textTertiary} />
              </View>
              <View style={styles.collectionMetaRow}>
                <Badge label={`${questionCount || '-'} câu hỏi`} variant="info" size="sm" />
                <Badge
                  label={`${Number(collection?.sourceQuizCount || 0)} quiz nguồn`}
                  variant="default"
                  size="sm"
                />
                {formatShortDate(collection?.createdAt || collection?.updatedAt) ? (
                  <Text style={[styles.dateText, {color: colors.textTertiary}]}>
                    {formatShortDate(collection?.createdAt || collection?.updatedAt)}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </>
  );

  const renderDetail = () => {
    const questionCount = questions.length || getQuestionCount(selectedCollection);
    return (
      <>
        <TouchableOpacity
          onPress={() => setSelectedCollection(null)}
          style={styles.backToListButton}>
          <Icon name="arrow-left" size={18} color={Colors.primary} />
          <Text style={styles.backToListText}>Bộ sưu tập</Text>
        </TouchableOpacity>

        <View
          style={[
            styles.detailHero,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <View style={styles.detailHeroHead}>
            <View style={styles.detailHeroIcon}>
              <Icon name="folder-star-outline" size={28} color={Colors.primary} />
            </View>
            <View style={styles.detailHeroActions}>
              <TouchableOpacity
                onPress={openEdit}
                style={[styles.smallAction, {borderColor: colors.border}]}>
                <Icon name="pencil-outline" size={16} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteCollection}
                style={[styles.smallAction, {borderColor: colors.border}]}>
                <Icon name="trash-can-outline" size={16} color={Colors.error} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.detailTitle, {color: colors.heading}]}>
            {selectedCollection?.title || 'Bộ sưu tập'}
          </Text>
          <Text style={[styles.detailDescription, {color: colors.textSecondary}]}>
            {selectedCollection?.description || 'Group quizzes and questions for targeted review.'}
          </Text>
          <View style={styles.statsRow}>
            <StatPill label="Câu hỏi" value={questionCount} colors={colors} />
            <StatPill
              label="Quiz nguồn"
              value={Number(selectedCollection?.sourceQuizCount || 0)}
              colors={colors}
            />
            <StatPill
              label="Điểm tối đa"
              value={selectedCollection?.maxScore || '-'}
              colors={colors}
            />
          </View>
          <TouchableOpacity
            onPress={handlePractice}
            disabled={questionCount <= 0}
            style={[
              styles.practiceButton,
              questionCount <= 0 && styles.disabledButton,
            ]}>
            <Icon name="play-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.practiceButtonText}>Luyện tập bộ sưu tập</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabRow}>
          {[
            {key: 'questions', label: 'Câu hỏi'},
            {key: 'importQuiz', label: 'Import quiz'},
            {key: 'importQuestion', label: 'Import câu hỏi'},
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as DetailTab)}
              style={[
                styles.tabButton,
                activeTab === tab.key && styles.tabButtonActive,
              ]}>
              <Text
                style={[
                  styles.tabButtonText,
                  {color: activeTab === tab.key ? '#FFFFFF' : colors.textSecondary},
                ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {detailLoading ? (
          <View style={styles.detailLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : activeTab === 'questions' ? (
          questions.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="file-question-outline" size={44} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, {color: colors.heading}]}>
                Chưa có câu hỏi
              </Text>
              <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
                Import quiz để bắt đầu xây bộ sưu tập luyện tập.
              </Text>
            </View>
          ) : (
            questions.map((question, index) => {
              const questionId = Number(question?.questionId || 0);
              return (
                <View
                  key={questionId || index}
                  style={[
                    styles.questionCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.questionHead}>
                    <Badge label={`Câu ${index + 1}`} variant="info" size="sm" />
                    <TouchableOpacity
                      onPress={() => handleDeleteQuestion(questionId)}
                      hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                      <Icon name="close" size={18} color={colors.textTertiary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.questionText, {color: colors.heading}]}>
                    {question?.content || 'Nội dung câu hỏi trống'}
                  </Text>
                  <Text style={[styles.questionMeta, {color: colors.textSecondary}]}>
                    {question?.questionType || 'Question'} · {question?.answerCount || 0} đáp án · {question?.score || 0} điểm
                  </Text>
                </View>
              );
            })
          )
        ) : activeTab === 'importQuiz' ? (
          <View>
            <Text style={[styles.importHint, {color: colors.textSecondary}]}>
              Chọn quiz trong workspace để deep-copy câu hỏi vào bộ sưu tập này.
            </Text>
            {importableQuizzes.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="head-question-outline" size={44} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, {color: colors.heading}]}>
                  Chưa có quiz phù hợp
                </Text>
                <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
                  Hãy tạo quiz trước khi import vào bộ sưu tập.
                </Text>
              </View>
            ) : (
              importableQuizzes.map(quiz => {
                const quizId = getQuizId(quiz);
                const selected = selectedQuizIds.includes(quizId);
                return (
                  <TouchableOpacity
                    key={quizId}
                    onPress={() => toggleQuizSelection(quizId)}
                    style={[
                      styles.importItem,
                      {
                        backgroundColor: selected
                          ? isDark
                            ? '#172554'
                            : '#EFF6FF'
                          : colors.surface,
                        borderColor: selected ? Colors.primary : colors.border,
                      },
                    ]}>
                    <Icon
                      name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                      size={22}
                      color={selected ? Colors.primary : colors.textTertiary}
                    />
                    <View style={styles.importContent}>
                      <Text style={[styles.importTitle, {color: colors.heading}]} numberOfLines={1}>
                        {quiz?.title || quiz?.name || 'Quiz'}
                      </Text>
                      <Text style={[styles.importMeta, {color: colors.textSecondary}]}>
                        {quiz?.questionCount || quiz?.totalQuestion || 0} câu hỏi
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            <TouchableOpacity
              onPress={handleImportQuizzes}
              disabled={selectedQuizIds.length === 0 || importing}
              style={[
                styles.primaryButton,
                (selectedQuizIds.length === 0 || importing) && styles.disabledButton,
              ]}>
              {importing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="import" size={18} color="#FFFFFF" />
              )}
              <Text style={styles.primaryButtonText}>
                Import {selectedQuizIds.length || ''} quiz đã chọn
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={[styles.importHint, {color: colors.textSecondary}]}>
              Chọn từng câu hỏi từ catalog workspace để deep-copy vào bộ sưu tập này.
            </Text>
            {importableQuestions.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="file-question-outline" size={44} color={colors.textTertiary} />
                <Text style={[styles.emptyTitle, {color: colors.heading}]}>
                  Chưa có câu hỏi phù hợp
                </Text>
                <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
                  Câu hỏi đã có trong bộ sưu tập hoặc chưa có quiz nguồn phù hợp.
                </Text>
              </View>
            ) : (
              importableQuestions.map(question => {
                const questionId = Number(question?.questionId || 0);
                const selected = selectedQuestionIds.includes(questionId);
                return (
                  <TouchableOpacity
                    key={questionId}
                    onPress={() => toggleQuestionSelection(questionId)}
                    style={[
                      styles.importQuestionItem,
                      {
                        backgroundColor: selected
                          ? isDark
                            ? '#172554'
                            : '#EFF6FF'
                          : colors.surface,
                        borderColor: selected ? Colors.primary : colors.border,
                      },
                    ]}>
                    <View style={styles.questionSelectRow}>
                      <Icon
                        name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                        size={22}
                        color={selected ? Colors.primary : colors.textTertiary}
                      />
                      <View style={styles.importContent}>
                        <Text
                          style={[styles.importTitle, {color: colors.heading}]}
                          numberOfLines={2}>
                          {question?.content || 'Nội dung câu hỏi trống'}
                        </Text>
                        <Text style={[styles.importMeta, {color: colors.textSecondary}]}>
                          {question?.quizTitle || 'Quiz nguồn'} · {question?.questionType || 'Question'} · {question?.score || 0} điểm
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            <TouchableOpacity
              onPress={handleImportQuestions}
              disabled={selectedQuestionIds.length === 0 || importing}
              style={[
                styles.primaryButton,
                (selectedQuestionIds.length === 0 || importing) && styles.disabledButton,
              ]}>
              {importing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="import" size={18} color="#FFFFFF" />
              )}
              <Text style={styles.primaryButtonText}>
                Import {selectedQuestionIds.length || ''} câu hỏi đã chọn
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: isDark ? colors.backgroundSecondary : colors.background}]}>
      <View
        style={[
          styles.header,
          {backgroundColor: colors.surface, borderBottomColor: colors.border},
        ]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Icon name="arrow-left" size={24} color={colors.heading} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, {color: colors.heading}]}>Bộ sưu tập</Text>
          <Text style={[styles.headerSub, {color: colors.textSecondary}]} numberOfLines={1}>
            {title || 'Workspace'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {selectedCollection ? renderDetail() : renderCollectionList()}
      </ScrollView>

      <CollectionFormModal
        visible={createOpen}
        title="Tạo bộ sưu tập"
        description="Group quizzes and questions into a custom practice collection."
        formTitle={formTitle}
        formDescription={formDescription}
        saving={saving}
        colors={colors}
        onChangeTitle={setFormTitle}
        onChangeDescription={setFormDescription}
        onCancel={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <CollectionFormModal
        visible={editOpen}
        title="Chỉnh sửa bộ sưu tập"
        description="Cập nhật tên hiển thị và mô tả."
        formTitle={formTitle}
        formDescription={formDescription}
        saving={saving}
        colors={colors}
        onChangeTitle={setFormTitle}
        onChangeDescription={setFormDescription}
        onCancel={() => setEditOpen(false)}
        onSubmit={handleUpdate}
      />
    </SafeAreaView>
  );
}

function StatPill({label, value, colors}: {label: string; value: any; colors: any}) {
  return (
    <View style={[styles.statPill, {backgroundColor: colors.backgroundSecondary}]}>
      <Text style={[styles.statValue, {color: colors.heading}]}>{value}</Text>
      <Text style={[styles.statLabel, {color: colors.textSecondary}]}>{label}</Text>
    </View>
  );
}

function CollectionFormModal({
  visible,
  title,
  description,
  formTitle,
  formDescription,
  saving,
  colors,
  onChangeTitle,
  onChangeDescription,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  description: string;
  formTitle: string;
  formDescription: string;
  saving: boolean;
  colors: any;
  onChangeTitle: (value: string) => void;
  onChangeDescription: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, {backgroundColor: colors.surface}]}>
          <Text style={[styles.modalTitle, {color: colors.heading}]}>{title}</Text>
          <Text style={[styles.modalDescription, {color: colors.textSecondary}]}>
            {description}
          </Text>
          <Text style={[styles.inputLabel, {color: colors.heading}]}>Tên bộ sưu tập</Text>
          <TextInput
            value={formTitle}
            onChangeText={onChangeTitle}
            placeholder="Ví dụ: Ôn tập chương OOP"
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.input,
              {color: colors.text, borderColor: colors.border, backgroundColor: colors.background},
            ]}
          />
          <Text style={[styles.inputLabel, {color: colors.heading}]}>Mô tả</Text>
          <TextInput
            value={formDescription}
            onChangeText={onChangeDescription}
            placeholder="Thêm ghi chú ngắn về mục tiêu ôn tập..."
            placeholderTextColor={colors.textTertiary}
            multiline
            style={[
              styles.textArea,
              {color: colors.text, borderColor: colors.border, backgroundColor: colors.background},
            ]}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={onCancel}
              disabled={saving}
              style={[styles.secondaryButton, {borderColor: colors.border}]}>
              <Text style={[styles.secondaryButtonText, {color: colors.text}]}>Quay lại</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSubmit}
              disabled={saving || !formTitle.trim()}
              style={[
                styles.modalSubmitButton,
                (saving || !formTitle.trim()) && styles.disabledButton,
              ]}>
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalSubmitText}>Lưu</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
  headerBack: {padding: Spacing.sm},
  headerCenter: {flex: 1, marginHorizontal: Spacing.sm},
  headerTitle: {fontSize: 18, fontWeight: '700'},
  headerSub: {fontSize: 12, marginTop: 2},
  content: {padding: Spacing.lg, paddingBottom: Spacing['3xl']},
  searchRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  searchInput: {flex: 1, fontSize: 14, paddingHorizontal: Spacing.sm},
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  lockBannerText: {flex: 1, fontSize: 13, lineHeight: 18},
  primaryButton: {
    marginTop: Spacing.md,
    minHeight: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  disabledButton: {opacity: 0.45},
  primaryButtonText: {color: '#FFFFFF', fontSize: 14, fontWeight: '700'},
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['3xl'],
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  emptyTitle: {fontSize: 16, fontWeight: '700', textAlign: 'center'},
  emptyText: {fontSize: 13, lineHeight: 19, textAlign: 'center'},
  collectionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  collectionCardHead: {flexDirection: 'row', alignItems: 'center', gap: Spacing.md},
  collectionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionTitleWrap: {flex: 1},
  collectionTitle: {fontSize: 16, fontWeight: '700', lineHeight: 21},
  collectionDescription: {fontSize: 13, lineHeight: 18, marginTop: 3},
  collectionMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  dateText: {fontSize: 12, marginLeft: 'auto'},
  backToListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  backToListText: {color: Colors.primary, fontSize: 14, fontWeight: '700'},
  detailHero: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  detailHeroHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  detailHeroIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeroActions: {flexDirection: 'row', gap: Spacing.sm},
  smallAction: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitle: {fontSize: 22, fontWeight: '800', marginTop: Spacing.md},
  detailDescription: {fontSize: 14, lineHeight: 20, marginTop: Spacing.xs},
  statsRow: {flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md},
  statPill: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  statValue: {fontSize: 17, fontWeight: '800'},
  statLabel: {fontSize: 11, marginTop: 2},
  practiceButton: {
    marginTop: Spacing.md,
    minHeight: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  practiceButtonText: {color: '#FFFFFF', fontSize: 14, fontWeight: '700'},
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: '#EEF2F7',
  },
  tabButtonActive: {backgroundColor: Colors.primary},
  tabButtonText: {fontSize: 13, fontWeight: '700'},
  detailLoading: {paddingVertical: Spacing['3xl']},
  questionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  questionHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  questionText: {fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: Spacing.sm},
  questionMeta: {fontSize: 12, marginTop: Spacing.xs},
  importHint: {fontSize: 13, lineHeight: 19, marginBottom: Spacing.sm},
  importItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  importQuestionItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  questionSelectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  importContent: {flex: 1},
  importTitle: {fontSize: 14, fontWeight: '700'},
  importMeta: {fontSize: 12, marginTop: 2},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  modalTitle: {fontSize: 18, fontWeight: '800'},
  modalDescription: {fontSize: 13, lineHeight: 19, marginTop: Spacing.xs, marginBottom: Spacing.md},
  inputLabel: {fontSize: 13, fontWeight: '700', marginBottom: Spacing.xs},
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 14,
    marginBottom: Spacing.md,
  },
  textArea: {
    minHeight: 92,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  modalActions: {flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg},
  secondaryButton: {
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {fontSize: 14, fontWeight: '700'},
  modalSubmitButton: {
    flex: 1,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {color: '#FFFFFF', fontSize: 14, fontWeight: '700'},
});
