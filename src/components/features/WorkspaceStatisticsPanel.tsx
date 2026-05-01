import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {BorderRadius, Spacing} from '../../theme/spacing';
import {Colors} from '../../theme/colors';
import WorkspaceAPI from '../../api/WorkspaceAPI';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

const ATTEMPT_MODES = [
  {value: 'OFFICIAL', label: 'Kiểm tra chính thức'},
  {value: 'PRACTICE', label: 'Luyện tập'},
  {value: 'ALL', label: 'Tất cả'},
];

const SURFACES = [
  {
    value: 'QUESTION',
    title: 'Theo câu hỏi',
    description:
      'Theo dõi độ chính xác, tiến độ và hiệu suất theo độ khó hoặc cấp Bloom của từng câu hỏi.',
    icon: 'chart-box-outline',
  },
  {
    value: 'QUIZ',
    title: 'Theo quiz',
    description:
      'Xem mức độ hoàn thành, điểm trung bình và hiệu suất của từng quiz trong workspace.',
    icon: 'clipboard-text-outline',
  },
];

const DIFFICULTY_ORDER = ['EASY', 'MEDIUM', 'HARD', 'CUSTOM', 'UNSPECIFIED'];
const BLOOM_ORDER = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE'];

type Props = {
  workspaceId: number;
  colors: any;
};

function extractPayload(response: any) {
  return response?.data?.data ?? response?.data ?? response ?? null;
}

function isNoDataError(error: any) {
  const status = error?.response?.status;
  const apiMsg = String(
    error?.response?.data?.message || error?.response?.data?.error || '',
  );
  return (
    status === 404 ||
    status === 409 ||
    /ch[uư]a c[oó]|no data|not found|empty|conflict/i.test(apiMsg)
  );
}

function hasQuestionStatsData(stats: any) {
  if (!stats) {
    return false;
  }

  const current = stats.currentQuestionStats;
  const lifetime = stats.lifetimeQuestionAttemptStats;
  return (
    Number(current?.attemptedQuestionsInMode || 0) > 0 ||
    Number(current?.gradedQuestionsInMode || 0) > 0 ||
    Number(lifetime?.totalQuestionAttempts ?? lifetime?.totalAttempts ?? 0) > 0
  );
}

function hasQuizStatsData(stats: any) {
  if (!stats) {
    return false;
  }

  const current = stats.currentQuizStats;
  const lifetime = stats.lifetimeQuizAttemptStats;
  return (
    Number(current?.attemptedQuizzesInMode || 0) > 0 ||
    Number(lifetime?.totalQuizAttempts || 0) > 0
  );
}

function pct(value: any, total: any) {
  const safeTotal = Number(total || 0);
  if (safeTotal <= 0) {
    return 0;
  }
  return Math.round((Number(value || 0) / safeTotal) * 100);
}

function fmtNumber(value: any) {
  return Number(value ?? 0).toLocaleString('vi-VN');
}

function fmtPercentFromRatio(value: any) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function fmtScore(value: any) {
  if (value == null || Number.isNaN(Number(value))) {
    return '0';
  }
  return Number(value).toLocaleString('vi-VN', {
    maximumFractionDigits: 1,
  });
}

function fmtSeconds(value: any) {
  const totalSeconds = Math.round(Number(value || 0));
  if (!totalSeconds) {
    return '0s';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  if (seconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

function fmtDateTime(value: any) {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString('vi-VN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function translateDifficulty(label: any) {
  switch (String(label || '').toUpperCase()) {
    case 'EASY':
      return 'Dễ';
    case 'MEDIUM':
      return 'Trung bình';
    case 'HARD':
      return 'Khó';
    case 'CUSTOM':
      return 'Tùy chỉnh';
    default:
      return 'Không rõ';
  }
}

function translateBloom(label: any) {
  switch (String(label || '').toUpperCase()) {
    case 'REMEMBER':
      return 'Ghi nhớ';
    case 'UNDERSTAND':
      return 'Hiểu';
    case 'APPLY':
      return 'Áp dụng';
    case 'ANALYZE':
      return 'Phân tích';
    case 'EVALUATE':
      return 'Đánh giá';
    default:
      return 'Không rõ';
  }
}

function getRenderableBloomBuckets(buckets: any[] = []) {
  const bucketMap = new Map(
    buckets
      .filter(bucket => String(bucket?.label || '').toUpperCase() !== 'UNSPECIFIED')
      .map(bucket => [String(bucket?.label || '').toUpperCase(), bucket]),
  );
  return BLOOM_ORDER.map(key => bucketMap.get(key)).filter(Boolean);
}

function getQuestionBucketAttemptCount(bucket: any) {
  return Number(
    bucket?.attemptedQuestionsInMode ?? bucket?.gradedQuestionsInMode ?? 0,
  );
}

function getQuestionBucketAccuracy(bucket: any) {
  return Number(bucket?.accuracyInMode ?? 0);
}

function pickQuestionInsightBucket(buckets: any[] = [], type: 'best' | 'worst') {
  const candidates = buckets.filter(
    bucket => getQuestionBucketAttemptCount(bucket) > 0,
  );
  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((left, right) => {
    const accuracyDiff =
      getQuestionBucketAccuracy(right) - getQuestionBucketAccuracy(left);
    if (Math.abs(accuracyDiff) > 0.0001) {
      return accuracyDiff;
    }
    return (
      getQuestionBucketAttemptCount(right) -
      getQuestionBucketAttemptCount(left)
    );
  });

  return type === 'worst' ? sorted[sorted.length - 1] : sorted[0];
}

function pickQuizInsightItem(items: any[] = [], type: 'best' | 'worst') {
  const candidates = items.filter(item => Number(item?.totalAttempts || 0) > 0);
  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((left, right) => {
    const accuracyDiff =
      Number(right?.averageAccuracy ?? 0) - Number(left?.averageAccuracy ?? 0);
    if (Math.abs(accuracyDiff) > 0.0001) {
      return accuracyDiff;
    }
    const scoreDiff =
      Number(right?.averageScore ?? 0) - Number(left?.averageScore ?? 0);
    if (Math.abs(scoreDiff) > 0.0001) {
      return scoreDiff;
    }
    return Number(right?.totalAttempts ?? 0) - Number(left?.totalAttempts ?? 0);
  });

  return type === 'worst' ? sorted[sorted.length - 1] : sorted[0];
}

function cardWidth(columns: number) {
  const horizontal = Spacing.lg * 2;
  const gaps = Spacing.sm * (columns - 1);
  return (SCREEN_WIDTH - horizontal - gaps) / columns;
}

function AccuracyRing({
  accuracy,
  label,
  colors,
  size = 118,
}: {
  accuracy: number;
  label: string;
  colors: any;
  size?: number;
}) {
  const pctValue = Math.max(0, Math.min(100, Math.round((accuracy || 0) * 100)));
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pctValue / 100) * circumference;
  const toneColor =
    pctValue >= 70 ? Colors.success : pctValue >= 40 ? Colors.warning : Colors.error;

  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={toneColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={styles.ringContent}>
        <Text style={[styles.ringValue, {color: toneColor}]}>{pctValue}%</Text>
        <Text style={[styles.ringLabel, {color: colors.textSecondary}]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function SegmentedControl({
  items,
  value,
  onChange,
}: {
  items: Array<{value: string; label: string}>;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.segmentWrap}>
      {items.map(item => {
        const active = value === item.value;
        return (
          <TouchableOpacity
            key={item.value}
            activeOpacity={0.85}
            onPress={() => onChange(item.value)}
            style={[styles.segmentButton, active && styles.segmentButtonActive]}>
            <Text
              style={[
                styles.segmentText,
                {color: active ? '#FFFFFF' : '#475569'},
              ]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function SurfaceSwitcher({
  surface,
  onChange,
}: {
  surface: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.surfaceGrid}>
      {SURFACES.map(item => {
        const active = surface === item.value;
        return (
          <TouchableOpacity
            key={item.value}
            activeOpacity={0.88}
            onPress={() => onChange(item.value)}
            style={[
              styles.surfaceCard,
              active ? styles.surfaceCardActive : styles.surfaceCardInactive,
            ]}>
            <View style={[styles.surfaceIcon, active && styles.surfaceIconActive]}>
              <Icon
                name={item.icon}
                size={20}
                color={active ? Colors.primary : '#64748B'}
              />
            </View>
            <View style={styles.surfaceContent}>
              <Text style={styles.surfaceTitle}>{item.title}</Text>
              <Text style={styles.surfaceDescription}>{item.description}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  subValue,
  accentColor,
  width,
}: {
  icon: string;
  label: string;
  value: string;
  subValue?: string;
  accentColor: string;
  width: number;
}) {
  return (
    <View style={[styles.statCard, {width}]}>
      <View style={[styles.statTopBar, {backgroundColor: accentColor}]} />
      <View style={[styles.statIconWrap, {backgroundColor: `${accentColor}15`}]}>
        <Icon name={icon} size={18} color={accentColor} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {subValue ? <Text style={styles.statSubValue}>{subValue}</Text> : null}
    </View>
  );
}

function InsightCard({
  title,
  value,
  description,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  tone: 'emerald' | 'amber';
}) {
  const palette =
    tone === 'emerald'
      ? {bg: '#ECFDF5', border: '#A7F3D0', title: '#065F46'}
      : {bg: '#FFFBEB', border: '#FDE68A', title: '#92400E'};

  return (
    <View
      style={[
        styles.insightCard,
        {backgroundColor: palette.bg, borderColor: palette.border},
      ]}>
      <Text style={[styles.insightTitle, {color: palette.title}]}>{title}</Text>
      <Text style={styles.insightValue}>{value}</Text>
      <Text style={styles.insightDescription}>{description}</Text>
    </View>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SimpleBarList({
  title,
  buckets,
  bucketType,
  getValue,
  showPercent = false,
}: {
  title: string;
  buckets: any[];
  bucketType: 'difficulty' | 'bloom' | 'default';
  getValue: (bucket: any) => number;
  showPercent?: boolean;
}) {
  const sanitized = buckets.filter(Boolean);
  if (sanitized.length === 0) {
    return null;
  }

  const maxValue = Math.max(...sanitized.map(bucket => getValue(bucket)), 1);

  return (
    <SectionCard title={title}>
      <View style={styles.metricList}>
        {sanitized.map((bucket, index) => {
          const value = getValue(bucket);
          const label =
            bucketType === 'difficulty'
              ? translateDifficulty(bucket?.label)
              : bucketType === 'bloom'
              ? translateBloom(bucket?.label)
              : String(bucket?.label || 'Không rõ');

          return (
            <View key={`${label}:${index}`} style={styles.metricRow}>
              <View style={styles.metricHeader}>
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={styles.metricValue}>
                  {showPercent ? `${Math.round(value)}%` : fmtNumber(value)}
                </Text>
              </View>
              <View style={styles.metricTrack}>
                <View
                  style={[
                    styles.metricFill,
                    {width: `${Math.max(4, (value / maxValue) * 100)}%`},
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}

function StackedProgress({
  correct,
  incorrect,
  pending,
}: {
  correct: number;
  incorrect: number;
  pending: number;
}) {
  const total = Math.max(1, correct + incorrect + pending);
  return (
    <View>
      <View style={styles.stackedBar}>
        <View
          style={[
            styles.stackedGreen,
            {width: `${(correct / total) * 100}%`},
          ]}
        />
        <View
          style={[
            styles.stackedRed,
            {width: `${(incorrect / total) * 100}%`},
          ]}
        />
        {pending > 0 ? (
          <View
            style={[
              styles.stackedAmber,
              {width: `${(pending / total) * 100}%`},
            ]}
          />
        ) : null}
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendText}>Đúng ({fmtNumber(correct)})</Text>
        <Text style={styles.legendText}>Sai ({fmtNumber(incorrect)})</Text>
        {pending > 0 ? (
          <Text style={styles.legendText}>Chưa chấm ({fmtNumber(pending)})</Text>
        ) : null}
      </View>
    </View>
  );
}

function QuizListCard({items}: {items: any[]}) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <SectionCard
      title="Bảng hiệu suất theo quiz"
      subtitle="Tổng hợp số lần làm, độ chính xác và thời gian trung bình của từng quiz">
      <View style={styles.quizTableWrap}>
        {items.map((item, index) => (
          <View key={`${item?.quizId || index}:${item?.quizTitle || 'quiz'}`} style={styles.quizRow}>
            <View style={styles.quizRowHeader}>
              <Text style={styles.quizName} numberOfLines={1}>
                {item?.quizTitle || 'Quiz'}
              </Text>
              <Text style={styles.quizAccuracy}>
                {fmtPercentFromRatio(item?.averageAccuracy)}
              </Text>
            </View>
            <Text style={styles.quizMeta}>
              {item?.quizType || 'Quiz'} • {translateDifficulty(item?.difficulty)}
            </Text>
            <View style={styles.quizMetaGrid}>
              <Text style={styles.quizMetaItem}>Lượt làm: {fmtNumber(item?.totalAttempts)}</Text>
              <Text style={styles.quizMetaItem}>Điểm TB: {fmtScore(item?.averageScore)}</Text>
              <Text style={styles.quizMetaItem}>TB thời gian: {fmtSeconds(item?.averageDurationSeconds)}</Text>
            </View>
            <Text style={styles.quizMetaFoot}>
              Lần gần nhất: {fmtDateTime(item?.latestCompletedAt)}
            </Text>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

function QuestionSurface({
  stats,
}: {
  stats: any;
}) {
  const current = stats?.currentQuestionStats;
  const lifetime = stats?.lifetimeQuestionAttemptStats;
  const totalQuestions = Number(current?.totalWorkspaceQuestions || 0);
  const attemptedQuestions = Number(current?.attemptedQuestionsInMode || 0);
  const gradedQuestions = Number(current?.gradedQuestionsInMode || 0);
  const correctQuestions = Number(current?.correctQuestionsInMode || 0);
  const incorrectQuestions = Number(current?.incorrectQuestionsInMode || 0);
  const pendingQuestions = Number(current?.pendingQuestionsInMode || 0);
  const untouchedQuestions = Math.max(0, totalQuestions - attemptedQuestions);
  const attemptedPercent = pct(attemptedQuestions, totalQuestions);
  const strongestDifficulty = pickQuestionInsightBucket(
    current?.byDifficulty || [],
    'best',
  );
  const weakestDifficulty = pickQuestionInsightBucket(
    current?.byDifficulty || [],
    'worst',
  );
  const currentBloomBuckets = getRenderableBloomBuckets(current?.byBloom || []);
  const lifetimeBloomBuckets = getRenderableBloomBuckets(lifetime?.byBloom || []);

  return (
    <View style={styles.contentStack}>
      <View style={styles.summaryGrid}>
        <StatCard
          icon="target"
          label="Tổng số câu hỏi"
          value={fmtNumber(totalQuestions)}
          accentColor="#2563EB"
          width={cardWidth(2)}
        />
        <StatCard
          icon="check-circle-outline"
          label="Đã làm"
          value={fmtNumber(attemptedQuestions)}
          subValue={`${attemptedPercent}%`}
          accentColor="#10B981"
          width={cardWidth(2)}
        />
        <StatCard
          icon="chart-line"
          label="Độ chính xác"
          value={fmtPercentFromRatio(current?.accuracyInMode)}
          accentColor="#8B5CF6"
          width={cardWidth(2)}
        />
        <StatCard
          icon="book-open-outline"
          label="Đã chấm"
          value={fmtNumber(gradedQuestions)}
          accentColor="#4F46E5"
          width={cardWidth(2)}
        />
        <StatCard
          icon="scale-balance"
          label="Đúng"
          value={fmtNumber(correctQuestions)}
          accentColor="#0F766E"
          width={cardWidth(2)}
        />
        <StatCard
          icon="clock-outline"
          label="Chưa làm"
          value={fmtNumber(untouchedQuestions)}
          accentColor="#64748B"
          width={cardWidth(2)}
        />
      </View>

      <View style={styles.insightGrid}>
        <InsightCard
          title="Điểm mạnh hiện tại"
          value={
            strongestDifficulty
              ? translateDifficulty(strongestDifficulty?.label)
              : 'Chưa đủ dữ liệu'
          }
          description={
            strongestDifficulty
              ? `${fmtPercentFromRatio(strongestDifficulty?.accuracyInMode)} • ${fmtNumber(
                  strongestDifficulty?.attemptedQuestionsInMode,
                )} đã làm`
              : 'Làm thêm quiz để hệ thống xác định thế mạnh chính xác hơn.'
          }
          tone="emerald"
        />
        <InsightCard
          title="Cần ưu tiên ôn lại"
          value={
            weakestDifficulty
              ? translateDifficulty(weakestDifficulty?.label)
              : 'Chưa đủ dữ liệu'
          }
          description={
            weakestDifficulty
              ? `${fmtPercentFromRatio(weakestDifficulty?.accuracyInMode)} • ${fmtNumber(
                  weakestDifficulty?.attemptedQuestionsInMode,
                )} đã làm`
              : 'Chưa có đủ dữ liệu để chỉ ra phần cần ôn lại.'
          }
          tone="amber"
        />
      </View>

      <SectionCard title="Tiến độ">
        <View style={styles.progressPanel}>
          <View style={styles.progressLeft}>
            <AccuracyRing
              accuracy={Number(current?.accuracyInMode || 0)}
              label="Độ chính xác"
              colors={Colors.light}
            />
            <Text style={styles.progressCount}>
              {fmtNumber(attemptedQuestions)} / {fmtNumber(totalQuestions)}
            </Text>
            <Text style={styles.progressBadge}>{attemptedPercent}% Đã làm</Text>
          </View>
          <View style={styles.progressRight}>
            <Text style={styles.progressLabel}>Tiến độ</Text>
            <View style={styles.linearTrack}>
              <View
                style={[
                  styles.linearFill,
                  {width: `${attemptedPercent}%`},
                ]}
              />
            </View>
            <StackedProgress
              correct={correctQuestions}
              incorrect={incorrectQuestions}
              pending={pendingQuestions}
            />
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Thống kê câu hỏi hiện tại"
        subtitle="Dựa trên lần làm gần nhất của mỗi câu hỏi">
        <View style={styles.chartGrid}>
          <SimpleBarList
            title="Hiệu suất theo độ khó"
            buckets={(current?.byDifficulty || []).filter((bucket: any) =>
              DIFFICULTY_ORDER.includes(String(bucket?.label || '').toUpperCase()),
            )}
            bucketType="difficulty"
            getValue={bucket =>
              Number(
                bucket?.correctQuestionsInMode ??
                  bucket?.attemptedQuestionsInMode ??
                  0,
              )
            }
          />
          <SimpleBarList
            title="Hiệu suất theo cấp Bloom"
            buckets={currentBloomBuckets}
            bucketType="bloom"
            getValue={bucket => Math.round(Number(bucket?.accuracyInMode || 0) * 100)}
            showPercent
          />
        </View>
      </SectionCard>

      <SectionCard
        title="Ma trận kỹ năng"
        subtitle="Điểm mạnh và các phần cần cải thiện">
        <View style={styles.metricList}>
          {currentBloomBuckets.length > 0 ? (
            currentBloomBuckets.map((bucket: any, index: number) => {
              const value = Math.round(Number(bucket?.accuracyInMode || 0) * 100);
              return (
                <View key={`${bucket?.label || index}`} style={styles.metricRow}>
                  <View style={styles.metricHeader}>
                    <Text style={styles.metricLabel}>
                      {translateBloom(bucket?.label)}
                    </Text>
                    <Text style={styles.metricValue}>{value}%</Text>
                  </View>
                  <View style={styles.metricTrack}>
                    <View
                      style={[
                        styles.metricFill,
                        {width: `${Math.max(4, value)}%`},
                      ]}
                    />
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyHint}>Chưa đủ dữ liệu Bloom.</Text>
          )}
        </View>
      </SectionCard>

      {lifetime ? (
        <SectionCard
          title="Thống kê tích lũy"
          subtitle="Tổng hợp trên toàn bộ các lần làm câu hỏi">
          <View style={styles.summaryGrid}>
            <StatCard
              icon="counter"
              label="Tổng lượt làm"
              value={fmtNumber(lifetime?.totalQuestionAttempts ?? lifetime?.totalAttempts)}
              accentColor="#4F46E5"
              width={cardWidth(3)}
            />
            <StatCard
              icon="chart-arc"
              label="Độ chính xác tổng thể"
              value={fmtPercentFromRatio(
                lifetime?.accuracy ?? lifetime?.overallAccuracy,
              )}
              accentColor="#10B981"
              width={cardWidth(3)}
            />
            <StatCard
              icon="progress-question"
              label="Chưa chấm"
              value={fmtNumber(lifetime?.pendingQuestionAttempts)}
              accentColor="#F59E0B"
              width={cardWidth(3)}
            />
          </View>

          <View style={styles.chartGrid}>
            <SimpleBarList
              title="Hiệu suất theo độ khó"
              buckets={lifetime?.byDifficulty || []}
              bucketType="difficulty"
              getValue={bucket =>
                Number(
                  bucket?.correctQuestionAttemptsInMode ??
                    bucket?.attemptedQuestionsInMode ??
                    0,
                )
              }
            />
            <SimpleBarList
              title="Hiệu suất theo cấp Bloom"
              buckets={lifetimeBloomBuckets}
              bucketType="bloom"
              getValue={bucket => Math.round(Number(bucket?.accuracyInMode || 0) * 100)}
              showPercent
            />
          </View>
        </SectionCard>
      ) : null}
    </View>
  );
}

function QuizSurface({
  stats,
}: {
  stats: any;
}) {
  const current = stats?.currentQuizStats;
  const lifetime = stats?.lifetimeQuizAttemptStats;
  const bestQuiz = pickQuizInsightItem(lifetime?.byQuiz || [], 'best');
  const worstQuiz = pickQuizInsightItem(lifetime?.byQuiz || [], 'worst');

  return (
    <View style={styles.contentStack}>
      <View style={styles.summaryGrid}>
        <StatCard
          icon="clipboard-text-outline"
          label="Quiz đã làm"
          value={fmtNumber(current?.attemptedQuizzesInMode)}
          accentColor="#2563EB"
          width={cardWidth(2)}
        />
        <StatCard
          icon="counter"
          label="Tổng lượt làm"
          value={fmtNumber(lifetime?.totalQuizAttempts)}
          accentColor="#10B981"
          width={cardWidth(2)}
        />
        <StatCard
          icon="trophy-outline"
          label="Điểm trung bình"
          value={fmtScore(current?.averageScoreInMode)}
          accentColor="#8B5CF6"
          width={cardWidth(2)}
        />
        <StatCard
          icon="chart-line"
          label="Độ chính xác"
          value={fmtPercentFromRatio(current?.averageAccuracyInMode)}
          accentColor="#0F766E"
          width={cardWidth(2)}
        />
        <StatCard
          icon="clock-outline"
          label="TB thời gian"
          value={fmtSeconds(current?.averageDurationSecondsInMode)}
          accentColor="#F59E0B"
          width={cardWidth(2)}
        />
      </View>

      <View style={styles.insightGrid}>
        <InsightCard
          title="Quiz tốt nhất"
          value={bestQuiz?.quizTitle || 'Chưa đủ dữ liệu'}
          description={
            bestQuiz
              ? `${fmtPercentFromRatio(bestQuiz?.averageAccuracy)} • ${fmtScore(
                  bestQuiz?.averageScore,
                )} • ${fmtNumber(bestQuiz?.totalAttempts)} lượt làm`
              : 'Làm thêm quiz để hệ thống nhận diện quiz có hiệu suất cao nhất.'
          }
          tone="emerald"
        />
        <InsightCard
          title="Quiz cần xem lại"
          value={worstQuiz?.quizTitle || 'Chưa đủ dữ liệu'}
          description={
            worstQuiz
              ? `${fmtPercentFromRatio(worstQuiz?.averageAccuracy)} • ${fmtScore(
                  worstQuiz?.averageScore,
                )} • ${fmtNumber(worstQuiz?.totalAttempts)} lượt làm`
              : 'Chưa có đủ dữ liệu để xác định quiz cần ôn lại.'
          }
          tone="amber"
        />
      </View>

      <SectionCard title="Tổng quan hiệu suất quiz">
        <View style={styles.progressPanel}>
          <View style={styles.progressLeft}>
            <AccuracyRing
              accuracy={Number(current?.averageAccuracyInMode || 0)}
              label="Độ chính xác"
              colors={Colors.light}
            />
            <Text style={styles.progressCount}>
              {fmtScore(current?.averageScoreInMode)}
            </Text>
            <Text style={styles.progressBadge}>Điểm trung bình</Text>
          </View>
          <View style={styles.progressRight}>
            <View style={styles.metricStatGrid}>
              <MiniMetric
                label="Tổng lượt làm"
                value={fmtNumber(lifetime?.totalQuizAttempts)}
              />
              <MiniMetric
                label="Quiz hoàn thành"
                value={fmtNumber(lifetime?.distinctCompletedQuizzes)}
              />
              <MiniMetric
                label="TB thời gian"
                value={fmtSeconds(
                  lifetime?.averageDurationSeconds ??
                    current?.averageDurationSecondsInMode,
                )}
              />
            </View>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Hiệu suất quiz hiện tại"
        subtitle="Tổng hợp theo loại quiz và độ khó trong chế độ đang chọn">
        <View style={styles.chartGrid}>
          <SimpleBarList
            title="Theo loại quiz"
            buckets={current?.byQuizType || []}
            bucketType="default"
            getValue={bucket => Math.round(Number(bucket?.averageAccuracy || 0) * 100)}
            showPercent
          />
          <SimpleBarList
            title="Theo độ khó"
            buckets={current?.byDifficulty || []}
            bucketType="difficulty"
            getValue={bucket => Math.round(Number(bucket?.averageAccuracy || 0) * 100)}
            showPercent
          />
        </View>
      </SectionCard>

      {lifetime ? (
        <SectionCard
          title="Thống kê quiz tích lũy"
          subtitle="Dữ liệu gộp trên toàn bộ các lần làm quiz trong workspace">
          <View style={styles.summaryGrid}>
            <StatCard
              icon="counter"
              label="Tổng lượt làm"
              value={fmtNumber(lifetime?.totalQuizAttempts)}
              accentColor="#4F46E5"
              width={cardWidth(3)}
            />
            <StatCard
              icon="chart-line"
              label="Độ chính xác TB"
              value={fmtPercentFromRatio(lifetime?.averageAccuracy)}
              accentColor="#10B981"
              width={cardWidth(3)}
            />
            <StatCard
              icon="trophy-outline"
              label="Điểm TB"
              value={fmtScore(lifetime?.averageScore)}
              accentColor="#8B5CF6"
              width={cardWidth(3)}
            />
          </View>

          <View style={styles.chartGrid}>
            <SimpleBarList
              title="Theo loại quiz"
              buckets={lifetime?.byQuizType || []}
              bucketType="default"
              getValue={bucket => Math.round(Number(bucket?.averageAccuracy || 0) * 100)}
              showPercent
            />
            <SimpleBarList
              title="Theo độ khó"
              buckets={lifetime?.byDifficulty || []}
              bucketType="difficulty"
              getValue={bucket => Math.round(Number(bucket?.averageAccuracy || 0) * 100)}
              showPercent
            />
          </View>

          <QuizListCard items={lifetime?.byQuiz || []} />
        </SectionCard>
      ) : null}
    </View>
  );
}

function MiniMetric({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.miniMetricCard}>
      <Text style={styles.miniMetricLabel}>{label}</Text>
      <Text style={styles.miniMetricValue}>{value}</Text>
    </View>
  );
}

export default function WorkspaceStatisticsPanel({
  workspaceId,
  colors,
}: Props) {
  const [questionStatsByMode, setQuestionStatsByMode] = useState<Record<string, any>>({});
  const [quizStatsByMode, setQuizStatsByMode] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attemptMode, setAttemptMode] = useState('ALL');
  const [surface, setSurface] = useState('QUESTION');

  const fetchQuestionModeStats = useCallback(async (mode: string) => {
    try {
      const response = await WorkspaceAPI.getQuestionStats(workspaceId, mode);
      return extractPayload(response);
    } catch (err: any) {
      if (isNoDataError(err)) {
        return null;
      }
      throw err;
    }
  }, [workspaceId]);

  const fetchQuizModeStats = useCallback(async (mode: string) => {
    try {
      const response = await WorkspaceAPI.getQuizStats(workspaceId, mode);
      return extractPayload(response);
    } catch (err: any) {
      if (isNoDataError(err)) {
        return null;
      }
      throw err;
    }
  }, [workspaceId]);

  const loadAllModes = useCallback(async () => {
    if (!workspaceId) {
      setQuestionStatsByMode({});
      setQuizStatsByMode({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const results = await Promise.all(
        ATTEMPT_MODES.map(async mode => {
          const [questionData, quizData] = await Promise.all([
            fetchQuestionModeStats(mode.value),
            fetchQuizModeStats(mode.value),
          ]);
          return [mode.value, questionData, quizData] as const;
        }),
      );

      const nextQuestionStatsByMode: Record<string, any> = {};
      const nextQuizStatsByMode: Record<string, any> = {};

      results.forEach(([mode, questionData, quizData]) => {
        nextQuestionStatsByMode[mode] = questionData;
        nextQuizStatsByMode[mode] = quizData;
      });

      setQuestionStatsByMode(nextQuestionStatsByMode);
      setQuizStatsByMode(nextQuizStatsByMode);
    } catch (err: any) {
      const apiMsg = String(
        err?.response?.data?.message || err?.response?.data?.error || '',
      );
      setError(apiMsg || err?.message || 'Không thể tải thống kê học tập.');
    } finally {
      setLoading(false);
    }
  }, [fetchQuestionModeStats, fetchQuizModeStats, workspaceId]);

  useEffect(() => {
    loadAllModes();
  }, [loadAllModes]);

  const surfaceHasData = useCallback(
    (modeValue: string, surfaceValue: string) =>
      surfaceValue === 'QUIZ'
        ? hasQuizStatsData(quizStatsByMode[modeValue])
        : hasQuestionStatsData(questionStatsByMode[modeValue]),
    [questionStatsByMode, quizStatsByMode],
  );

  const availableModes = useMemo(() => {
    const activeModes = ATTEMPT_MODES.filter(mode =>
      surfaceHasData(mode.value, surface),
    );
    if (activeModes.length > 0) {
      return activeModes;
    }
    return ATTEMPT_MODES.filter(
      mode =>
        surfaceHasData(mode.value, 'QUESTION') ||
        surfaceHasData(mode.value, 'QUIZ'),
    );
  }, [surface, surfaceHasData]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const surfaceHasAnyData =
      surface === 'QUIZ'
        ? ATTEMPT_MODES.some(mode => hasQuizStatsData(quizStatsByMode[mode.value]))
        : ATTEMPT_MODES.some(mode =>
            hasQuestionStatsData(questionStatsByMode[mode.value]),
          );

    if (!surfaceHasAnyData) {
      const canUseQuiz = ATTEMPT_MODES.some(mode =>
        hasQuizStatsData(quizStatsByMode[mode.value]),
      );
      const canUseQuestion = ATTEMPT_MODES.some(mode =>
        hasQuestionStatsData(questionStatsByMode[mode.value]),
      );

      if (surface === 'QUESTION' && canUseQuiz) {
        setSurface('QUIZ');
        return;
      }
      if (surface === 'QUIZ' && canUseQuestion) {
        setSurface('QUESTION');
        return;
      }
    }

    if (availableModes.length === 0) {
      setAttemptMode('ALL');
      return;
    }

    if (!availableModes.some(mode => mode.value === attemptMode)) {
      const fallback = availableModes.find(mode => mode.value === 'ALL') || availableModes[0];
      setAttemptMode(fallback.value);
    }
  }, [attemptMode, availableModes, loading, questionStatsByMode, quizStatsByMode, surface]);

  const questionStats = questionStatsByMode[attemptMode] || null;
  const quizStats = quizStatsByMode[attemptMode] || null;
  const hasCurrentSurfaceData =
    surface === 'QUIZ'
      ? hasQuizStatsData(quizStats)
      : hasQuestionStatsData(questionStats);
  const currentWorkspaceName =
    questionStats?.workspaceName || quizStats?.workspaceName || 'Workspace';

  if (loading) {
    return (
      <View style={styles.stateCard}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={[styles.stateText, {color: colors.textSecondary}]}>
          Đang tải thống kê học tập...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.stateCard}>
        <Icon name="alert-circle-outline" size={28} color={Colors.error} />
        <Text style={[styles.stateText, {color: colors.textSecondary}]}>
          {error}
        </Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={loadAllModes}
          style={styles.retryButton}>
          <Icon name="refresh" size={16} color="#FFFFFF" />
          <Text style={styles.retryButtonText}>Tải lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.heroCard}>
        <View style={styles.heroIconWrap}>
          <Icon
            name={
              surface === 'QUIZ'
                ? 'clipboard-text-outline'
                : 'chart-box-outline'
            }
            size={24}
            color={Colors.primary}
          />
        </View>
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>Thống kê học tập</Text>
          <Text style={styles.heroWorkspace}>{currentWorkspaceName}</Text>
          <Text style={styles.heroDescription}>
            {
              SURFACES.find(item => item.value === surface)?.description
            }
          </Text>
        </View>
      </View>

      <SurfaceSwitcher surface={surface} onChange={setSurface} />
      <SegmentedControl
        items={availableModes.map(mode => ({
          value: mode.value,
          label: mode.label,
        }))}
        value={attemptMode}
        onChange={setAttemptMode}
      />

      {!hasCurrentSurfaceData ? (
        <View style={styles.stateCard}>
          <Icon name="chart-box-outline" size={28} color="#94A3B8" />
          <Text style={[styles.stateText, {color: colors.textSecondary}]}>
            {surface === 'QUIZ'
              ? 'Chưa có dữ liệu thống kê theo quiz trong chế độ này.'
              : 'Chưa có dữ liệu thống kê theo câu hỏi trong chế độ này.'}
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={loadAllModes}
            style={styles.retryButton}>
            <Icon name="refresh" size={16} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>Tải lại</Text>
          </TouchableOpacity>
        </View>
      ) : surface === 'QUIZ' ? (
        <QuizSurface stats={quizStats} />
      ) : (
        <QuestionSurface stats={questionStats} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: Spacing.md,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#FFFFFF',
    padding: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.md,
  },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroWorkspace: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  heroDescription: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: '#64748B',
  },
  surfaceGrid: {
    gap: Spacing.sm,
  },
  surfaceCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.md,
  },
  surfaceCardActive: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  surfaceCardInactive: {
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  surfaceIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  surfaceIconActive: {
    backgroundColor: '#DBEAFE',
  },
  surfaceContent: {
    flex: 1,
  },
  surfaceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  surfaceDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  contentStack: {
    gap: Spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    overflow: 'hidden',
  },
  statTopBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 4,
  },
  statIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  statValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  statSubValue: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  insightGrid: {
    gap: Spacing.sm,
  },
  insightCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: Spacing.md,
  },
  insightTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  insightValue: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  insightDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
  },
  sectionCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
  },
  sectionBody: {
    marginTop: Spacing.md,
  },
  progressPanel: {
    gap: Spacing.md,
  },
  progressLeft: {
    alignItems: 'center',
  },
  progressRight: {
    flex: 1,
  },
  progressCount: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  progressBadge: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  progressLabel: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  linearTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  linearFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  ringSvg: {
    transform: [{rotate: '-90deg'}],
  },
  ringContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  ringLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
  },
  stackedBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  stackedGreen: {
    backgroundColor: Colors.success,
    height: '100%',
  },
  stackedRed: {
    backgroundColor: Colors.error,
    height: '100%',
  },
  stackedAmber: {
    backgroundColor: Colors.warning,
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  chartGrid: {
    gap: Spacing.md,
  },
  metricList: {
    gap: Spacing.sm,
  },
  metricRow: {
    gap: 6,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  metricTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  metricFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  emptyHint: {
    fontSize: 12,
    color: '#64748B',
  },
  metricStatGrid: {
    gap: Spacing.sm,
  },
  miniMetricCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: Spacing.md,
  },
  miniMetricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  miniMetricValue: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  quizTableWrap: {
    gap: Spacing.sm,
  },
  quizRow: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: Spacing.md,
  },
  quizRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  quizName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  quizAccuracy: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },
  quizMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
  },
  quizMetaGrid: {
    gap: 4,
    marginTop: 10,
  },
  quizMetaItem: {
    fontSize: 12,
    color: '#334155',
  },
  quizMetaFoot: {
    marginTop: 8,
    fontSize: 11,
    color: '#64748B',
  },
  stateCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  stateText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 4,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
