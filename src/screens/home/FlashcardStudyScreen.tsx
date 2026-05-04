import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Animated,
  ActivityIndicator,
  Easing,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import FlashcardAPI from '../../api/FlashcardAPI';
import ContentRenderer from '../../components/ui/ContentRenderer';
import {buildContentBlocks} from '../../utils/contentBlocks';

const normalizeItems = (rawItems: any[]) => {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item: any, index: number) => {
      const id = Number(item?.flashcardItemId || item?.id || index + 1);
      const front = String(
        item?.frontContent ?? item?.front ?? item?.term ?? item?.question ?? '',
      ).trim();
      const back = String(
        item?.backContent ?? item?.back ?? item?.definition ?? item?.answer ?? '',
      ).trim();

      return {
        uid: `${id}-${index}`,
        id,
        front,
        back,
      };
    })
    .filter((item: any) => item.front || item.back);
};

export default function FlashcardStudyScreen({navigation, route}: any) {
  const {
    flashcardId,
    title,
    contextType,
    contextId,
    workspaceId,
    groupId,
    backTitle,
  } = route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [_isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [showAddForm, setShowAddForm] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [addingSaving, setAddingSaving] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const handleBack = useCallback(() => {
    const normalizedContextType = String(contextType || '').toUpperCase();
    const resolvedGroupId = Number(groupId || contextId || 0);
    const resolvedWorkspaceId = Number(workspaceId || contextId || 0);

    if (
      normalizedContextType === 'GROUP' &&
      Number.isInteger(resolvedGroupId) &&
      resolvedGroupId > 0
    ) {
      navigation.navigate('GroupWorkspace', {
        groupId: resolvedGroupId,
        title: backTitle,
      });
      return;
    }

    if (
      normalizedContextType === 'WORKSPACE' &&
      Number.isInteger(resolvedWorkspaceId) &&
      resolvedWorkspaceId > 0
    ) {
      navigation.navigate('Workspace', {
        workspaceId: resolvedWorkspaceId,
        title: backTitle,
      });
      return;
    }

    navigation.goBack();
  }, [backTitle, contextId, contextType, groupId, navigation, workspaceId]);

  const fetchDetail = useCallback(async () => {
    const normalizedId = Number(flashcardId || 0);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      showToast('Thiếu Flashcard ID', 'error');
      handleBack();
      return;
    }

    setLoading(true);
    try {
      const res = await FlashcardAPI.getById(normalizedId);
      const data = res?.data || {};
      const normalizedItems = normalizeItems(data?.items);

      setDetail(data);
      setItems(normalizedItems);
      setActiveIndex(0);
      setIsFlipped(false);
      flipAnim.setValue(0);
      slideAnim.setValue(0);
    } catch {
      showToast('Không thể tải chi tiết flashcard', 'error');
      handleBack();
    } finally {
      setLoading(false);
    }
  }, [flashcardId, flipAnim, handleBack, showToast, slideAnim]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const canPrev = activeIndex > 0;
  const canNext = activeIndex < items.length - 1;
  const currentCard = items[activeIndex] || null;

  const cardTitle = title || detail?.name || detail?.title || 'Flashcard';
  const cardMeta = useMemo(() => {
    const metaList = [`${items.length} thẻ`];
    if (detail?.createVia) {
      metaList.push(`Tạo bởi ${detail.createVia}`);
    }
    if (detail?.status) {
      metaList.push(String(detail.status).toUpperCase());
    }
    return metaList.join(' • ');
  }, [detail?.createVia, detail?.status, items.length]);

  const frontBlocks = useMemo(() => buildContentBlocks(currentCard?.front || ''), [currentCard]);
  const backBlocks = useMemo(() => buildContentBlocks(currentCard?.back || ''), [currentCard]);

  const animateFlip = (nextFlipped: boolean) => {
    Animated.timing(flipAnim, {
      toValue: nextFlipped ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const toggleFlip = () => {
    if (!currentCard) {
      return;
    }
    setIsFlipped(prev => {
      const next = !prev;
      animateFlip(next);
      return next;
    });
  };

  const animateSlide = (direction: 'prev' | 'next') => {
    slideAnim.stopAnimation();
    slideAnim.setValue(direction === 'next' ? 26 : -26);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const goPrev = () => {
    if (!canPrev) {
      return;
    }
    setActiveIndex(prev => Math.max(0, prev - 1));
    setIsFlipped(false);
    flipAnim.setValue(0);
    animateSlide('prev');
  };

  const goNext = () => {
    if (!canNext) {
      return;
    }
    setActiveIndex(prev => Math.min(items.length - 1, prev + 1));
    setIsFlipped(false);
    flipAnim.setValue(0);
    animateSlide('next');
  };

  const renderCardFaceContent = (blocks: any[], fallback: string, textStyle: any) => {
    if (blocks.length > 0) {
      return <ContentRenderer blocks={blocks} />;
    }

    return (
      <Text style={textStyle}>
        {fallback}
      </Text>
    );
  };

  const handleAddItem = async () => {
    if (!detail?.flashcardSetId || !newFront.trim() || !newBack.trim()) {
      showToast('Vui lòng nhập cả mặt trước và mặt sau', 'error');
      return;
    }

    setAddingSaving(true);
    try {
      const res = await FlashcardAPI.addItem(detail.flashcardSetId, {
        frontContent: newFront.trim(),
        backContent: newBack.trim(),
      });
      const newItem = res?.data || {};
      const normalized = {
        uid: `${newItem.flashcardItemId}-${items.length}`,
        id: newItem.flashcardItemId,
        front: newItem.frontContent,
        back: newItem.backContent,
      };
      setItems([...items, normalized]);
      setNewFront('');
      setNewBack('');
      setShowAddForm(false);
      showToast('Đã thêm thẻ mới', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Không thể thêm thẻ', 'error');
    } finally {
      setAddingSaving(false);
    }
  };

  const handleUpdateItem = async (itemId: number) => {
    if (!editFront.trim() || !editBack.trim()) {
      showToast('Vui lòng nhập cả mặt trước và mặt sau', 'error');
      return;
    }

    setEditSaving(true);
    try {
      const res = await FlashcardAPI.updateItem(itemId, {
        frontContent: editFront.trim(),
        backContent: editBack.trim(),
      });
      const updated = res?.data || {};
      setItems(prev =>
        prev.map(item =>
          item.id === itemId
            ? {
                ...item,
                front: updated.frontContent || editFront.trim(),
                back: updated.backContent || editBack.trim(),
              }
            : item,
        ),
      );
      setEditingItemId(null);
      showToast('Đã cập nhật thẻ', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Không thể cập nhật thẻ', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      await FlashcardAPI.deleteItem(itemId);
      setItems(prev => prev.filter(item => item.id !== itemId));
      showToast('Đã xóa thẻ', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Không thể xóa thẻ', 'error');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[styles.loaderText, {color: colors.textSecondary}]}>Đang tải flashcard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}>
        <TouchableOpacity onPress={handleBack} style={styles.iconBtn}>
          <Icon name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{flex: 1}}>
          <Text style={[styles.headerTitle, {color: colors.heading}]} numberOfLines={1}>
            {cardTitle}
          </Text>
          {!!cardMeta && (
            <Text style={[styles.headerSub, {color: colors.textSecondary}]}>
              {cardMeta}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={fetchDetail} style={styles.iconBtn}>
          <Icon name="refresh" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}>
        <View style={styles.cardStage}>
          {currentCard ? (
            <Animated.View
              style={[
                styles.cardMotion,
                {
                  opacity: slideAnim.interpolate({
                    inputRange: [-26, 0, 26],
                    outputRange: [0.6, 1, 0.6],
                  }),
                  transform: [{translateX: slideAnim}],
                },
              ]}>
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={toggleFlip}
                style={styles.cardTapArea}>
                <View style={styles.cardPerspective}>
                  <Animated.View
                    style={[
                      styles.cardFace,
                      styles.cardFront,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        transform: [
                          {perspective: 1000},
                          {
                            rotateX: flipAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0deg', '180deg'],
                            }),
                          },
                        ],
                      },
                    ]}>
                    <Text style={[styles.faceLabel, {color: isDark ? '#94a3b8' : '#cbd5e1'}]}>Mặt trước</Text>
                    <View style={styles.cardBody}>
                      {renderCardFaceContent(
                        frontBlocks,
                        currentCard?.front || 'Không có nội dung',
                        [styles.cardText, {color: isDark ? '#ffffff' : '#0f172a'}],
                      )}
                    </View>
                    <Text style={[styles.hintText, {color: isDark ? '#94a3b8' : '#cbd5e1'}]}>Nhấn để lật thẻ</Text>
                  </Animated.View>

                  <Animated.View
                    style={[
                      styles.cardFace,
                      styles.cardBack,
                      {
                        borderColor: isDark ? '#064e3b' : '#86efac',
                        backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ecfdf5',
                        transform: [
                          {perspective: 1000},
                          {
                            rotateX: flipAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['180deg', '360deg'],
                            }),
                          },
                        ],
                      },
                    ]}>
                    <Text style={[styles.faceLabel, {color: isDark ? '#6ee7b7' : '#047857'}]}>
                      Mặt sau
                    </Text>
                    <View style={styles.cardBody}>
                      {renderCardFaceContent(
                        backBlocks,
                        currentCard?.back || 'Không có nội dung',
                        [styles.cardText, {color: isDark ? '#a7f3d0' : '#065f46'}],
                      )}
                    </View>
                    <Text style={[styles.hintText, {color: isDark ? '#6ee7b7' : '#047857'}]}>
                      Nhấn để lật thẻ
                    </Text>
                  </Animated.View>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <View
              style={[
                styles.emptyCard,
                {borderColor: isDark ? '#64748b' : '#e2e8f0', backgroundColor: isDark ? '#1e293b' : '#f8fafc'},
              ]}>
              <Icon name="cards-outline" size={40} color={isDark ? '#64748b' : '#cbd5e1'} />
              <Text style={[styles.emptyCardText, {color: isDark ? '#94a3b8' : '#64748b'}]}>
                Chưa có thẻ để hiển thị
              </Text>
            </View>
          )}
        </View>

        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={goPrev}
            disabled={!canPrev}
            style={[
              styles.navBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: canPrev ? 1 : 0.5,
              },
            ]}>
            <Icon name="chevron-left" size={24} color={canPrev ? colors.text : colors.textTertiary} />
          </TouchableOpacity>
          <Text style={[styles.navText, {color: colors.heading}]}>
            {items.length === 0 ? '0/0' : `${activeIndex + 1}/${items.length}`}
          </Text>
          <TouchableOpacity
            onPress={goNext}
            disabled={!canNext}
            style={[
              styles.navBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: canNext ? 1 : 0.5,
              },
            ]}>
            <Icon name="chevron-right" size={24} color={canNext ? colors.text : colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, {color: colors.heading}]}>Danh sách thẻ</Text>
          <TouchableOpacity onPress={() => setShowAddForm(true)} style={[styles.addBtn]}>
            <Icon name="plus" size={20} color="white" />
          </TouchableOpacity>
        </View>
        {items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Icon name="cards-outline" size={40} color={isDark ? '#64748b' : '#cbd5e1'} />
            <Text style={[styles.emptyTitle, {color: colors.heading}]}>Bộ thẻ chưa có nội dung</Text>
            <Text style={[styles.emptyDesc, {color: isDark ? '#94a3b8' : '#64748b'}]}>Hãy tạo hoặc chờ AI tạo thêm card.</Text>
          </View>
        ) : (
          <View style={[styles.listWrap, {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border}]}>
            {items.map((item: any, index: number) => {
              const frontPreview = buildContentBlocks(item.front);
              const backPreview = buildContentBlocks(item.back);
              const isEditing = editingItemId === item.id;
              return (
                <View
                  key={`${item.id}-${index}`}
                  style={[
                    styles.listItem,
                    {
                      borderBottomColor: colors.border,
                    },
                  ]}>
                  <View style={styles.listHeaderRow}>
                    <View style={[styles.listBadge, {backgroundColor: isDark ? '#1e293b' : '#eff6ff'}]}>
                      <Text style={[styles.listBadgeText, {color: Colors.primary}]}>#{index + 1}</Text>
                    </View>
                    {!isEditing ? (
                      <View style={styles.listActions}>
                        <TouchableOpacity
                          onPress={() => {
                            setEditingItemId(item.id);
                            setEditFront(item.front);
                            setEditBack(item.back);
                          }}
                          style={styles.listActionBtn}
                          accessibilityLabel="Sửa thẻ"
                        >
                          <Icon name="pencil" size={18} color={isDark ? '#94a3b8' : '#94a3b8'} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            Alert.alert(
                              'Xác nhận xóa',
                              'Bạn có chắc chắn muốn xóa thẻ này?',
                              [
                                {text: 'Hủy', style: 'cancel'},
                                {text: 'Xóa', style: 'destructive', onPress: () => handleDeleteItem(item.id)},
                              ],
                            );
                          }}
                          style={styles.listActionBtn}
                          accessibilityLabel="Xóa thẻ"
                        >
                          <Icon name="trash-can-outline" size={18} color={isDark ? '#94a3b8' : '#94a3b8'} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.listContentCol}>
                    {isEditing ? (
                      <>
                        <Text style={[styles.listLabel, {color: isDark ? '#94a3b8' : '#cbd5e1'}]}>Mặt trước</Text>
                        <TextInput
                          style={[
                            styles.formInput,
                            {
                              borderColor: colors.border,
                              backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                              color: colors.heading,
                            },
                          ]}
                          placeholder="Mặt trước"
                          placeholderTextColor={colors.textSecondary}
                          value={editFront}
                          onChangeText={setEditFront}
                          multiline
                        />
                        <Text style={[styles.listLabel, {color: isDark ? '#94a3b8' : '#cbd5e1'}]}>Mặt sau</Text>
                        <TextInput
                          style={[
                            styles.formInput,
                            {
                              borderColor: colors.border,
                              backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                              color: colors.heading,
                            },
                          ]}
                          placeholder="Mặt sau"
                          placeholderTextColor={colors.textSecondary}
                          value={editBack}
                          onChangeText={setEditBack}
                          multiline
                        />
                        <View style={styles.formActions}>
                          <TouchableOpacity
                            onPress={() => setEditingItemId(null)}
                            style={[
                              styles.formBtn,
                              {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
                            ]}>
                            <Text style={{color: colors.heading, fontWeight: '600'}}>Hủy</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleUpdateItem(item.id)}
                            disabled={editSaving}
                            style={[
                              styles.formBtn,
                              {backgroundColor: '#10b981', opacity: editSaving ? 0.6 : 1},
                            ]}>
                            <Text style={{color: 'white', fontWeight: '600'}}>
                              {editSaving ? 'Đang lưu...' : 'Lưu'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : (
                      <>
                        <Text style={[styles.listLabel, {color: isDark ? '#94a3b8' : '#cbd5e1'}]}>Mặt trước</Text>
                        {frontPreview.length > 0 ? (
                          <ContentRenderer blocks={frontPreview} />
                        ) : (
                          <Text style={[styles.listFront, {color: colors.heading}]}>
                            {item.front || 'Không có mặt trước'}
                          </Text>
                        )}
                        <Text style={[styles.listLabel, {color: isDark ? '#94a3b8' : '#cbd5e1'}]}>Mặt sau</Text>
                        {backPreview.length > 0 ? (
                          <ContentRenderer blocks={backPreview} />
                        ) : (
                          <Text style={[styles.listBack, {color: isDark ? '#94a3b8' : '#64748b'}]}>
                            {item.back || 'Không có mặt sau'}
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {showAddForm && (
          <View style={[styles.formModal]}>
            <View
              style={[
                styles.formContent,
                {backgroundColor: colors.surface},
              ]}>
              <Text style={[styles.formTitle, {color: colors.heading}]}>Thêm thẻ mới</Text>
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                    color: colors.heading,
                  },
                ]}
                placeholder="Mặt trước"
                placeholderTextColor={colors.textSecondary}
                value={newFront}
                onChangeText={setNewFront}
                multiline
              />
              <TextInput
                style={[
                  styles.formInput,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                    color: colors.heading,
                  },
                ]}
                placeholder="Mặt sau"
                placeholderTextColor={colors.textSecondary}
                value={newBack}
                onChangeText={setNewBack}
                multiline
              />
              <View style={styles.formActions}>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddForm(false);
                    setNewFront('');
                    setNewBack('');
                  }}
                  style={[
                    styles.formBtn,
                    {backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border},
                  ]}>
                  <Text style={{color: colors.heading, fontWeight: '600'}}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleAddItem}
                  disabled={addingSaving || !newFront.trim() || !newBack.trim()}
                  style={[
                    styles.formBtn,
                    {backgroundColor: '#10b981', opacity: addingSaving || !newFront.trim() || !newBack.trim() ? 0.6 : 1},
                  ]}>
                  <Text style={{color: 'white', fontWeight: '600'}}>
                    {addingSaving ? 'Đang lưu...' : 'Thêm'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
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
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
  },
  headerTitle: {fontSize: 16, fontWeight: '700'},
  headerSub: {fontSize: 12, marginTop: 4, fontWeight: '500'},
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  contentContainer: {
    gap: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  cardStage: {
    alignItems: 'center',
  },
  cardMotion: {
    width: '100%',
  },
  cardTapArea: {
    height: 360,
    width: '100%',
  },
  cardPerspective: {
    flex: 1,
    position: 'relative',
  },
  cardFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing.lg,
    justifyContent: 'space-between',
    backfaceVisibility: 'hidden',
  },
  cardFront: {
  },
  cardBack: {
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  emptyCard: {
    width: '100%',
    height: 360,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyCardText: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginVertical: Spacing.md,
  },
  navBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 2,
  },
  navText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  sectionTitle: {fontSize: 16, fontWeight: '700', marginBottom: Spacing.sm},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
  },
  listWrap: {
    gap: 0,
  },
  listItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 0,
    paddingVertical: Spacing.md,
    flexDirection: 'column',
    gap: Spacing.sm,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
  },
  listActionBtn: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContentCol: {
    gap: Spacing.xs,
  },
  listLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  listBadge: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listFront: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  listBack: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  faceLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardText: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 34,
  },
  hintText: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loaderText: {fontSize: 13, fontWeight: '500'},
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {fontSize: 16, fontWeight: '700', textAlign: 'center'},
  emptyDesc: {fontSize: 13, textAlign: 'center', lineHeight: 20, fontWeight: '500'},
  formModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  formContent: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  formTitle: {fontSize: 16, fontWeight: '700', marginBottom: Spacing.md},
  formInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    minHeight: 80,
  },
  formActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'flex-end',
  },
  formBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
