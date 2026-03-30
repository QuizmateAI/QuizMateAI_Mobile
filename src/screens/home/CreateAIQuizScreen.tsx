import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import AIAPI from '../../api/AIAPI';

const OUTPUT_LANGUAGES = ['Vietnamese', 'English', 'Japanese'] as const;
const MIN_SECONDS_PER_QUESTION = 30;
const MIN_PER_DIFFICULTY_DURATION_SECONDS = 10;

type RatioItem = {
  key: number;
  label: string;
  ratio: number;
};

const toList = (payload: any): any[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.content)) {
    return payload.content;
  }
  return [];
};

const toInt = (value: any, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
};

const toFloat = (value: any, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, parsed);
};

const nearlyEqual = (a: number, b: number, epsilon = 0.01) =>
  Math.abs(a - b) <= epsilon;

const normalizeIntegerInput = (value: string) => {
  if (value === '') {
    return '';
  }

  const digits = String(value).replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  return digits.replace(/^0+(?=\d)/, '');
};

const normalizeDecimalInput = (value: string) => {
  if (value === '') {
    return '';
  }

  const cleaned = String(value)
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1');

  if (cleaned === '.') {
    return '0.';
  }

  return cleaned;
};

const splitIntegerEven = (parts: number, total: number) => {
  if (parts <= 0) {
    return [] as number[];
  }

  const safeTotal = Math.max(0, Math.round(total));
  const base = Math.floor(safeTotal / parts);
  const remainder = safeTotal - base * parts;
  return Array.from({length: parts}, (_, idx) => (idx < remainder ? base + 1 : base));
};

const distributeEvenToTarget = (
  items: RatioItem[],
  target: number,
  unitByCount: boolean,
) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [] as RatioItem[];
  }

  const safeTarget = Math.max(0, unitByCount ? Math.round(target) : target);

  if (unitByCount) {
    const values = splitIntegerEven(items.length, safeTarget);
    return items.map((item, idx) => ({
      ...item,
      ratio: values[idx] || 0,
    }));
  }

  const base = Math.floor((safeTarget / items.length) * 100) / 100;
  const next = items.map(item => ({
    ...item,
    ratio: base,
  }));

  const delta = Math.round((safeTarget - next.reduce((acc, item) => acc + item.ratio, 0)) * 100) / 100;
  if (delta !== 0 && next.length > 0) {
    const last = next.length - 1;
    next[last] = {
      ...next[last],
      ratio: Math.max(0, Math.round((next[last].ratio + delta) * 100) / 100),
    };
  }

  return next;
};

const rebalanceWithPinned = (
  items: RatioItem[],
  target: number,
  unitByCount: boolean,
  pinnedKey: number | null,
) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [] as RatioItem[];
  }

  if (pinnedKey == null) {
    return distributeEvenToTarget(items, target, unitByCount);
  }

  const pinned = items.find(item => item.key === pinnedKey);
  if (!pinned) {
    return distributeEvenToTarget(items, target, unitByCount);
  }

  const pinnedRatioRaw = Math.max(0, Number(pinned.ratio) || 0);
  const pinnedRatio = unitByCount ? Math.round(pinnedRatioRaw) : pinnedRatioRaw;
  const remainingTarget = Math.max(0, target - pinnedRatio);

  const others = items.filter(item => item.key !== pinnedKey);
  const balancedOthers = distributeEvenToTarget(others, remainingTarget, unitByCount);

  const balancedMap = new Map<number, RatioItem>();
  balancedOthers.forEach(item => {
    balancedMap.set(item.key, item);
  });

  return items.map(item => {
    if (item.key === pinnedKey) {
      return {
        ...item,
        ratio: pinnedRatio,
      };
    }

    return balancedMap.get(item.key) || item;
  });
};

const normalizeConfigToTarget = (
  items: RatioItem[],
  target: number,
  unitByCount: boolean,
) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [] as RatioItem[];
  }

  const safeTarget = Math.max(0, unitByCount ? Math.round(target) : target);
  const sum = items.reduce((acc, item) => acc + (Number(item?.ratio) || 0), 0);

  if (sum <= 0) {
    const even = unitByCount
      ? splitIntegerEven(items.length, safeTarget)
      : Array.from({length: items.length}, () =>
          Math.round((safeTarget / items.length) * 100) / 100,
        );

    const next = items.map((item, idx) => ({
      ...item,
      ratio: even[idx] || 0,
    }));

    if (!unitByCount) {
      const delta = Math.round((safeTarget - next.reduce((acc, item) => acc + item.ratio, 0)) * 100) / 100;
      if (delta !== 0) {
        const last = next.length - 1;
        next[last] = {...next[last], ratio: Math.max(0, Math.round((next[last].ratio + delta) * 100) / 100)};
      }
    }

    return next;
  }

  if (unitByCount) {
    const scaledRaw = items.map(item => ((Number(item?.ratio) || 0) / sum) * safeTarget);
    const floors = scaledRaw.map(value => Math.floor(value));
    let remaining = safeTarget - floors.reduce((acc, val) => acc + val, 0);
    const fractions = scaledRaw
      .map((value, idx) => ({idx, fraction: value - Math.floor(value)}))
      .sort((a, b) => b.fraction - a.fraction);

    for (let i = 0; i < fractions.length && remaining > 0; i += 1) {
      floors[fractions[i].idx] += 1;
      remaining -= 1;
    }

    return items.map((item, idx) => ({
      ...item,
      ratio: floors[idx] || 0,
    }));
  }

  const scaled = items.map(item =>
    Math.round((((Number(item?.ratio) || 0) / sum) * safeTarget) * 100) / 100,
  );
  const delta = Math.round((safeTarget - scaled.reduce((acc, val) => acc + val, 0)) * 100) / 100;
  if (delta !== 0 && scaled.length > 0) {
    const last = scaled.length - 1;
    scaled[last] = Math.max(0, Math.round((scaled[last] + delta) * 100) / 100);
  }

  return items.map((item, idx) => ({
    ...item,
    ratio: scaled[idx] || 0,
  }));
};

const convertValuesByUnit = (
  items: RatioItem[],
  fromUnitByCount: boolean,
  toUnitByCount: boolean,
  totalQuestions: number,
) => {
  if (!Array.isArray(items) || items.length === 0 || fromUnitByCount === toUnitByCount) {
    return items;
  }

  const safeTotal = Math.max(1, totalQuestions);

  return items.map(item => {
    const raw = Math.max(0, Number(item?.ratio) || 0);
    if (!fromUnitByCount && toUnitByCount) {
      return {...item, ratio: Math.round((raw / 100) * safeTotal)};
    }
    return {...item, ratio: Math.round((((raw / safeTotal) * 100) * 100)) / 100};
  });
};

const normalizeDifficultyToTarget = (
  ratios: {easy: number; medium: number; hard: number},
  target: number,
  unitByCount: boolean,
) => {
  const source: RatioItem[] = [
    {key: 1, label: 'easy', ratio: ratios.easy},
    {key: 2, label: 'medium', ratio: ratios.medium},
    {key: 3, label: 'hard', ratio: ratios.hard},
  ];
  const normalized = normalizeConfigToTarget(source, target, unitByCount);

  return {
    easy: normalized[0]?.ratio ?? 0,
    medium: normalized[1]?.ratio ?? 0,
    hard: normalized[2]?.ratio ?? 0,
  };
};

const normalizeMaterialStatus = (material: any) =>
  String(material?.final_status || material?.status || '').toUpperCase();

const isRejectedMaterial = (material: any) => {
  const status = normalizeMaterialStatus(material);
  return status === 'REJECT' || status === 'REJECTED';
};

const getDominantDifficulty = (ratios: {easy: number; medium: number; hard: number}) => {
  const entries: Array<{key: 'EASY' | 'MEDIUM' | 'HARD'; value: number}> = [
    {key: 'EASY', value: ratios.easy},
    {key: 'MEDIUM', value: ratios.medium},
    {key: 'HARD', value: ratios.hard},
  ];

  entries.sort((a, b) => b.value - a.value);
  return entries[0]?.key || 'MEDIUM';
};

export default function CreateAIQuizScreen({navigation, route}: any) {
  const {workspaceId, materials = []} = route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();

  const [title, setTitle] = useState('AI Practice Quiz');
  const [prompt, setPrompt] = useState('');
  const [totalQuestion, setTotalQuestion] = useState('10');
  const [durationMinutes, setDurationMinutes] = useState('15');
  const [easyDurationSeconds, setEasyDurationSeconds] = useState('60');
  const [mediumDurationSeconds, setMediumDurationSeconds] = useState('120');
  const [hardDurationSeconds, setHardDurationSeconds] = useState('180');
  const [outputLanguage, setOutputLanguage] =
    useState<(typeof OUTPUT_LANGUAGES)[number]>('Vietnamese');
  const [timerMode, setTimerMode] = useState(true);
  const [questionTypeUnit, setQuestionTypeUnit] = useState(false);
  const [bloomUnit, setBloomUnit] = useState(false);
  const [questionUnit, setQuestionUnit] = useState(false);
  const [difficultyDefinitions, setDifficultyDefinitions] = useState<any[]>([]);
  const [selectedDifficultyId, setSelectedDifficultyId] = useState<string>('');
  const [customDifficulty, setCustomDifficulty] = useState({
    easy: '30',
    medium: '40',
    hard: '30',
  });
  const [questionTypes, setQuestionTypes] = useState<any[]>([]);
  const [selectedQTypes, setSelectedQTypes] = useState<RatioItem[]>([]);
  const [bloomSkills, setBloomSkills] = useState<any[]>([]);
  const [selectedBloomSkills, setSelectedBloomSkills] = useState<RatioItem[]>([]);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);
  const prevQuestionTypeUnitRef = useRef(questionTypeUnit);
  const prevBloomUnitRef = useRef(bloomUnit);
  const prevDifficultyUnitRef = useRef(questionUnit);

  const parsedTotalQuestion = useMemo(() => {
    return toInt(totalQuestion);
  }, [totalQuestion]);

  const parsedDurationMinutes = useMemo(() => toInt(durationMinutes), [durationMinutes]);
  const parsedEasyDuration = useMemo(() => toInt(easyDurationSeconds), [easyDurationSeconds]);
  const parsedMediumDuration = useMemo(
    () => toInt(mediumDurationSeconds),
    [mediumDurationSeconds],
  );
  const parsedHardDuration = useMemo(() => toInt(hardDurationSeconds), [hardDurationSeconds]);
  const qTypeTarget = questionTypeUnit ? parsedTotalQuestion : 100;
  const bloomTarget = bloomUnit ? parsedTotalQuestion : 100;
  const difficultyTarget = questionUnit ? parsedTotalQuestion : 100;

  const normalizedMaterials = useMemo(() => {
    return (Array.isArray(materials) ? materials : []).map((material: any) => {
      const id = Number(material.materialId || material.id);
      return {
        ...material,
        normalizedId: Number.isFinite(id) ? id : null,
        normalizedStatus: normalizeMaterialStatus(material),
        disabled: isRejectedMaterial(material),
      };
    });
  }, [materials]);

  const selectableMaterialIdSet = useMemo(() => {
    const ids = normalizedMaterials
      .filter(item => !item.disabled && item.normalizedId != null)
      .map(item => item.normalizedId as number);
    return new Set(ids);
  }, [normalizedMaterials]);

  useEffect(() => {
    setSelectedMaterialIds(prev => prev.filter(id => selectableMaterialIdSet.has(id)));
  }, [selectableMaterialIdSet]);

  useEffect(() => {
    setSelectedQTypes(prev => {
      let next = prev;
      if (prevQuestionTypeUnitRef.current !== questionTypeUnit) {
        next = convertValuesByUnit(
          next,
          prevQuestionTypeUnitRef.current,
          questionTypeUnit,
          parsedTotalQuestion,
        );
        prevQuestionTypeUnitRef.current = questionTypeUnit;
      }
      return rebalanceWithPinned(next, qTypeTarget, questionTypeUnit, null);
    });
  }, [parsedTotalQuestion, qTypeTarget, questionTypeUnit]);

  useEffect(() => {
    setSelectedBloomSkills(prev => {
      let next = prev;
      if (prevBloomUnitRef.current !== bloomUnit) {
        next = convertValuesByUnit(
          next,
          prevBloomUnitRef.current,
          bloomUnit,
          parsedTotalQuestion,
        );
        prevBloomUnitRef.current = bloomUnit;
      }
      return rebalanceWithPinned(next, bloomTarget, bloomUnit, null);
    });
  }, [bloomTarget, bloomUnit, parsedTotalQuestion]);

  useEffect(() => {
    if (selectedDifficultyId !== 'CUSTOM') {
      prevDifficultyUnitRef.current = questionUnit;
      return;
    }

    setCustomDifficulty(prev => {
      const current = {
        easy: toFloat(prev.easy),
        medium: toFloat(prev.medium),
        hard: toFloat(prev.hard),
      };

      let converted = current;
      if (prevDifficultyUnitRef.current !== questionUnit) {
        if (!prevDifficultyUnitRef.current && questionUnit) {
          converted = {
            easy: Math.round((current.easy / 100) * Math.max(1, parsedTotalQuestion)),
            medium: Math.round((current.medium / 100) * Math.max(1, parsedTotalQuestion)),
            hard: Math.round((current.hard / 100) * Math.max(1, parsedTotalQuestion)),
          };
        } else if (prevDifficultyUnitRef.current && !questionUnit) {
          converted = {
            easy: Math.round((((current.easy / Math.max(1, parsedTotalQuestion)) * 100) * 100)) / 100,
            medium:
              Math.round((((current.medium / Math.max(1, parsedTotalQuestion)) * 100) * 100)) /
              100,
            hard: Math.round((((current.hard / Math.max(1, parsedTotalQuestion)) * 100) * 100)) / 100,
          };
        }
        prevDifficultyUnitRef.current = questionUnit;
      }

      const normalized = normalizeDifficultyToTarget(converted, difficultyTarget, questionUnit);

      return {
        easy: String(normalized.easy),
        medium: String(normalized.medium),
        hard: String(normalized.hard),
      };
    });
  }, [difficultyTarget, parsedTotalQuestion, questionUnit, selectedDifficultyId]);

  useEffect(() => {
    let cancelled = false;

    const loadMetadata = async () => {
      try {
        setMetadataLoading(true);
        const [questionTypeRes, difficultyRes, bloomRes] = await Promise.all([
          AIAPI.getQuestionTypes(),
          AIAPI.getDifficultyDefinitions(),
          AIAPI.getBloomSkills(),
        ]);

        if (cancelled) {
          return;
        }

        const qTypeList = toList(questionTypeRes?.data).filter(item => {
          const label = String(item?.questionType || item?.name || '').toUpperCase();
          return label !== 'IMAGED_BASED';
        });
        const difficultyList = toList(difficultyRes?.data);
        const bloomList = toList(bloomRes?.data);

        setQuestionTypes(qTypeList);
        setDifficultyDefinitions(difficultyList);
        setBloomSkills(bloomList);

        if (difficultyList.length > 0) {
          const mediumPreset = difficultyList.find((item: any) =>
            String(item?.difficultyName || '').toUpperCase().includes('MEDIUM'),
          );
          const nextDifficulty = mediumPreset || difficultyList[0];
          setSelectedDifficultyId(String(nextDifficulty?.id || ''));
        }

        if (qTypeList.length > 0) {
          const first = qTypeList[0];
          const id = Number(first?.questionTypeId || first?.id);
          if (Number.isFinite(id)) {
            setSelectedQTypes([{key: id, label: first?.questionType || first?.name || 'Type', ratio: 100}]);
          }
        }

        if (bloomList.length > 0) {
          const first = bloomList[0];
          const id = Number(first?.bloomId || first?.id);
          if (Number.isFinite(id)) {
            setSelectedBloomSkills([{key: id, label: first?.name || first?.bloomName || 'Bloom', ratio: 100}]);
          }
        }
      } catch {
        if (!cancelled) {
          showToast('Không thể tải metadata cấu hình AI', 'error');
        }
      } finally {
        if (!cancelled) {
          setMetadataLoading(false);
        }
      }
    };

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const toggleMaterial = (id: number, disabled = false) => {
    if (disabled) {
      return;
    }
    setSelectedMaterialIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id],
    );
    setFieldError('');
  };

  const updateRatioItems = (
    prev: RatioItem[],
    nextKey: number,
    nextLabel: string,
    enabled: boolean,
    target: number,
    unitByCount: boolean,
  ) => {
    if (enabled) {
      const exists = prev.some(item => item.key === nextKey);
      if (exists) {
        return prev;
      }
      const next = [...prev, {key: nextKey, label: nextLabel, ratio: 0}];
      return rebalanceWithPinned(next, target, unitByCount, null);
    }
    const next = prev.filter(item => item.key !== nextKey);
    return rebalanceWithPinned(next, target, unitByCount, null);
  };

  const updateItemRatio = (
    prev: RatioItem[],
    targetKey: number,
    value: string,
    target: number,
    unitByCount: boolean,
  ) => {
    const numericRatio = unitByCount ? toInt(value) : toFloat(value);
    const next = prev.map(item => (item.key === targetKey ? {...item, ratio: numericRatio} : item));
    return rebalanceWithPinned(next, target, unitByCount, targetKey);
  };

  const selectedDifficultyRatios = useMemo(() => {
    if (selectedDifficultyId === 'CUSTOM') {
      return {
        easy: toFloat(customDifficulty.easy),
        medium: toFloat(customDifficulty.medium),
        hard: toFloat(customDifficulty.hard),
      };
    }

    const selected = difficultyDefinitions.find(
      item => String(item?.id) === String(selectedDifficultyId),
    );
    return {
      easy: toFloat(selected?.easyRatio, 30),
      medium: toFloat(selected?.mediumRatio, 40),
      hard: toFloat(selected?.hardRatio, 30),
    };
  }, [customDifficulty.easy, customDifficulty.hard, customDifficulty.medium, difficultyDefinitions, selectedDifficultyId]);

  const formatDifficultyValue = (value: number) => {
    if (questionUnit) {
      return String(Math.round(value));
    }
    return String(Math.round(value * 100) / 100);
  };

  const validateDistribution = (
    items: RatioItem[],
    unitByCount: boolean,
    label: string,
    totalQuestions: number,
  ) => {
    const target = unitByCount ? totalQuestions : 100;
    const sum = items.reduce((acc, item) => acc + (Number(item?.ratio) || 0), 0);

    if (items.length === 0) {
      return `${label} là bắt buộc`;
    }
    if (!nearlyEqual(sum, target)) {
      if (unitByCount) {
        return `Tổng số lượng ${label} phải đúng bằng ${totalQuestions}`;
      }
      return `Tổng tỷ lệ ${label} phải đúng bằng 100%`;
    }

    return '';
  };

  const handleGenerate = async () => {
    if (!workspaceId) {
      showToast('Thiếu workspaceId', 'error');
      return;
    }
    if (!title.trim()) {
      showToast('Vui lòng nhập tiêu đề quiz', 'error');
      return;
    }
    if (parsedTotalQuestion < 1) {
      showToast('Số lượng câu hỏi phải lớn hơn hoặc bằng 1', 'error');
      return;
    }

    const selectedMaterialIdsSafe = selectedMaterialIds.filter(id =>
      selectableMaterialIdSet.has(id),
    );

    if (selectedMaterialIdsSafe.length === 0 && !prompt.trim()) {
      setFieldError('Vui lòng chọn ít nhất một tài liệu hợp lệ hoặc nhập prompt');
      return;
    }

    if (timerMode) {
      if (parsedDurationMinutes < 1) {
        setFieldError('Thời lượng phải ít nhất 1 phút khi bật chế độ tính giờ tổng');
        return;
      }

      const totalDurationInSeconds = parsedDurationMinutes * 60;
      if (totalDurationInSeconds < parsedTotalQuestion * MIN_SECONDS_PER_QUESTION) {
        setFieldError(
          `Mỗi câu cần ít nhất ${MIN_SECONDS_PER_QUESTION} giây, vui lòng tăng thời lượng`,
        );
        return;
      }
    } else {
      if (parsedEasyDuration < 1 || parsedMediumDuration < 1 || parsedHardDuration < 1) {
        setFieldError('Vui lòng nhập đầy đủ thời lượng cho từng mức độ');
        return;
      }
      if (
        parsedEasyDuration < MIN_PER_DIFFICULTY_DURATION_SECONDS ||
        parsedMediumDuration < MIN_PER_DIFFICULTY_DURATION_SECONDS ||
        parsedHardDuration < MIN_PER_DIFFICULTY_DURATION_SECONDS
      ) {
        setFieldError(
          `Mỗi thời lượng theo từng câu phải ít nhất ${MIN_PER_DIFFICULTY_DURATION_SECONDS} giây`,
        );
        return;
      }
      if (parsedMediumDuration <= parsedEasyDuration) {
        setFieldError('Thời lượng Trung bình phải lớn hơn Dễ');
        return;
      }
      if (parsedHardDuration <= parsedMediumDuration) {
        setFieldError('Thời lượng Khó phải lớn hơn Trung bình');
        return;
      }
    }

    const difficultySum =
      selectedDifficultyRatios.easy +
      selectedDifficultyRatios.medium +
      selectedDifficultyRatios.hard;
    if (!nearlyEqual(difficultySum, difficultyTarget)) {
      setFieldError(
        questionUnit
          ? `Tổng số lượng độ khó phải đúng bằng ${parsedTotalQuestion}`
          : 'Tổng tỷ lệ độ khó phải đúng bằng 100%',
      );
      return;
    }

    const qTypeError = validateDistribution(
      selectedQTypes,
      questionTypeUnit,
      'Question type distribution',
      parsedTotalQuestion,
    );
    if (qTypeError) {
      setFieldError(qTypeError);
      return;
    }

    const bloomError = validateDistribution(
      selectedBloomSkills,
      bloomUnit,
      'Bloom skill distribution',
      parsedTotalQuestion,
    );
    if (bloomError) {
      setFieldError(bloomError);
      return;
    }

    setFieldError('');

    setGenerating(true);
    try {
      const selectedDifficulty = difficultyDefinitions.find(
        item => String(item?.id) === String(selectedDifficultyId),
      );

      const overallDifficulty =
        selectedDifficultyId === 'CUSTOM'
          ? getDominantDifficulty(selectedDifficultyRatios)
          : String(selectedDifficulty?.difficultyName || 'MEDIUM').toUpperCase();

      const payload = {
        title: title.trim(),
        materialIds: selectedMaterialIdsSafe,
        overallDifficulty,
        durationInMinute: timerMode ? parsedDurationMinutes : 0,
        durationInSecond: 0,
        roadmapId: null,
        phaseId: null,
        knowledgeId: null,
        workspaceId: Number(workspaceId),
        totalQuestion: parsedTotalQuestion,
        prompt: prompt.trim() || null,
        outputLanguage,
        questionTypeUnit,
        questionTypes: selectedQTypes.map(item => ({
          questionTypeId: item.key,
          ratio: Number(item.ratio) || 0,
        })),
        bloomUnit,
        bloomSkills: selectedBloomSkills.map(item => ({
          bloomId: item.key,
          ratio: Number(item.ratio) || 0,
        })),
        quizIntent: 'REVIEW',
        questionUnit,
        easyRatio: selectedDifficultyRatios.easy,
        mediumRatio: selectedDifficultyRatios.medium,
        hardRatio: selectedDifficultyRatios.hard,
        timerMode,
        ...(timerMode
          ? {}
          : {
              easyDurationInSeconds: parsedEasyDuration,
              mediumDurationInSeconds: parsedMediumDuration,
              hardDurationInSeconds: parsedHardDuration,
            }),
      };

      await AIAPI.generateAIQuiz(payload);
      showToast('Quiz AI đang được tạo', 'success');
      navigation.goBack();
    } catch {
      showToast('Không thể tạo quiz', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.heading}]}>Tạo quiz AI</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}>
        <FloatingInput label="Tiêu đề quiz" value={title} onChangeText={setTitle} />

        <View style={styles.spaceMd} />
        <FloatingInput
          label="Số lượng câu hỏi"
          value={totalQuestion}
          onChangeText={value => setTotalQuestion(normalizeIntegerInput(value))}
          keyboardType="number-pad"
        />

        <View style={styles.spaceMd} />
        <FloatingInput
          label="Prompt (tùy chọn)"
          value={prompt}
          onChangeText={setPrompt}
          multiline
        />

        <Text style={[styles.sectionTitle, {color: colors.heading}]}>Cấu hình chung</Text>

        <Text style={[styles.label, {color: colors.textSecondary}]}>Ngôn ngữ đầu ra</Text>
        <View style={styles.segmentRow}>
          {OUTPUT_LANGUAGES.map(language => {
            const active = outputLanguage === language;
            return (
              <TouchableOpacity
                key={language}
                onPress={() => setOutputLanguage(language)}
                style={[
                  styles.segmentBtn,
                  {
                    borderColor: active ? Colors.primary : colors.border,
                    backgroundColor: active
                      ? isDark
                        ? '#1E3A8A40'
                        : '#DBEAFE'
                      : colors.surface,
                  },
                ]}>
                <Text
                  style={[
                    styles.segmentText,
                    {color: active ? Colors.primary : colors.textSecondary},
                  ]}>
                  {language}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, {color: colors.heading}]}>Thời gian</Text>
        <View style={styles.segmentRow}>
          <TouchableOpacity
            onPress={() => setTimerMode(true)}
            style={[
              styles.segmentBtn,
              {
                borderColor: timerMode ? Colors.primary : colors.border,
                backgroundColor: timerMode
                  ? isDark
                    ? '#1E3A8A40'
                    : '#DBEAFE'
                  : colors.surface,
              },
            ]}>
            <Text style={[styles.segmentText, {color: timerMode ? Colors.primary : colors.textSecondary}]}>Tính giờ tổng</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTimerMode(false)}
            style={[
              styles.segmentBtn,
              {
                borderColor: !timerMode ? Colors.primary : colors.border,
                backgroundColor: !timerMode
                  ? isDark
                    ? '#1E3A8A40'
                    : '#DBEAFE'
                  : colors.surface,
              },
            ]}>
            <Text style={[styles.segmentText, {color: !timerMode ? Colors.primary : colors.textSecondary}]}>Theo từng câu</Text>
          </TouchableOpacity>
        </View>

        {timerMode ? (
          <>
            <View style={styles.spaceMd} />
            <FloatingInput
              label="Tổng thời lượng (phút)"
              value={durationMinutes}
              onChangeText={value => setDurationMinutes(normalizeIntegerInput(value))}
              keyboardType="number-pad"
            />
          </>
        ) : (
          <View style={styles.threeColumnRow}>
            <View style={styles.flexItem}>
              <FloatingInput
                label="Dễ (giây)"
                value={easyDurationSeconds}
                onChangeText={value => setEasyDurationSeconds(normalizeIntegerInput(value))}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.flexItem}>
              <FloatingInput
                label="Trung bình (giây)"
                value={mediumDurationSeconds}
                onChangeText={value => setMediumDurationSeconds(normalizeIntegerInput(value))}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.flexItem}>
              <FloatingInput
                label="Khó (giây)"
                value={hardDurationSeconds}
                onChangeText={value => setHardDurationSeconds(normalizeIntegerInput(value))}
                keyboardType="number-pad"
              />
            </View>
          </View>
        )}

        <Text style={[styles.sectionTitle, {color: colors.heading}]}>Cấu hình độ khó</Text>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Mẫu cài đặt</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.presetRow}>
          {difficultyDefinitions.map(item => {
            const id = String(item?.id);
            const active = selectedDifficultyId === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => {
                  setSelectedDifficultyId(id);
                  setQuestionUnit(false);
                }}
                style={[
                  styles.presetChip,
                  {
                    borderColor: active ? Colors.primary : colors.border,
                    backgroundColor: active
                      ? isDark
                        ? '#1E3A8A40'
                        : '#DBEAFE'
                      : colors.surface,
                  },
                ]}>
                <Text
                  style={{
                    color: active ? Colors.primary : colors.textSecondary,
                    fontSize: 12,
                    fontWeight: '600',
                  }}>
                  {String(item?.difficultyName || 'Preset')}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => setSelectedDifficultyId('CUSTOM')}
            style={[
              styles.presetChip,
              {
                borderColor: selectedDifficultyId === 'CUSTOM' ? Colors.primary : colors.border,
                backgroundColor:
                  selectedDifficultyId === 'CUSTOM'
                    ? isDark
                      ? '#1E3A8A40'
                      : '#DBEAFE'
                    : colors.surface,
              },
            ]}>
            <Text
              style={{
                color: selectedDifficultyId === 'CUSTOM' ? Colors.primary : colors.textSecondary,
                fontSize: 12,
                fontWeight: '600',
              }}>
              CUSTOM
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.toggleRow}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Độ khó theo số lượng</Text>
          <TouchableOpacity onPress={() => setQuestionUnit(prev => !prev)}>
            <Icon
              name={questionUnit ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={22}
              color={questionUnit ? Colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.threeColumnRow}>
          <View style={styles.flexItem}>
            {selectedDifficultyId === 'CUSTOM' ? (
              <FloatingInput
                label={`Dễ (${questionUnit ? 'số lượng' : '%'})`}
                value={customDifficulty.easy}
                onChangeText={value =>
                  setCustomDifficulty(prev => ({
                    ...prev,
                    easy: questionUnit
                      ? normalizeIntegerInput(value)
                      : normalizeDecimalInput(value),
                  }))
                }
                keyboardType="number-pad"
              />
            ) : (
              <View style={[styles.ratioCard, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <Text style={[styles.ratioCardLabel, {color: colors.textSecondary}]}>Dễ (%)</Text>
                <Text style={[styles.ratioCardValue, {color: colors.text}]}>
                  {formatDifficultyValue(selectedDifficultyRatios.easy)}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.flexItem}>
            {selectedDifficultyId === 'CUSTOM' ? (
              <FloatingInput
                label={`Trung bình (${questionUnit ? 'số lượng' : '%'})`}
                value={customDifficulty.medium}
                onChangeText={value =>
                  setCustomDifficulty(prev => ({
                    ...prev,
                    medium: questionUnit
                      ? normalizeIntegerInput(value)
                      : normalizeDecimalInput(value),
                  }))
                }
                keyboardType="number-pad"
              />
            ) : (
              <View style={[styles.ratioCard, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <Text style={[styles.ratioCardLabel, {color: colors.textSecondary}]}>Trung bình (%)</Text>
                <Text style={[styles.ratioCardValue, {color: colors.text}]}>
                  {formatDifficultyValue(selectedDifficultyRatios.medium)}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.flexItem}>
            {selectedDifficultyId === 'CUSTOM' ? (
              <FloatingInput
                label={`Khó (${questionUnit ? 'số lượng' : '%'})`}
                value={customDifficulty.hard}
                onChangeText={value =>
                  setCustomDifficulty(prev => ({
                    ...prev,
                    hard: questionUnit
                      ? normalizeIntegerInput(value)
                      : normalizeDecimalInput(value),
                  }))
                }
                keyboardType="number-pad"
              />
            ) : (
              <View style={[styles.ratioCard, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <Text style={[styles.ratioCardLabel, {color: colors.textSecondary}]}>Khó (%)</Text>
                <Text style={[styles.ratioCardValue, {color: colors.text}]}>
                  {formatDifficultyValue(selectedDifficultyRatios.hard)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <Text style={[styles.sectionTitle, {color: colors.heading}]}>Loại câu hỏi</Text>
        <View style={styles.toggleRow}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Dùng đơn vị số lượng</Text>
          <TouchableOpacity onPress={() => setQuestionTypeUnit(prev => !prev)}>
            <Icon
              name={questionTypeUnit ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={22}
              color={questionTypeUnit ? Colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.configList}>
          {questionTypes.map(item => {
            const key = Number(item?.questionTypeId || item?.id);
            if (!Number.isFinite(key)) {
              return null;
            }

            const selectedItem = selectedQTypes.find(entry => entry.key === key);
            const selected = !!selectedItem;
            return (
              <View key={key} style={[styles.configItem, {borderColor: colors.border}]}>
                <TouchableOpacity
                  style={styles.configCheckRow}
                  onPress={() =>
                    setSelectedQTypes(prev =>
                      updateRatioItems(
                        prev,
                        key,
                        item?.questionType || item?.name || `Type ${key}`,
                        !selected,
                        qTypeTarget,
                        questionTypeUnit,
                      ),
                    )
                  }>
                  <Icon
                    name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                    size={20}
                    color={selected ? Colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.configLabel, {color: colors.text}]}>
                    {item?.questionType || item?.name || `Type ${key}`}
                  </Text>
                </TouchableOpacity>
                {selected && (
                  <TextInput
                    value={String(selectedItem?.ratio ?? 0)}
                    onChangeText={value =>
                      setSelectedQTypes(prev =>
                        updateItemRatio(prev, key, value, qTypeTarget, questionTypeUnit),
                      )
                    }
                    keyboardType="number-pad"
                    style={[
                      styles.ratioInput,
                      {borderColor: colors.border, color: colors.text, backgroundColor: colors.surface},
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, {color: colors.heading}]}>Kỹ năng Bloom</Text>
        <View style={styles.toggleRow}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Dùng đơn vị số lượng</Text>
          <TouchableOpacity onPress={() => setBloomUnit(prev => !prev)}>
            <Icon
              name={bloomUnit ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={22}
              color={bloomUnit ? Colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.configList}>
          {bloomSkills.map(item => {
            const key = Number(item?.bloomId || item?.id);
            if (!Number.isFinite(key)) {
              return null;
            }

            const selectedItem = selectedBloomSkills.find(entry => entry.key === key);
            const selected = !!selectedItem;
            const label = item?.name || item?.bloomName || `Bloom ${key}`;

            return (
              <View key={key} style={[styles.configItem, {borderColor: colors.border}]}>
                <TouchableOpacity
                  style={styles.configCheckRow}
                  onPress={() =>
                    setSelectedBloomSkills(prev =>
                      updateRatioItems(prev, key, label, !selected, bloomTarget, bloomUnit),
                    )
                  }>
                  <Icon
                    name={selected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                    size={20}
                    color={selected ? Colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.configLabel, {color: colors.text}]}>
                    {label}
                  </Text>
                </TouchableOpacity>
                {selected && (
                  <TextInput
                    value={String(selectedItem?.ratio ?? 0)}
                    onChangeText={value =>
                      setSelectedBloomSkills(prev =>
                        updateItemRatio(prev, key, value, bloomTarget, bloomUnit),
                      )
                    }
                    keyboardType="number-pad"
                    style={[
                      styles.ratioInput,
                      {borderColor: colors.border, color: colors.text, backgroundColor: colors.surface},
                    ]}
                  />
                )}
              </View>
            );
          })}
        </View>

        <Text style={[styles.sectionTitle, {color: colors.heading}]}>Tài liệu</Text>
        {metadataLoading && (
          <Text style={[styles.helperText, {color: colors.textSecondary}]}>Đang tải metadata AI...</Text>
        )}
        {materials.length === 0 ? (
          <Text style={[styles.helperText, {color: colors.textSecondary}]}>Chưa có tài liệu. Vẫn có thể tạo quiz từ prompt.</Text>
        ) : (
          <View style={styles.materialList}>
            {normalizedMaterials.map((material: any) => {
              const id = material.normalizedId;
              if (id == null) {
                return null;
              }

              const selected = selectedMaterialIds.includes(id);
              const disabled = material.disabled;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => toggleMaterial(id, disabled)}
                  disabled={disabled}
                  style={[
                    styles.materialItem,
                    {
                      borderColor: disabled
                        ? colors.border
                        : selected
                        ? Colors.primary
                        : colors.border,
                      backgroundColor: disabled
                        ? isDark
                          ? '#33415555'
                          : '#F1F5F9'
                        : selected
                        ? isDark
                          ? '#1E3A8A30'
                          : '#EFF6FF'
                        : colors.surface,
                      opacity: disabled ? 0.7 : 1,
                    },
                  ]}>
                  <Icon
                    name={
                      disabled
                        ? 'close-circle-outline'
                        : selected
                        ? 'checkbox-marked-circle'
                        : 'checkbox-blank-circle-outline'
                    }
                    size={20}
                    color={
                      disabled
                        ? Colors.error
                        : selected
                        ? Colors.primary
                        : colors.textTertiary
                    }
                  />
                  <View style={styles.materialTextWrap}>
                    <Text style={[styles.materialTitle, {color: colors.text}]} numberOfLines={1}>
                      {material.title || material.fileName || material.name}
                    </Text>
                    <Text
                      style={[
                        styles.materialStatusText,
                        {color: disabled ? Colors.error : colors.textSecondary},
                      ]}>
                      {disabled ? 'Bị từ chối - không thể chọn' : material.normalizedStatus || 'ACTIVE'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!!fieldError && (
          <Text style={styles.errorText}>{fieldError}</Text>
        )}

        <View style={styles.spaceXl} />
        <Button
          title={generating ? 'Đang tạo...' : 'Tạo quiz'}
          onPress={handleGenerate}
          loading={generating}
          icon="magic-staff"
        />
      </ScrollView>

      {generating && (
        <View style={styles.blockingOverlay}>
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  helperText: {fontSize: 13, lineHeight: 18},
  segmentRow: {flexDirection: 'row', gap: Spacing.sm},
  segmentBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  segmentText: {fontSize: 13, fontWeight: '600'},
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  threeColumnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  flexItem: {flex: 1},
  presetRow: {gap: Spacing.sm, paddingVertical: Spacing.xs},
  presetChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  configList: {
    gap: Spacing.sm,
  },
  configItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  configCheckRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  configLabel: {
    fontSize: 13,
    flex: 1,
  },
  ratioInput: {
    minWidth: 56,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    textAlign: 'center',
    fontSize: 12,
  },
  ratioCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    minHeight: 56,
    justifyContent: 'center',
  },
  ratioCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  ratioCardValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  materialList: {gap: Spacing.sm},
  materialItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  materialTextWrap: {
    flex: 1,
  },
  materialTitle: {fontSize: 13, flex: 1},
  materialStatusText: {
    fontSize: 11,
    marginTop: 2,
  },
  errorText: {
    marginTop: Spacing.sm,
    color: Colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  spaceMd: {height: Spacing.md},
  spaceXl: {height: Spacing.xl},
  blockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000020',
  },
});
