import React, {useState, useEffect, useCallback} from 'react';
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

  const fetchQuizzes = useCallback(async () => {
    try {
      const res = await QuizAPI.getByUser();
      setQuizzes(res.data || []);
    } catch {
      setQuizzes([]);
      showToast('Failed to load quizzes', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.background}]}
      edges={['top']}>
      <View
        style={[
          styles.header,
          {backgroundColor: colors.surface, borderBottomColor: colors.border},
        ]}>
        <Text style={[styles.headerTitle, {color: colors.heading}]}>
          My Quizzes
        </Text>
      </View>

      <FlatList
        data={quizzes}
        keyExtractor={item => String(item.id || item.quizId)}
        renderItem={({item}) => (
          <TouchableOpacity
            onPress={() => {
              const quizId = item.id || item.quizId;
              if (!quizId) {
                showToast('Quiz ID is missing', 'error');
                return;
              }
              navigation.navigate('PracticeQuiz', {
                quizId,
                title: item.name || item.title,
              });
            }}
            activeOpacity={0.7}
            style={[
              styles.quizCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                shadowColor: isDark ? colors.shadow : '#0F172A',
              },
            ]}>
            <View style={styles.quizCardHeader}>
              <View
                style={[
                  styles.quizIcon,
                  {backgroundColor: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF'},
                ]}>
                <Icon
                  name="head-question-outline"
                  size={20}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.quizCardInfo}>
                <Text
                  style={[styles.quizName, {color: colors.heading}]}
                  numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={[styles.quizMeta, {color: colors.textSecondary}]}>
                  {item.questionCount || 0} questions
                </Text>
              </View>
            </View>
            <View style={styles.quizCardFooter}>
              <View style={styles.quizActions}>
                <TouchableOpacity
                  onPress={() => {
                    const quizId = item.id || item.quizId;
                    if (!quizId) {
                      showToast('Quiz ID is missing', 'error');
                      return;
                    }
                    navigation.navigate('PracticeQuiz', {
                      quizId,
                      title: item.name || item.title,
                    });
                  }}
                  style={[
                    styles.actionBtn,
                    {backgroundColor: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF'},
                  ]}>
                  <Icon name="play-outline" size={14} color={Colors.primary} />
                  <Text style={[styles.actionText, {color: Colors.primary}]}>
                    Practice
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const quizId = item.id || item.quizId;
                    if (!quizId) {
                      showToast('Quiz ID is missing', 'error');
                      return;
                    }
                    navigation.navigate('ExamQuiz', {
                      quizId,
                      title: item.name || item.title,
                    });
                  }}
                  style={[
                    styles.actionBtn,
                    {backgroundColor: isDark ? 'rgba(234,88,12,0.15)' : '#FFF7ED'},
                  ]}>
                  <Icon name="timer-outline" size={14} color="#EA580C" />
                  <Text style={[styles.actionText, {color: '#EA580C'}]}>
                    Exam
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon
              name="head-question-outline"
              size={56}
              color={colors.textTertiary}
            />
            <Text style={[styles.emptyTitle, {color: colors.textSecondary}]}>
              No quizzes yet
            </Text>
            <Text style={[styles.emptySubtitle, {color: colors.textTertiary}]}>
              Create quizzes from your workspaces
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchQuizzes();
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
  quizName: {fontSize: 15, fontWeight: '600'},
  quizMeta: {fontSize: 12, marginTop: 3},
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
});
