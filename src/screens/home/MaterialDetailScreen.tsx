import React, {useEffect, useState} from 'react';
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
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Badge from '../../components/ui/Badge';
import MaterialAPI from '../../api/MaterialAPI';

export default function MaterialDetailScreen({navigation, route}: any) {
  const {material} = route.params || {};
  const {isDark, colors} = useTheme();

  const materialId = material?.materialId || material?.id;

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState('');
  const [extractedText, setExtractedText] = useState('');

  useEffect(() => {
    let mounted = true;
    const loadDetail = async () => {
      if (!materialId) {
        setLoading(false);
        return;
      }

      try {
        const [summaryRes, textRes] = await Promise.all([
          MaterialAPI.getExtractedSummary(materialId),
          MaterialAPI.getExtractedText(materialId),
        ]);
        if (!mounted) {
          return;
        }
        setSummary(summaryRes.data || '');
        setExtractedText(textRes.data || '');
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
    return () => {
      mounted = false;
    };
  }, [materialId]);

  const normalizedStatus = String(material?.status || 'UNKNOWN').toUpperCase();
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
          <Text style={[styles.bodyText, {color: colors.textSecondary}]}>
            {summary || 'Bản tóm tắt chưa sẵn sàng.'}
          </Text>
        </View>

        <View style={[styles.card, {borderColor: colors.border, backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.heading}]}>Văn bản trích xuất</Text>
          <Text style={[styles.bodyText, {color: colors.textSecondary}]}>
            {extractedText || 'Văn bản trích xuất chưa sẵn sàng.'}
          </Text>
        </View>

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
});

