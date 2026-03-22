import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import StudyProfileAPI from '../../api/StudyProfileAPI';
import WorkspaceProfileAPI from '../../api/WorkspaceProfileAPI';

type LearningMode = 'STUDY_NEW' | 'REVIEW' | 'MOCK_TEST';

const LEARNING_MODES: LearningMode[] = ['STUDY_NEW', 'REVIEW', 'MOCK_TEST'];
const STEP_TITLES = ['Foundation', 'Personalization', 'Validation'];
const ADAPTATION_MODES = ['STRICT', 'FLEXIBLE'] as const;
const SPEED_MODES = ['STANDARD', 'SLOW', 'FAST'] as const;
const ANALYSIS_DEBOUNCE_MS = 800;
const FIELDS_SUGGEST_DEBOUNCE_MS = 700;
const EXAM_TEMPLATE_SUGGEST_DEBOUNCE_MS = 750;
const CONSISTENCY_DEBOUNCE_MS = 900;

const emptyFieldSuggestions = {
  currentLevelSuggestions: [] as string[],
  learningGoalSuggestions: [] as string[],
  strongAreaSuggestions: [] as string[],
  weakAreaSuggestions: [] as string[],
  examNameSuggestions: [] as string[],
};

export default function WorkspaceProfileWizardScreen({navigation, route}: any) {
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();

  const [loadingProfile, setLoadingProfile] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  const [workspaceId, setWorkspaceId] = useState<number | null>(
    Number(route?.params?.workspaceId) || null,
  );

  const [knowledge, setKnowledge] = useState('');
  const [domain, setDomain] = useState('');
  const [learningMode, setLearningMode] = useState<LearningMode>('STUDY_NEW');
  const [currentLevel, setCurrentLevel] = useState('');
  const [learningGoal, setLearningGoal] = useState('');
  const [strongAreas, setStrongAreas] = useState('');
  const [weakAreas, setWeakAreas] = useState('');
  const [examName, setExamName] = useState('');
  const [templateNames, setTemplateNames] = useState<string[]>([]);
  const [consistencyNote, setConsistencyNote] = useState('');
  const [suggestFieldsNote, setSuggestFieldsNote] = useState('');
  const [knowledgeAnalysisNote, setKnowledgeAnalysisNote] = useState('');
  const [fieldSuggestions, setFieldSuggestions] = useState(emptyFieldSuggestions);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [analysisRetryTick, setAnalysisRetryTick] = useState(0);
  const [domainOptions, setDomainOptions] = useState<Array<{label: string; reason: string}>>([]);
  const [autoSuggestingFields, setAutoSuggestingFields] = useState(false);
  const [autoSuggestingTemplates, setAutoSuggestingTemplates] = useState(false);
  const [autoValidatingConsistency, setAutoValidatingConsistency] = useState(false);
  const [roadmapEnabled, setRoadmapEnabled] = useState(true);
  const [adaptationMode, setAdaptationMode] = useState<'STRICT' | 'FLEXIBLE'>('STRICT');
  const [speedMode, setSpeedMode] = useState<'STANDARD' | 'SLOW' | 'FAST'>('STANDARD');
  const [estimatedTotalDays, setEstimatedTotalDays] = useState('30');
  const [estimatedMinutesPerDay, setEstimatedMinutesPerDay] = useState('60');

  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const fieldsSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldsSuggestAbortRef = useRef<AbortController | null>(null);
  const templateSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templateSuggestAbortRef = useRef<AbortController | null>(null);
  const templateSuggestFingerprintRef = useRef('');
  const consistencyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consistencyAbortRef = useRef<AbortController | null>(null);

  const parseListField = useCallback((value: string) =>
    value
      .split(/[\n,;/]+/)
      .map(item => item.trim())
      .filter(Boolean), []);

  const normalizeSuggestionList = useCallback((value: any): string[] => {
    if (Array.isArray(value)) {
      return value
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 6);
    }
    if (typeof value === 'string') {
      return value
        .split(/[\n,;/|]+/)
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 6);
    }
    return [];
  }, []);

  const mapFieldSuggestions = useCallback((data: any) => {
    const currentLevelSuggestions = normalizeSuggestionList(
      data.currentLevelSuggestions || data.currentLevelSuggestion || data.currentLevel,
    );
    const learningGoalSuggestions = normalizeSuggestionList(
      data.learningGoalSuggestions || data.learningGoalSuggestion || data.learningGoal,
    );
    const strongAreaSuggestions = normalizeSuggestionList(
      data.strongAreaSuggestions || data.strongAreasSuggestions || data.strongAreas,
    );
    const weakAreaSuggestions = normalizeSuggestionList(
      data.weakAreaSuggestions || data.weakAreasSuggestions || data.weakAreas,
    );
    const examNameSuggestions = normalizeSuggestionList(
      data.examNameSuggestions || data.examSuggestions || data.examName,
    );

    return {
      currentLevelSuggestions,
      learningGoalSuggestions,
      strongAreaSuggestions,
      weakAreaSuggestions,
      examNameSuggestions,
    };
  }, [normalizeSuggestionList]);

  const applyFieldSuggestion = useCallback((field: 'currentLevel' | 'learningGoal' | 'strongAreas' | 'weakAreas' | 'examName', value: string) => {
    const nextValue = String(value || '').trim();
    if (!nextValue) {
      return;
    }

    if (field === 'strongAreas' || field === 'weakAreas') {
      const currentRaw = field === 'strongAreas' ? strongAreas : weakAreas;
      const existing = parseListField(currentRaw).map(item => item.toLowerCase());
      if (existing.includes(nextValue.toLowerCase())) {
        return;
      }
      const merged = currentRaw.trim().length > 0 ? `${currentRaw.trim()}, ${nextValue}` : nextValue;
      if (field === 'strongAreas') {
        setStrongAreas(merged);
      } else {
        setWeakAreas(merged);
      }
      return;
    }

    if (field === 'currentLevel') {
      setCurrentLevel(nextValue);
      return;
    }
    if (field === 'learningGoal') {
      setLearningGoal(nextValue);
      return;
    }
    setExamName(nextValue);
  }, [parseListField, strongAreas, weakAreas]);

  const requestSuggestFields = useCallback(async ({silent = false, signal}: {silent?: boolean; signal?: AbortSignal} = {}) => {
    if (!knowledge.trim() || !domain.trim()) {
      if (!silent) {
        showToast('Please fill knowledge and domain first', 'error');
      }
      return;
    }

    if (!silent) {
      setSuggesting(true);
    }

    try {
      const res = await StudyProfileAPI.suggestProfileFields(
        {
          knowledge: knowledge.trim(),
          domain: domain.trim(),
          learningMode,
          currentLevel: currentLevel.trim() || undefined,
          strongAreas: parseListField(strongAreas),
          weakAreas: parseListField(weakAreas),
        },
        signal,
      );

      const data = res.data || {};
      setFieldSuggestions(mapFieldSuggestions(data));
      const note =
        data.message ||
        data.summary ||
        data.reasoning ||
        (Array.isArray(data.warnings) ? data.warnings.join('. ') : '') ||
        'AI field suggestion completed';
      setSuggestFieldsNote(note);
      if (!silent) {
        showToast('AI suggestions applied', 'success');
      }
    } catch {
      if (signal?.aborted) {
        return;
      }
      if (!silent) {
        showToast('Failed to suggest profile fields', 'error');
      }
    } finally {
      if (!silent) {
        setSuggesting(false);
      }
    }
  }, [
    currentLevel,
    domain,
    knowledge,
    learningMode,
    mapFieldSuggestions,
    parseListField,
    showToast,
    strongAreas,
    weakAreas,
  ]);

  const runConsistencyValidation = useCallback(async ({silent = false, signal}: {silent?: boolean; signal?: AbortSignal} = {}) => {
    if (!silent) {
      setSuggesting(true);
    }
    try {
      const res = await StudyProfileAPI.validateProfileConsistency(
        {
          knowledge,
          domain,
          learningMode,
          currentLevel,
          learningGoal,
          strongAreas: parseListField(strongAreas),
          weakAreas: parseListField(weakAreas),
          examName,
        },
        signal,
      );

      const data = res.data || {};
      const note =
        data.message ||
        data.summary ||
        (Array.isArray(data.warnings) ? data.warnings.join('. ') : '') ||
        'Profile looks consistent';
      setConsistencyNote(note);
      if (!silent) {
        showToast('Validation completed', 'success');
      }
    } catch {
      if (signal?.aborted) {
        return;
      }
      if (!silent) {
        setConsistencyNote('Could not validate consistency. Please review manually.');
        showToast('Validation failed', 'error');
      }
    } finally {
      if (!silent) {
        setSuggesting(false);
      }
    }
  }, [
    currentLevel,
    domain,
    examName,
    knowledge,
    learningGoal,
    learningMode,
    parseListField,
    strongAreas,
    weakAreas,
    showToast,
  ]);

  const requestSuggestTemplates = useCallback(async ({silent = false, signal}: {silent?: boolean; signal?: AbortSignal} = {}) => {
    if (!knowledge.trim() || !domain.trim()) {
      if (!silent) {
        showToast('Please fill knowledge and domain first', 'error');
      }
      return;
    }

    if (!silent) {
      setSuggesting(true);
    }

    try {
      const res = await StudyProfileAPI.suggestExamTemplates(
        {
          knowledge: knowledge.trim(),
          domain: domain.trim(),
        },
        signal,
      );

      const data = res.data || {};
      const templates =
        data.templates || data.examTemplates || data.data?.templates || [];
      const names = templates
        .map((item: any) => item.templateName || item.examName || item.name)
        .filter(Boolean)
        .slice(0, 5);
      setTemplateNames(names);
      if (!silent) {
        showToast('Exam templates generated', 'success');
      }
    } catch {
      if (signal?.aborted) {
        return;
      }
      if (!silent) {
        showToast('Failed to suggest exam templates', 'error');
      }
    } finally {
      if (!silent) {
        setSuggesting(false);
      }
    }
  }, [domain, knowledge, showToast]);

  const canAutoSuggestFields = useMemo(() => {
    if (step !== 2) {
      return false;
    }
    if (!knowledge.trim() || !domain.trim()) {
      return false;
    }
    if (analysisStatus !== 'success') {
      return false;
    }
    if (!domainOptions.some(option => option.label === domain)) {
      return false;
    }

    const missingCore =
      !currentLevel.trim() ||
      !learningGoal.trim() ||
      !strongAreas.trim() ||
      !weakAreas.trim();
    const missingExamName = learningMode === 'MOCK_TEST' && !examName.trim();
    return missingCore || missingExamName;
  }, [
    analysisStatus,
    currentLevel,
    domain,
    domainOptions,
    examName,
    knowledge,
    learningGoal,
    learningMode,
    step,
    strongAreas,
    weakAreas,
  ]);

  const canAutoValidateConsistency = useMemo(() => {
    if (step < 2) {
      return false;
    }
    if (!knowledge.trim() || !domain.trim()) {
      return false;
    }
    if (!currentLevel.trim() || !learningGoal.trim()) {
      return false;
    }
    if (analysisStatus !== 'success') {
      return false;
    }
    if (!domainOptions.some(option => option.label === domain)) {
      return false;
    }
    if (learningMode === 'MOCK_TEST' && !examName.trim()) {
      return false;
    }
    return true;
  }, [
    analysisStatus,
    currentLevel,
    domain,
    domainOptions,
    examName,
    knowledge,
    learningGoal,
    learningMode,
    step,
  ]);

  const canAutoSuggestTemplates = useMemo(() => {
    if (step < 2) {
      return false;
    }
    if (learningMode !== 'MOCK_TEST') {
      return false;
    }
    if (!knowledge.trim() || !domain.trim()) {
      return false;
    }
    if (analysisStatus !== 'success') {
      return false;
    }
    if (!domainOptions.some(option => option.label === domain)) {
      return false;
    }
    return true;
  }, [analysisStatus, domain, domainOptions, knowledge, learningMode, step]);

  useEffect(() => {
    const id = Number(route?.params?.workspaceId);
    if (id) {
      setWorkspaceId(id);
    }
  }, [route]);

  useEffect(() => {
    return () => {
      if (analysisTimerRef.current) {
        clearTimeout(analysisTimerRef.current);
      }
      if (fieldsSuggestTimerRef.current) {
        clearTimeout(fieldsSuggestTimerRef.current);
      }
      if (templateSuggestTimerRef.current) {
        clearTimeout(templateSuggestTimerRef.current);
      }
      if (consistencyTimerRef.current) {
        clearTimeout(consistencyTimerRef.current);
      }
      analysisAbortRef.current?.abort();
      fieldsSuggestAbortRef.current?.abort();
      templateSuggestAbortRef.current?.abort();
      consistencyAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (analysisTimerRef.current) {
      clearTimeout(analysisTimerRef.current);
    }
    analysisAbortRef.current?.abort();

    const trimmedKnowledge = knowledge.trim();
    if (!trimmedKnowledge) {
      setAnalysisStatus('idle');
      setKnowledgeAnalysisNote('');
      setDomainOptions([]);
      setDomain('');
      setFieldSuggestions(emptyFieldSuggestions);
      return;
    }

    setAnalysisStatus('loading');

    analysisTimerRef.current = setTimeout(async () => {
      const abortController = new AbortController();
      analysisAbortRef.current = abortController;

      try {
        const res = await StudyProfileAPI.analyzeKnowledge(
          trimmedKnowledge,
          abortController.signal,
        );
        if (abortController.signal.aborted) {
          return;
        }

        const data = res.data || {};
        const details =
          data.domainSuggestionDetails ||
          data.domainSuggestionDetail ||
          data.domainSuggestionsDetails ||
          [];

        let nextOptions: Array<{label: string; reason: string}> = [];
        if (Array.isArray(details) && details.length > 0) {
          nextOptions = details
            .map((item: any) => ({
              label: String(
                item?.label || item?.domain || item?.title || item?.name || '',
              ).trim(),
              reason: String(item?.reason || item?.message || '').trim() || 'Suggested by AI based on your knowledge context.',
            }))
            .filter((item: any) => item.label)
            .slice(0, 5);
        } else if (Array.isArray(data.domainSuggestions)) {
          nextOptions = data.domainSuggestions
            .map((item: any) => ({
              label: String(item || '').trim(),
              reason: 'Suggested by AI based on your knowledge context.',
            }))
            .filter((item: any) => item.label)
            .slice(0, 5);
        }

        setDomainOptions(nextOptions);
        setKnowledgeAnalysisNote(
          data.message ||
            data.summary ||
            data.advice ||
            data.warning ||
            (nextOptions.length > 0
              ? 'AI suggested domains based on your knowledge input.'
              : 'AI analyzed your knowledge input.'),
        );

        if (nextOptions.length > 0) {
          setDomain(currentDomain => {
            if (nextOptions.some(option => option.label === currentDomain)) {
              return currentDomain;
            }
            if (nextOptions.length > 2) {
              return '';
            }
            return nextOptions[0].label;
          });
        } else {
          setDomain('');
        }

        setAnalysisStatus('success');
      } catch {
        if (abortController.signal.aborted) {
          return;
        }
        setAnalysisStatus('error');
        setDomainOptions([]);
        setDomain('');
        setFieldSuggestions(emptyFieldSuggestions);
        setKnowledgeAnalysisNote('AI analysis failed. Please retry.');
      }
    }, ANALYSIS_DEBOUNCE_MS);

    return () => {
      if (analysisTimerRef.current) {
        clearTimeout(analysisTimerRef.current);
      }
      analysisAbortRef.current?.abort();
    };
  }, [knowledge, analysisRetryTick]);

  useEffect(() => {
    if (fieldsSuggestTimerRef.current) {
      clearTimeout(fieldsSuggestTimerRef.current);
    }
    fieldsSuggestAbortRef.current?.abort();

    if (!canAutoSuggestFields) {
      setAutoSuggestingFields(false);
      return;
    }

    fieldsSuggestTimerRef.current = setTimeout(async () => {
      const abortController = new AbortController();
      fieldsSuggestAbortRef.current = abortController;
      setAutoSuggestingFields(true);
      try {
        await requestSuggestFields({silent: true, signal: abortController.signal});
      } finally {
        if (!abortController.signal.aborted) {
          setAutoSuggestingFields(false);
        }
      }
    }, FIELDS_SUGGEST_DEBOUNCE_MS);

    return () => {
      if (fieldsSuggestTimerRef.current) {
        clearTimeout(fieldsSuggestTimerRef.current);
      }
      fieldsSuggestAbortRef.current?.abort();
    };
  }, [
    canAutoSuggestFields,
    currentLevel,
    domain,
    examName,
    knowledge,
    learningGoal,
    learningMode,
    requestSuggestFields,
    strongAreas,
    weakAreas,
  ]);

  useEffect(() => {
    if (templateSuggestTimerRef.current) {
      clearTimeout(templateSuggestTimerRef.current);
    }
    templateSuggestAbortRef.current?.abort();

    if (!canAutoSuggestTemplates) {
      setAutoSuggestingTemplates(false);
      templateSuggestFingerprintRef.current = '';
      if (learningMode !== 'MOCK_TEST') {
        setTemplateNames([]);
      }
      return;
    }

    const fingerprint = `${knowledge.trim().toLowerCase()}|${domain.trim().toLowerCase()}`;
    if (templateSuggestFingerprintRef.current === fingerprint) {
      return;
    }

    templateSuggestTimerRef.current = setTimeout(async () => {
      const abortController = new AbortController();
      templateSuggestAbortRef.current = abortController;
      templateSuggestFingerprintRef.current = fingerprint;
      setAutoSuggestingTemplates(true);
      try {
        await requestSuggestTemplates({silent: true, signal: abortController.signal});
      } catch {
        templateSuggestFingerprintRef.current = '';
      } finally {
        if (!abortController.signal.aborted) {
          setAutoSuggestingTemplates(false);
        }
      }
    }, EXAM_TEMPLATE_SUGGEST_DEBOUNCE_MS);

    return () => {
      if (templateSuggestTimerRef.current) {
        clearTimeout(templateSuggestTimerRef.current);
      }
      templateSuggestAbortRef.current?.abort();
    };
  }, [
    canAutoSuggestTemplates,
    domain,
    knowledge,
    learningMode,
    requestSuggestTemplates,
  ]);

  useEffect(() => {
    if (consistencyTimerRef.current) {
      clearTimeout(consistencyTimerRef.current);
    }
    consistencyAbortRef.current?.abort();

    if (!canAutoValidateConsistency) {
      setAutoValidatingConsistency(false);
      return;
    }

    consistencyTimerRef.current = setTimeout(async () => {
      const abortController = new AbortController();
      consistencyAbortRef.current = abortController;
      setAutoValidatingConsistency(true);
      try {
        await runConsistencyValidation({silent: true, signal: abortController.signal});
      } finally {
        if (!abortController.signal.aborted) {
          setAutoValidatingConsistency(false);
        }
      }
    }, CONSISTENCY_DEBOUNCE_MS);

    return () => {
      if (consistencyTimerRef.current) {
        clearTimeout(consistencyTimerRef.current);
      }
      consistencyAbortRef.current?.abort();
    };
  }, [
    canAutoValidateConsistency,
    currentLevel,
    domain,
    examName,
    knowledge,
    learningGoal,
    learningMode,
    runConsistencyValidation,
    strongAreas,
    weakAreas,
  ]);

  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      if (!workspaceId) {
        return;
      }

      setLoadingProfile(true);
      try {
        const res = await WorkspaceProfileAPI.getProfile(workspaceId);
        const profile = res.data?.data || res.data || {};
        if (!mounted) {
          return;
        }

        setKnowledge(profile.knowledge || '');
        setDomain(profile.domain || '');
        setLearningMode(profile.learningMode || 'STUDY_NEW');
        setCurrentLevel(profile.currentLevel || '');
        setLearningGoal(profile.learningGoal || '');
        setStrongAreas(Array.isArray(profile.strongAreas) ? profile.strongAreas.join(', ') : '');
        setWeakAreas(Array.isArray(profile.weakAreas) ? profile.weakAreas.join(', ') : '');
        setExamName(profile.examName || '');
        setRoadmapEnabled(
          typeof profile.roadmapEnabled === 'boolean'
            ? profile.roadmapEnabled
            : profile.learningMode === 'STUDY_NEW',
        );
        setAdaptationMode(profile.adaptationMode === 'FLEXIBLE' ? 'FLEXIBLE' : 'STRICT');
        setSpeedMode(
          profile.speedMode === 'MEDIUM' || profile.speedMode === 'STANDARD'
            ? 'STANDARD'
            : profile.speedMode || 'STANDARD',
        );
        setEstimatedTotalDays(
          profile.estimatedTotalDays ? String(profile.estimatedTotalDays) : '30',
        );
        setEstimatedMinutesPerDay(
          profile.estimatedMinutesPerDay ? String(profile.estimatedMinutesPerDay) : '60',
        );
        if (profile.currentStep && Number(profile.currentStep) >= 1 && Number(profile.currentStep) <= 3) {
          setStep(Number(profile.currentStep));
        }
      } catch {
        if (mounted) {
          showToast('Could not load current workspace profile', 'warning');
        }
      } finally {
        if (mounted) {
          setLoadingProfile(false);
        }
      }
    };

    loadProfile();
    return () => {
      mounted = false;
    };
  }, [workspaceId, showToast]);

  const handleSuggestFields = async () => {
    await requestSuggestFields();
  };

  const handleSuggestTemplates = async () => {
    await requestSuggestTemplates();
  };

  const handleValidate = async () => {
    await runConsistencyValidation();
  };

  const canGoNextStep1 =
    knowledge.trim().length > 0 &&
    domain.trim().length > 0 &&
    analysisStatus === 'success' &&
    domainOptions.some(option => option.label === domain);

  const handleSubmitProfile = async () => {
    if (!workspaceId) {
      showToast('Missing workspace id', 'error');
      return;
    }
    if (!knowledge.trim() || !domain.trim()) {
      showToast('Knowledge and domain are required', 'error');
      return;
    }
    if (!domainOptions.some(option => option.label === domain)) {
      showToast('Please select a domain from AI suggestions', 'error');
      return;
    }
    if (!currentLevel.trim() || !learningGoal.trim()) {
      showToast('Current level and learning goal are required', 'error');
      return;
    }
    if (learningMode === 'MOCK_TEST' && !examName.trim()) {
      showToast('Exam name is required for mock test mode', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        learningMode,
        domain,
        knowledge,
        currentLevel,
        learningGoal,
        weakAreas: parseListField(weakAreas),
        strongAreas: parseListField(strongAreas),
        examName,
        roadmapEnabled: learningMode === 'STUDY_NEW' ? true : roadmapEnabled,
        adaptationMode,
        speedMode,
        estimatedTotalDays: Number(estimatedTotalDays) || null,
        estimatedMinutesPerDay: Number(estimatedMinutesPerDay) || null,
      } as const;

      await WorkspaceProfileAPI.configureProfileDraft(workspaceId, payload as any);

      if (!consistencyNote) {
        await handleValidate();
      }

      const confirmRes = await WorkspaceProfileAPI.confirm(workspaceId);
      const message =
        confirmRes.data?.message ||
        confirmRes.data?.data?.message ||
        'Workspace profile configured successfully';
      showToast(message, 'success');
      navigation.goBack();
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Failed to save workspace profile';
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loadingProfile) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.header, {borderBottomColor: colors.border, backgroundColor: colors.surface}]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{flex: 1}}>
          <Text style={[styles.headerTitle, {color: colors.heading}]}>Study Profile Wizard</Text>
          <Text style={[styles.stepText, {color: colors.textSecondary}]}>Step {step}/3 • {STEP_TITLES[step - 1]}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.progressWrap}>
          {[1, 2, 3].map(stepIndex => {
            const active = stepIndex === step;
            const done = stepIndex < step;
            return (
              <View key={stepIndex} style={styles.progressItem}>
                <View
                  style={[
                    styles.progressDot,
                    {
                      backgroundColor: done || active ? Colors.primary : colors.border,
                    },
                  ]}>
                  <Text style={styles.progressDotText}>{stepIndex}</Text>
                </View>
                <Text
                  style={[
                    styles.progressLabel,
                    {color: active ? colors.heading : colors.textSecondary},
                  ]}>
                  {STEP_TITLES[stepIndex - 1]}
                </Text>
              </View>
            );
          })}
        </View>

        {step === 1 && (
          <View>
            <FloatingInput
              label="Knowledge you want to learn"
              value={knowledge}
              onChangeText={setKnowledge}
              multiline
            />

            {domain ? (
              <View
                style={[
                  styles.domainPreviewCard,
                  {borderColor: colors.border, backgroundColor: colors.surface},
                ]}>
                <View style={styles.domainPreviewHead}>
                  <Icon name="compass-outline" size={16} color={Colors.primary} />
                  <Text style={[styles.domainPreviewTitle, {color: colors.heading}]}>Primary Domain (AI selected)</Text>
                </View>
                <Text style={[styles.domainPreviewValue, {color: colors.text}]}>{domain}</Text>
              </View>
            ) : null}

            {analysisStatus === 'loading' && (
              <View style={styles.inlineStatusRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={[styles.inlineStatusText, {color: colors.textSecondary}]}>AI is analyzing your knowledge...</Text>
              </View>
            )}

            {analysisStatus === 'error' && (
              <TouchableOpacity
                onPress={() => setAnalysisRetryTick(value => value + 1)}
                style={[
                  styles.retryRow,
                  {borderColor: colors.border, backgroundColor: colors.surface},
                ]}>
                <Icon name="refresh" size={16} color={Colors.primary} />
                <Text style={[styles.retryText, {color: colors.textSecondary}]}>Retry AI domain suggestion</Text>
              </TouchableOpacity>
            )}

            {domainOptions.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, {color: colors.heading}]}>AI suggested domains</Text>
                <View style={styles.chipsWrap}>
                  {domainOptions.map(option => {
                    const active = option.label === domain;
                    return (
                      <View
                        key={option.label}
                        style={[
                          styles.domainOptionCard,
                          {
                            borderColor: active ? Colors.primary : colors.border,
                            backgroundColor: active
                              ? isDark
                                ? '#1E3A8A40'
                                : '#DBEAFE'
                              : colors.surface,
                          },
                        ]}>
                        <TouchableOpacity onPress={() => setDomain(option.label)} style={styles.domainOptionHead}>
                          <Text
                            style={[
                              styles.chipText,
                              {color: active ? Colors.primary : colors.textSecondary},
                            ]}>
                            {option.label}
                          </Text>
                          {active && (
                            <Icon name="check-circle" size={16} color={Colors.primary} />
                          )}
                        </TouchableOpacity>
                        {!!option.reason && (
                          <Text style={[styles.domainOptionReason, {color: colors.textTertiary}]}>
                            {option.reason}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            ) : analysisStatus === 'success' ? (
              <View
                style={[
                  styles.noDomainCard,
                  {borderColor: colors.border, backgroundColor: colors.surface},
                ]}>
                <Icon name="alert-circle-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.noDomainText, {color: colors.textSecondary}]}>AI could not suggest a clear domain. Please refine your knowledge description.</Text>
              </View>
            ) : null}

            {analysisStatus === 'success' && domainOptions.length > 2 && !domain && (
              <View
                style={[
                  styles.noDomainCard,
                  {borderColor: colors.border, backgroundColor: colors.surface},
                ]}>
                <Icon name="gesture-tap-button" size={16} color={Colors.primary} />
                <Text style={[styles.noDomainText, {color: colors.textSecondary}]}>AI found multiple possible domains. Please pick one domain to continue.</Text>
              </View>
            )}

            <Text style={[styles.sectionTitle, {color: colors.heading}]}>Learning mode</Text>
            <View style={styles.segmentRow}>
              {LEARNING_MODES.map(mode => {
                const active = learningMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => setLearningMode(mode)}
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
                      {mode}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {!!knowledgeAnalysisNote && (
              <View style={[styles.card, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <Text style={[styles.cardTitle, {color: colors.heading}]}>AI analysis response</Text>
                <Text style={[styles.cardLine, {color: colors.textSecondary}]}> {knowledgeAnalysisNote}</Text>
              </View>
            )}
          </View>
        )}

        {step === 2 && (
          <View>
            <FloatingInput
              label="Current level"
              value={currentLevel}
              onChangeText={setCurrentLevel}
            />
            {fieldSuggestions.currentLevelSuggestions.length > 0 && (
              <View style={styles.aiSuggestionsWrap}>
                <Text style={[styles.aiSuggestionsLabel, {color: colors.textSecondary}]}>AI suggestions</Text>
                <View style={styles.chipsWrap}>
                  {fieldSuggestions.currentLevelSuggestions.map(item => (
                    <TouchableOpacity
                      key={`current-${item}`}
                      onPress={() => applyFieldSuggestion('currentLevel', item)}
                      style={[styles.chip, {borderColor: colors.border, backgroundColor: colors.surface}]}
                    >
                      <Text style={[styles.chipText, {color: colors.textSecondary}]}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <View style={styles.spaceMd} />
            <FloatingInput
              label="Learning goal"
              value={learningGoal}
              onChangeText={setLearningGoal}
              multiline
            />
            {fieldSuggestions.learningGoalSuggestions.length > 0 && (
              <View style={styles.aiSuggestionsWrap}>
                <Text style={[styles.aiSuggestionsLabel, {color: colors.textSecondary}]}>AI suggestions</Text>
                <View style={styles.chipsWrap}>
                  {fieldSuggestions.learningGoalSuggestions.map(item => (
                    <TouchableOpacity
                      key={`goal-${item}`}
                      onPress={() => applyFieldSuggestion('learningGoal', item)}
                      style={[styles.chip, {borderColor: colors.border, backgroundColor: colors.surface}]}
                    >
                      <Text style={[styles.chipText, {color: colors.textSecondary}]}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <View style={styles.spaceMd} />
            <FloatingInput
              label="Strong areas (comma separated)"
              value={strongAreas}
              onChangeText={setStrongAreas}
            />
            {fieldSuggestions.strongAreaSuggestions.length > 0 && (
              <View style={styles.aiSuggestionsWrap}>
                <Text style={[styles.aiSuggestionsLabel, {color: colors.textSecondary}]}>AI suggestions (tap to add)</Text>
                <View style={styles.chipsWrap}>
                  {fieldSuggestions.strongAreaSuggestions.map(item => (
                    <TouchableOpacity
                      key={`strong-${item}`}
                      onPress={() => applyFieldSuggestion('strongAreas', item)}
                      style={[styles.chip, {borderColor: colors.border, backgroundColor: colors.surface}]}
                    >
                      <Text style={[styles.chipText, {color: colors.textSecondary}]}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <View style={styles.spaceMd} />
            <FloatingInput
              label="Weak areas (comma separated)"
              value={weakAreas}
              onChangeText={setWeakAreas}
            />
            {fieldSuggestions.weakAreaSuggestions.length > 0 && (
              <View style={styles.aiSuggestionsWrap}>
                <Text style={[styles.aiSuggestionsLabel, {color: colors.textSecondary}]}>AI suggestions (tap to add)</Text>
                <View style={styles.chipsWrap}>
                  {fieldSuggestions.weakAreaSuggestions.map(item => (
                    <TouchableOpacity
                      key={`weak-${item}`}
                      onPress={() => applyFieldSuggestion('weakAreas', item)}
                      style={[styles.chip, {borderColor: colors.border, backgroundColor: colors.surface}]}
                    >
                      <Text style={[styles.chipText, {color: colors.textSecondary}]}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            {learningMode === 'MOCK_TEST' && (
              <>
                <View style={styles.spaceMd} />
                <FloatingInput
                  label="Target exam name"
                  value={examName}
                  onChangeText={setExamName}
                />
                {fieldSuggestions.examNameSuggestions.length > 0 && (
                  <View style={styles.aiSuggestionsWrap}>
                    <Text style={[styles.aiSuggestionsLabel, {color: colors.textSecondary}]}>AI suggestions</Text>
                    <View style={styles.chipsWrap}>
                      {fieldSuggestions.examNameSuggestions.map(item => (
                        <TouchableOpacity
                          key={`exam-${item}`}
                          onPress={() => applyFieldSuggestion('examName', item)}
                          style={[styles.chip, {borderColor: colors.border, backgroundColor: colors.surface}]}
                        >
                          <Text style={[styles.chipText, {color: colors.textSecondary}]}>{item}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}

            <View style={styles.spaceLg} />
            <Button
              title="AI suggest profile fields"
              onPress={handleSuggestFields}
              loading={suggesting}
              variant="secondary"
              icon="lightbulb-on-outline"
            />

            {autoSuggestingFields && (
              <View style={styles.inlineStatusRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={[styles.inlineStatusText, {color: colors.textSecondary}]}>AI is refining profile fields...</Text>
              </View>
            )}

            {!!suggestFieldsNote && (
              <View style={[styles.card, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <Text style={[styles.cardTitle, {color: colors.heading}]}>AI suggestion response</Text>
                <Text style={[styles.cardLine, {color: colors.textSecondary}]}>{suggestFieldsNote}</Text>
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View>
            <Button
              title="Generate exam templates"
              onPress={handleSuggestTemplates}
              loading={suggesting}
              variant="secondary"
              icon="file-document-multiple-outline"
            />

            {autoSuggestingTemplates && (
              <View style={styles.inlineStatusRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={[styles.inlineStatusText, {color: colors.textSecondary}]}>AI is generating exam templates...</Text>
              </View>
            )}

            <View style={styles.spaceLg} />
            <Button
              title="Validate consistency"
              onPress={handleValidate}
              loading={suggesting}
              icon="check-decagram-outline"
            />

            {autoValidatingConsistency && (
              <View style={styles.inlineStatusRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={[styles.inlineStatusText, {color: colors.textSecondary}]}>AI is checking consistency...</Text>
              </View>
            )}

            {templateNames.length > 0 && (
              <View style={[styles.card, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <Text style={[styles.cardTitle, {color: colors.heading}]}>Suggested templates</Text>
                {templateNames.map(name => (
                  <Text key={name} style={[styles.cardLine, {color: colors.textSecondary}]}>• {name}</Text>
                ))}
              </View>
            )}

            {!!consistencyNote && (
              <View style={[styles.card, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <Text style={[styles.cardTitle, {color: colors.heading}]}>Validation result</Text>
                <Text style={[styles.cardLine, {color: colors.textSecondary}]}>{consistencyNote}</Text>
              </View>
            )}

            <Text style={[styles.sectionTitle, {color: colors.heading}]}>Roadmap config</Text>
            {learningMode !== 'STUDY_NEW' && (
              <TouchableOpacity
                onPress={() => setRoadmapEnabled(prev => !prev)}
                style={[
                  styles.checkboxRow,
                  {borderColor: colors.border, backgroundColor: colors.surface},
                ]}>
                <Icon
                  name={roadmapEnabled ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={20}
                  color={roadmapEnabled ? Colors.primary : colors.textSecondary}
                />
                <Text style={[styles.checkboxText, {color: colors.textSecondary}]}>Enable roadmap</Text>
              </TouchableOpacity>
            )}

            {(learningMode === 'STUDY_NEW' || roadmapEnabled) && (
              <>
                <View style={styles.spaceMd} />
                <FloatingInput
                  label="Estimated total days"
                  value={estimatedTotalDays}
                  onChangeText={setEstimatedTotalDays}
                  keyboardType="number-pad"
                />
                <View style={styles.spaceMd} />
                <FloatingInput
                  label="Estimated minutes/day"
                  value={estimatedMinutesPerDay}
                  onChangeText={setEstimatedMinutesPerDay}
                  keyboardType="number-pad"
                />

                <Text style={[styles.sectionTitle, {color: colors.heading}]}>Speed mode</Text>
                <View style={styles.segmentRow}>
                  {SPEED_MODES.map(mode => {
                    const active = speedMode === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => setSpeedMode(mode)}
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
                          {mode}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.sectionTitle, {color: colors.heading}]}>Adaptation mode</Text>
                <View style={styles.segmentRow}>
                  {ADAPTATION_MODES.map(mode => {
                    const active = adaptationMode === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => setAdaptationMode(mode)}
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
                          {mode}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}

        <View style={styles.spaceXl} />
      </ScrollView>

      <View style={[styles.footer, {borderTopColor: colors.border, backgroundColor: colors.surface}]}>
        {step > 1 ? (
          <Button
            title="Back"
            onPress={() => setStep(prev => Math.max(1, prev - 1))}
            variant="outline"
            size="md"
            fullWidth={false}
            style={styles.footerBtn}
          />
        ) : (
          <View style={styles.footerBtnPlaceholder} />
        )}

        {step < 3 ? (
          <Button
            title="Next"
            onPress={() => {
              if (step === 1 && !canGoNextStep1) {
                showToast('Please complete Step 1 first', 'error');
                return;
              }
              setStep(prev => Math.min(3, prev + 1));
            }}
            size="md"
            fullWidth={false}
            style={styles.footerBtn}
          />
        ) : (
          <Button
            title={saving ? 'Saving...' : 'Finish'}
            onPress={handleSubmitProfile}
            loading={saving}
            size="md"
            fullWidth={false}
            style={styles.footerBtn}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {width: 32, alignItems: 'center', justifyContent: 'center'},
  headerTitle: {fontSize: 17, fontWeight: '600', flex: 1},
  stepText: {fontSize: 12, fontWeight: '500'},
  content: {flex: 1},
  contentContainer: {padding: Spacing.lg},
  progressWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  progressItem: {alignItems: 'center', flex: 1},
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotText: {fontSize: 11, color: '#FFFFFF', fontWeight: '700'},
  progressLabel: {fontSize: 11, marginTop: 4, textAlign: 'center'},
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  inlineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  inlineStatusText: {fontSize: 12},
  retryRow: {
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  retryText: {fontSize: 12, fontWeight: '500'},
  segmentRow: {flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap'},
  segmentBtn: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  segmentText: {fontSize: 12, fontWeight: '600'},
  chipsWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm},
  chip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  aiSuggestionsWrap: {marginTop: Spacing.xs, gap: Spacing.xs},
  aiSuggestionsLabel: {fontSize: 11, fontWeight: '600'},
  chipText: {fontSize: 12},
  domainPreviewCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    gap: 4,
  },
  domainPreviewHead: {flexDirection: 'row', alignItems: 'center', gap: Spacing.xs},
  domainPreviewTitle: {fontSize: 12, fontWeight: '600'},
  domainPreviewValue: {fontSize: 13, fontWeight: '700'},
  domainOptionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    minWidth: 140,
    maxWidth: '100%',
  },
  domainOptionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  domainOptionReason: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 15,
  },
  noDomainCard: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  noDomainText: {fontSize: 12, lineHeight: 17, flex: 1},
  card: {
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardTitle: {fontSize: 14, fontWeight: '600'},
  cardLine: {fontSize: 13, lineHeight: 18},
  checkboxRow: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  checkboxText: {fontSize: 13, fontWeight: '500'},
  loadingWrap: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerBtn: {width: 120},
  footerBtnPlaceholder: {width: 120},
  spaceMd: {height: Spacing.md},
  spaceLg: {height: Spacing.lg},
  spaceXl: {height: Spacing.xl},
});
