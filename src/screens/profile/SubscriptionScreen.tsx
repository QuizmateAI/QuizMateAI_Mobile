import React, {useMemo, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PaymentAPI from '../../api/PaymentAPI';
import ManagementSystemAPI from '../../api/ManagementSystemAPI';
import WorkspaceAPI from '../../api/WorkspaceAPI';
import {getCurrentPlanName} from '../../utils/accountSummary';

type PlanType = 'INDIVIDUAL' | 'GROUP';

const MATERIAL_FORMATS = [
  {key: 'canProcessPdf', label: 'PDF'},
  {key: 'canProcessWord', label: 'Word'},
  {key: 'canProcessSlide', label: 'Slide'},
  {key: 'canProcessExcel', label: 'Excel'},
  {key: 'canProcessText', label: 'Text'},
  {key: 'canProcessImage', label: 'hình ảnh'},
  {key: 'canProcessVideo', label: 'video'},
  {key: 'canProcessAudio', label: 'audio'},
];

const STUDY_NOTES = [
  {
    title: 'Thời hạn gói rõ ràng',
    desc: 'Mỗi plan có thời hạn và quyền lợi riêng để bạn chọn theo nhu cầu học.',
  },
  {
    title: 'AI dùng theo Credit',
    desc: 'Các tính năng AI trừ credit khi bạn thực sự sử dụng, giúp dễ kiểm soát chi phí.',
  },
  {
    title: 'Thanh toán rõ ràng',
    desc: 'Lịch sử mua plan và credit luôn có thể xem lại trong phần quản lý gói.',
  },
];

const formatNumber = (value: any) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return '0';
  }

  return new Intl.NumberFormat('vi-VN').format(amount);
};

const formatVnd = (value: any) => `${formatNumber(value)} đ`;

const isForeverDuration = (durationInDay: any) => {
  const days = Number(durationInDay);
  return Number.isFinite(days) && days >= 999999;
};

const getDurationLabel = (plan: any) => {
  const days = Number(plan?.durationInDay ?? 0);
  if (isForeverDuration(days)) {
    return 'trọn đời';
  }
  if (days > 0) {
    return `${formatNumber(days)} ngày`;
  }

  return plan?.durationLabel || 'không giới hạn';
};

const getSupportedFormats = (entitlement: any) =>
  MATERIAL_FORMATS
    .filter(item => Boolean(entitlement?.[item.key]))
    .map(item => item.label);

const joinList = (items: string[]) => {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} và ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')} và ${items[items.length - 1]}`;
};

const getTierKey = (plan: any, index: number, totalPlans: number) => {
  if (plan?.type === 'GROUP') {
    return 'GROUP';
  }
  if (Number(plan?.price ?? 0) === 0 || index === 0) {
    return 'FREE';
  }
  if (index === totalPlans - 1) {
    return 'TITANIUM';
  }

  return 'PRO';
};

const getPlanFeatureCatalog = (plan: any) => {
  const entitlement = plan?.entitlement || {};
  const items: Array<{key: string; text: string; title: string}> = [];
  const formats = getSupportedFormats(entitlement);

  if (formats.length > 0) {
    const text =
      formats.length > 3
        ? `Hỗ trợ nhập ${joinList(formats.slice(0, 3))} và thêm ${formats.length - 3} định dạng khác`
        : `Hỗ trợ nhập ${joinList(formats)}`;
    items.push({
      key: 'formats',
      text,
      title: 'Nhập nhiều định dạng',
    });
  }

  if (entitlement?.canCreateRoadMap) {
    items.push({
      key: 'roadmaps',
      text: 'Mở khóa lộ trình học AI theo từng bước',
      title: 'Lộ trình học AI',
    });
  }
  if (entitlement?.hasAiCompanionMode) {
    items.push({
      key: 'companion',
      text: 'Có AI đồng hành để hỏi đáp và luyện tập nhanh',
      title: 'AI đồng hành',
    });
  }
  if (entitlement?.hasAiSummaryAndTextReading) {
    items.push({
      key: 'summaries',
      text: 'Tóm tắt và đọc hiểu tài liệu nhanh hơn với AI',
      title: 'Tóm tắt thông minh',
    });
  }
  if (entitlement?.hasAiQuizAssessmentAndRecommendation) {
    items.push({
      key: 'assessment',
      text: 'Theo dõi tiến độ và điểm yếu để học có trọng tâm hơn',
      title: 'Đánh giá học tập',
    });
  }
  if (entitlement?.hasWorkspaceAnalytics) {
    items.push({
      key: 'analytics',
      text: 'Phân tích học tập và quiz nâng cao',
      title: 'Phân tích học tập',
    });
  }
  if (entitlement?.hasAdvanceQuizConfig) {
    items.push({
      key: 'advancedQuiz',
      text: 'Mở khóa kiểu quiz nâng cao cho luyện tập sâu hơn',
      title: 'Quiz nâng cao',
    });
  }

  const includedCredits = Number(
    entitlement?.planIncludedCredits ??
      entitlement?.bonusCreditOnPlanPurchase ??
      plan?.bonusCreditOnPlanPurchase ??
      0,
  );
  if (includedCredits > 0) {
    items.push({
      key: 'credits',
      text: `Bao gồm ${formatNumber(includedCredits)} credit`,
      title: 'Credit đi kèm',
    });
  }

  return items;
};

const pickCatalogItems = (catalog: any[], keys: string[], limit: number) => {
  const map = new Map(catalog.map(item => [item.key, item]));
  return keys
    .map(key => map.get(key))
    .filter(Boolean)
    .slice(0, limit);
};

const getPlanHighlights = (
  plan: any,
  previousPlan: any,
  tierKey: string,
) => {
  const catalog = getPlanFeatureCatalog(plan);
  const priorityMap: Record<string, string[]> = {
    FREE: ['formats', 'roadmaps', 'companion', 'summaries'],
    PRO: ['roadmaps', 'companion', 'summaries', 'formats', 'assessment', 'advancedQuiz', 'credits'],
    TITANIUM: ['analytics', 'advancedQuiz', 'assessment', 'summaries', 'companion', 'roadmaps', 'credits'],
    GROUP: ['formats', 'roadmaps', 'companion', 'summaries', 'analytics', 'advancedQuiz', 'credits'],
  };

  const highlights: string[] = [];
  if (tierKey === 'GROUP') {
    highlights.push('Quản lý quyền lợi AI trong không gian học tập nhóm');
  } else if (previousPlan) {
    highlights.push(`Bao gồm mọi tính năng của ${previousPlan.name}`);
  }

  pickCatalogItems(catalog, priorityMap[tierKey] || [], tierKey === 'FREE' ? 3 : 5)
    .forEach(item => highlights.push(item.text));

  if (highlights.length === 0) {
    highlights.push('Bắt đầu với các tính năng học tập cốt lõi');
  }

  return Array.from(new Set(highlights));
};

const getPlanDescription = (
  plan: any,
  previousPlan: any,
  tierKey: string,
) => {
  const catalog = getPlanFeatureCatalog(plan);
  if (tierKey === 'FREE') {
    return 'Bắt đầu với các tính năng cốt lõi để tạo quiz và học thử.';
  }
  if (tierKey === 'GROUP') {
    return 'Gói dành cho nhóm học tập, mở rộng quyền lợi AI theo workspace.';
  }

  const extras = pickCatalogItems(
    catalog,
    tierKey === 'TITANIUM'
      ? ['analytics', 'advancedQuiz', 'assessment', 'summaries', 'credits']
      : ['companion', 'summaries', 'roadmaps', 'formats', 'credits'],
    2,
  ).map(item => item.title.toLowerCase());

  if (extras.length === 0) {
    return `Bao gồm toàn bộ ${previousPlan?.name || 'gói trước'}.`;
  }

  return `Bao gồm toàn bộ ${previousPlan?.name || 'gói trước'}, thêm ${joinList(extras)}.`;
};

const getRecommendedIndex = (plans: any[]) => {
  if (plans.length <= 1) {
    return -1;
  }

  const firstPaidIndex = plans.findIndex(plan => Number(plan?.price ?? 0) > 0);
  return firstPaidIndex >= 0 ? firstPaidIndex : 0;
};

const getCurrentPlanId = (currentPlan: any) =>
  Number(currentPlan?.plan?.id ?? currentPlan?.plan?.planCatalogId ?? 0);

const isMatchingCurrentPlan = (plan: any, currentPlan: any, planType: PlanType) => {
  if (!plan || !currentPlan?.plan) {
    return false;
  }

  const currentId = getCurrentPlanId(currentPlan);
  if (currentId > 0 && currentId === Number(plan?.id || 0)) {
    return true;
  }

  const currentType = String(currentPlan?.plan?.type || '').toUpperCase();
  if (currentType && currentType !== planType) {
    return false;
  }

  const currentName = String(getCurrentPlanName(currentPlan)).trim().toLowerCase();
  const planName = String(plan?.name || '').trim().toLowerCase();
  return Boolean(currentName) && currentName === planName;
};

const getFeatureTiles = (plans: any[]) => {
  const hasFeature = (key: string) =>
    plans.some(plan => Boolean(plan?.entitlement?.[key]));

  return [
    hasFeature('canCreateRoadMap') && {
      key: 'roadmap',
      icon: 'map-outline',
      title: 'Lộ trình học AI',
      desc: 'Chuyển tài liệu thành các bước học rõ ràng để bám theo dễ hơn.',
    },
    hasFeature('hasAiCompanionMode') && {
      key: 'companion',
      icon: 'message-text-outline',
      title: 'AI đồng hành',
      desc: 'Hỏi nhanh, ôn nhanh và tiếp tục mạch học mà không bị ngắt quãng.',
    },
    hasFeature('hasAiSummaryAndTextReading') && {
      key: 'summary',
      icon: 'book-open-page-variant-outline',
      title: 'Tóm tắt thông minh',
      desc: 'Biến nội dung dài thành ý chính ngắn gọn để ôn lại nhanh hơn.',
    },
    hasFeature('hasWorkspaceAnalytics') && {
      key: 'analytics',
      icon: 'chart-bar',
      title: 'Phân tích học tập',
      desc: 'Nhìn rõ điểm mạnh, điểm yếu và tiến độ để điều chỉnh cách học.',
    },
    hasFeature('hasAdvanceQuizConfig') && {
      key: 'advancedQuiz',
      icon: 'creation',
      title: 'Quiz nâng cao',
      desc: 'Mở thêm kiểu câu hỏi và cấu hình linh hoạt cho luyện tập chuyên sâu.',
    },
  ].filter(Boolean) as Array<{
    key: string;
    icon: string;
    title: string;
    desc: string;
  }>;
};

export default function SubscriptionScreen({navigation, route}: any) {
  const {isDark, colors} = useTheme();
  const preselectedPlanType = String(route?.params?.planType || '').toLowerCase();
  const preselectedWorkspaceId = Number(route?.params?.workspaceId || 0);
  const preselectedWorkspaceName = String(route?.params?.workspaceName || '');
  const isGroupScoped =
    preselectedPlanType === 'group' && preselectedWorkspaceId > 0;
  const planType: PlanType = isGroupScoped ? 'GROUP' : 'INDIVIDUAL';
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<any>(null);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;

      const loadData = async () => {
        setLoading(true);
        setLoadError(null);

        const planPromise = PaymentAPI.getPurchasablePlans(planType);
        const currentPlanPromise = isGroupScoped
          ? WorkspaceAPI.getCurrentPlan(preselectedWorkspaceId)
          : ManagementSystemAPI.getCurrentUserPlan();

        const [planResult, currentPlanResult] = await Promise.allSettled([
          planPromise,
          currentPlanPromise,
        ]);

        if (!active) {
          return;
        }

        if (planResult.status === 'fulfilled') {
          setPlans(
            (planResult.value.data || [])
              .filter((item: any) => String(item?.type || '').toUpperCase() === planType)
              .sort((left: any, right: any) => Number(left?.price || 0) - Number(right?.price || 0)),
          );
        } else {
          setPlans([]);
          setLoadError('Không thể tải danh sách gói đăng ký.');
        }

        setCurrentPlan(
          currentPlanResult.status === 'fulfilled'
            ? currentPlanResult.value.data
            : null,
        );
        setLoading(false);
      };

      loadData();

      return () => {
        active = false;
      };
    }, [isGroupScoped, planType, preselectedWorkspaceId]),
  );

  const recommendedIndex = useMemo(() => getRecommendedIndex(plans), [plans]);
  const featureTiles = useMemo(() => getFeatureTiles(plans), [plans]);
  const pageTitle = isGroupScoped
    ? `Chọn gói cho ${preselectedWorkspaceName || 'nhóm của bạn'}`
    : 'Chọn gói học phù hợp';
  const pageSubtitle = isGroupScoped
    ? 'Mỗi nhóm dùng một gói riêng trong không gian học tập của chính nhóm đó.'
    : 'Mở khóa đúng mức hỗ trợ AI bạn cần để học nhanh hơn, mà không phải đọc quá nhiều thông số kỹ thuật.';

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top']}>
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
        <Text style={[styles.headerTitle, {color: colors.heading}]}>Gói đăng ký</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.heroSection,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>

          <Text style={[styles.pageTitle, {color: colors.heading}]}>
            {pageTitle}
          </Text>
          <Text style={[styles.pageSubtitle, {color: colors.textSecondary}]}>
            {pageSubtitle}
          </Text>

          <View
            style={[
              styles.groupNotice,
              {borderTopColor: colors.border},
            ]}>
            <Text style={[styles.groupNoticeTitle, {color: colors.heading}]}>
              {isGroupScoped
                ? 'Gói nhóm đang được quản lý trong nhóm này'
                : 'Gói nhóm được quản lý trong từng nhóm'}
            </Text>
            <Text style={[styles.groupNoticeDesc, {color: colors.textSecondary}]}>
              {isGroupScoped
                ? 'Bạn đang xem gói và thanh toán cho workspace nhóm đã chọn.'
                : 'Mỗi nhóm mua gói riêng trong không gian học tập của chính nhóm đó. Hãy mở nhóm bạn làm trưởng nhóm để xem gói và thanh toán tại đó.'}
            </Text>
          </View>
        </View>

        {loadError ? (
          <View
            style={[
              styles.errorCard,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <Icon name="alert-circle-outline" size={24} color={Colors.error} />
            <Text style={[styles.errorText, {color: colors.textSecondary}]}>
              {loadError}
            </Text>
          </View>
        ) : plans.length === 0 ? (
          <View
            style={[
              styles.emptyPlans,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <Icon name="tag-outline" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, {color: colors.heading}]}>
              Không có gói khả dụng
            </Text>
            <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
              Danh sách gói sẽ hiển thị tại đây khi hệ thống có cấu hình phù hợp.
            </Text>
          </View>
        ) : (
          <View style={styles.planList}>
            {plans.map((plan, index) => {
              const previousPlan = index > 0 ? plans[index - 1] : null;
              const tierKey = getTierKey(plan, index, plans.length);
              const isRecommended =
                index === recommendedIndex && Number(plan?.price ?? 0) > 0;
              const isCurrentPlan = isMatchingCurrentPlan(plan, currentPlan, planType);
              const isFreePlan = Number(plan?.price ?? 0) === 0;
              const description = getPlanDescription(plan, previousPlan, tierKey);
              const highlights = getPlanHighlights(plan, previousPlan, tierKey);
              const price = Number(plan?.price ?? 0);
              const disabled = isCurrentPlan || isFreePlan;

              return (
                <View
                  key={String(plan?.id || index)}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: isRecommended
                        ? isDark
                          ? '#111A38'
                          : '#F5F7FF'
                        : colors.surface,
                      borderColor:
                        isRecommended || isCurrentPlan
                          ? '#818CF8'
                          : colors.border,
                      shadowColor: isRecommended ? '#6366F1' : '#0F172A',
                    },
                  ]}>
                  {isRecommended ? (
                    <Badge
                      label="Phổ biến nhất"
                      variant="info"
                      size="sm"
                      style={styles.popularBadge}
                    />
                  ) : null}

                  <View style={styles.planTopRow}>
                    <View style={styles.planTitleBlock}>
                      <Text style={[styles.planName, {color: colors.heading}]}>
                        {plan?.name || 'Gói học'}
                      </Text>
                      <Text style={[styles.planDescription, {color: colors.textSecondary}]}>
                        {description}
                      </Text>
                    </View>

                    {isCurrentPlan ? (
                      <Badge label="Đang dùng" variant="warning" size="sm" />
                    ) : null}
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={[styles.planPrice, {color: colors.heading}]}>
                      {formatVnd(price)}
                    </Text>
                    <Text style={[styles.planDuration, {color: colors.textSecondary}]}>
                      / {getDurationLabel(plan)}
                    </Text>
                  </View>

                  <View style={[styles.featureList, {borderTopColor: colors.border}]}>
                    {highlights.map((item, featureIndex) => (
                      <View key={`${item}-${featureIndex}`} style={styles.featureRow}>
                        <View
                          style={[
                            styles.featureIcon,
                            {
                              backgroundColor: isDark
                                ? 'rgba(148,163,184,0.14)'
                                : '#F1F5F9',
                            },
                          ]}>
                          <Icon
                            name="check"
                            size={14}
                            color={isRecommended ? '#6366F1' : colors.textSecondary}
                          />
                        </View>
                        <Text style={[styles.featureText, {color: colors.textSecondary}]}>
                          {item}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <Button
                    title={
                      isCurrentPlan
                        ? 'Đang sử dụng'
                        : isFreePlan
                        ? 'Gói miễn phí'
                        : 'Chọn plan'
                    }
                    disabled={disabled}
                    variant={isRecommended ? 'primary' : 'outline'}
                    size="md"
                    onPress={() =>
                      navigation.navigate('Payment', {
                        planId: plan.id,
                        planName: plan.name,
                        planType: plan.type,
                        workspaceId:
                          isGroupScoped && preselectedWorkspaceId > 0
                            ? preselectedWorkspaceId
                            : undefined,
                        workspaceName:
                          isGroupScoped && preselectedWorkspaceName
                            ? preselectedWorkspaceName
                            : undefined,
                      })
                    }
                    style={styles.planAction}
                  />
                </View>
              );
            })}
          </View>
        )}

        {featureTiles.length > 0 || STUDY_NOTES.length > 0 ? (
          <View
            style={[
              styles.featureSection,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <Text style={[styles.featureSectionTitle, {color: colors.heading}]}>
              Công cụ học tập nổi bật
            </Text>
            <Text style={[styles.featureSectionDesc, {color: colors.textSecondary}]}>
              Các gói trả phí mở rộng thêm nhiều cách dùng AI hữu ích trong quá trình học.
            </Text>

            {featureTiles.length > 0 ? (
              <View style={styles.featureTileList}>
                {featureTiles.map(feature => (
                  <View
                    key={feature.key}
                    style={[
                      styles.featureTile,
                      {
                        backgroundColor: isDark ? '#111827' : '#F8FAFC',
                        borderColor: colors.border,
                      },
                    ]}>
                    <View
                      style={[
                        styles.featureTileIcon,
                        {backgroundColor: isDark ? '#0F172A' : '#FFFFFF'},
                      ]}>
                      <Icon name={feature.icon} size={18} color={colors.textSecondary} />
                    </View>
                    <View style={styles.featureTileCopy}>
                      <Text style={[styles.featureTileTitle, {color: colors.heading}]}>
                        {feature.title}
                      </Text>
                      <Text style={[styles.featureTileDesc, {color: colors.textSecondary}]}>
                        {feature.desc}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View
              style={[
                styles.noteCard,
                {backgroundColor: isDark ? '#111827' : '#F8FAFC', borderColor: colors.border},
              ]}>
              {STUDY_NOTES.map((note, index) => (
                <View
                  key={note.title}
                  style={[
                    styles.noteItem,
                    index > 0 && {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border},
                  ]}>
                  <Text style={[styles.noteTitle, {color: colors.heading}]}>
                    {note.title}
                  </Text>
                  <Text style={[styles.noteDesc, {color: colors.textSecondary}]}>
                    {note.desc}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
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
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {padding: Spacing.sm, width: 42},
  headerTitle: {fontSize: 17, fontWeight: '600'},
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  heroSection: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  backInline: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: Spacing.lg,
  },
  backInlineText: {
    fontSize: 13,
    fontWeight: '500',
  },
  pageTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
  },
  pageSubtitle: {
    marginTop: Spacing.sm,
    fontSize: 14,
    lineHeight: 22,
  },
  groupNotice: {
    borderTopWidth: 1,
    paddingTop: Spacing.base,
    marginTop: Spacing.lg,
  },
  groupNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  groupNoticeDesc: {
    marginTop: Spacing.sm,
    fontSize: 13,
    lineHeight: 20,
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyPlans: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    marginTop: Spacing.md,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: Spacing.sm,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  planList: {
    gap: Spacing.lg,
  },
  planCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowOffset: {width: 0, height: 12},
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 2,
  },
  popularBadge: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.md,
  },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.base,
  },
  planTitleBlock: {
    flex: 1,
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
  },
  planDescription: {
    marginTop: Spacing.sm,
    fontSize: 13,
    lineHeight: 21,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: Spacing.xl,
    flexWrap: 'wrap',
  },
  planPrice: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
  },
  planDuration: {
    marginLeft: Spacing.sm,
    marginBottom: 5,
    fontSize: 13,
  },
  featureList: {
    borderTopWidth: 1,
    paddingTop: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  featureIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  planAction: {
    marginTop: Spacing.xl,
  },
  featureSection: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.xl,
  },
  featureSectionTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  featureSectionDesc: {
    marginTop: Spacing.sm,
    fontSize: 13,
    lineHeight: 20,
  },
  featureTileList: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  featureTile: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.base,
    flexDirection: 'row',
    gap: Spacing.md,
  },
  featureTileIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTileCopy: {
    flex: 1,
  },
  featureTileTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  featureTileDesc: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  noteCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.lg,
  },
  noteItem: {
    paddingVertical: Spacing.base,
  },
  noteTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  noteDesc: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 19,
  },
});
