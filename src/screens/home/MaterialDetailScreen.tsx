import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialAPI from '../../api/MaterialAPI';
import ContentRenderer from '../../components/ui/ContentRenderer';
import {buildContentBlocks, getSourceImageUrls} from '../../utils/contentBlocks';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';

function resolveTextPayload(payload: any, fallback = '') {
  if (typeof payload === 'string') {
    return payload;
  }

  if (Array.isArray(payload)) {
    const joined = payload
      .map(item => resolveTextPayload(item, ''))
      .filter(Boolean)
      .join('\n');
    return joined || fallback;
  }

  if (!payload || typeof payload !== 'object') {
    return String(payload ?? fallback);
  }

  const candidateValues = [
    payload.summary,
    payload.extractedSummary,
    payload.extracted_summary,
    payload.text,
    payload.extractedText,
    payload.extracted_text,
    payload.content,
    payload.result,
    payload.data?.summary,
    payload.data?.text,
    payload.data?.content,
    payload.data?.result,
    payload.data?.extractedSummary,
    payload.data?.extracted_summary,
    payload.data?.extractedText,
    payload.data?.extracted_text,
  ];

  for (const value of candidateValues) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  if (payload.ready === false && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  return fallback;
}

export default function MaterialDetailScreen({navigation, route}: any) {
  const {material, contextType = 'WORKSPACE'} = route.params || {};
  const {isDark, colors} = useTheme();

  const materialId = material?.materialId || material?.id;
  const [currentStatus, setCurrentStatus] = useState(
    String(material?.status || material?.final_status || 'UNKNOWN').toUpperCase(),
  );
  const normalizedStatus = currentStatus;
  const needsReview = Boolean(material?.needReview) || ['WARN', 'WARNED'].includes(normalizedStatus);

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [contentBlocks, setContentBlocks] = useState<any[]>([]);
  const [fallbackImageUrls, setFallbackImageUrls] = useState<string[]>([]);
  const [moderationReport, setModerationReport] = useState<any>(null);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationDetailOpen, setModerationDetailOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');

  useEffect(() => {
    if (normalizedStatus === 'DELETED') {
      navigation.goBack();
    }
  }, [navigation, normalizedStatus]);

  const moderationInfo = useMemo(() => {
    const status = normalizedStatus;
    if (status === 'REJECT' || status === 'REJECTED') {
      return {
        type: 'REJECT',
        reason: moderationReport?.reason || null,
        detectedTopic: moderationReport?.detected_topic || null,
      };
    }

    if (status === 'WARN' || status === 'WARNED') {
      return {
        type: 'WARN',
        reason: moderationReport?.reason || null,
        suggestion: moderationReport?.suggestion || null,
        suitablePercent: moderationReport?.suitablePrecent ?? null,
        targetLevelRequired: moderationReport?.target_level_required || null,
        currentLevelDetected: moderationReport?.current_level_detected || null,
      };
    }

    return null;
  }, [moderationReport, normalizedStatus]);

  const reviewButtonVisible = needsReview && ['WARN', 'WARNED'].includes(normalizedStatus);

  const formatSuitablePercent = useCallback((value: any) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }
    const normalized = value <= 1 ? value * 100 : value;
    return `${Math.round(normalized)}%`;
  }, []);

  const loadModerationReport = useCallback(async () => {
    const status = String(material?.status || material?.final_status || '').toUpperCase();
    if (!materialId || !['WARN', 'WARNED', 'REJECT', 'REJECTED'].includes(status)) {
      setModerationReport(null);
      return;
    }

    setModerationLoading(true);
    try {
      const res = await MaterialAPI.getModerationReportDetail(materialId);
      setModerationReport(res?.data ?? null);
    } catch {
      setModerationReport(null);
    } finally {
      setModerationLoading(false);
    }
  }, [material?.final_status, material?.status, materialId]);

  const handleReview = useCallback(async (isApproved: boolean) => {
    if (!materialId || reviewLoading) {
      return;
    }

    setReviewLoading(true);
    setReviewError('');
    setReviewMessage('');

    try {
      const reviewApi = contextType === 'GROUP' ? MaterialAPI.reviewGroupMaterial : MaterialAPI.reviewMaterial;
      const result = await reviewApi(materialId, isApproved);
      const updatedMaterial = result?.data ?? null;

      if (updatedMaterial?.status || updatedMaterial?.final_status) {
        setCurrentStatus(String(updatedMaterial.status || updatedMaterial.final_status).toUpperCase());
      }

      if (updatedMaterial) {
        setReviewMessage(isApproved ? 'Đã duyệt tài liệu.' : 'Đã từ chối tài liệu.');
      }

      if (!isApproved) {
        navigation.goBack();
      }
    } catch (error: any) {
      setReviewError(error?.response?.data?.message || error?.message || 'Không thể duyệt tài liệu lúc này.');
    } finally {
      setReviewLoading(false);
    }
  }, [contextType, materialId, navigation, reviewLoading]);

  useEffect(() => {
    let mounted = true;
    const loadDetail = async () => {
      if (!materialId) {
        setLoading(false);
        return;
      }

      try {
        const textRes = await MaterialAPI.getExtractedText(materialId);
        if (!mounted) {
          return;
        }
        setSummary(
          resolveTextPayload(
            material?.summary ?? material?.extractedSummary ?? material?.extracted_summary ?? '',
            '',
          ),
        );
          const textValue = resolveTextPayload(textRes.data, '');
          setExtractedText(textValue);
          const blocks = buildContentBlocks(textValue);
          setContentBlocks(blocks);
          setFallbackImageUrls(getSourceImageUrls(material, blocks));
      } catch {
        if (!mounted) {
          return;
        }
        setSummary('Chưa có tóm tắt.');
        setExtractedText('Chưa có nội dung trích xuất.');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadDetail();
    void loadModerationReport();
    return () => {
      mounted = false;
    };
  }, [loadModerationReport, materialId]);

  const statusVariant =
    normalizedStatus === 'READY' || normalizedStatus === 'ACTIVE'
      ? 'success'
      : normalizedStatus === 'PROCESSING' || normalizedStatus === 'PENDING'
      ? 'warning'
      : normalizedStatus === 'FAILED' || normalizedStatus === 'ERROR'
      ? 'error'
      : 'default';

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}>
      <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.heading}]}>Chi tiết tài liệu</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {(moderationLoading || moderationInfo || reviewMessage || reviewError || reviewButtonVisible) && (
          <View style={[
            styles.reviewCard,
            {
              borderColor: normalizedStatus === 'REJECT' || normalizedStatus === 'REJECTED' ? '#FCA5A5' : '#FCD34D',
              backgroundColor: normalizedStatus === 'REJECT' || normalizedStatus === 'REJECTED' ? (isDark ? '#3F1D1D' : '#FEF2F2') : (isDark ? '#3B2F12' : '#FFFBEB'),
            }
          ]}>
            {moderationLoading ? (
              <View style={styles.reviewLoadingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={[styles.reviewHintText, {color: colors.textSecondary}]}>Đang tải moderation report...</Text>
              </View>
            ) : null}

            {!moderationLoading && moderationInfo && (
              <View>
                <TouchableOpacity onPress={() => setModerationDetailOpen(prev => !prev)} style={styles.reviewHeader}>
                  <Text style={[styles.reviewTitle, {color: colors.heading}]}>Moderation report</Text>
                  <Icon name={moderationDetailOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>

                {moderationDetailOpen && (
                  <View style={styles.reviewDetailBody}>
                    {moderationInfo.reason ? (
                      <Text style={[styles.reviewDetailText, {color: colors.textSecondary}]}>
                        <Text style={styles.reviewDetailStrong}>Lý do: </Text>{moderationInfo.reason}
                      </Text>
                    ) : null}
                    {moderationInfo.type === 'WARN' && moderationInfo.suggestion ? (
                      <Text style={[styles.reviewDetailText, {color: colors.textSecondary}]}>
                        <Text style={styles.reviewDetailStrong}>Gợi ý: </Text>{moderationInfo.suggestion}
                      </Text>
                    ) : null}
                    {moderationInfo.type === 'REJECT' && moderationInfo.detectedTopic ? (
                      <Text style={[styles.reviewDetailText, {color: colors.textSecondary}]}>
                        <Text style={styles.reviewDetailStrong}>Chủ đề phát hiện: </Text>{moderationInfo.detectedTopic}
                      </Text>
                    ) : null}
                    {moderationInfo.type === 'WARN' && formatSuitablePercent(moderationInfo.suitablePercent) ? (
                      <Text style={[styles.reviewDetailText, {color: colors.textSecondary}]}>
                        <Text style={styles.reviewDetailStrong}>Tỉ lệ phù hợp: </Text>{formatSuitablePercent(moderationInfo.suitablePercent)}
                      </Text>
                    ) : null}
                    {moderationInfo.type === 'WARN' && moderationInfo.currentLevelDetected && moderationInfo.targetLevelRequired ? (
                      <Text style={[styles.reviewDetailText, {color: colors.textSecondary}]}>
                        <Text style={styles.reviewDetailStrong}>Mức hiện tại: </Text>{moderationInfo.currentLevelDetected}
                        <Text style={styles.reviewDetailStrong}> | Mức yêu cầu: </Text>{moderationInfo.targetLevelRequired}
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            )}

            {reviewButtonVisible && (
              <View style={styles.reviewActionSection}>
                <Text style={[styles.reviewPrompt, {color: colors.textSecondary}]}>Bạn có muốn duyệt tài liệu này không?</Text>
                <View style={styles.reviewActionsRow}>
                  <TouchableOpacity
                    onPress={() => void handleReview(true)}
                    disabled={reviewLoading}
                    style={[
                      styles.reviewActionButton,
                      {backgroundColor: isDark ? '#14532D' : '#DCFCE7'},
                      reviewLoading && styles.reviewActionDisabled,
                    ]}>
                    <Text style={[styles.reviewActionText, {color: isDark ? '#86EFAC' : '#166534'}]}>Duyệt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => void handleReview(false)}
                    disabled={reviewLoading}
                    style={[
                      styles.reviewActionButton,
                      {backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2'},
                      reviewLoading && styles.reviewActionDisabled,
                    ]}>
                    <Text style={[styles.reviewActionText, {color: isDark ? '#FCA5A5' : '#B91C1C'}]}>Từ chối</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {reviewMessage ? (
              <Text style={[styles.reviewStatusText, {color: isDark ? '#86EFAC' : '#166534'}]}>{reviewMessage}</Text>
            ) : null}
            {reviewError ? (
              <Text style={[styles.reviewStatusText, {color: isDark ? '#FCA5A5' : '#B91C1C'}]}>{reviewError}</Text>
            ) : null}
          </View>
        )}

        <View style={[styles.card, {borderColor: colors.border, backgroundColor: colors.surface}]}>
          <Text style={[styles.fileName, {color: colors.heading}]}>
            {material?.title || material?.fileName || material?.name || 'Tài liệu'}
          </Text>
          <View style={styles.metaRow}>
            <Badge label={normalizedStatus} variant={statusVariant as any} size="sm" />
            <Text style={[styles.metaText, {color: colors.textSecondary}]}>
              {material?.materialType || 'FILE'}
            </Text>
          </View>
          {!!material?.uploadedAt && (
            <Text style={[styles.metaText, {color: colors.textTertiary}]}>
              Đã tải lên: {new Date(material.uploadedAt).toLocaleString()}
            </Text>
          )}
        </View>

        <View style={[styles.card, {borderColor: colors.border, backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.heading}]}>Tóm tắt</Text>
          <Text style={[styles.bodyText, {color: colors.textSecondary}]}> {summary || 'Bản tóm tắt chưa sẵn sàng.'} </Text>
        </View>

        {(fallbackImageUrls.length > 0 || (extractedText && contentBlocks.length > 0)) && (
          <View style={[styles.card, {borderColor: colors.border, backgroundColor: colors.surface}]}>
            {fallbackImageUrls.map((url, i) => (
              <ContentRenderer key={`fb-${i}`} blocks={[{type: 'image', url}]} />
            ))}
            <ContentRenderer blocks={contentBlocks} />
          </View>
        )}

        {normalizedStatus === 'PROCESSING' && (
          <View style={[styles.tipCard, {backgroundColor: isDark ? '#1E293B' : '#EFF6FF'}]}>
            <Icon name="information-outline" size={18} color={Colors.primary} />
            <Text style={[styles.tipText, {color: colors.textSecondary}]}>
              Tài liệu vẫn đang xử lý. Hãy quay lại danh sách tài liệu để làm mới sau.
            </Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {width: 32, alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontSize: 17, fontWeight: '600'},
  content: {flex: 1},
  contentContainer: {padding: Spacing.lg, paddingBottom: Spacing['3xl'], gap: Spacing.md},
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  fileName: {fontSize: 15, fontWeight: '600'},
  metaRow: {flexDirection: 'row', alignItems: 'center', gap: Spacing.sm},
  metaText: {fontSize: 12},
  sectionTitle: {fontSize: 14, fontWeight: '600'},
  bodyText: {fontSize: 13, lineHeight: 19},
  tipCard: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  tipText: {fontSize: 12, lineHeight: 18, flex: 1},
  reviewCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  reviewLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewTitle: {fontSize: 14, fontWeight: '700'},
  reviewDetailBody: {gap: 6},
  reviewDetailText: {fontSize: 12, lineHeight: 18},
  reviewDetailStrong: {fontWeight: '700'},
  reviewActionSection: {gap: Spacing.xs},
  reviewPrompt: {fontSize: 12, fontWeight: '600'},
  reviewActionsRow: {flexDirection: 'row', gap: Spacing.sm},
  reviewActionButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  reviewActionDisabled: {opacity: 0.6},
  reviewActionText: {fontSize: 13, fontWeight: '700'},
  reviewStatusText: {fontSize: 12, lineHeight: 18},
  reviewHintText: {fontSize: 12, lineHeight: 18},
});

