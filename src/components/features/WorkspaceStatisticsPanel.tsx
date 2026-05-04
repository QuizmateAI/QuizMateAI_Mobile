import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {BorderRadius, Spacing} from '../../theme/spacing';
import {Colors} from '../../theme/colors';
import WorkspaceAPI from '../../api/WorkspaceAPI';
import {useTheme} from '../../context/ThemeContext';

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
// Match FE ordering for consistent radar/bar charts.
const BLOOM_ORDER = ['ANALYZE', 'UNDERSTAND', 'REMEMBER', 'EVALUATE', 'APPLY'];

const BLOOM_COLORS: Record<string, {main: string}> = {
  REMEMBER: {main: '#6366f1'},
  UNDERSTAND: {main: '#06b6d4'},
  APPLY: {main: '#22c55e'},
  ANALYZE: {main: '#f59e0b'},
  EVALUATE: {main: '#ef4444'},
};

const NARROW_SCREEN_WIDTH = 360;
const MEDIUM_SCREEN_WIDTH = 420;

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

function getResponsiveColumns(windowWidth: number, preferredColumns: number) {
  if (preferredColumns <= 1) {
    return 1;
  }

  if (preferredColumns === 2) {
    return windowWidth >= NARROW_SCREEN_WIDTH ? 2 : 1;
  }

  if (windowWidth >= MEDIUM_SCREEN_WIDTH) {
    return 3;
  }

  if (windowWidth >= NARROW_SCREEN_WIDTH) {
    return 2;
  }

  return 1;
}

function cardWidth(windowWidth: number, columns: number) {
  const horizontal = Spacing.lg * 2;
  const gaps = Spacing.sm * (columns - 1);
  return Math.max(0, (windowWidth - horizontal - gaps) / columns);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function chartInnerWidth(windowWidth: number) {
  // Match the screen's horizontal padding and the section card's inner padding.
  return Math.max(0, windowWidth - Spacing.lg * 2 - Spacing.md * 2);
}

function DonutChart({
  segments,
  size = 180,
  strokeWidth = 18,
  trackColor,
}: {
  segments: Array<{label: string; value: number; color: string}>;
  size?: number;
  strokeWidth?: number;
  trackColor: string;
}) {
  const total = segments.reduce((sum, seg) => sum + Math.max(0, Number(seg.value || 0)), 0);
  if (total <= 0) {
    return null;
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <Svg width={size} height={size} style={styles.ringSvg}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {segments
        .filter(seg => Number(seg.value || 0) > 0)
        .map((seg, index) => {
          const value = Math.max(0, Number(seg.value || 0));
          const length = (value / total) * circumference;
          const dasharray = `${length} ${Math.max(0, circumference - length)}`;
          const dashoffset = -cumulative;
          cumulative += length;
          return (
            <Circle
              key={`${seg.label}:${index}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
              strokeLinecap="butt"
            />
          );
        })}
    </Svg>
  );
}

function DifficultyGroupedBarChart({
  buckets,
  isLifetime = false,
  colors: passedColors,
}: {
  buckets: any[];
  isLifetime?: boolean;
  colors?: any;
}) {
  const {colors: themeColors} = useTheme();
  const {width: windowWidth} = useWindowDimensions();
  const colors = passedColors || themeColors;

  if (!Array.isArray(buckets) || buckets.length === 0) {
    return null;
  }

  const ordered = DIFFICULTY_ORDER.map(key =>
    (buckets || []).find(bucket => String(bucket?.label || '').toUpperCase() === key),
  )
    .filter(Boolean)
    .filter(bucket => String(bucket?.label || '').toUpperCase() !== 'UNSPECIFIED');

  if (ordered.length === 0) {
    return null;
  }

  const data = ordered.map(bucket => {
    const correct = isLifetime
      ? Number(bucket?.correctQuestionAttemptsInMode || 0)
      : Number(bucket?.correctQuestionsInMode || 0);
    const incorrect = isLifetime
      ? Number(bucket?.incorrectQuestionAttemptsInMode || 0)
      : Number(bucket?.incorrectQuestionsInMode || 0);
    return {
      label: translateDifficulty(bucket?.label),
      correct,
      incorrect,
    };
  });

  const width = chartInnerWidth(windowWidth);
  const height = 210;
  const margin = {top: 14, right: 10, bottom: 34, left: 28};
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(
    1,
    ...data.flatMap(item => [Number(item.correct || 0), Number(item.incorrect || 0)]),
  );

  const band = plotWidth / data.length;
  const gap = Math.max(4, band * 0.08);
  const barWidth = Math.max(10, (band - gap) / 2.2);

  const gridLines = 4;
  const axisColor = colors.textSecondary;
  const gridColor = colors.borderLight || colors.border;

  return (
    <View style={{width: '100%'}}>
      <Svg width={width} height={height}>
        <G>
          {Array.from({length: gridLines}).map((_, index) => {
            const y =
              margin.top +
              (plotHeight * index) / (gridLines - 1);
            return (
              <Line
                key={`grid-${index}`}
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                stroke={gridColor}
                strokeWidth={1}
              />
            );
          })}

          {data.map((item, index) => {
            const baseX = margin.left + index * band + (band - (barWidth * 2 + gap)) / 2;
            const correctHeight = (Number(item.correct || 0) / maxValue) * plotHeight;
            const incorrectHeight = (Number(item.incorrect || 0) / maxValue) * plotHeight;
            const correctY = margin.top + (plotHeight - correctHeight);
            const incorrectY = margin.top + (plotHeight - incorrectHeight);

            return (
              <G key={`bar-${item.label}:${index}`}>
                <Rect
                  x={baseX}
                  y={correctY}
                  width={barWidth}
                  height={correctHeight}
                  rx={4}
                  fill="#22c55e"
                />
                <Rect
                  x={baseX + barWidth + gap}
                  y={incorrectY}
                  width={barWidth}
                  height={incorrectHeight}
                  rx={4}
                  fill="#ef4444"
                />
                <SvgText
                  x={margin.left + index * band + band / 2}
                  y={height - 14}
                  fontSize={10}
                  fontWeight="600"
                  fill={axisColor}
                  textAnchor="middle">
                  {item.label}
                </SvgText>
              </G>
            );
          })}

          <SvgText
            x={margin.left}
            y={12}
            fontSize={10}
            fontWeight="600"
            fill={axisColor}>
            Đúng
          </SvgText>
          <SvgText
            x={margin.left + 32}
            y={12}
            fontSize={10}
            fontWeight="600"
            fill={axisColor}>
            / Sai
          </SvgText>
        </G>
      </Svg>
    </View>
  );
}

function HorizontalPercentBarChart({
  rows,
  colors: passedColors,
}: {
  rows: Array<{label: string; value: number; fill: string}>;
  colors?: any;
}) {
  const {colors: themeColors} = useTheme();
  const {width: windowWidth} = useWindowDimensions();
  const colors = passedColors || themeColors;

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const width = chartInnerWidth(windowWidth);
  const rowHeight = 52;
  const height = Math.max(200, rows.length * rowHeight + 52);
  const outerPadding = 14;
  const margin = {
    top: 14,
    bottom: 30,
  };
  const plotLeft = outerPadding;
  const plotWidth = Math.max(0, width - outerPadding * 2);
  const plotHeight = height - margin.top - margin.bottom;
  const barHeight = 14;
  const ticks = [0, 25, 50, 75, 100];
  const axisColor = colors.textSecondary;
  const gridColor = colors.borderLight || colors.border;

  return (
    <Svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMinYMin meet">
      <G>
        {ticks.map(tick => {
          const x = plotLeft + (tick / 100) * plotWidth;
          const tickAnchor = tick === 0 ? 'start' : tick === 100 ? 'end' : 'middle';
          return (
            <G key={`tick-${tick}`}>
              <Line
                x1={x}
                x2={x}
                y1={margin.top}
                y2={margin.top + plotHeight}
                stroke={gridColor}
                strokeWidth={1}
              />
              <SvgText
                x={x}
                y={height - 8}
                fontSize={10}
                fontWeight="600"
                fill={axisColor}
                textAnchor={tickAnchor}>
                {tick}
              </SvgText>
            </G>
          );
        })}

        {rows.map((row, index) => {
          const value = clamp(Number(row.value || 0), 0, 100);
          const y = margin.top + index * rowHeight;
          const headerY = y + 14;
          const barY = y + 22;
          const barWidth = (value / 100) * plotWidth;
          return (
            <G key={`row-${row.label}:${index}`}>
              <SvgText
                x={outerPadding}
                y={headerY}
                fontSize={11}
                fontWeight="700"
                fill={axisColor}
                textAnchor="start">
                {row.label}
              </SvgText>

              <SvgText
                x={width - outerPadding}
                y={headerY}
                fontSize={11}
                fontWeight="700"
                fill={axisColor}
                textAnchor="end">
                {value}%
              </SvgText>

              <Rect
                x={plotLeft}
                y={barY}
                width={plotWidth}
                height={barHeight}
                rx={6}
                fill={colors.borderLight || colors.border}
              />
              <Rect
                x={plotLeft}
                y={barY}
                width={Math.max(4, barWidth)}
                height={barHeight}
                rx={6}
                fill={row.fill}
              />
            </G>
          );
        })}
      </G>
    </Svg>
  );
}

function BloomAccuracyBarChart({
  buckets,
  colors: passedColors,
}: {
  buckets: any[];
  colors?: any;
}) {
  const rows = getRenderableBloomBuckets(buckets).map((bucket: any) => {
    const key = String(bucket?.label || '').toUpperCase();
    return {
      label: translateBloom(bucket?.label),
      value: clamp(Math.round(Number(bucket?.accuracyInMode || 0) * 100), 0, 100),
      fill: BLOOM_COLORS[key]?.main || Colors.primary,
    };
  });

  if (rows.length === 0) {
    return null;
  }

  return (
    <HorizontalPercentBarChart
      rows={rows}
      colors={passedColors}
    />
  );
}

function BloomRadarCard({
  buckets,
  colors: passedColors,
}: {
  buckets: any[];
  colors?: any;
}) {
  const {colors: themeColors} = useTheme();
  const {width: windowWidth} = useWindowDimensions();
  const colors = passedColors || themeColors;
  const rows = getRenderableBloomBuckets(buckets);

  if (rows.length < 3) {
    return null;
  }

  const width = chartInnerWidth(windowWidth);
  const height = 300;
  const cx = width / 2;
  const cy = height / 2 + 6;
  const radius = Math.min(width, height) * 0.33;
  const levels = 4;
  const angleStep = (2 * Math.PI) / rows.length;

  const points = rows.map((bucket: any, index: number) => {
    const value = clamp(Math.round(Number(bucket?.accuracyInMode || 0) * 100), 0, 100);
    const angle = -Math.PI / 2 + index * angleStep;
    const r = (value / 100) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      label: translateBloom(bucket?.label),
      value,
      angle,
    };
  });

  const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');
  const axisColor = colors.textSecondary;
  const gridColor = colors.borderLight || colors.border;

  return (
    <SectionCard
      title="Ma trận kỹ năng"
      subtitle="Tổng hợp độ chính xác theo cấp Bloom"
      colors={colors}>
      <Svg width={width} height={height}>
        <G>
          {Array.from({length: levels}).map((_, levelIndex) => {
            const ratio = (levelIndex + 1) / levels;
            const ringPoints = points
              .map(p => {
                const r = radius * ratio;
                const x = cx + r * Math.cos(p.angle);
                const y = cy + r * Math.sin(p.angle);
                return `${x},${y}`;
              })
              .join(' ');
            return (
              <Polygon
                key={`ring-${levelIndex}`}
                points={ringPoints}
                fill="none"
                stroke={gridColor}
                strokeWidth={1}
              />
            );
          })}

          {points.map((p, index) => (
            <Line
              key={`axis-${index}`}
              x1={cx}
              y1={cy}
              x2={cx + radius * Math.cos(p.angle)}
              y2={cy + radius * Math.sin(p.angle)}
              stroke={gridColor}
              strokeWidth={1}
            />
          ))}

          <Polygon
            points={polygonPoints}
            fill="#3b82f6"
            fillOpacity={0.22}
            stroke="#3b82f6"
            strokeWidth={2}
          />

          {points.map((p, index) => (
            <Circle
              key={`dot-${index}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="#3b82f6"
            />
          ))}

          {points.map((p, index) => {
            const labelRadius = radius + 18;
            const lx = cx + labelRadius * Math.cos(p.angle);
            const ly = cy + labelRadius * Math.sin(p.angle);
            const anchor = Math.abs(Math.cos(p.angle)) < 0.2
              ? 'middle'
              : Math.cos(p.angle) > 0
              ? 'start'
              : 'end';
            return (
              <SvgText
                key={`label-${index}`}
                x={lx}
                y={ly}
                fontSize={10}
                fontWeight="600"
                fill={axisColor}
                textAnchor={anchor}>
                {p.label}
              </SvgText>
            );
          })}
        </G>
      </Svg>
    </SectionCard>
  );
}

function MetricAverageBarList({
  buckets,
  title,
  bucketType,
  colors: passedColors,
}: {
  buckets: any[];
  title: string;
  bucketType: 'difficulty' | 'default';
  colors?: any;
}) {
  const {colors: themeColors} = useTheme();
  const colors = passedColors || themeColors;
  if (!Array.isArray(buckets) || buckets.length === 0) {
    return null;
  }

  const rows = buckets
    .filter(bucket => Number(bucket?.distinctQuizCount || bucket?.totalQuizAttempts || 0) > 0)
    .map(bucket => ({
      label:
        bucketType === 'difficulty'
          ? translateDifficulty(bucket?.label)
          : String(bucket?.label || 'Không rõ'),
      accuracy: clamp(Math.round(Number(bucket?.averageAccuracy || 0) * 100), 0, 100),
    }))
    .filter(row => row.accuracy > 0);

  if (rows.length === 0) {
    return null;
  }

  return (
    <SectionCard title={title} colors={colors}>
      <HorizontalPercentBarChart
        rows={rows.map(row => ({
          label: row.label,
          value: row.accuracy,
          fill: Colors.primary,
        }))}
        colors={colors}
        labelWidth={130}
      />
    </SectionCard>
  );
}

function AccuracyRing({
  accuracy,
  label,
  colors: passedColors,
  size = 118,
}: {
  accuracy: number;
  label: string;
  colors?: any;
  size?: number;
}) {
  const {colors: themeColors} = useTheme();
  const colors = passedColors || themeColors;
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
          stroke={colors.borderLight || colors.border || '#E2E8F0'}
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
  colors: passedColors,
}: {
  items: Array<{value: string; label: string}>;
  value: string;
  onChange: (next: string) => void;
  colors?: any;
}) {
  const {colors: themeColors} = useTheme();
  const colors = passedColors || themeColors;

  return (
    <View
      style={[
        styles.segmentWrap,
        {backgroundColor: colors.surface, borderColor: colors.border},
      ]}>
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
                {color: active ? '#FFFFFF' : colors.textSecondary},
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
  colors: passedColors,
}: {
  surface: string;
  onChange: (next: string) => void;
  colors?: any;
}) {
  const {colors: themeColors} = useTheme();
  const colors = passedColors || themeColors;
  const isDarkTheme =
    colors.background === Colors.dark.background ||
    colors.surface === Colors.dark.surface;

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
              {
                backgroundColor: active
                  ? isDarkTheme
                    ? 'rgba(37, 99, 235, 0.18)'
                    : Colors.primaryLight
                  : colors.surface,
                borderColor: active ? Colors.primary : colors.border,
              },
            ]}>
            <View
              style={[
                styles.surfaceIcon,
                {
                  backgroundColor: active
                    ? `${Colors.primary}18`
                    : colors.surfaceVariant,
                },
              ]}>
              <Icon
                name={item.icon}
                size={20}
                color={active ? Colors.primary : colors.textSecondary}
              />
            </View>
            <View style={styles.surfaceContent}>
              <Text style={[styles.surfaceTitle, {color: colors.heading}]}>
                {item.title}
              </Text>
              <Text
                style={[
                  styles.surfaceDescription,
                  {color: colors.textSecondary},
                ]}>
                {item.description}
              </Text>
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
  colors: passedColors,
}: {
  icon: string;
  label: string;
  value: string;
  subValue?: string;
  accentColor: string;
  width?: number | string;
  colors?: any;
}) {
  const {colors: themeColors} = useTheme();
  const colors = passedColors || themeColors;

  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        width == null ? null : {width},
      ]}>
      <View style={[styles.statTopBar, {backgroundColor: accentColor}]} />
      <View style={[styles.statIconWrap, {backgroundColor: `${accentColor}15`}]}>
        <Icon name={icon} size={18} color={accentColor} />
      </View>
      <Text style={[styles.statLabel, {color: colors.textSecondary}]}>
        {label}
      </Text>
      <Text style={[styles.statValue, {color: colors.heading}]}>{value}</Text>
      {subValue ? (
        <Text style={[styles.statSubValue, {color: colors.textTertiary}]}>
          {subValue}
        </Text>
      ) : null}
    </View>
  );
}

function InsightCard({
  title,
  value,
  description,
  tone,
  colors: passedColors,
}: {
  title: string;
  value: string;
  description: string;
  tone: 'emerald' | 'amber';
  colors?: any;
}) {
  const {colors: themeColors} = useTheme();
  const colors = passedColors || themeColors;
  const isDarkTheme =
    colors.background === Colors.dark.background ||
    colors.surface === Colors.dark.surface;
  const palette =
    tone === 'emerald'
      ? isDarkTheme
        ? {bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.32)', title: '#6EE7B7'}
        : {bg: '#ECFDF5', border: '#A7F3D0', title: '#065F46'}
      : isDarkTheme
      ? {bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.32)', title: '#FCD34D'}
      : {bg: '#FFFBEB', border: '#FDE68A', title: '#92400E'};

  return (
    <View
      style={[
        styles.insightCard,
        {backgroundColor: palette.bg, borderColor: palette.border},
      ]}>
      <Text style={[styles.insightTitle, {color: palette.title}]}>{title}</Text>
      <Text style={[styles.insightValue, {color: colors.heading}]}>{value}</Text>
      <Text style={[styles.insightDescription, {color: colors.textSecondary}]}>
        {description}
      </Text>
    </View>
  );
}

function WelcomeCard({
  colors: passedColors,
  onDismiss,
}: {
  colors?: any;
  onDismiss: () => void;
}) {
  const {colors: themeColors} = useTheme();
  const colors = passedColors || themeColors;
  const isDarkTheme =
    colors.background === Colors.dark.background ||
    colors.surface === Colors.dark.surface;

  return (
    <View
      style={[
        styles.welcomeCard,
        {
          backgroundColor: isDarkTheme
            ? 'rgba(37, 99, 235, 0.10)'
            : 'rgba(219, 234, 254, 0.55)',
          borderColor: isDarkTheme
            ? 'rgba(30, 64, 175, 0.55)'
            : '#BFDBFE',
        },
      ]}>
      <View style={styles.welcomeHeader}>
        <View
          style={[
            styles.welcomeIcon,
            {
              backgroundColor: isDarkTheme
                ? 'rgba(30, 64, 175, 0.45)'
                : '#DBEAFE',
            },
          ]}>
          <Icon name="information-outline" size={18} color={Colors.primary} />
        </View>
        <View style={styles.welcomeContent}>
          <Text style={[styles.welcomeTitle, {color: colors.heading}]}>
            Mẹo: làm thêm quiz để dashboard chính xác hơn
          </Text>
          <Text style={[styles.welcomeDesc, {color: colors.textSecondary}]}>
            Khi bạn có nhiều lượt làm hơn, hệ thống sẽ xác định điểm mạnh/yếu và biểu đồ Bloom rõ ràng hơn.
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onDismiss}
          style={styles.welcomeClose}>
          <Icon name="close" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  colors: passedColors,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  colors?: any;
}) {
  const {colors: themeColors} = useTheme();
  const colors = passedColors || themeColors;

  return (
    <View
      style={[
        styles.sectionCard,
        {backgroundColor: colors.surface, borderColor: colors.border},
      ]}>
      <Text style={[styles.sectionTitle, {color: colors.heading}]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.sectionSubtitle, {color: colors.textSecondary}]}>
          {subtitle}
        </Text>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function QuizListCard({items, colors: passedColors}: {items: any[]; colors?: any}) {
  const {colors: themeColors} = useTheme();
  const colors = passedColors || themeColors;

  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return (
    <SectionCard
      title="Bảng hiệu suất theo quiz"
      subtitle="Tổng hợp số lần làm, độ chính xác và thời gian trung bình của từng quiz"
      colors={colors}>
      <View style={styles.quizTableWrap}>
        {items.map((item, index) => (
          <View
            key={`${item?.quizId || index}:${item?.quizTitle || 'quiz'}`}
            style={[
              styles.quizRow,
              {backgroundColor: colors.surfaceVariant, borderColor: colors.border},
            ]}>
            <View style={styles.quizRowHeader}>
              <Text
                style={[styles.quizName, {color: colors.heading}]}
                numberOfLines={1}>
                {item?.quizTitle || 'Quiz'}
              </Text>
              <Text style={styles.quizAccuracy}>
                {fmtPercentFromRatio(item?.averageAccuracy)}
              </Text>
            </View>
            <Text style={[styles.quizMeta, {color: colors.textSecondary}]}>
              {item?.quizType || 'Quiz'} • {translateDifficulty(item?.difficulty)}
            </Text>
            <View style={styles.quizMetaGrid}>
              <Text style={[styles.quizMetaItem, {color: colors.text}]}>
                Lượt làm: {fmtNumber(item?.totalAttempts)}
              </Text>
              <Text style={[styles.quizMetaItem, {color: colors.text}]}>
                Điểm TB: {fmtScore(item?.averageScore)}
              </Text>
              <Text style={[styles.quizMetaItem, {color: colors.text}]}>
                TB thời gian: {fmtSeconds(item?.averageDurationSeconds)}
              </Text>
            </View>
            <Text style={[styles.quizMetaFoot, {color: colors.textTertiary}]}>
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
  const {colors} = useTheme();
  const {width: windowWidth} = useWindowDimensions();
  const current = stats?.currentQuestionStats;
  const lifetime = stats?.lifetimeQuestionAttemptStats;
  const summaryColumns = getResponsiveColumns(windowWidth, 2);
  const lifetimeColumns = getResponsiveColumns(windowWidth, 3);
  const summaryCardWidth = cardWidth(windowWidth, summaryColumns);
  const lifetimeCardWidth = cardWidth(windowWidth, lifetimeColumns);
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

  return (
    <View style={styles.contentStack}>
      <View style={styles.summaryGrid}>
        <StatCard
          icon="target"
          label="Tổng số câu hỏi"
          value={fmtNumber(totalQuestions)}
          accentColor="#2563EB"
          width={summaryCardWidth}
        />
        <StatCard
          icon="check-circle-outline"
          label="Đã làm"
          value={fmtNumber(attemptedQuestions)}
          subValue={`${attemptedPercent}%`}
          accentColor="#10B981"
          width={summaryCardWidth}
        />
        <StatCard
          icon="chart-line"
          label="Độ chính xác"
          value={fmtPercentFromRatio(current?.accuracyInMode)}
          accentColor="#8B5CF6"
          width={summaryCardWidth}
        />
        <StatCard
          icon="book-open-outline"
          label="Đã chấm"
          value={fmtNumber(gradedQuestions)}
          accentColor="#4F46E5"
          width={summaryCardWidth}
        />
        <StatCard
          icon="scale-balance"
          label="Đúng"
          value={fmtNumber(correctQuestions)}
          accentColor="#0F766E"
          width={summaryCardWidth}
        />
        <StatCard
          icon="clock-outline"
          label="Chưa làm"
          value={fmtNumber(untouchedQuestions)}
          accentColor="#64748B"
          width={summaryCardWidth}
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
              colors={colors}
            />
            <Text style={[styles.progressCount, {color: colors.heading}]}>
              {fmtNumber(attemptedQuestions)} / {fmtNumber(totalQuestions)}
            </Text>
            <Text style={styles.progressBadge}>{attemptedPercent}% Đã làm</Text>
          </View>
          <View style={styles.progressRight}>
            <Text style={[styles.progressLabel, {color: colors.textSecondary}]}>
              Tiến độ
            </Text>
            <View
              style={[
                styles.linearTrack,
                {backgroundColor: colors.borderLight || colors.border},
              ]}>
              <View
                style={[
                  styles.linearFill,
                  {width: `${attemptedPercent}%`},
                ]}
              />
            </View>
            <View style={{alignItems: 'center'}}>
              <DonutChart
                segments={[
                  {label: 'Đúng', value: correctQuestions, color: '#22c55e'},
                  {label: 'Sai', value: incorrectQuestions, color: '#ef4444'},
                  ...(pendingQuestions > 0
                    ? [{label: 'Chưa chấm', value: pendingQuestions, color: '#f59e0b'}]
                    : []),
                ]}
                size={180}
                strokeWidth={18}
                trackColor={colors.borderLight || colors.border}
              />
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    {backgroundColor: Colors.success},
                  ]}
                />
                <Text style={[styles.legendText, {color: colors.textSecondary}]}>
                  Đúng ({fmtNumber(correctQuestions)})
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    {backgroundColor: Colors.error},
                  ]}
                />
                <Text style={[styles.legendText, {color: colors.textSecondary}]}>
                  Sai ({fmtNumber(incorrectQuestions)})
                </Text>
              </View>
              {pendingQuestions > 0 ? (
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      {backgroundColor: Colors.warning},
                    ]}
                  />
                  <Text
                    style={[styles.legendText, {color: colors.textSecondary}]}>
                    Chưa chấm ({fmtNumber(pendingQuestions)})
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Thống kê câu hỏi hiện tại"
        subtitle="Dựa trên lần làm gần nhất của mỗi câu hỏi">
        <View style={styles.chartGrid}>
          <SectionCard title="Hiệu suất theo độ khó" colors={colors}>
            <DifficultyGroupedBarChart
              buckets={current?.byDifficulty || []}
              colors={colors}
            />
          </SectionCard>
          <SectionCard title="Hiệu suất theo cấp Bloom" colors={colors}>
            <BloomAccuracyBarChart buckets={current?.byBloom || []} colors={colors} />
          </SectionCard>
        </View>
      </SectionCard>

      <BloomRadarCard buckets={current?.byBloom || []} colors={colors} />

      {lifetime ? (
        <SectionCard
          title="Thống kê tích lũy"
          subtitle="Tổng hợp trên toàn bộ các lần làm câu hỏi">
          <View style={styles.forcedTwoColGrid}>
            <View style={styles.forcedTwoColItem}>
              <StatCard
                icon="counter"
                label="Tổng lượt làm"
                value={fmtNumber(
                  lifetime?.totalQuestionAttempts ?? lifetime?.totalAttempts,
                )}
                accentColor="#4F46E5"
              />
            </View>
            <View style={styles.forcedTwoColItem}>
              <StatCard
                icon="chart-arc"
                label="Độ chính xác tổng thể"
                value={fmtPercentFromRatio(
                  lifetime?.accuracy ?? lifetime?.overallAccuracy,
                )}
                accentColor="#10B981"
              />
            </View>

            <View style={styles.forcedTwoColCenterRow}>
              <View style={styles.forcedTwoColItem}>
                <StatCard
                  icon="progress-question"
                  label="Chưa chấm"
                  value={fmtNumber(lifetime?.pendingQuestionAttempts)}
                  accentColor="#F59E0B"
                />
              </View>
            </View>
          </View>

          <View style={styles.chartGrid}>
            <SectionCard title="Hiệu suất theo độ khó" colors={colors}>
              <DifficultyGroupedBarChart
                buckets={lifetime?.byDifficulty || []}
                isLifetime
                colors={colors}
              />
            </SectionCard>
            <SectionCard title="Hiệu suất theo cấp Bloom" colors={colors}>
              <BloomAccuracyBarChart buckets={lifetime?.byBloom || []} colors={colors} />
            </SectionCard>
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
  const {colors} = useTheme();
  const {width: windowWidth} = useWindowDimensions();
  const current = stats?.currentQuizStats;
  const lifetime = stats?.lifetimeQuizAttemptStats;
  const summaryColumns = getResponsiveColumns(windowWidth, 2);
  const lifetimeColumns = getResponsiveColumns(windowWidth, 3);
  const summaryCardWidth = cardWidth(windowWidth, summaryColumns);
  const lifetimeCardWidth = cardWidth(windowWidth, lifetimeColumns);
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
          width={summaryCardWidth}
        />
        <StatCard
          icon="counter"
          label="Tổng lượt làm"
          value={fmtNumber(lifetime?.totalQuizAttempts)}
          accentColor="#10B981"
          width={summaryCardWidth}
        />
        <StatCard
          icon="trophy-outline"
          label="Điểm trung bình"
          value={fmtScore(current?.averageScoreInMode)}
          accentColor="#8B5CF6"
          width={summaryCardWidth}
        />
        <StatCard
          icon="chart-line"
          label="Độ chính xác"
          value={fmtPercentFromRatio(current?.averageAccuracyInMode)}
          accentColor="#0F766E"
          width={summaryCardWidth}
        />
        <StatCard
          icon="clock-outline"
          label="TB thời gian"
          value={fmtSeconds(current?.averageDurationSecondsInMode)}
          accentColor="#F59E0B"
          width={summaryCardWidth}
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
              colors={colors}
            />
            <Text style={[styles.progressCount, {color: colors.heading}]}>
              {fmtScore(current?.averageScoreInMode)}
            </Text>
            <Text style={styles.progressBadge}>Điểm trung bình</Text>
          </View>
          <View style={styles.progressRight}>
            <View style={styles.metricStatGrid}>
              <MiniMetric
                label="Tổng lượt làm"
                value={fmtNumber(lifetime?.totalQuizAttempts)}
                colors={colors}
              />
              <MiniMetric
                label="Quiz hoàn thành"
                value={fmtNumber(lifetime?.distinctCompletedQuizzes)}
                colors={colors}
              />
              <MiniMetric
                label="TB thời gian"
                value={fmtSeconds(
                  lifetime?.averageDurationSeconds ??
                    current?.averageDurationSecondsInMode,
                )}
                colors={colors}
              />
            </View>
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title="Hiệu suất quiz hiện tại"
        subtitle="Tổng hợp theo loại quiz và độ khó trong chế độ đang chọn">
        <View style={styles.chartGrid}>
          <MetricAverageBarList
            title="Theo loại quiz"
            buckets={current?.byQuizType || []}
            bucketType="default"
            colors={colors}
          />
          <MetricAverageBarList
            title="Theo độ khó"
            buckets={current?.byDifficulty || []}
            bucketType="difficulty"
            colors={colors}
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
              width={lifetimeCardWidth}
            />
            <StatCard
              icon="chart-line"
              label="Độ chính xác TB"
              value={fmtPercentFromRatio(lifetime?.averageAccuracy)}
              accentColor="#10B981"
              width={lifetimeCardWidth}
            />
            <StatCard
              icon="trophy-outline"
              label="Điểm TB"
              value={fmtScore(lifetime?.averageScore)}
              accentColor="#8B5CF6"
              width={lifetimeCardWidth}
            />
          </View>

          <View style={styles.chartGrid}>
            <MetricAverageBarList
              title="Theo loại quiz"
              buckets={lifetime?.byQuizType || []}
              bucketType="default"
              colors={colors}
            />
            <MetricAverageBarList
              title="Theo độ khó"
              buckets={lifetime?.byDifficulty || []}
              bucketType="difficulty"
              colors={colors}
            />
          </View>

          <QuizListCard items={lifetime?.byQuiz || []} colors={colors} />
        </SectionCard>
      ) : null}
    </View>
  );
}

function MiniMetric({
  label,
  value,
  colors: passedColors,
}: {
  label: string;
  value: string;
  colors?: any;
}) {
  const {colors: themeColors} = useTheme();
  const colors = passedColors || themeColors;

  return (
    <View
      style={[
        styles.miniMetricCard,
        {backgroundColor: colors.surfaceVariant, borderColor: colors.border},
      ]}>
      <Text style={[styles.miniMetricLabel, {color: colors.textSecondary}]}>
        {label}
      </Text>
      <Text style={[styles.miniMetricValue, {color: colors.heading}]}>
        {value}
      </Text>
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
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

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

  const totalAttempts = Number(
    questionStats?.lifetimeQuestionAttemptStats?.totalQuestionAttempts ??
      questionStats?.lifetimeQuestionAttemptStats?.totalAttempts ??
      0,
  );
  const showWelcome =
    surface === 'QUESTION' &&
    hasCurrentSurfaceData &&
    !welcomeDismissed &&
    totalAttempts <= 5;

  if (loading) {
    return (
      <View
        style={[
          styles.stateCard,
          {backgroundColor: colors.surface, borderColor: colors.border},
        ]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={[styles.stateText, {color: colors.textSecondary}]}>
          Đang tải thống kê học tập...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={[
          styles.stateCard,
          {backgroundColor: colors.surface, borderColor: colors.border},
        ]}>
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
      <View
        style={[
          styles.heroCard,
          {backgroundColor: colors.surface, borderColor: colors.border},
        ]}>
        <View
          style={[
            styles.heroIconWrap,
            {backgroundColor: `${Colors.primary}18`},
          ]}>
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
          <Text style={[styles.heroTitle, {color: colors.heading}]}>
            Dashboard cá nhân
          </Text>
          <Text style={styles.heroWorkspace}>{currentWorkspaceName}</Text>
          <View style={styles.heroPillRow}>
            <View
              style={[
                styles.heroPill,
                {backgroundColor: colors.surfaceVariant, borderColor: colors.border},
              ]}>
              <Text style={[styles.heroPillText, {color: colors.textSecondary}]}>
                {ATTEMPT_MODES.find(mode => mode.value === attemptMode)?.label || 'Tất cả'}
              </Text>
            </View>
          </View>
          <Text style={[styles.heroDescription, {color: colors.textSecondary}]}>
            {
              SURFACES.find(item => item.value === surface)?.description
            }
          </Text>
        </View>
      </View>

      <SurfaceSwitcher surface={surface} onChange={setSurface} colors={colors} />
      <SegmentedControl
        items={availableModes.map(mode => ({
          value: mode.value,
          label: mode.label,
        }))}
        value={attemptMode}
        onChange={setAttemptMode}
        colors={colors}
      />

      {showWelcome ? (
        <WelcomeCard colors={colors} onDismiss={() => setWelcomeDismissed(true)} />
      ) : null}

      {!hasCurrentSurfaceData ? (
        <View
          style={[
            styles.stateCard,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
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
    alignItems: 'flex-start',
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
    minWidth: 0,
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
  heroPillRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: '700',
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
    minWidth: 0,
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
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    minWidth: 0,
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
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  forcedTwoColGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  forcedTwoColItem: {
    width: '47%',
    marginBottom: Spacing.sm,
  },
  forcedTwoColCenterRow: {
    width: '100%',
    alignItems: 'center',
  },
  summaryCenteredRow: {
    width: '100%',
    alignItems: 'center',
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
  welcomeCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: Spacing.md,
  },
  welcomeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  welcomeIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeContent: {
    flex: 1,
    minWidth: 0,
  },
  welcomeTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  welcomeDesc: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  welcomeClose: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
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
    minWidth: 0,
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
