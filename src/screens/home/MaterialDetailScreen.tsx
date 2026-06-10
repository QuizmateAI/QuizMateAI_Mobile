import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import MaterialAPI from '../../api/MaterialAPI';
import MaterialNoteAPI from '../../api/MaterialNoteAPI';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ContentRenderer from '../../components/ui/ContentRenderer';
import Dialog from '../../components/ui/Dialog';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import {buildContentBlocks, getSourceImageUrls} from '../../utils/contentBlocks';

type DrawerTab = 'tree' | 'notes' | 'ai';

type DocumentSectionNode = {
  id?: string;
  title?: string;
  level?: number;
  isActive?: boolean;
  chunkIds?: string[];
  children?: DocumentSectionNode[];
};

type MaterialNote = {
  noteId?: number;
  noteType?: 'NORMAL' | 'HIGHLIGHT';
  title?: string;
  content?: string;
  highlightedText?: string;
  createdAt?: string;
  updatedAt?: string;
};

let CachedWebView: React.ComponentType<any> | null | undefined;

const getWebViewComponent = () => {
  if (CachedWebView !== undefined) {
    return CachedWebView;
  }

  try {
    const webViewModule = require('react-native-webview');
    CachedWebView =
      webViewModule?.default || webViewModule?.WebView || webViewModule;
  } catch {
    CachedWebView = null;
  }

  return CachedWebView;
};

function resolveTextPayload(payload: any, fallback = ''): string {
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

  const candidates = [
    payload.summary,
    payload.extractedSummary,
    payload.extracted_summary,
    payload.answer,
    payload.text,
    payload.extractedText,
    payload.extracted_text,
    payload.content,
    payload.result,
    payload.message,
    payload.data?.summary,
    payload.data?.answer,
    payload.data?.text,
    payload.data?.content,
    payload.data?.result,
    payload.data?.message,
    payload.data?.extractedSummary,
    payload.data?.extracted_summary,
    payload.data?.extractedText,
    payload.data?.extracted_text,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return fallback;
}

function pickMaterialUrl(source: any): string | null {
  const candidates = [
    source?.storageURL,
    source?.storageUrl,
    source?.storage_url,
    source?.fileURL,
    source?.fileUrl,
    source?.file_url,
    source?.materialUrl,
    source?.material_url,
    source?.downloadURL,
    source?.downloadUrl,
    source?.download_url,
    source?.r2Url,
    source?.r2_url,
    source?.url,
    source?.link,
    source?.contentURL,
    source?.contentUrl,
    source?.content_url,
    source?.previewUrl,
    source?.thumbnailUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getMaterialTitle(material: any) {
  return material?.title || material?.fileName || material?.name || 'Tài liệu';
}

function getCoverInitial(title?: string) {
  const normalized = String(title || '').trim();
  const match = normalized.match(/[\p{L}\p{N}]/u);
  return (match ? match[0] : normalized[0] || '?').toUpperCase();
}

function getMaterialTypeLabel(source: any) {
  const rawType = String(
    source?.materialType || source?.type || source?.contentType || '',
  ).toLowerCase();
  const rawName = String(
    source?.title || source?.fileName || source?.name || '',
  ).toLowerCase();
  const combined = `${rawType} ${rawName}`;

  if (combined.includes('pdf')) {
    return 'PDF';
  }
  if (
    combined.includes('wordprocessingml') ||
    combined.includes('msword') ||
    /\.(docx?|rtf)\b/.test(combined)
  ) {
    return 'Word';
  }
  if (
    combined.includes('spreadsheetml') ||
    combined.includes('excel') ||
    /\.(xlsx?|csv)\b/.test(combined)
  ) {
    return 'Excel';
  }
  if (
    combined.includes('presentationml') ||
    combined.includes('powerpoint') ||
    /\.(pptx?)\b/.test(combined)
  ) {
    return 'PowerPoint';
  }
  if (combined.includes('image') || /\.(png|jpe?g|webp|gif|svg)\b/.test(combined)) {
    return 'Image';
  }
  if (combined.includes('video') || /\.(mp4|mov|avi|mkv|webm)\b/.test(combined)) {
    return 'Video';
  }
  if (combined.includes('audio') || /\.(mp3|wav|ogg|m4a|aac|flac)\b/.test(combined)) {
    return 'Audio';
  }
  if (combined.includes('link') || combined.includes('url')) {
    return 'Link';
  }
  return 'Document';
}

function buildDocumentViewerUrl(sourceUrl: string | null, materialTypeLabel: string) {
  if (!sourceUrl) {
    return null;
  }

  const lower = sourceUrl.toLowerCase();
  const encodedUrl = encodeURIComponent(sourceUrl);
  const canRenderDirect =
    materialTypeLabel === 'Image' ||
    materialTypeLabel === 'Video' ||
    materialTypeLabel === 'Audio' ||
    lower.includes('.html');

  if (canRenderDirect) {
    return sourceUrl;
  }

  if (materialTypeLabel === 'PDF' || lower.includes('.pdf')) {
    return `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodedUrl}#page=1&zoom=page-width&pagemode=none`;
  }

  if (['Word', 'Excel', 'PowerPoint'].includes(materialTypeLabel)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;
  }

  return sourceUrl;
}

function inferWorkspaceId(material: any) {
  return Number(
    material?.workspaceId ||
      material?.workspaceID ||
      material?.workspace?.workspaceId ||
      material?.workspace?.id ||
      0,
  );
}

function getSectionId(node: DocumentSectionNode) {
  return String(node?.id || '');
}

function getChildren(node: DocumentSectionNode) {
  return Array.isArray(node?.children) ? node.children : [];
}

function countSections(nodes: DocumentSectionNode[]): number {
  return (Array.isArray(nodes) ? nodes : []).reduce(
    (total, node) => total + 1 + countSections(getChildren(node)),
    0,
  );
}

function countActiveSections(nodes: DocumentSectionNode[]): number {
  return (Array.isArray(nodes) ? nodes : []).reduce((total, node) => {
    const own = node?.isActive === false ? 0 : 1;
    return total + own + countActiveSections(getChildren(node));
  }, 0);
}

function countChunks(nodes: DocumentSectionNode[]): number {
  return (Array.isArray(nodes) ? nodes : []).reduce((total, node) => {
    const own = Array.isArray(node?.chunkIds) ? node.chunkIds.length : 0;
    return total + own + countChunks(getChildren(node));
  }, 0);
}

function countActiveChunks(nodes: DocumentSectionNode[]): number {
  return (Array.isArray(nodes) ? nodes : []).reduce((total, node) => {
    const own =
      node?.isActive === false
        ? 0
        : Array.isArray(node?.chunkIds)
        ? node.chunkIds.length
        : 0;
    return total + own + countActiveChunks(getChildren(node));
  }, 0);
}

function countActiveRoots(nodes: DocumentSectionNode[]): number {
  return (Array.isArray(nodes) ? nodes : []).filter(node => node?.isActive !== false)
    .length;
}

function formatDateTime(value?: string) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString();
}

function mapAskSources(payload: any) {
  const list = Array.isArray(payload?.sources)
    ? payload.sources
    : Array.isArray(payload?.data?.sources)
    ? payload.data.sources
    : [];

  return list.map((item: any, index: number) => ({
    id: String(item?.chunk_id || item?.chunkId || index),
    title:
      item?.section_title ||
      item?.chunk_section_title ||
      item?.title ||
      `Nguon ${index + 1}`,
    page: item?.pages || item?.page || null,
    snippet: resolveTextPayload(
      item?.content || item?.snippet || item?.text || item?.chunk_content,
      '',
    ),
  }));
}

export default function MaterialDetailScreen({navigation, route}: any) {
  const {
    material,
    contextType = 'WORKSPACE',
    workspaceId: routeWorkspaceId,
    groupId: routeGroupId,
    backContext,
  } = route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();

  const materialId = Number(material?.materialId || material?.id || 0);
  const workspaceId = Number(routeWorkspaceId || routeGroupId || inferWorkspaceId(material));
  const sourceUrl = pickMaterialUrl(material);
  const materialTitle = getMaterialTitle(material);
  const materialTypeLabel = getMaterialTypeLabel(material);
  const viewerUrl = buildDocumentViewerUrl(sourceUrl, materialTypeLabel);
  const coverInitial = getCoverInitial(materialTitle);
  const screenWidth = Dimensions.get('window').width;
  const drawerWidth = Math.min(Math.max(screenWidth * 0.88, 320), 430);

  const [currentStatus, setCurrentStatus] = useState(
    String(material?.status || material?.final_status || 'UNKNOWN').toUpperCase(),
  );
  const normalizedStatus = currentStatus;
  const needsReview =
    Boolean(material?.needReview) ||
    ['WARN', 'WARNED', 'PENDING', 'PROCESSING', 'PROCECCSING'].includes(normalizedStatus);

  const [loading, setLoading] = useState(true);
  const [extractedText, setExtractedText] = useState('');
  const [contentBlocks, setContentBlocks] = useState<any[]>([]);
  const [fallbackImageUrls, setFallbackImageUrls] = useState<string[]>([]);
  const [moderationReport, setModerationReport] = useState<any>(null);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationDetailOpen, setModerationDetailOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');

  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>('tree');
  const drawerTranslateX = useRef(new Animated.Value(drawerWidth)).current;

  const [sections, setSections] = useState<DocumentSectionNode[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Record<string, boolean>>(
    {},
  );
  const [togglingSectionId, setTogglingSectionId] = useState('');

  const [notes, setNotes] = useState<MaterialNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteDialogVisible, setNoteDialogVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<MaterialNote | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const [askQuestion, setAskQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState('');
  const [askSources, setAskSources] = useState<any[]>([]);
  const [askError, setAskError] = useState('');
  const [extractedDialogVisible, setExtractedDialogVisible] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(Boolean(viewerUrl));
  const [viewerFailed, setViewerFailed] = useState(false);

  useEffect(() => {
    // Reset viewer state when switching materials so the WebView refreshes
    setViewerLoading(Boolean(viewerUrl));
    setViewerFailed(false);
  }, [viewerUrl, sourceUrl, materialId]);

  useEffect(() => {
    const nextStatus = String(
      material?.status || material?.final_status || 'UNKNOWN',
    ).toUpperCase();
    setCurrentStatus(nextStatus);
    setModerationReport(null);
    setModerationDetailOpen(false);
    setReviewLoading(false);
    setReviewError('');
    setReviewMessage('');
  }, [material?.final_status, material?.status, materialId]);

  const handleBack = useCallback(() => {
    if (backContext?.type === 'group' && Number(backContext?.groupId) > 0) {
      navigation.navigate('GroupWorkspace', {
        groupId: Number(backContext.groupId),
        title: backContext.title,
        initialTab: backContext.initialTab || 'sources',
      });
      return;
    }

    if (backContext?.type === 'workspace' && Number(backContext?.workspaceId) > 0) {
      navigation.navigate('Workspace', {
        workspaceId: Number(backContext.workspaceId),
        title: backContext.title,
        initialTab: backContext.initialTab || 'sources',
      });
      return;
    }

    if (contextType === 'GROUP' && workspaceId > 0) {
      navigation.navigate('GroupWorkspace', {
        groupId: workspaceId,
        initialTab: 'sources',
      });
      return;
    }

    if (contextType === 'WORKSPACE' && workspaceId > 0) {
      navigation.navigate('Workspace', {
        workspaceId,
        initialTab: 'sources',
      });
      return;
    }

    navigation.goBack();
  }, [backContext, contextType, navigation, workspaceId]);

  useEffect(() => {
    if (normalizedStatus === 'DELETED') {
      handleBack();
    }
  }, [handleBack, normalizedStatus]);

  const totalSectionCount = useMemo(() => countSections(sections), [sections]);
  const activeSectionCount = useMemo(
    () => countActiveSections(sections),
    [sections],
  );
  const totalChunkCount = useMemo(() => countChunks(sections), [sections]);
  const activeChunkCount = useMemo(() => countActiveChunks(sections), [sections]);
  const activeRootCount = useMemo(() => countActiveRoots(sections), [sections]);
  const displayPageCount = useMemo(() => {
    const explicitPages = Number(
      material?.totalPages || material?.pageCount || material?.pages || 0,
    );
    if (Number.isFinite(explicitPages) && explicitPages > 0) {
      return explicitPages;
    }
    const textLength = String(extractedText || '').trim().length;
    return Math.max(1, Math.ceil(textLength / 2400));
  }, [extractedText, material?.pageCount, material?.pages, material?.totalPages]);

  const statusVariant =
    normalizedStatus === 'READY' || normalizedStatus === 'ACTIVE'
      ? 'success'
      : normalizedStatus === 'PROCESSING' || normalizedStatus === 'PENDING'
      ? 'warning'
      : normalizedStatus === 'FAILED' || normalizedStatus === 'ERROR'
      ? 'error'
      : 'default';

  const moderationInfo = useMemo(() => {
    if (normalizedStatus === 'REJECT' || normalizedStatus === 'REJECTED') {
      return {
        type: 'REJECT',
        reason: moderationReport?.reason || null,
        detectedTopic: moderationReport?.detected_topic || null,
      };
    }
    if (normalizedStatus === 'WARN' || normalizedStatus === 'WARNED') {
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

  const reviewButtonVisible =
    needsReview &&
    ['WARN', 'WARNED', 'PENDING', 'PROCESSING', 'PROCECCSING'].includes(normalizedStatus);

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

  const loadSections = useCallback(async () => {
    if (!materialId) {
      setSections([]);
      return;
    }
    setSectionsLoading(true);
    try {
      const res = await MaterialAPI.getDocumentSections(materialId);
      const nextSections = Array.isArray(res?.data) ? res.data : [];
      setSections(nextSections);
      setExpandedSectionIds(prev => {
        const next = {...prev};
        nextSections.forEach(node => {
          const id = getSectionId(node);
          if (id) {
            next[id] = true;
          }
        });
        return next;
      });
    } catch (error: any) {
      setSections([]);
      showToast(error?.response?.data?.message || 'Khong the tai cay kien thuc', 'error');
    } finally {
      setSectionsLoading(false);
    }
  }, [materialId, showToast]);

  const loadNotes = useCallback(async () => {
    if (!materialId) {
      setNotes([]);
      return;
    }
    setNotesLoading(true);
    try {
      const res = await MaterialNoteAPI.list(materialId);
      setNotes(Array.isArray(res?.data) ? res.data : []);
    } catch (error: any) {
      setNotes([]);
      showToast(error?.response?.data?.message || 'Khong the tai ghi chu', 'error');
    } finally {
      setNotesLoading(false);
    }
  }, [materialId, showToast]);

  const openDrawer = useCallback(
    (nextTab: DrawerTab) => {
      setActiveDrawerTab(nextTab);
      setDrawerVisible(true);
      drawerTranslateX.setValue(drawerWidth);
      Animated.timing(drawerTranslateX, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    },
    [drawerTranslateX, drawerWidth],
  );

  const closeDrawer = useCallback(() => {
    Animated.timing(drawerTranslateX, {
      toValue: drawerWidth,
      duration: 180,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (finished) {
        setDrawerVisible(false);
      }
    });
  }, [drawerTranslateX, drawerWidth]);

  const handleReview = useCallback(
    async (isApproved: boolean) => {
      if (!materialId || reviewLoading) {
        return;
      }
      setReviewLoading(true);
      setReviewError('');
      setReviewMessage('');
      try {
        const reviewApi =
          contextType === 'GROUP'
            ? MaterialAPI.reviewGroupMaterial
            : MaterialAPI.reviewMaterial;
        const result = await reviewApi(materialId, isApproved);
        const updatedMaterial = result?.data ?? null;
        if (updatedMaterial?.status || updatedMaterial?.final_status) {
          setCurrentStatus(
            String(updatedMaterial.status || updatedMaterial.final_status).toUpperCase(),
          );
        }
        if (updatedMaterial) {
          setReviewMessage(isApproved ? 'Da duyet tai lieu.' : 'Da tu choi tai lieu.');
        }
        if (!isApproved) {
          handleBack();
        }
      } catch (error: any) {
        setReviewError(
          error?.response?.data?.message ||
            error?.message ||
            'Khong the duyet tai lieu luc nay.',
        );
      } finally {
        setReviewLoading(false);
      }
    },
    [contextType, handleBack, materialId, reviewLoading],
  );

  const handleOpenSource = useCallback(async () => {
    if (!sourceUrl) {
      showToast('Tài liệu này chưa có đường dẫn nguồn', 'info');
      return;
    }
    try {
      await Linking.openURL(sourceUrl);
    } catch {
      showToast('Khong the mo file goc', 'error');
    }
  }, [showToast, sourceUrl]);

  const handleToggleSectionExpand = useCallback((sectionId: string) => {
    if (!sectionId) {
      return;
    }
    setExpandedSectionIds(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  }, []);

  const handleToggleSectionActive = useCallback(
    async (section: DocumentSectionNode, isActive: boolean) => {
      const sectionId = getSectionId(section);
      if (!materialId || !sectionId || togglingSectionId) {
        return;
      }
      setTogglingSectionId(sectionId);
      try {
        const res = await MaterialAPI.setDocumentSectionActive(
          materialId,
          sectionId,
          isActive,
        );
        setSections(current =>
          Array.isArray(res?.data) && res.data.length > 0 ? res.data : current,
        );
      } catch (error: any) {
        showToast(error?.response?.data?.message || 'Khong the cap nhat section', 'error');
      } finally {
        setTogglingSectionId('');
      }
    },
    [materialId, showToast, togglingSectionId],
  );

  const openCreateNoteDialog = useCallback(() => {
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteDialogVisible(true);
  }, []);

  const openEditNoteDialog = useCallback((note: MaterialNote) => {
    setEditingNote(note);
    setNoteTitle(note?.title || '');
    setNoteContent(note?.content || '');
    setNoteDialogVisible(true);
  }, []);

  const closeNoteDialog = useCallback(() => {
    setNoteDialogVisible(false);
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
  }, []);

  const handleSaveNote = useCallback(async () => {
    if (!materialId || noteSaving) {
      return;
    }
    const trimmedTitle = noteTitle.trim();
    const trimmedContent = noteContent.trim();
    if (!trimmedTitle && !trimmedContent) {
      showToast('Vui long nhap tieu de hoac noi dung ghi chu', 'warning');
      return;
    }

    setNoteSaving(true);
    try {
      if (editingNote?.noteId) {
        await MaterialNoteAPI.update(editingNote.noteId, {
          title: trimmedTitle || undefined,
          content: trimmedContent || undefined,
        });
        showToast('Da cap nhat ghi chu', 'success');
      } else {
        await MaterialNoteAPI.create({
          materialId,
          noteType: 'NORMAL',
          title: trimmedTitle || undefined,
          content: trimmedContent || undefined,
        });
        showToast('Da tao ghi chu', 'success');
      }
      closeNoteDialog();
      await loadNotes();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Khong the luu ghi chu', 'error');
    } finally {
      setNoteSaving(false);
    }
  }, [
    closeNoteDialog,
    editingNote?.noteId,
    loadNotes,
    materialId,
    noteContent,
    noteSaving,
    noteTitle,
    showToast,
  ]);

  const handleDeleteNote = useCallback(
    async (noteId?: number) => {
      if (!noteId) {
        return;
      }
      try {
        await MaterialNoteAPI.delete(noteId);
        setNotes(current => current.filter(item => item?.noteId !== noteId));
        showToast('Da xoa ghi chu', 'success');
      } catch (error: any) {
        showToast(error?.response?.data?.message || 'Khong the xoa ghi chu', 'error');
      }
    },
    [showToast],
  );

  const handleAskAI = useCallback(async () => {
    const question = askQuestion.trim();
    if (!question) {
      showToast('Hay nhap cau hoi truoc khi gui', 'warning');
      return;
    }
    if (!workspaceId) {
      showToast('Khong xac dinh duoc workspace de hoi AI', 'error');
      return;
    }

    setAskLoading(true);
    setAskError('');
    try {
      const res = await MaterialAPI.askMaterial({
        question,
        workspaceId,
        materialId: materialId || undefined,
      });
      const payload = res?.data ?? {};
      setAskAnswer(
        resolveTextPayload(payload?.answer ?? payload, '') ||
          'AI chua tra ve noi dung.',
      );
      setAskSources(mapAskSources(payload));
    } catch (error: any) {
      setAskError(error?.response?.data?.message || error?.message || 'Khong the hoi AI');
      setAskAnswer('');
      setAskSources([]);
    } finally {
      setAskLoading(false);
    }
  }, [askQuestion, materialId, showToast, workspaceId]);

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
        const nextText = resolveTextPayload(textRes?.data, '');
        const blocks = buildContentBlocks(nextText);
        setExtractedText(nextText || '');
        setContentBlocks(blocks);
        setFallbackImageUrls(getSourceImageUrls(material, blocks));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadDetail();
    loadModerationReport().catch(() => {});
    loadSections().catch(() => {});
    loadNotes().catch(() => {});
    return () => {
      mounted = false;
    };
  }, [loadModerationReport, loadNotes, loadSections, material, materialId]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.surface}]}>
      <View
        style={[
          styles.topBar,
          {backgroundColor: colors.surface, borderBottomColor: colors.border},
        ]}>
        <TouchableOpacity onPress={handleBack} style={styles.iconButton}>
          <Icon name="arrow-left" size={21} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.titleCluster}>
          <View style={styles.cover}>
            <Text style={styles.coverText}>{coverInitial}</Text>
          </View>
          <View style={styles.titleTextWrap}>
            <Text numberOfLines={1} style={[styles.titleText, {color: colors.heading}]}>
              {materialTitle}
            </Text>
            <View style={styles.metaLine}>
              <Text numberOfLines={1} style={[styles.metaLineText, {color: colors.textSecondary}]}>
                {displayPageCount} trang
              </Text>
              <Badge label={materialTypeLabel} variant="default" size="sm" />
              <Badge label={normalizedStatus} variant={statusVariant as any} size="sm" />
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => openDrawer(activeDrawerTab)}
          style={styles.iconButton}>
          <Icon name="menu" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      {(moderationLoading ||
        moderationInfo ||
        reviewMessage ||
        reviewError ||
        reviewButtonVisible) && (
        <ModerationBanner
          colors={colors}
          isDark={isDark}
          normalizedStatus={normalizedStatus}
          moderationLoading={moderationLoading}
          moderationInfo={moderationInfo}
          moderationDetailOpen={moderationDetailOpen}
          setModerationDetailOpen={setModerationDetailOpen}
          reviewButtonVisible={reviewButtonVisible}
          reviewLoading={reviewLoading}
          reviewMessage={reviewMessage}
          reviewError={reviewError}
          formatSuitablePercent={formatSuitablePercent}
          onReview={handleReview}
        />
      )}

      <View
        style={[
          styles.readerStage,
          {backgroundColor: isDark ? '#0F172A' : '#E5ECF6'},
        ]}>
        <View
          style={[
            styles.readerToolbar,
            {backgroundColor: isDark ? '#111827' : '#F1F5FB', borderBottomColor: colors.border},
          ]}>
          <Text numberOfLines={1} style={[styles.readerToolbarText, {color: colors.textSecondary}]}>
            {materialTypeLabel} • {activeSectionCount}/{totalSectionCount || 0} section ON • {totalChunkCount} chunk
          </Text>
          <View style={styles.readerToolbarActions}>
            <TouchableOpacity
              onPress={() => setExtractedDialogVisible(true)}
              style={[styles.readerToolButton, {backgroundColor: isDark ? '#1E293B' : '#FFFFFF'}]}>
              <Icon name="text-box-outline" size={18} color={colors.icon} />
            </TouchableOpacity>
            {sourceUrl ? (
              <TouchableOpacity
                onPress={handleOpenSource}
                style={[styles.readerToolButton, {backgroundColor: isDark ? '#1E293B' : '#FFFFFF'}]}>
                <Icon name="open-in-new" size={18} color={colors.icon} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={[styles.readerScroll, styles.readerScrollContent]}>
          <View
            style={[
              styles.documentPage,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                shadowColor: colors.shadow,
              },
            ]}>
            <DocumentViewer
              key={viewerUrl || sourceUrl || `m-${materialId}`}
              viewerUrl={viewerUrl}
              sourceUrl={sourceUrl}
              materialTitle={materialTitle}
              viewerLoading={viewerLoading}
              viewerFailed={viewerFailed}
              setViewerLoading={setViewerLoading}
              setViewerFailed={setViewerFailed}
              colors={colors}
              isDark={isDark}
              onOpenSource={handleOpenSource}
            />
            <View style={styles.hiddenExtractedContent}>
            {fallbackImageUrls.map((url, index) => (
              <ContentRenderer
                key={`fallback-image-${index}`}
                blocks={[{type: 'image', url}]}
              />
            ))}
            {contentBlocks.length > 0 ? (
              <ContentRenderer blocks={contentBlocks} />
            ) : (
              <View style={styles.documentEmptyState}>
                <Icon name="file-document-outline" size={42} color={colors.icon} />
                <Text style={[styles.documentEmptyTitle, {color: colors.heading}]}>
                  Chưa có nội dung để hiển thị
                </Text>
                <Text style={[styles.documentEmptyText, {color: colors.textSecondary}]}>
                  {summary || 'Tài liệu này chưa có nội dung trích xuất.'}
                </Text>
              </View>
            )}
            </View>
          </View>
        </View>
      </View>

      <Modal
        visible={drawerVisible}
        transparent
        animationType="none"
        onRequestClose={closeDrawer}>
        <View style={styles.drawerOverlay}>
          <Pressable
            style={[StyleSheet.absoluteFill, {backgroundColor: colors.overlay}]}
            onPress={closeDrawer}
          />
          <Animated.View
            style={[
              styles.drawerPanel,
              {
                width: drawerWidth,
                backgroundColor: isDark ? '#0F172A' : '#F0F7FF',
                borderLeftColor: colors.border,
                transform: [{translateX: drawerTranslateX}],
              },
            ]}>
            <View
              style={[
                styles.drawerHeader,
                {borderBottomColor: colors.border},
              ]}>
              <View style={styles.drawerHeaderText}>
                <Text style={[styles.drawerTitle, {color: colors.heading}]}>
                  {materialTitle}
                </Text>
                <Text style={[styles.drawerSubtitle, {color: colors.textSecondary}]}>
                  {activeSectionCount}/{totalSectionCount || 0} section ON • {notes.length} ghi chú
                </Text>
              </View>
              <TouchableOpacity onPress={closeDrawer} style={styles.drawerCloseBtn}>
                <Icon name="close" size={22} color={colors.icon} />
              </TouchableOpacity>
            </View>

            <DrawerTabs
              activeTab={activeDrawerTab}
              onChange={setActiveDrawerTab}
              colors={colors}
              isDark={isDark}
            />

            {activeDrawerTab === 'ai' ? (
              <View style={styles.drawerAiContent}>
                <AskAiPanelFE
                  askQuestion={askQuestion}
                  setAskQuestion={setAskQuestion}
                  askLoading={askLoading}
                  askAnswer={askAnswer}
                  askSources={askSources}
                  askError={askError}
                  materialTitle={materialTitle}
                  colors={colors}
                  isDark={isDark}
                  onAsk={handleAskAI}
                />
              </View>
            ) : (
              <ScrollView
                style={styles.drawerContent}
                contentContainerStyle={styles.drawerContentContainer}>
                {activeDrawerTab === 'tree' ? (
                  <KnowledgeTreePanel
                    sections={sections}
                    sectionsLoading={sectionsLoading}
                    activeSectionCount={activeSectionCount}
                    activeChunkCount={activeChunkCount}
                    activeRootCount={activeRootCount}
                    totalSectionCount={totalSectionCount}
                    totalChunkCount={totalChunkCount}
                    totalRootCount={sections.length}
                    expandedSectionIds={expandedSectionIds}
                    togglingSectionId={togglingSectionId}
                    colors={colors}
                    isDark={isDark}
                    onToggleExpand={handleToggleSectionExpand}
                    onToggleActive={handleToggleSectionActive}
                  />
                ) : null}

                {activeDrawerTab === 'notes' ? (
                  <NotesPanel
                    notes={notes}
                    notesLoading={notesLoading}
                    colors={colors}
                    isDark={isDark}
                    onCreate={openCreateNoteDialog}
                    onEdit={openEditNoteDialog}
                    onDelete={handleDeleteNote}
                  />
                ) : null}
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>

      <Dialog
        visible={noteDialogVisible}
        onClose={closeNoteDialog}
        title={editingNote?.noteId ? 'Chỉnh sửa ghi chú' : 'Tạo ghi chú'}>
        <View style={styles.noteDialogBody}>
          <TextInput
            value={noteTitle}
            onChangeText={setNoteTitle}
            placeholder="Tiêu đề ghi chú"
            placeholderTextColor={colors.placeholder}
            style={[
              styles.noteInput,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: isDark ? colors.surfaceVariant : '#F8FAFC',
              },
            ]}
          />
          <TextInput
            value={noteContent}
            onChangeText={setNoteContent}
            multiline
            textAlignVertical="top"
            placeholder="Nhập nội dung ghi chú..."
            placeholderTextColor={colors.placeholder}
            style={[
              styles.noteTextarea,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: isDark ? colors.surfaceVariant : '#F8FAFC',
              },
            ]}
          />
          <View style={styles.noteDialogActions}>
            <Button
              title="Hủy"
              onPress={closeNoteDialog}
              variant="outline"
              size="sm"
              style={styles.noteDialogButton}
            />
            <Button
              title={editingNote?.noteId ? 'Lưu thay đổi' : 'Tạo ghi chú'}
              onPress={() => {
                handleSaveNote();
              }}
              loading={noteSaving}
              size="sm"
              style={styles.noteDialogButton}
            />
          </View>
        </View>
      </Dialog>

      <Dialog
        visible={extractedDialogVisible}
        onClose={() => setExtractedDialogVisible(false)}
        title="Nội dung trích xuất">
        <ScrollView style={styles.extractedDialogScroll}>
          {fallbackImageUrls.map((url, index) => (
            <ContentRenderer
              key={`extracted-image-${index}`}
              blocks={[{type: 'image', url}]}
            />
          ))}
          {contentBlocks.length > 0 ? (
            <ContentRenderer blocks={contentBlocks} />
          ) : (
            <Text style={[styles.bodyText, {color: colors.textSecondary}]}>
              Tài liệu này chưa có nội dung trích xuất.
            </Text>
          )}
        </ScrollView>
      </Dialog>
    </SafeAreaView>
  );
}

function DocumentViewer({
  viewerUrl,
  sourceUrl,
  materialTitle,
  viewerLoading,
  viewerFailed,
  setViewerLoading,
  setViewerFailed,
  colors,
  isDark,
  onOpenSource,
}: any) {
  const WebViewComponent = getWebViewComponent();

  if (!sourceUrl || !viewerUrl) {
    return (
      <View style={styles.documentEmptyState}>
        <Icon name="file-document-outline" size={42} color={colors.icon} />
        <Text style={[styles.documentEmptyTitle, {color: colors.heading}]}>
          Chưa tìm thấy file gốc
        </Text>
        <Text style={[styles.documentEmptyText, {color: colors.textSecondary}]}>
          Dùng nút tài liệu ở góc phải để xem nội dung đã trích xuất.
        </Text>
      </View>
    );
  }

  if (!WebViewComponent || viewerFailed) {
    return (
      <View style={styles.documentEmptyState}>
        <Icon name="file-document-outline" size={42} color={colors.icon} />
        <Text style={[styles.documentEmptyTitle, {color: colors.heading}]}>
          Không mở được trình xem tài liệu
        </Text>
        <Text style={[styles.documentEmptyText, {color: colors.textSecondary}]}>
          Bạn vẫn có thể mở file gốc hoặc xem nội dung trích xuất.
        </Text>
        <Button
          title="Mở file gốc"
          onPress={onOpenSource}
          icon="open-in-new"
          size="sm"
          style={styles.viewerFallbackButton}
        />
      </View>
    );
  }

  return (
    <View style={styles.webViewFrame}>
      {viewerLoading ? (
        <View
          style={[
            styles.webViewLoading,
            {backgroundColor: isDark ? '#111827' : '#FFFFFF'},
          ]}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[styles.metaText, {color: colors.textSecondary}]}>
            Đang mở {materialTitle}...
          </Text>
        </View>
      ) : null}
      <WebViewComponent
        source={{uri: viewerUrl}}
        style={styles.webView}
        containerStyle={styles.webView}
        originWhitelist={['*']}
        startInLoadingState
        scalesPageToFit
        nestedScrollEnabled
        showsVerticalScrollIndicator
        overScrollMode="always"
        javaScriptEnabled
        domStorageEnabled
        onLoadStart={() => {
          setViewerLoading(true);
          setViewerFailed(false);
        }}
        onLoadEnd={() => setViewerLoading(false)}
        onError={() => {
          setViewerLoading(false);
          setViewerFailed(true);
        }}
      />
    </View>
  );
}

function ModerationBanner({
  colors,
  isDark,
  normalizedStatus,
  moderationLoading,
  moderationInfo,
  moderationDetailOpen,
  setModerationDetailOpen,
  reviewButtonVisible,
  reviewLoading,
  reviewMessage,
  reviewError,
  formatSuitablePercent: _formatSuitablePercent,
  onReview,
}: any) {
  const isRejected =
    normalizedStatus === 'REJECT' || normalizedStatus === 'REJECTED';

  return (
    <View
      style={[
        styles.reviewBanner,
        {
          borderBottomColor: isRejected ? '#FCA5A5' : '#FCD34D',
          backgroundColor: isRejected
            ? isDark
              ? '#3F1D1D'
              : '#FEF2F2'
            : isDark
            ? '#3B2F12'
            : '#FFFBEB',
        },
      ]}>
      {moderationLoading ? (
        <View style={styles.reviewLoadingRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={[styles.reviewHintText, {color: colors.textSecondary}]}>
            Đang tải moderation report...
          </Text>
        </View>
      ) : null}

      {!moderationLoading && moderationInfo ? (
        <View>
          <TouchableOpacity
            onPress={() => setModerationDetailOpen((prev: boolean) => !prev)}
            style={styles.reviewHeader}>
            <Text style={[styles.reviewTitle, {color: colors.heading}]}>
              {isRejected ? 'Tài liệu không phù hợp' : 'Tài liệu cần duyệt'}
            </Text>
            <Icon
              name={moderationDetailOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {moderationDetailOpen ? (
            <View style={styles.reviewDetailBody}>
              {moderationInfo.reason ? (
                <Text style={[styles.reviewDetailText, {color: colors.textSecondary}]}>
                  <Text style={styles.reviewDetailStrong}>Lý do: </Text>
                  {moderationInfo.reason}
                </Text>
              ) : null}
              {moderationInfo.type === 'WARN' && moderationInfo.suggestion ? (
                <Text style={[styles.reviewDetailText, {color: colors.textSecondary}]}>
                  <Text style={styles.reviewDetailStrong}>Gợi ý: </Text>
                  {moderationInfo.suggestion}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {reviewButtonVisible ? (
        <View style={styles.reviewActionsRow}>
          <TouchableOpacity
            onPress={() => onReview(true)}
            disabled={reviewLoading}
            style={[
              styles.reviewActionButton,
              {backgroundColor: isDark ? '#14532D' : '#DCFCE7'},
              reviewLoading && styles.reviewActionDisabled,
            ]}>
            <Text
              style={[
                styles.reviewActionText,
                {color: isDark ? '#86EFAC' : '#166534'},
              ]}>
              Duyệt
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onReview(false)}
            disabled={reviewLoading}
            style={[
              styles.reviewActionButton,
              {backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2'},
              reviewLoading && styles.reviewActionDisabled,
            ]}>
            <Text
              style={[
                styles.reviewActionText,
                {color: isDark ? '#FCA5A5' : '#B91C1C'},
              ]}>
              Từ chối
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {reviewMessage ? (
        <Text
          style={[
            styles.reviewStatusText,
            {color: isDark ? '#86EFAC' : '#166534'},
          ]}>
          {reviewMessage}
        </Text>
      ) : null}
      {reviewError ? (
        <Text
          style={[
            styles.reviewStatusText,
            {color: isDark ? '#FCA5A5' : '#B91C1C'},
          ]}>
          {reviewError}
        </Text>
      ) : null}
    </View>
  );
}

function DrawerTabs({
  activeTab,
  onChange,
  colors,
  isDark,
}: {
  activeTab: DrawerTab;
  onChange: (tab: DrawerTab) => void;
  colors: any;
  isDark: boolean;
}) {
  const tabs: Array<{key: DrawerTab; label: string; icon: string; color: string}> = [
    {key: 'tree', label: 'Cây kiến thức', icon: 'sitemap-outline', color: Colors.primary},
    {key: 'notes', label: 'Ghi chú', icon: 'message-text-outline', color: '#F97316'},
    {key: 'ai', label: 'Hỏi AI', icon: 'sparkles', color: '#16A34A'},
  ];

  return (
    <View
      style={[
        styles.segmentWrap,
        {
          backgroundColor: isDark ? '#1E293B' : 'rgba(255,255,255,0.78)',
          borderColor: colors.border,
        },
      ]}>
      {tabs.map(tab => {
        const active = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={[
              styles.segmentBtn,
              active && {backgroundColor: tab.color},
            ]}>
            <Icon
              name={tab.icon}
              size={14}
              color={active ? '#FFFFFF' : colors.textSecondary}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.segmentText,
                {color: active ? '#FFFFFF' : colors.textSecondary},
              ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function KnowledgeTreePanel({
  sections,
  sectionsLoading,
  activeSectionCount: _activeSectionCount,
  activeChunkCount,
  activeRootCount,
  totalSectionCount,
  totalChunkCount,
  totalRootCount,
  expandedSectionIds,
  togglingSectionId,
  colors,
  isDark,
  onToggleExpand,
  onToggleActive,
}: any) {
  const scopePercent =
    totalChunkCount > 0 ? Math.round((activeChunkCount / totalChunkCount) * 100) : 0;

  return (
    <View style={styles.drawerSection}>
      <View
        style={[
          styles.scopeCard,
          {
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
            borderColor: colors.border,
          },
        ]}>
        <View style={styles.scopeHeader}>
          <Text style={[styles.scopeKicker, {color: colors.textSecondary}]}>
            PHẠM VI HỌC LIỆU
          </Text>
          <View style={styles.scopeAiPill}>
            <Icon name="fire" size={12} color="#C2410C" />
            <Text style={styles.scopeAiText}>PHẠM VI AI</Text>
          </View>
        </View>
        <View style={styles.scopePercentRow}>
          <Text style={styles.scopePercentNumber}>{scopePercent}</Text>
          <Text style={styles.scopePercentMark}>%</Text>
          <Text style={[styles.scopeRootText, {color: colors.textSecondary}]}>
            {activeRootCount} / {totalRootCount || 0} mục ON
          </Text>
        </View>
        <View style={styles.scopeProgressTrack}>
          <View style={[styles.scopeProgressFill, {width: `${scopePercent}%`}]} />
        </View>
        <View style={styles.scopeStatsRow}>
          <ScopeStat value={`${activeChunkCount}/${totalChunkCount || 0}`} label="CHUNK ON" />
          <ScopeStat value={String(totalSectionCount || 0)} label="SECTION" />
          <ScopeStat value={String(totalRootCount || 0)} label="MỤC GỐC" />
        </View>
      </View>

      <View style={styles.treeTitleRow}>
        <View style={styles.treeTitleLeft}>
          <Text style={[styles.treeTitle, {color: colors.textSecondary}]}>
            CÂY KIẾN THỨC
          </Text>
          <View style={styles.treeCountBadge}>
            <Text style={styles.treeCountText}>{totalRootCount || 0} MỤC</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.refreshButton}>
          <Icon name="refresh" size={13} color={colors.textSecondary} />
          <Text style={[styles.refreshText, {color: colors.textSecondary}]}>
            Làm mới
          </Text>
        </TouchableOpacity>
      </View>

      {sectionsLoading ? (
        <View style={styles.loadingInlineRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={[styles.metaText, {color: colors.textSecondary}]}>
            Đang tải cây kiến thức...
          </Text>
        </View>
      ) : sections.length === 0 ? (
        <EmptyPanelState
          icon="sitemap-outline"
          title="Chưa có cây kiến thức"
          description="Backend chưa trả về document sections cho tài liệu này."
          colors={colors}
        />
      ) : (
        sections.map((node: DocumentSectionNode) => (
          <SectionTreeNode
            key={getSectionId(node)}
            node={node}
            depth={0}
            expandedIds={expandedSectionIds}
            togglingSectionId={togglingSectionId}
            colors={colors}
            isDark={isDark}
            onToggleExpand={onToggleExpand}
            onToggleActive={onToggleActive}
          />
        ))
      )}
    </View>
  );
}

function NotesPanel({
  notes,
  notesLoading,
  colors,
  isDark,
  onCreate,
  onEdit,
  onDelete,
}: any) {
  return (
    <View style={styles.drawerSection}>
      <TouchableOpacity
        onPress={onCreate}
        style={[styles.floatingCreateBtn, {backgroundColor: '#F97316'}]}>
        <Icon name="plus" size={18} color="#FFFFFF" />
        <Text style={styles.floatingCreateText}>Tạo ghi chú</Text>
      </TouchableOpacity>
      {notesLoading ? (
        <View style={styles.loadingInlineRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={[styles.metaText, {color: colors.textSecondary}]}>
            Đang tải ghi chú...
          </Text>
        </View>
      ) : notes.length === 0 ? (
        <EmptyPanelState
          icon="notebook-outline"
          title="Chưa có ghi chú"
          description="Ghi chú tự do của tài liệu sẽ nằm trong tab này."
          colors={colors}
        />
      ) : (
        notes.map((note: MaterialNote, index: number) => (
          <View
            key={String(note?.noteId || note?.createdAt || index)}
            style={[
              styles.noteCard,
              {
                backgroundColor: isDark ? '#111827' : '#FFFFFF',
                borderColor: colors.border,
              },
            ]}>
            <View style={styles.noteCardHeader}>
              <View style={styles.noteIcon}>
                <Icon
                  name={note?.noteType === 'HIGHLIGHT' ? 'marker' : 'alpha-n'}
                  size={16}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.noteTitleWrap}>
                <Text style={[styles.noteTitle, {color: colors.heading}]}>
                  {note?.title ||
                    (note?.noteType === 'HIGHLIGHT'
                      ? 'Ghi chú highlight'
                      : 'Ghi chú không tiêu đề')}
                </Text>
                <Text style={[styles.noteMeta, {color: colors.textSecondary}]}>
                  {note?.noteType === 'HIGHLIGHT' ? 'Highlight' : 'Free note'}
                  {formatDateTime(note?.updatedAt || note?.createdAt)
                    ? ` • ${formatDateTime(note?.updatedAt || note?.createdAt)}`
                    : ''}
                </Text>
              </View>
              <View style={styles.noteActions}>
                <TouchableOpacity onPress={() => onEdit(note)} style={styles.noteActionBtn}>
                  <Icon name="pencil-outline" size={18} color={colors.icon} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDelete(note?.noteId)}
                  style={styles.noteActionBtn}>
                  <Icon name="trash-can-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            </View>
            {!!note?.highlightedText && (
              <View
                style={[
                  styles.highlightQuote,
                  {
                    borderLeftColor: '#F97316',
                    backgroundColor: isDark ? '#3B2F12' : '#FFF7ED',
                  },
                ]}>
                <Text style={[styles.highlightQuoteText, {color: colors.textSecondary}]}>
                  {note.highlightedText}
                </Text>
              </View>
            )}
            {!!note?.content && (
              <Text style={[styles.noteContent, {color: colors.textSecondary}]}>
                {note.content}
              </Text>
            )}
          </View>
        ))
      )}
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AskAiPanel({
  askQuestion,
  setAskQuestion,
  askLoading,
  askAnswer,
  askSources,
  askError,
  colors,
  isDark,
  onAsk,
}: any) {
  return (
    <View style={styles.drawerSection}>
      <View
        style={[
          styles.aiPromptCard,
          {
            borderColor: colors.border,
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
          },
        ]}>
        <TextInput
          value={askQuestion}
          onChangeText={setAskQuestion}
          multiline
          placeholder="Hỏi điều gì đó về tài liệu..."
          placeholderTextColor={colors.placeholder}
          style={[
            styles.aiInput,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
            },
          ]}
        />
        <Button
          title="Gửi câu hỏi"
          onPress={onAsk}
          loading={askLoading}
          icon="send"
          size="sm"
        />
      </View>

      {askError ? (
        <View
          style={[
            styles.aiResultCard,
            {
              borderColor: '#FCA5A5',
              backgroundColor: isDark ? '#3F1D1D' : '#FEF2F2',
            },
          ]}>
          <Text style={[styles.aiResultTitle, {color: Colors.error}]}>
            Không thể trả lời
          </Text>
          <Text style={[styles.bodyText, {color: colors.textSecondary}]}>
            {askError}
          </Text>
        </View>
      ) : null}

      {askAnswer ? (
        <View
          style={[
            styles.aiResultCard,
            {
              borderColor: colors.border,
              backgroundColor: isDark ? '#111827' : '#FFFFFF',
            },
          ]}>
          <Text style={[styles.aiResultTitle, {color: colors.heading}]}>
            Trả lời từ AI
          </Text>
          <Text style={[styles.bodyText, {color: colors.textSecondary}]}>
            {askAnswer}
          </Text>
          {askSources.length > 0 ? (
            <View style={styles.aiSourcesWrap}>
              <Text style={[styles.aiSourcesTitle, {color: colors.heading}]}>
                Nguồn tham chiếu
              </Text>
              {askSources.map((source: any) => (
                <View
                  key={source.id}
                  style={[
                    styles.aiSourceCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    },
                  ]}>
                  <Text style={[styles.aiSourceTitle, {color: colors.heading}]}>
                    {source.title}
                  </Text>
                  {source.page ? (
                    <Text style={[styles.aiSourceMeta, {color: colors.textSecondary}]}>
                      Trang: {source.page}
                    </Text>
                  ) : null}
                  {!!source.snippet && (
                    <Text
                      numberOfLines={4}
                      style={[styles.aiSourceSnippet, {color: colors.textSecondary}]}>
                      {source.snippet}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function AskAiPanelFE({
  askQuestion,
  setAskQuestion,
  askLoading,
  askAnswer,
  askSources,
  askError,
  materialTitle,
  colors,
  isDark,
  onAsk,
}: any) {
  const suggestions = [
    'Tóm tắt nội dung trang 1',
    'Giải thích khái niệm chính trang 1',
    'Tạo 3 câu hỏi trắc nghiệm từ phần này',
  ];

  return (
    <View style={styles.askPanel}>
      <ScrollView
        style={styles.askScroll}
        contentContainerStyle={styles.askScrollContent}
        keyboardShouldPersistTaps="handled">
      <View
        style={[
          styles.askFileCard,
          {
            backgroundColor: isDark ? '#111827' : '#F8FAFC',
            borderColor: colors.border,
          },
        ]}>
        <View style={styles.askFileIcon}>
          <Icon name="file-document-outline" size={16} color={Colors.primary} />
        </View>
        <View style={styles.askFileTextWrap}>
          <Text numberOfLines={1} style={[styles.askFileName, {color: colors.heading}]}>
            {materialTitle}
          </Text>
          <Text style={styles.askFileMeta}>Đang ở trang 1</Text>
        </View>
      </View>

      {!askAnswer && !askError ? (
        <>
          <Text style={[styles.askEmptyHint, {color: colors.textTertiary}]}>
            Hỏi AI bất kỳ điều gì về tài liệu này
          </Text>
          <Text style={[styles.askSuggestLabel, {color: colors.textSecondary}]}>
            GỢI Ý
          </Text>
          <View style={styles.askSuggestions}>
            {suggestions.map(item => (
              <TouchableOpacity
                key={item}
                onPress={() => setAskQuestion(item)}
                style={[
                  styles.askSuggestionButton,
                  {
                    backgroundColor: isDark ? '#111827' : '#FFFFFF',
                    borderColor: colors.border,
                  },
                ]}>
                <Text style={styles.askSuggestionText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      {askError ? (
        <View
          style={[
            styles.aiResultCard,
            {
              borderColor: '#FCA5A5',
              backgroundColor: isDark ? '#3F1D1D' : '#FEF2F2',
            },
          ]}>
          <Text style={[styles.aiResultTitle, {color: Colors.error}]}>
            Không thể trả lời
          </Text>
          <Text style={[styles.bodyText, {color: colors.textSecondary}]}>
            {askError}
          </Text>
        </View>
      ) : null}

      {askAnswer ? (
        <View
          style={[
            styles.aiResultCard,
            {
              borderColor: colors.border,
              backgroundColor: isDark ? '#111827' : '#FFFFFF',
            },
          ]}>
          <Text style={[styles.aiResultTitle, {color: colors.heading}]}>
            Trả lời từ AI
          </Text>
          <Text style={[styles.bodyText, {color: colors.textSecondary}]}>
            {askAnswer}
          </Text>
          {askSources.length > 0 ? (
            <View style={styles.aiSourcesWrap}>
              <Text style={[styles.aiSourcesTitle, {color: colors.heading}]}>
                Nguồn tham chiếu
              </Text>
              {askSources.map((source: any) => (
                <View
                  key={source.id}
                  style={[
                    styles.aiSourceCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    },
                  ]}>
                  <Text style={[styles.aiSourceTitle, {color: colors.heading}]}>
                    {source.title}
                  </Text>
                  {source.page ? (
                    <Text style={[styles.aiSourceMeta, {color: colors.textSecondary}]}>
                      Trang: {source.page}
                    </Text>
                  ) : null}
                  {!!source.snippet && (
                    <Text
                      numberOfLines={4}
                      style={[styles.aiSourceSnippet, {color: colors.textSecondary}]}>
                      {source.snippet}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      </ScrollView>

      <View style={[styles.askComposerDock, {backgroundColor: isDark ? '#0F172A' : '#F0F7FF'}]}>
      <View
        style={[
          styles.askComposer,
          {
            borderColor: '#93C5FD',
            backgroundColor: isDark ? '#111827' : '#FFFFFF',
          },
        ]}>
        <TextInput
          value={askQuestion}
          onChangeText={setAskQuestion}
          multiline
          placeholder="Hỏi về nội dung tài liệu..."
          placeholderTextColor={colors.placeholder}
          style={[styles.askComposerInput, {color: colors.text}]}
        />
        <TouchableOpacity
          onPress={onAsk}
          disabled={askLoading}
          style={[styles.askSendButton, askLoading && styles.askSendButtonDisabled]}>
          {askLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Icon name="send" size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
      <Text style={[styles.askFooterHint, {color: colors.textTertiary}]}>
        Enter để gửi • Shift+Enter xuống dòng • Click source pill để mở PDF
      </Text>
      </View>
    </View>
  );
}

function ScopeStat({value, label}: {value: string; label: string}) {
  return (
    <View style={styles.scopeStat}>
      <Text style={styles.scopeStatValue}>{value}</Text>
      <Text style={styles.scopeStatLabel}>{label}</Text>
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function MetricCard({title, value, colors, isDark}: any) {
  return (
    <View
      style={[
        styles.metricCard,
        {
          backgroundColor: isDark ? '#111827' : '#FFFFFF',
          borderColor: colors.border,
        },
      ]}>
      <Text style={[styles.metricValue, {color: colors.heading}]}>{value}</Text>
      <Text style={[styles.metricTitle, {color: colors.textSecondary}]}>{title}</Text>
    </View>
  );
}

function EmptyPanelState({icon, title, description, colors}: any) {
  return (
    <View style={styles.emptyState}>
      <Icon name={icon} size={30} color={colors.icon} />
      <Text style={[styles.emptyStateTitle, {color: colors.heading}]}>{title}</Text>
      <Text style={[styles.emptyStateText, {color: colors.textSecondary}]}>
        {description}
      </Text>
    </View>
  );
}

function SectionTreeNode({
  node,
  depth,
  expandedIds,
  togglingSectionId,
  colors,
  isDark,
  onToggleExpand,
  onToggleActive,
}: {
  node: DocumentSectionNode;
  depth: number;
  expandedIds: Record<string, boolean>;
  togglingSectionId: string;
  colors: any;
  isDark: boolean;
  onToggleExpand: (sectionId: string) => void;
  onToggleActive: (section: DocumentSectionNode, isActive: boolean) => void;
}) {
  const sectionId = getSectionId(node);
  const children = getChildren(node);
  const hasChildren = children.length > 0;
  const isExpanded = expandedIds[sectionId] ?? depth < 1;
  const isActive = node?.isActive !== false;
  const chunkCount = Array.isArray(node?.chunkIds) ? node.chunkIds.length : 0;
  const isToggling = togglingSectionId === sectionId;
  const activeBg = isDark ? '#052E16' : '#ECFDF5';
  const inactiveBg = isDark ? '#111827' : '#FFFFFF';
  const activeBorder = isDark ? '#22C55E' : '#86EFAC';

  return (
    <View style={styles.sectionNodeWrap}>
      <View
        style={[
          styles.sectionNodeCard,
          {
            marginLeft: depth * 14,
            borderColor: isActive ? activeBorder : colors.border,
            backgroundColor: isActive ? activeBg : inactiveBg,
            opacity: isActive ? 1 : 0.62,
          },
        ]}>
        <TouchableOpacity
          disabled={!hasChildren}
          onPress={() => onToggleExpand(sectionId)}
          style={styles.sectionNodeMain}>
          <View
            style={[
              styles.sectionNodeCheck,
              {backgroundColor: isActive ? '#10B981' : colors.border},
            ]}>
            <Icon
              name={isActive ? 'check' : 'minus'}
              size={18}
              color="#FFFFFF"
            />
          </View>
          <View style={styles.sectionNodeTextWrap}>
            <Text style={[styles.sectionNodeTitle, {color: colors.heading}]}>
              {node?.title || 'Untitled section'}
            </Text>
            <Text style={[styles.sectionNodeMeta, {color: colors.textSecondary}]}>
              {chunkCount} chunk{node?.level ? ` • Level ${node.level}` : ''}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onToggleActive(node, !isActive)}
          style={[
            styles.sectionToggle,
            {backgroundColor: isActive ? Colors.primary : isDark ? '#334155' : '#E5E7EB'},
          ]}>
          {isToggling ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <View style={styles.sectionToggleContent}>
              <Icon
                name="power"
                size={12}
                color={isActive ? '#FFFFFF' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.sectionToggleText,
                  {color: isActive ? '#FFFFFF' : colors.textSecondary},
                ]}>
                {isActive ? 'ON' : 'OFF'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        {hasChildren ? (
          <TouchableOpacity
            onPress={() => onToggleExpand(sectionId)}
            style={styles.sectionChevronBtn}>
            <Icon
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.icon}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {hasChildren && isExpanded
        ? children.map(child => (
            <SectionTreeNode
              key={getSectionId(child)}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              togglingSectionId={togglingSectionId}
              colors={colors}
              isDark={isDark}
              onToggleExpand={onToggleExpand}
              onToggleActive={onToggleActive}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  topBar: {
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCluster: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cover: {
    width: 32,
    height: 40,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 3,
  },
  coverText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  titleTextWrap: {flex: 1, minWidth: 0, gap: 4},
  titleText: {fontSize: 14, fontWeight: '800'},
  metaLine: {flexDirection: 'row', alignItems: 'center', gap: 6},
  metaLineText: {fontSize: 11, fontWeight: '600'},
  readerStage: {flex: 1},
  readerToolbar: {
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  readerToolbarText: {flex: 1, fontSize: 12, fontWeight: '700'},
  readerToolbarActions: {flexDirection: 'row', gap: Spacing.sm},
  readerToolButton: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toolBadgeText: {color: '#FFFFFF', fontSize: 9, fontWeight: '900'},
  readerScroll: {flex: 1},
  readerScrollContent: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  documentPage: {
    width: '100%',
    maxWidth: 760,
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderRadius: 4,
    padding: 0,
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 3,
    overflow: 'hidden',
  },
  webViewFrame: {
    flex: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webViewLoading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  viewerFallbackButton: {
    marginTop: Spacing.sm,
  },
  hiddenExtractedContent: {
    display: 'none',
  },
  extractedDialogScroll: {
    maxHeight: 520,
  },
  documentEmptyState: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  documentEmptyTitle: {fontSize: 16, fontWeight: '800'},
  documentEmptyText: {fontSize: 13, lineHeight: 20, textAlign: 'center'},
  reviewBanner: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
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
  reviewTitle: {fontSize: 14, fontWeight: '800'},
  reviewDetailBody: {gap: 6, paddingTop: Spacing.xs},
  reviewDetailText: {fontSize: 12, lineHeight: 18},
  reviewDetailStrong: {fontWeight: '800'},
  reviewActionsRow: {flexDirection: 'row', gap: Spacing.sm},
  reviewActionButton: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  reviewActionDisabled: {opacity: 0.6},
  reviewActionText: {fontSize: 13, fontWeight: '800'},
  reviewStatusText: {fontSize: 12, lineHeight: 18},
  reviewHintText: {fontSize: 12, lineHeight: 18},
  drawerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  drawerPanel: {
    flex: 1,
    borderLeftWidth: 1,
    shadowColor: '#000',
    shadowOffset: {width: -4, height: 0},
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 12,
  },
  drawerHeader: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  drawerHeaderText: {flex: 1, gap: 2},
  drawerTitle: {fontSize: 15, fontWeight: '800'},
  drawerSubtitle: {fontSize: 12, fontWeight: '600'},
  drawerCloseBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentWrap: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.base,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: BorderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  segmentText: {fontSize: 11, fontWeight: '800'},
  drawerContent: {flex: 1},
  drawerContentContainer: {
    padding: Spacing.base,
    paddingBottom: Spacing['4xl'],
  },
  drawerAiContent: {
    flex: 1,
    paddingTop: Spacing.base,
  },
  drawerSection: {gap: Spacing.base},
  scopeCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  scopeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  scopeKicker: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  scopeAiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scopeAiText: {
    color: '#C2410C',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  scopePercentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  scopePercentNumber: {
    color: Colors.primary,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
  },
  scopePercentMark: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '900',
    paddingBottom: 6,
  },
  scopeRootText: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '900',
    paddingBottom: 7,
  },
  scopeProgressTrack: {
    height: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: '#DBEAFE',
    overflow: 'hidden',
  },
  scopeProgressFill: {
    height: '100%',
    borderRadius: BorderRadius.full,
    backgroundColor: '#06B6D4',
  },
  scopeStatsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  scopeStat: {
    flex: 1,
    minHeight: 64,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  scopeStatValue: {
    color: '#1E40AF',
    fontSize: 18,
    fontWeight: '900',
  },
  scopeStatLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  treeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  treeTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  treeTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  treeCountBadge: {
    borderRadius: BorderRadius.full,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  treeCountText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  refreshText: {
    fontSize: 11,
    fontWeight: '800',
  },
  metricRow: {flexDirection: 'row', gap: Spacing.sm},
  metricCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 4,
  },
  metricValue: {fontSize: 20, fontWeight: '900'},
  metricTitle: {fontSize: 11, fontWeight: '700'},
  loadingInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  metaText: {fontSize: 12},
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['2xl'],
    gap: Spacing.sm,
  },
  emptyStateTitle: {fontSize: 15, fontWeight: '800'},
  emptyStateText: {fontSize: 12, lineHeight: 18, textAlign: 'center'},
  sectionNodeWrap: {gap: Spacing.sm},
  sectionNodeCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  sectionNodeMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  sectionNodeCheck: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionNodeTextWrap: {flex: 1, gap: 2},
  sectionNodeTitle: {fontSize: 14, fontWeight: '900'},
  sectionNodeMeta: {fontSize: 11, fontWeight: '700'},
  sectionToggle: {
    minWidth: 56,
    borderRadius: BorderRadius.full,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sectionToggleText: {fontSize: 11, fontWeight: '900'},
  sectionChevronBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingCreateBtn: {
    minHeight: 42,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  floatingCreateText: {color: '#FFFFFF', fontSize: 13, fontWeight: '800'},
  noteCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  noteCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  noteIcon: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteTitleWrap: {flex: 1, gap: 2},
  noteTitle: {fontSize: 14, fontWeight: '800'},
  noteMeta: {fontSize: 11},
  noteActions: {flexDirection: 'row', gap: 2},
  noteActionBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightQuote: {
    borderLeftWidth: 3,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  highlightQuoteText: {fontSize: 12, lineHeight: 18, fontStyle: 'italic'},
  noteContent: {fontSize: 13, lineHeight: 19},
  aiPromptCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  aiInput: {
    minHeight: 122,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  aiResultCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  aiResultTitle: {fontSize: 15, fontWeight: '800'},
  bodyText: {fontSize: 13, lineHeight: 20},
  aiSourcesWrap: {gap: Spacing.sm},
  aiSourcesTitle: {fontSize: 13, fontWeight: '800'},
  aiSourceCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 4,
  },
  aiSourceTitle: {fontSize: 13, fontWeight: '800'},
  aiSourceMeta: {fontSize: 11},
  aiSourceSnippet: {fontSize: 12, lineHeight: 18},
  askPanel: {
    flex: 1,
  },
  askScroll: {
    flex: 1,
  },
  askScrollContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.lg,
    gap: Spacing.base,
  },
  askFileCard: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  askFileIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  askFileTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  askFileName: {
    fontSize: 12,
    fontWeight: '900',
  },
  askFileMeta: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '900',
  },
  askEmptyHint: {
    marginTop: Spacing.xl,
    textAlign: 'center',
    fontSize: 12,
    fontStyle: 'italic',
  },
  askSuggestLabel: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.xs,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  askSuggestions: {
    gap: Spacing.sm,
  },
  askSuggestionButton: {
    minHeight: 33,
    borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  askSuggestionText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  askComposerDock: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.35)',
  },
  askComposer: {
    minHeight: 52,
    borderWidth: 2,
    borderRadius: 14,
    paddingLeft: Spacing.sm,
    paddingRight: 6,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  askComposerInput: {
    flex: 1,
    maxHeight: 92,
    paddingVertical: 9,
    fontSize: 12,
    lineHeight: 18,
    textAlignVertical: 'top',
  },
  askSendButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#8EA7F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  askSendButtonDisabled: {
    opacity: 0.7,
  },
  askFooterHint: {
    marginTop: 6,
    paddingHorizontal: 2,
    fontSize: 9,
    fontWeight: '600',
  },
  noteDialogBody: {gap: Spacing.base},
  noteInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
  },
  noteTextarea: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    lineHeight: 20,
  },
  noteDialogActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  noteDialogButton: {
    flex: 1,
    width: 'auto',
  },
});
