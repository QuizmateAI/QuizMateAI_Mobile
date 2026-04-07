import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import FlashcardAPI from '../../api/FlashcardAPI';

const shuffleArray = <T,>(array: T[]) => {
  const cloned = [...array];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
};

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
  const {flashcardId, title} = route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [studyQueue, setStudyQueue] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyStarted, setStudyStarted] = useState(false);
  const [shuffleOnStart, setShuffleOnStart] = useState(true);
  const [studyRound, setStudyRound] = useState(1);
  const [cardOutcomeByUid, setCardOutcomeByUid] = useState<
    Record<string, 'remembered' | 'learning'>
  >({});

  const fetchDetail = useCallback(async () => {
    const normalizedId = Number(flashcardId || 0);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
      showToast('Thiếu Flashcard ID', 'error');
      navigation.goBack();
      return;
    }

    setLoading(true);
    try {
      const res = await FlashcardAPI.getById(normalizedId);
      const data = res?.data || {};
      const normalizedItems = normalizeItems(data?.items);

      setDetail(data);
      setItems(normalizedItems);
      setStudyQueue([]);
      setCurrentIndex(0);
      setIsFlipped(false);
      setStudyStarted(false);
      setStudyRound(1);
      setCardOutcomeByUid({});
    } catch {
      showToast('Không thể tải chi tiết flashcard', 'error');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [flashcardId, navigation, showToast]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const canPrev = currentIndex > 0;
  const canNext = currentIndex < studyQueue.length - 1;
  const currentCard = studyQueue[currentIndex] || null;
  const rememberedCount = useMemo(
    () => Object.values(cardOutcomeByUid).filter(value => value === 'remembered').length,
    [cardOutcomeByUid],
  );
  const learningCount = useMemo(
    () => Object.values(cardOutcomeByUid).filter(value => value === 'learning').length,
    [cardOutcomeByUid],
  );
  const remainingInQueue = useMemo(() => {
    return studyQueue.filter((item: any) => cardOutcomeByUid[item.uid] !== 'remembered');
  }, [cardOutcomeByUid, studyQueue]);
  const progressPercent = useMemo(() => {
    if (studyQueue.length === 0) {
      return 0;
    }
    return Math.round(((currentIndex + 1) / studyQueue.length) * 100);
  }, [currentIndex, studyQueue.length]);

  const goPrev = () => {
    if (!canPrev) {
      return;
    }
    setCurrentIndex(prev => prev - 1);
    setIsFlipped(false);
  };

  const goNext = () => {
    if (!canNext) {
      return;
    }
    setCurrentIndex(prev => prev + 1);
    setIsFlipped(false);
  };

  const toggleFlip = () => {
    if (!currentCard) {
      return;
    }
    setIsFlipped(prev => !prev);
  };

  const startStudy = () => {
    if (items.length === 0) {
      return;
    }
    const queue = shuffleOnStart ? shuffleArray(items) : [...items];
    setStudyQueue(queue);
    setCurrentIndex(0);
    setIsFlipped(false);
    setStudyRound(1);
    setCardOutcomeByUid({});
    setStudyStarted(true);
  };

  const markCurrentCard = (outcome: 'remembered' | 'learning') => {
    if (!currentCard) {
      return;
    }

    setCardOutcomeByUid(prev => ({
      ...prev,
      [currentCard.uid]: outcome,
    }));

    if (canNext) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  };

  const reviewUnknownCards = () => {
    if (remainingInQueue.length === 0) {
      return;
    }

    setStudyQueue(shuffleOnStart ? shuffleArray(remainingInQueue) : [...remainingInQueue]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setStudyRound(prev => prev + 1);
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

  if (items.length === 0) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}> 
        <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}> 
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Icon name="chevron-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, {color: colors.heading}]} numberOfLines={1}>
            {title || detail?.name || detail?.title || 'Flashcard'}
          </Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.emptyWrap}>
          <Icon name="cards-outline" size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, {color: colors.heading}]}>Bộ thẻ chưa có nội dung</Text>
          <Text style={[styles.emptyDesc, {color: colors.textSecondary}]}>Hãy tạo hoặc chờ AI tạo thêm card để bắt đầu học.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (studyStarted && !currentCard) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}> 
        <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}> 
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Icon name="chevron-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, {color: colors.heading}]} numberOfLines={1}>
            {title || detail?.name || detail?.title || 'Flashcard'}
          </Text>
          <TouchableOpacity onPress={() => setStudyStarted(false)} style={styles.iconBtn}>
            <Icon name="format-list-bulleted" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.emptyWrap}>
          <Icon name="information-outline" size={40} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, {color: colors.heading}]}>Chưa có thẻ để hiển thị</Text>
          <Text style={[styles.emptyDesc, {color: colors.textSecondary}]}>Vui lòng quay lại danh sách và bắt đầu lại phiên học.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!studyStarted) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}> 
        <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}> 
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Icon name="chevron-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{flex: 1}}>
            <Text style={[styles.headerTitle, {color: colors.heading}]} numberOfLines={1}>
              {title || detail?.name || detail?.title || 'Flashcard'}
            </Text>
            <Text style={[styles.headerSub, {color: colors.textSecondary}]}> 
              Danh sách {items.length} thẻ
            </Text>
          </View>
          <TouchableOpacity onPress={fetchDetail} style={styles.iconBtn}>
            <Icon name="refresh" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.listContent}>
          <View
            style={[
              styles.summaryCard,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryTitle, {color: colors.heading}]}>Chế độ học</Text>
              <TouchableOpacity
                onPress={() => setShuffleOnStart(prev => !prev)}
                style={[
                  styles.shuffleToggle,
                  {
                    borderColor: shuffleOnStart ? Colors.primary : colors.border,
                    backgroundColor: shuffleOnStart
                      ? isDark
                        ? '#1E3A8A30'
                        : '#EFF6FF'
                      : colors.surface,
                  },
                ]}>
                <Icon
                  name={shuffleOnStart ? 'shuffle-variant' : 'shuffle-disabled'}
                  size={16}
                  color={shuffleOnStart ? Colors.primary : colors.textTertiary}
                />
                <Text
                  style={[
                    styles.shuffleText,
                    {color: shuffleOnStart ? Colors.primary : colors.textSecondary},
                  ]}>
                  {shuffleOnStart ? 'Shuffle bật' : 'Shuffle tắt'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.summaryDesc, {color: colors.textSecondary}]}> 
              Vào học theo vòng, có thể đánh dấu Đã nhớ hoặc Chưa nhớ để ôn lại đúng phần còn yếu.
            </Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listWrap}>
            {items.map((item: any, index: number) => (
              <View
                key={`${item.id}-${index}`}
                style={[
                  styles.listItem,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}>
                <View style={[styles.listBadge, {backgroundColor: isDark ? '#1E293B' : '#EEF2FF'}]}>
                  <Text style={[styles.listBadgeText, {color: Colors.primary}]}>#{index + 1}</Text>
                </View>
                <View style={{flex: 1, gap: 4}}>
                  <Text style={[styles.listFront, {color: colors.heading}]} numberOfLines={2}>
                    {item.front || 'Không có mặt trước'}
                  </Text>
                  <Text style={[styles.listBack, {color: colors.textSecondary}]} numberOfLines={2}>
                    {item.back || 'Không có mặt sau'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            onPress={startStudy}
            style={[styles.startBtn, {backgroundColor: Colors.primary}]}
            activeOpacity={0.9}>
            <Icon name="play-circle-outline" size={20} color="#FFFFFF" />
            <Text style={styles.startBtnText}>Bắt đầu học</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}> 
      <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}> 
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Icon name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{flex: 1}}>
          <Text style={[styles.headerTitle, {color: colors.heading}]} numberOfLines={1}>
            {title || detail?.name || detail?.title || 'Flashcard'}
          </Text>
          <Text style={[styles.headerSub, {color: colors.textSecondary}]}>
            Vòng {studyRound} • {currentIndex + 1}/{studyQueue.length} thẻ
          </Text>
        </View>
        <TouchableOpacity onPress={() => setStudyStarted(false)} style={styles.iconBtn}>
          <Icon name="format-list-bulleted" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.metricsRow}>
          <View
            style={[
              styles.metricChip,
              {
                borderColor: isDark ? '#14532d' : '#86efac',
                backgroundColor: isDark ? 'rgba(20,83,45,0.35)' : '#f0fdf4',
              },
            ]}>
            <Text style={[styles.metricText, {color: isDark ? '#86efac' : '#166534'}]}>
              Đã nhớ: {rememberedCount}
            </Text>
          </View>
          <View
            style={[
              styles.metricChip,
              {
                borderColor: isDark ? '#7f1d1d' : '#fecaca',
                backgroundColor: isDark ? 'rgba(127,29,29,0.35)' : '#fef2f2',
              },
            ]}>
            <Text style={[styles.metricText, {color: isDark ? '#fca5a5' : '#b91c1c'}]}>
              Chưa nhớ: {learningCount}
            </Text>
          </View>
        </View>

        <View style={[styles.progressTrack, {backgroundColor: isDark ? '#1F2937' : '#E2E8F0'}]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: Colors.primary,
                width: `${progressPercent}%`,
              },
            ]}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.95}
          onPress={toggleFlip}
          style={[
            styles.card,
            {
              borderColor: colors.border,
              backgroundColor: isFlipped
                ? isDark
                  ? '#0F172A'
                  : '#EFF6FF'
                : colors.surface,
            },
          ]}>
          <Text style={[styles.faceLabel, {color: colors.textTertiary}]}> 
            {isFlipped ? 'Mặt sau' : 'Mặt trước'}
          </Text>
          <Text style={[styles.cardText, {color: colors.heading}]}> 
            {(isFlipped ? currentCard.back : currentCard.front) || 'Không có nội dung'}
          </Text>
          <Text style={[styles.hintText, {color: colors.textSecondary}]}>Nhấn vào thẻ để lật</Text>
        </TouchableOpacity>

        <View style={styles.controls}>
          <TouchableOpacity
            onPress={goPrev}
            disabled={!canPrev}
            style={[
              styles.controlBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: canPrev ? 1 : 0.45,
              },
            ]}>
            <Icon name="chevron-left" size={20} color={colors.text} />
            <Text style={[styles.controlText, {color: colors.text}]}>Trước</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleFlip}
            style={[
              styles.flipBtn,
              {
                backgroundColor: Colors.primary,
              },
            ]}>
            <Icon name="autorenew" size={18} color="#FFFFFF" />
            <Text style={styles.flipText}>Lật thẻ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={goNext}
            disabled={!canNext}
            style={[
              styles.controlBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: canNext ? 1 : 0.45,
              },
            ]}>
            <Text style={[styles.controlText, {color: colors.text}]}>Tiếp</Text>
            <Icon name="chevron-right" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.rememberActionsWrap}>
          <TouchableOpacity
            onPress={() => markCurrentCard('learning')}
            style={[
              styles.rememberBtn,
              {
                borderColor: isDark ? '#7f1d1d' : '#fecaca',
                backgroundColor: isDark ? 'rgba(127,29,29,0.3)' : '#fef2f2',
              },
            ]}>
            <Icon name="close-circle-outline" size={18} color={isDark ? '#fca5a5' : '#b91c1c'} />
            <Text style={[styles.rememberBtnText, {color: isDark ? '#fca5a5' : '#b91c1c'}]}>Chưa nhớ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => markCurrentCard('remembered')}
            style={[
              styles.rememberBtn,
              {
                borderColor: isDark ? '#14532d' : '#86efac',
                backgroundColor: isDark ? 'rgba(20,83,45,0.3)' : '#f0fdf4',
              },
            ]}>
            <Icon name="check-circle-outline" size={18} color={isDark ? '#86efac' : '#166534'} />
            <Text style={[styles.rememberBtnText, {color: isDark ? '#86efac' : '#166534'}]}>Đã nhớ</Text>
          </TouchableOpacity>
        </View>

        {!canNext ? (
          <View style={styles.roundActions}>
            {remainingInQueue.length > 0 ? (
              <TouchableOpacity
                onPress={reviewUnknownCards}
                style={[styles.reviewBtn, {backgroundColor: Colors.primary}]}
                activeOpacity={0.9}>
                <Icon name="refresh" size={18} color="#FFFFFF" />
                <Text style={styles.reviewBtnText}>
                  Ôn lại {remainingInQueue.length} thẻ chưa nhớ
                </Text>
              </TouchableOpacity>
            ) : (
              <View
                style={[
                  styles.completedBanner,
                  {
                    borderColor: isDark ? '#14532d' : '#86efac',
                    backgroundColor: isDark ? 'rgba(20,83,45,0.3)' : '#f0fdf4',
                  },
                ]}>
                <Icon name="party-popper" size={18} color={isDark ? '#86efac' : '#166534'} />
                <Text style={[styles.completedText, {color: isDark ? '#86efac' : '#166534'}]}>
                  Bạn đã nhớ toàn bộ thẻ ở vòng này
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
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
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  headerTitle: {fontSize: 16, fontWeight: '700'},
  headerSub: {fontSize: 12, marginTop: 2},
  content: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  listContent: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryTitle: {fontSize: 13, fontWeight: '700'},
  summaryDesc: {fontSize: 12, lineHeight: 18},
  shuffleToggle: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shuffleText: {fontSize: 12, fontWeight: '600'},
  listWrap: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  listItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  listBadge: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  listBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listFront: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  listBack: {
    fontSize: 12,
    lineHeight: 18,
  },
  startBtn: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metricChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metricText: {
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 320,
  },
  faceLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardText: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 32,
  },
  hintText: {
    fontSize: 12,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  controlBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  controlText: {
    fontSize: 13,
    fontWeight: '600',
  },
  flipBtn: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  flipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  rememberActionsWrap: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  rememberBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  rememberBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  roundActions: {
    marginTop: Spacing.xs,
  },
  reviewBtn: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  reviewBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  completedBanner: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  completedText: {
    fontSize: 13,
    fontWeight: '700',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  loaderText: {fontSize: 13},
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {fontSize: 16, fontWeight: '700'},
  emptyDesc: {fontSize: 13, textAlign: 'center', lineHeight: 20},
});
