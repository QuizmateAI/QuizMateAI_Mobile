import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import QuizAPI from '../../api/QuizAPI';

export default function QuizListScreen({navigation}: any) {
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hasResolvedInitialFetch, setHasResolvedInitialFetch] = useState(false);

  const difficultyLabels: Record<string, string> = useMemo(
    () => ({
      EASY: 'Dễ',
      MEDIUM: 'Trung bình',
      HARD: 'Khó',
      CUSTOM: 'Tùy chỉnh',
    }),
    [],
  );

  const fetchQuizzes = useCallback(async ({silent = false} = {}) => {
    try {
      if (!silent && !hasResolvedInitialFetch) {
        setLoading(true);
      }
      const res = await QuizAPI.getByUser();
      setQuizzes(res.data || []);
      setFetchError(null);
    } catch {
      setFetchError('Không thể tải danh sách quiz');
      if (!quizzes.length) {
        showToast('Không thể tải danh sách quiz', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setHasResolvedInitialFetch(true);
    }
  }, [hasResolvedInitialFetch, quizzes.length, showToast]);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  const statusMeta = useMemo(() => {
    return {
      ACTIVE: {
        label: 'Đang mở',
        bg: isDark ? 'rgba(16,185,129,0.2)' : Colors.successLight,
        text: isDark ? Colors.success : Colors.success,
      },
      DRAFT: {
        label: 'Nháp',
        bg: isDark ? 'rgba(245,158,11,0.2)' : Colors.warningLight,
        text: isDark ? Colors.warning : Colors.warning,
      },
      PROCESSING: {
        label: 'Đang tạo',
        bg: isDark ? 'rgba(59,130,246,0.2)' : Colors.primaryLight,
        text: isDark ? Colors.info : Colors.primary,
      },
      ERROR: {
        label: 'Lỗi',
        bg: isDark ? 'rgba(239,68,68,0.2)' : Colors.errorLight,
        text: isDark ? Colors.error : Colors.error,
      },
      COMPLETED: {
        label: 'Hoàn thành',
        bg: isDark ? 'rgba(59,130,246,0.2)' : Colors.primaryLight,
        text: isDark ? Colors.info : Colors.primary,
      },
      INACTIVE: {
        label: 'Tạm ngưng',
        bg: isDark ? 'rgba(148,163,184,0.2)' : '#E2E8F0',
        text: colors.textSecondary,
      },
    };
  }, [isDark]);

  const getDurationLabel = useCallback((item: any) => {
    const minutes = Number(
      item?.timeLimitMinutes ||
        item?.durationMinutes ||
        item?.durationInMinute ||
        0,
    );
    if (Number.isFinite(minutes) && minutes > 0) {
      return `${Math.round(minutes)} phút`;
    }
    const seconds = Number(item?.timeLimitSeconds || item?.durationSeconds || 0);
    if (Number.isFinite(seconds) && seconds > 0) {
      return `${Math.max(1, Math.round(seconds / 60))} phút`;
    }
    return 'Không giới hạn';
  }, []);

                {(() => {
                  const normalizedStatus = String(item.status || '').toUpperCase();
                  const statusStyle = statusMeta[normalizedStatus];
                  const difficulty =
                    difficultyLabels[String(item.overallDifficulty || '').toUpperCase()];
                  return (
                    <>
                      <View style={styles.quizTitleRow}>
                        <Text
                          style={[styles.quizName, {color: colors.heading}]}
                          numberOfLines={2}
                        >
                          {item.name}
                        </Text>
                        <Icon
                          name="chevron-right"
                          size={20}
                          color={colors.textTertiary}
                        />
                      </View>
                      <View style={styles.quizInfoRow}>
                        <View style={styles.infoTag}>
                          <Text style={[styles.infoTagLabel, {color: colors.textTertiary}]}>CÂU HỎI</Text>
                          <Text style={[styles.infoTagValue, {color: colors.heading}]}> {item.questionCount || 0}</Text>
                        </View>
                        {normalizedStatus ? (
                          <View
                            style={[
                              styles.statusPill,
                              {
                                backgroundColor:
                                  statusStyle?.bg ||
                                  (isDark
                                    ? 'rgba(148,163,184,0.2)'
                                    : '#E2E8F0'),
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusText,
                                {color: statusStyle?.text || colors.textSecondary},
                              ]}
                              numberOfLines={1}
                            >
                              {statusStyle?.label || normalizedStatus}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.quizMetaLine}>
                        {difficulty ? (
                          <View style={styles.metaItem}>
                            <Icon name="chart-bar" size={12} color={Colors.warning} />
                            <Text style={[styles.metaText, {color: Colors.warning}]}>
                              {difficulty}
                            </Text>
                          </View>
                        ) : null}
                        <View style={styles.metaItem}>
                          <Icon
                            name={item.communityShared ? 'lock-open-outline' : 'lock-outline'}
                            size={12}
                            color={colors.textSecondary}
                          />
                          <Text style={[styles.metaText, {color: colors.textSecondary}]}>
                            {item.communityShared ? 'Công khai' : 'Riêng tư'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.quizMetaLine}>
                        <View style={styles.metaItem}>
                          <Icon name="clock-outline" size={12} color={colors.textSecondary} />
                          <Text style={[styles.metaText, {color: colors.textSecondary}]}>
                            {getDurationLabel(item)}
                          </Text>
                        </View>
                        {item.updatedAt || item.createdAt ? (
                          <View style={styles.metaItem}>
                            <Icon name="calendar-month-outline" size={12} color={colors.textSecondary} />
                            <Text style={[styles.metaText, {color: colors.textSecondary}]}>
                              {formatShortDate(item.updatedAt || item.createdAt)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </>
                  );
                })()}
                              {difficulty}
                            </Text>
                          </View>
                        ) : null}
                        <View
                          style={[
                            styles.metaPill,
                            {
                              backgroundColor: isDark
                                ? 'rgba(148,163,184,0.18)'
                                : '#E2E8F0',
                            },
                          ]}
                        >
                          <Icon name="clock-outline" size={12} color={colors.textSecondary} />
                          <Text
                            style={[styles.metaPillText, {color: colors.textSecondary}]}
                            numberOfLines={1}>
                            {getDurationLabel(item)}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.metaPill,
                            {
                              backgroundColor: isDark
                                ? 'rgba(16,185,129,0.18)'
                                : '#D1FAE5',
                            },
                          ]}
                        >
                          <Icon
                            name={item.communityShared ? 'earth' : 'lock-outline'}
                            size={12}
                            color={item.communityShared ? '#10B981' : colors.textSecondary}
                          />
                          <Text
                            style={[
                              styles.metaPillText,
                              {
                                color: item.communityShared
                                  ? '#10B981'
                                  : colors.textSecondary,
                              },
                            ]}
                            numberOfLines={1}>
                            {item.communityShared ? 'Công khai' : 'Riêng tư'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.quizMetaRow}>
                        <Text
                          style={[styles.quizMeta, {color: colors.textSecondary}]}
                        >
                          {item.questionCount || 0} câu hỏi
                        </Text>
                        {item.updatedAt || item.createdAt ? (
                          <Text
                            style={[styles.quizMeta, {color: colors.textSecondary}]}
                          >
                            {formatShortDate(item.updatedAt || item.createdAt)}
                          </Text>
                        ) : null}
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>
            <View style={styles.quizCardFooter}>
              <View style={styles.quizActions}>
                <TouchableOpacity
                  onPress={() => {
                    const quizId = item.id || item.quizId;
                    if (!quizId) {
                      showToast('Thiếu Quiz ID', 'error');
                      return;
                    }
                    navigation.navigate('PracticeQuiz', {
                      quizId,
                      title: item.name || item.title,
                      backContext: {type: 'quiz-list'},
                    });
                  }}
                  style={[
                    styles.actionBtn,
                    {backgroundColor: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF'},
                  ]}>
                  <Icon name="play-outline" size={14} color={Colors.primary} />
                  <Text style={[styles.actionText, {color: Colors.primary}]}>
                    Luyện tập
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const quizId = item.id || item.quizId;
                    if (!quizId) {
                      showToast('Thiếu Quiz ID', 'error');
                      return;
                    }
                    navigation.navigate('ExamQuiz', {
                      quizId,
                      title: item.name || item.title,
                      backContext: {type: 'quiz-list'},
                    });
                  }}
                  style={[
                    styles.actionBtn,
                    {backgroundColor: isDark ? 'rgba(234,88,12,0.15)' : '#FFF7ED'},
                  ]}>
                  <Icon name="timer-outline" size={14} color="#EA580C" />
                  <Text style={[styles.actionText, {color: '#EA580C'}]}>
                    Thi thử
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          fetchError && quizzes.length > 0 ? (
            <View
              style={[
                styles.inlineAlert,
                {backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#FFFBEB'},
              ]}>
            >
              <Icon name="alert-circle-outline" size={16} color={Colors.warning} />
              <Text style={[styles.inlineAlertText, {color: colors.textSecondary}]}>
                Không thể làm mới danh sách quiz. Dữ liệu cũ vẫn được giữ.
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon
              name="head-question-outline"
              size={56}
              color={colors.textTertiary}
            />
            <Text style={[styles.emptyTitle, {color: colors.textSecondary}]}>
              {fetchError ? 'Không thể tải danh sách quiz' : 'Chưa có quiz nào'}
            </Text>
            <Text style={[styles.emptySubtitle, {color: colors.textTertiary}]}>
              {fetchError
                ? 'Vui lòng thử lại sau ít phút.'
                : 'Hãy tạo quiz từ các workspace của bạn'}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchQuizzes({silent: true});
            }}
            tintColor={Colors.primary}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {fontSize: 20, fontWeight: '700'},
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 100,
    flexGrow: 1,
  },
  quizCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  quizCardHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: Spacing.md,
  },
  quizIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quizCardInfo: {flex: 1},
  quizTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  quizName: {flex: 1, fontSize: 15, fontWeight: '600'},
  quizInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  infoTag: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  infoTagLabel: {fontSize: 10, fontWeight: '700', letterSpacing: 0.4},
  infoTagValue: {fontSize: 12, fontWeight: '700'},
  quizMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {fontSize: 12, fontWeight: '600'},
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {fontSize: 11, fontWeight: '600'},
  quizCardFooter: {},
  quizActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  actionText: {fontSize: 12, fontWeight: '600'},
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {fontSize: 16, fontWeight: '600', marginTop: 12},
  emptySubtitle: {fontSize: 13},
  inlineAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  inlineAlertText: {fontSize: 12, flex: 1},
});
