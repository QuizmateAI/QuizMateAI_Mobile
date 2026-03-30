import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import FloatingInput from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import FlashcardAPI from '../../api/FlashcardAPI';

export default function CreateAIFlashcardScreen({navigation, route}: any) {
  const {workspaceId, materials = []} = route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();

  const [quantity, setQuantity] = useState('30');
  const [termPercent, setTermPercent] = useState('40');
  const [qaPercent, setQaPercent] = useState('40');
  const [clozePercent, setClozePercent] = useState('20');
  const [imagePercent, setImagePercent] = useState('0');
  const [prompt, setPrompt] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const percentSum = useMemo(() => {
    return (
      Number(termPercent || 0) +
      Number(qaPercent || 0) +
      Number(clozePercent || 0) +
      Number(imagePercent || 0)
    );
  }, [termPercent, qaPercent, clozePercent, imagePercent]);

  const handleGenerate = async () => {
    if (!workspaceId) {
      showToast('Thiếu workspace id', 'error');
      return;
    }
    if (!selectedMaterialId) {
      showToast('Vui lòng chọn một tài liệu', 'error');
      return;
    }
    if (percentSum !== 100) {
      showToast('Tổng phần trăm các loại thẻ phải bằng 100', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await FlashcardAPI.generateAI({
        materialId: selectedMaterialId,
        workspaceId,
        quantity: Math.max(1, Number(quantity) || 30),
        termPercent: Math.max(0, Number(termPercent) || 0),
        qaPercent: Math.max(0, Number(qaPercent) || 0),
        clozePercent: Math.max(0, Number(clozePercent) || 0),
        imagePercent: Math.max(0, Number(imagePercent) || 0),
        additionalPrompt: prompt.trim() || null,
      });

      showToast('Đã bắt đầu tạo flashcard AI', 'success');
      navigation.goBack();
    } catch {
      showToast('Không thể tạo flashcard', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.heading}]}>Tạo flashcard AI</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={[styles.sectionTitle, {color: colors.heading}]}>Tài liệu</Text>
        <View style={styles.listWrap}>
          {materials.map((material: any) => {
            const id = material.materialId || material.id;
            const selected = selectedMaterialId === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setSelectedMaterialId(id)}
                style={[
                  styles.materialItem,
                  {
                    borderColor: selected ? Colors.primary : colors.border,
                    backgroundColor: selected
                      ? isDark
                        ? '#1E3A8A30'
                        : '#EFF6FF'
                      : colors.surface,
                  },
                ]}>
                <Icon
                  name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                  size={20}
                  color={selected ? Colors.primary : colors.textTertiary}
                />
                <Text style={[styles.materialName, {color: colors.text}]} numberOfLines={1}>
                  {material.title || material.fileName || material.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.spaceMd} />
        <FloatingInput label="Số lượng" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
        <View style={styles.spaceMd} />
        <FloatingInput label="Thẻ thuật ngữ %" value={termPercent} onChangeText={setTermPercent} keyboardType="number-pad" />
        <View style={styles.spaceMd} />
        <FloatingInput label="Thẻ hỏi đáp %" value={qaPercent} onChangeText={setQaPercent} keyboardType="number-pad" />
        <View style={styles.spaceMd} />
        <FloatingInput label="Thẻ điền khuyết %" value={clozePercent} onChangeText={setClozePercent} keyboardType="number-pad" />
        <View style={styles.spaceMd} />
        <FloatingInput label="Thẻ hình ảnh %" value={imagePercent} onChangeText={setImagePercent} keyboardType="number-pad" />
        <View style={styles.spaceMd} />
        <FloatingInput label="Prompt (tùy chọn)" value={prompt} onChangeText={setPrompt} multiline />

        <Text
          style={[
            styles.sumText,
            {color: percentSum === 100 ? Colors.success : Colors.error},
          ]}>
          Tổng phần trăm: {percentSum}%
        </Text>

        <Button
          title={submitting ? 'Đang tạo...' : 'Tạo flashcard'}
          onPress={handleGenerate}
          loading={submitting}
          icon="cards-outline"
        />
      </ScrollView>

      {submitting && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}
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
  headerTitle: {fontSize: 17, fontWeight: '600'},
  backBtn: {width: 32, alignItems: 'center', justifyContent: 'center'},
  content: {flex: 1},
  contentContainer: {padding: Spacing.lg, paddingBottom: Spacing['3xl']},
  sectionTitle: {fontSize: 15, fontWeight: '600', marginBottom: Spacing.sm},
  listWrap: {gap: Spacing.sm},
  materialItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  materialName: {fontSize: 13, flex: 1},
  spaceMd: {height: Spacing.md},
  sumText: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    fontSize: 13,
    fontWeight: '600',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000020',
  },
});
