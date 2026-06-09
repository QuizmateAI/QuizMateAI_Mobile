import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  findNodeHandle,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {useAuth} from '../../context/AuthContext';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import QuizAPI from '../../api/QuizAPI';
import MaterialAPI from '../../api/MaterialAPI';
import GroupDiscussionAPI from '../../api/GroupDiscussionAPI';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import type {QuizBackContext, QuizDetailRouteParams} from '../../navigation/QuizStack';
import useWebSocket from '../../hooks/useWebSocket';

type QuizDetailTab = 'overview' | 'questions' | 'history' | 'discussion';

type QuizDetailParams = Partial<QuizDetailRouteParams>;

const tabs: Array<{
  key: QuizDetailTab;
  label: string;
  icon: string;
}> = [
  {key: 'overview', label: 'Tổng quan', icon: 'information-outline'},
  {key: 'discussion', label: 'Thảo luận', icon: 'message-text-outline'},
  {key: 'questions', label: 'Câu hỏi', icon: 'format-list-bulleted'},
  {key: 'history', label: 'Lịch sử làm bài', icon: 'history'},
];

const intentLabels: Record<string, string> = {
  PRE_LEARNING: 'Trước khi học',
  POST_LEARNING: 'Sau khi học',
  REVIEW: 'Ôn tập',
  PRACTICE: 'Luyện tập',
  MOCK_TEST: 'Thi thử',
  EXAM: 'Kiểm tra',
  REMEDIAL: 'Bù lỗ hổng',
};

const difficultyLabels: Record<string, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
  CUSTOM: 'Tùy chỉnh (Tự cấu hình)',
};

const questionTypeLabels: Record<string, string> = {
  SINGLE_CHOICE: 'Một đáp án',
  MULTIPLE_CHOICE: 'Nhiều đáp án',
  TRUE_FALSE: 'Đúng/Sai',
  TEXT: 'Tự luận',
  FILL_BLANK: 'Điền khuyết',
  MATCHING: 'Ghép cặp',
};

function toArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

function firstText(...values: any[]) {
  for (const value of values) {
    if (value == null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function toPositiveNumber(value: any) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function isTruthyFlag(value: any) {
  if (value === true || value === 1 || value === '1') {
    return true;
  }
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === 'passed';
}

function isFalseFlag(value: any) {
  if (value === false || value === 0 || value === '0') {
    return true;
  }
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'false' || normalized === 'no' || normalized === 'failed';
}

function formatDateTime(value: any) {
  if (!value) {
    return 'Không rõ';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeTime(value: any) {
  if (!value) {
    return '';
  }
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) {
    return formatDateTime(value);
  }
  const diffSeconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (diffSeconds < 60) {
    return 'vừa xong';
  }
  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)} phút trước`;
  }
  if (diffSeconds < 86400) {
    return `${Math.floor(diffSeconds / 3600)} giờ trước`;
  }
  return formatDateTime(value);
}

function formatNumber(value: any) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return '';
  }
  return Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(1).replace('.', ',');
}

function getQuizIdFrom(value: any) {
  return toPositiveNumber(value?.quizId || value?.id);
}

function getDurationInMinutes(quiz: any) {
  const directMinutes = toPositiveNumber(
    quiz?.timeLimitMinutes ||
      quiz?.durationInMinute ||
      quiz?.durationMinutes ||
      quiz?.totalDurationMinutes,
  );
  if (directMinutes) {
    return Math.max(1, Math.round(directMinutes));
  }

  const seconds = toPositiveNumber(
    quiz?.timeLimitSeconds ||
      quiz?.durationInSecond ||
      quiz?.durationSeconds ||
      quiz?.duration,
  );
  return seconds ? Math.max(1, Math.round(seconds / 60)) : 0;
}

function getTimerModeLabel(quiz: any) {
  const value = quiz?.timerMode ?? quiz?.isTotalTimer ?? quiz?.timeMode;
  if (
    value === true ||
    value === 'true' ||
    value === 1 ||
    value === '1' ||
    String(value || '').toUpperCase() === 'TOTAL'
  ) {
    return 'Giới hạn thời gian tổng';
  }
  if (
    value === false ||
    value === 'false' ||
    value === 0 ||
    value === '0' ||
    String(value || '').toUpperCase() === 'PER_QUESTION'
  ) {
    return 'Giới hạn theo từng câu';
  }
  return 'Chưa cấu hình';
}

function getIntentLabel(value: any) {
  const normalized = String(value || '').trim().toUpperCase();
  return intentLabels[normalized] || firstText(value, 'Không rõ');
}

function getDifficultyLabel(value: any) {
  const normalized = String(value || '').trim().toUpperCase();
  return difficultyLabels[normalized] || firstText(value, 'Không rõ');
}

function getAudienceLabel(quiz: any, params: QuizDetailParams) {
  const contextType = String(params.contextType || '').toUpperCase();
  if (contextType === 'GROUP' || params.backContext?.type === 'group') {
    const audienceMode = String(quiz?.groupAudienceMode || '').toUpperCase();
    return audienceMode === 'SELECTED_MEMBERS' ? 'Thành viên được giao' : 'Cả nhóm';
  }
  return quiz?.communityShared === true ? 'Công khai' : 'Riêng tư';
}

function getResultLabel(quiz: any, history: any[]) {
  const completedHistory = history.some(
    item => String(item?.status || '').toUpperCase() === 'COMPLETED',
  );
  if (isTruthyFlag(quiz?.myPassed)) {
    return 'Đã đạt';
  }
  if (isFalseFlag(quiz?.myPassed) && (isTruthyFlag(quiz?.myAttempted) || completedHistory)) {
    return 'Chưa đạt';
  }
  if (isTruthyFlag(quiz?.myAttempted) || completedHistory) {
    return 'Đã làm';
  }
  return 'Chưa làm';
}

function getQuestionCount(quiz: any, sections: any[]) {
  const explicitCount = toPositiveNumber(
    quiz?.totalQuestion || quiz?.questionCount || quiz?.totalQuestions,
  );
  if (explicitCount) {
    return Math.round(explicitCount);
  }
  return sections.reduce((count, section) => count + section.questions.length, 0);
}

function buildSections(quiz: any) {
  const rawSections = toArray(quiz?.sections);
  if (rawSections.length > 0) {
    return rawSections.map((section: any, sectionIndex: number) => {
      const questions = toArray(section?.questions).map((question: any, questionIndex: number) => ({
        ...question,
        sectionName:
          section?.name ||
          section?.content ||
          section?.title ||
          `Phần ${sectionIndex + 1}`,
        orderIndex: question?.orderIndex ?? questionIndex + 1,
      }));
      return {
        ...section,
        id: section?.sectionId || section?.id || sectionIndex + 1,
        name:
          section?.name ||
          section?.content ||
          section?.title ||
          `Phần ${sectionIndex + 1}`,
        questions,
      };
    });
  }

  const questions = toArray(quiz?.questions).map((question: any, questionIndex: number) => ({
    ...question,
    sectionName: 'Câu hỏi',
    orderIndex: question?.orderIndex ?? questionIndex + 1,
  }));
  return questions.length > 0
    ? [{id: 'default', name: 'Câu hỏi', questions}]
    : [];
}

function getQuestionText(question: any) {
  return firstText(
    question?.content,
    question?.questionContent,
    question?.questionText,
    question?.text,
    'Câu hỏi chưa có nội dung',
  );
}

function getAnswerText(answer: any) {
  return firstText(
    answer?.content,
    answer?.answerContent,
    answer?.text,
    answer?.answerText,
    answer?.label,
    answer?.value,
    answer?.leftText && answer?.rightText
      ? `${answer.leftText} - ${answer.rightText}`
      : '',
    'Đáp án',
  );
}

function isAnswerCorrect(answer: any) {
  return (
    answer?.isCorrect === true ||
    answer?.correct === true ||
    answer?.is_correct === true ||
    answer?.isCorrect === 1 ||
    answer?.correct === 1 ||
    String(answer?.isCorrect || answer?.correct || '').toLowerCase() === 'true'
  );
}

type MatchingPairItem = {leftKey: string; rightKey: string};

function extractMatchingPairs(answers: any[]): MatchingPairItem[] {
  const correctAnswer = answers.find(isAnswerCorrect) || answers[0];
  if (!correctAnswer) {
    return [];
  }

  const direct = correctAnswer.matchingPairs;
  if (Array.isArray(direct)) {
    return direct
      .map((p: any) => ({
        leftKey: String(p?.leftKey ?? p?.left ?? '').trim(),
        rightKey: String(p?.rightKey ?? p?.right ?? '').trim(),
      }))
      .filter(p => p.leftKey && p.rightKey);
  }

  const raw = correctAnswer.content;
  if (typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.pairs) ? parsed.pairs : [];
    return list
      .map((p: any) => ({
        leftKey: String(p?.leftKey ?? p?.left ?? '').trim(),
        rightKey: String(p?.rightKey ?? p?.right ?? '').trim(),
      }))
      .filter((p: MatchingPairItem) => p.leftKey && p.rightKey);
  } catch {
    return [];
  }
}

function getExplanationText(question: any, answers: any[] = []) {
  const answerExplanationSource =
    answers.find(isAnswerCorrect) ||
    answers.find(answer => firstText(answer?.explanation, answer?.reason));
  const answerExplanation = firstText(
    answerExplanationSource?.explanation,
    answerExplanationSource?.reason,
  );
  return firstText(
    question?.explanation,
    question?.explain,
    question?.solution,
    question?.answerExplanation,
    question?.correctAnswerExplanation,
    answerExplanation,
  );
}

function getFallbackCorrectAnswers(question: any, answers: any[] = []) {
  const explicit = [
    question?.correctAnswer,
    question?.correctAnswers,
    question?.expectedAnswer,
    question?.sampleAnswer,
  ];

  const fromQuestion = explicit
    .flatMap(value => (Array.isArray(value) ? value : [value]))
    .map(value => firstText(value))
    .filter(Boolean);

  if (fromQuestion.length > 0) {
    return fromQuestion;
  }

  return answers.filter(isAnswerCorrect).map(getAnswerText).filter(Boolean);
}

function isShortAnswerType(question: any) {
  const type = firstText(question?.questionType, question?.type).trim().toUpperCase();
  return type === 'TEXT' || type === 'SHORT_ANSWER' || type === 'SHORTANSWER';
}

function getQuestionKey(question: any, fallbackIndex: number) {
  return String(question?.id || question?.questionId || fallbackIndex);
}

function getQuestionId(question: any) {
  return toPositiveNumber(question?.questionId || question?.id);
}

function getQuestionSourceChunkId(question: any) {
  return firstText(
    question?.sourceChunkId,
    question?.source_chunk_id,
    question?.sourceChunkID,
    question?.source_chunk_ID,
    question?.ragChunkId,
    question?.rag_chunk_id,
    question?.chunkId,
    question?.chunk_id,
    question?.evidenceChunkId,
    question?.evidence_chunk_id,
    question?.source?.chunkId,
    question?.source?.chunk_id,
    question?.source?.sourceChunkId,
    question?.source?.source_chunk_id,
    question?.sourceChunk?.chunkId,
    question?.sourceChunk?.chunk_id,
    question?.sourceChunk?.id,
    Array.isArray(question?.sourceChunks) ? question.sourceChunks[0]?.chunkId : null,
    Array.isArray(question?.sourceChunks) ? question.sourceChunks[0]?.chunk_id : null,
    Array.isArray(question?.source_chunks) ? question.source_chunks[0]?.chunkId : null,
    Array.isArray(question?.source_chunks) ? question.source_chunks[0]?.chunk_id : null,
    Array.isArray(question?.sourceChunkIds) ? question.sourceChunkIds[0] : null,
    Array.isArray(question?.source_chunk_ids) ? question.source_chunk_ids[0] : null,
    question?.metadata?.sourceChunkId,
    question?.metadata?.source_chunk_id,
    question?.metadata?.ragChunkId,
    question?.metadata?.rag_chunk_id,
    question?.metadata?.chunkId,
    question?.metadata?.chunk_id,
  );
}

function getQuestionSourceSpan(question: any) {
  return firstText(
    question?.sourceSpan,
    question?.source_span,
    question?.sourceText,
    question?.source_text,
    question?.evidence,
    question?.evidenceText,
    question?.evidence_text,
    question?.sourceEvidence,
    question?.source_evidence,
    question?.source?.span,
    question?.source?.sourceSpan,
    question?.source?.source_span,
    question?.source?.text,
    question?.source?.content,
    question?.sourceChunk?.sourceSpan,
    question?.sourceChunk?.source_span,
    question?.sourceChunk?.content,
    Array.isArray(question?.sourceChunks) ? question.sourceChunks[0]?.sourceSpan : null,
    Array.isArray(question?.sourceChunks) ? question.sourceChunks[0]?.source_span : null,
    Array.isArray(question?.sourceChunks) ? question.sourceChunks[0]?.content : null,
    Array.isArray(question?.source_chunks) ? question.source_chunks[0]?.sourceSpan : null,
    Array.isArray(question?.source_chunks) ? question.source_chunks[0]?.source_span : null,
    Array.isArray(question?.source_chunks) ? question.source_chunks[0]?.content : null,
    question?.metadata?.sourceSpan,
    question?.metadata?.source_span,
    question?.metadata?.sourceText,
    question?.metadata?.source_text,
    question?.metadata?.evidence,
  );
}

function normalizeSourceToken(value: any) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function buildSourceTokens(value: any) {
  const text = String(value || '');
  const tokens: Array<{value: string; start: number; end: number}> = [];
  const pattern = /[\p{L}\p{N}]+/gu;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    tokens.push({
      value: normalizeSourceToken(match[0]),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return tokens;
}

function findFlexibleSourceRange(content: string, span: string) {
  const contentTokens = buildSourceTokens(content);
  const spanTokens = buildSourceTokens(span).map(token => token.value);
  if (contentTokens.length === 0 || spanTokens.length < 3) {
    return null;
  }

  const minimumLength =
    spanTokens.length >= 40 ? 12 : spanTokens.length >= 20 ? 8 : spanTokens.length >= 6 ? 6 : spanTokens.length;
  const candidateLengths = [spanTokens.length, 120, 80, 40, 20, 12, 8, 6]
    .map(length => Math.min(length, spanTokens.length))
    .filter((length, index, list) => length >= minimumLength && list.indexOf(length) === index);

  for (const length of candidateLengths) {
    const needle = spanTokens.slice(0, length);
    for (let index = 0; index <= contentTokens.length - length; index += 1) {
      let matched = true;
      for (let offset = 0; offset < length; offset += 1) {
        if (contentTokens[index + offset].value !== needle[offset]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return {
          start: contentTokens[index].start,
          end: contentTokens[index + length - 1].end,
          partial: length < spanTokens.length,
        };
      }
    }
  }
  return null;
}

function getHighlightedContentSegments(content: any, span: any) {
  const safeContent = String(content || '');
  const trimmedSpan = String(span || '').trim();
  if (!trimmedSpan) {
    return [{text: safeContent, highlight: false, partial: false}];
  }

  const lowerContent = safeContent.toLowerCase();
  const lowerSpan = trimmedSpan.toLowerCase();
  const exactIndex = lowerContent.indexOf(lowerSpan);
  const range = exactIndex >= 0
    ? {start: exactIndex, end: exactIndex + trimmedSpan.length, partial: false}
    : findFlexibleSourceRange(safeContent, trimmedSpan);

  if (!range) {
    return [{text: safeContent, highlight: false, partial: false}];
  }

  return [
    {text: safeContent.slice(0, range.start), highlight: false, partial: false},
    {text: safeContent.slice(range.start, range.end), highlight: true, partial: Boolean(range.partial)},
    {text: safeContent.slice(range.end), highlight: false, partial: false},
  ].filter(segment => segment.text);
}

function pickFirstPage(value: any) {
  if (Array.isArray(value)) {
    return value.map(toPositiveNumber).find(Boolean) || 0;
  }
  return toPositiveNumber(value);
}

function resolveChunkPage(chunk: any) {
  if (!chunk || typeof chunk !== 'object') {
    return 0;
  }
  return (
    pickFirstPage(chunk.pages) ||
    pickFirstPage(chunk.page) ||
    pickFirstPage(chunk.page_number) ||
    pickFirstPage(chunk.pageNumber) ||
    pickFirstPage(chunk.page_start) ||
    pickFirstPage(chunk.pageStart) ||
    pickFirstPage(chunk.start_page) ||
    pickFirstPage(chunk.startPage) ||
    pickFirstPage(chunk.metadata?.page_start) ||
    pickFirstPage(chunk.metadata?.pageStart)
  );
}

function extractChunks(payload: any) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.chunks)) {
    return data.chunks;
  }
  return [];
}

function normalizeChunkId(value: any) {
  return String(value || '').trim();
}

function normalizeDiscussionMessageId(value: any) {
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

function buildDiscussionMessageMap(messages: any[] = []) {
  const messageMap = new Map<string, any>();
  toArray(messages).forEach(message => {
    const messageId = normalizeDiscussionMessageId(message?.id || message?.messageId);
    if (messageId) {
      messageMap.set(messageId, message);
    }
  });
  return messageMap;
}

function formatDiscussionPreview(body: any) {
  return String(body || '')
    .replace(/\[\[q:\d+:(\d+)\]\]/g, '#$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDiscussionReplyPreview(messageMap: Map<string, any>, message: any) {
  const parentMessageId = normalizeDiscussionMessageId(message?.parentMessageId);
  if (!parentMessageId) {
    return null;
  }

  const parentMessage = messageMap.get(parentMessageId);
  if (!parentMessage) {
    return {
      id: parentMessageId,
      missing: true,
      authorName: null,
      authorUserName: null,
      body: '',
    };
  }

  return {
    id: parentMessageId,
    missing: false,
    authorName: firstText(parentMessage?.authorName, parentMessage?.user?.name, 'User'),
    authorUserName: firstText(parentMessage?.authorUserName, parentMessage?.user?.username),
    body: formatDiscussionPreview(parentMessage?.body || parentMessage?.content || parentMessage?.message),
  };
}

function getDiscussionReplyDepth(messageMap: Map<string, any>, message: any, maxDepth = 1) {
  let depth = 0;
  let cursorId = normalizeDiscussionMessageId(message?.parentMessageId);
  const visited = new Set<string>();

  while (cursorId && depth < maxDepth && !visited.has(cursorId)) {
    visited.add(cursorId);
    depth += 1;
    cursorId = normalizeDiscussionMessageId(messageMap.get(cursorId)?.parentMessageId);
  }

  return depth;
}

function parseDiscussionBody(body: any) {
  return String(body || '').split(/(\[\[q:\d+:\d+\]\])/);
}

function buildDraftTagMarker(question: any) {
  const questionIndex = toPositiveNumber(question?.index || question?.questionIndex || question?.order || 0);
  const questionText = firstText(question?.content, question?.questionText, question?.text);
  return questionText ? `[#${questionIndex}] ${questionText}` : `[#${questionIndex}]`;
}

function encodeDraftTags(draft: string, draftTags: Record<string, {questionId: number; index: number}>) {
  let encoded = draft;
  Object.entries(draftTags).forEach(([marker, tag]) => {
    encoded = encoded.split(marker).join(`[[q:${tag.questionId}:${tag.index}]]`);
  });
  return encoded;
}

function compareDiscussionMessages(left: any, right: any) {
  const leftTime = Date.parse(left?.createdAt || left?.sentAt || '') || 0;
  const rightTime = Date.parse(right?.createdAt || right?.sentAt || '') || 0;

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  const leftId = Number(left?.messageId ?? left?.id ?? 0) || 0;
  const rightId = Number(right?.messageId ?? right?.id ?? 0) || 0;
  return leftId - rightId;
}

function upsertDiscussionMessage(messages: any[] = [], incomingMessage: any) {
  const incomingId = normalizeDiscussionMessageId(incomingMessage?.id ?? incomingMessage?.messageId);
  if (!incomingId) {
    return toArray(messages);
  }

  const nextMessages = [...toArray(messages)];
  const existingIndex = nextMessages.findIndex(message => normalizeDiscussionMessageId(message?.id ?? message?.messageId) === incomingId);

  if (existingIndex >= 0) {
    nextMessages[existingIndex] = {...nextMessages[existingIndex], ...incomingMessage};
  } else {
    nextMessages.push(incomingMessage);
  }

  return nextMessages.sort(compareDiscussionMessages);
}

function removeDiscussionMessage(messages: any[] = [], messageId: any) {
  const normalizedMessageId = normalizeDiscussionMessageId(messageId);
  if (!normalizedMessageId) {
    return toArray(messages);
  }

  return toArray(messages).filter(message => normalizeDiscussionMessageId(message?.id ?? message?.messageId) !== normalizedMessageId);
}

function getMaterialNames(quiz: any) {
  const candidateArrays = [
    quiz?.materials,
    quiz?.materialList,
    quiz?.sources,
    quiz?.sourceMaterials,
    quiz?.references,
    quiz?.documents,
  ];
  const names = candidateArrays.flatMap(item =>
    toArray(item)
      .map(material =>
        typeof material === 'string'
          ? material
          : firstText(
              material?.title,
              material?.name,
              material?.fileName,
              material?.originalName,
              material?.documentName,
            ),
      )
      .filter(Boolean),
  );

  const directNames = firstText(
    quiz?.materialNames,
    quiz?.materialTitles,
    quiz?.referenceMaterials,
  );
  if (directNames) {
    names.push(directNames);
  }

  return Array.from(new Set(names));
}

function getMaterialId(material: any) {
  return toPositiveNumber(
    material?.materialId ??
      material?.id ??
      material?.material_id ??
      material?.documentId ??
      material?.document_id,
  );
}

function materialHasSourceUrl(material: any) {
  return Boolean(
    firstText(
      material?.storageURL,
      material?.storageUrl,
      material?.storage_url,
      material?.fileURL,
      material?.fileUrl,
      material?.file_url,
      material?.materialUrl,
      material?.material_url,
      material?.downloadURL,
      material?.downloadUrl,
      material?.download_url,
      material?.r2Url,
      material?.r2_url,
      material?.url,
      material?.link,
      material?.contentURL,
      material?.contentUrl,
      material?.content_url,
    ),
  );
}

function getQuizMaterialCandidates(quiz: any) {
  return [
    quiz?.materials,
    quiz?.materialList,
    quiz?.sources,
    quiz?.sourceMaterials,
    quiz?.references,
    quiz?.documents,
  ].flatMap(item => toArray(item)).filter(item => item && typeof item === 'object');
}

function findMaterialCandidate(quiz: any, materialId: number) {
  return getQuizMaterialCandidates(quiz).find(
    item => getMaterialId(item) === materialId,
  );
}

function getAttemptDate(attempt: any) {
  return (
    attempt?.completedAt ||
    attempt?.submittedAt ||
    attempt?.finishedAt ||
    attempt?.updatedAt ||
    attempt?.startedAt ||
    attempt?.createdAt
  );
}

function sortAttempts(history: any[]) {
  return [...history].sort((left, right) => {
    const leftTime = new Date(getAttemptDate(left) || 0).getTime();
    const rightTime = new Date(getAttemptDate(right) || 0).getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

function getAttemptModeLabel(attempt: any) {
  if (attempt?.isCompanionMode) {
    return 'Luyện tập nói';
  }
  return attempt?.isPracticeMode ? 'Luyện tập' : 'Kiểm tra';
}

function getAttemptScoreLabel(attempt: any) {
  const score = Number(attempt?.displayPercent ?? attempt?.scorePercent ?? attempt?.accuracy);
  if (Number.isFinite(score) && score > 0) {
    const percent = score <= 1 ? score * 100 : score;
    return `${formatNumber(percent)}%`;
  }

  const rawScore = Number(attempt?.score);
  const maxScore = Number(attempt?.maxScore);
  if (Number.isFinite(rawScore) && Number.isFinite(maxScore) && maxScore > 0) {
    return `${formatNumber(rawScore)}/${formatNumber(maxScore)}`;
  }
  if (Number.isFinite(rawScore)) {
    return formatNumber(rawScore);
  }
  return 'Chưa có điểm';
}

function getStatusLabel(value: any) {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'COMPLETED' || normalized === 'SUBMITTED') {
    return 'Hoàn thành';
  }
  if (normalized === 'IN_PROGRESS' || normalized === 'STARTED') {
    return 'Đang làm';
  }
  if (normalized === 'ACTIVE') {
    return 'Đang mở';
  }
  if (normalized === 'DRAFT') {
    return 'Nháp';
  }
  return firstText(value, 'Không rõ');
}

function getDiscussionMessageId(message: any) {
  return String(
    message?.messageId ||
      message?.groupDiscussionMessageId ||
      message?.id ||
      `${message?.authorId || 'author'}:${message?.createdAt || message?.body || ''}`,
  );
}

function getDiscussionAuthor(message: any) {
  return firstText(
    message?.authorName,
    message?.authorFullName,
    message?.fullName,
    message?.user?.fullName,
    message?.authorUserName,
    'Thành viên',
  );
}

function buildBackContext(params: QuizDetailParams, quiz: any): QuizBackContext {
  if (params.backContext) {
    return params.backContext;
  }

  const workspaceId = toPositiveNumber(params.workspaceId || params.contextId || quiz?.workspaceId);
  const groupId = toPositiveNumber(params.groupId || params.contextId || quiz?.groupId);
  const roadmapId = toPositiveNumber(params.roadmapId || quiz?.roadmapId);
  const phaseId = toPositiveNumber(params.phaseId || quiz?.phaseId);
  const contextType = String(params.contextType || quiz?.contextType || '').toUpperCase();

  if (contextType === 'GROUP' && groupId) {
    return {type: 'group', groupId, title: params.title};
  }
  if (contextType === 'WORKSPACE' && workspaceId) {
    return {type: 'workspace', workspaceId, title: params.title};
  }
  if ((contextType === 'ROADMAP' || roadmapId || phaseId) && (workspaceId || groupId)) {
    return {
      type: 'roadmap',
      contextType: groupId ? 'GROUP' : 'WORKSPACE',
      contextId: groupId || workspaceId,
      title: params.title,
      roadmapId: roadmapId || undefined,
      phaseId: phaseId || undefined,
      quizIntent: firstText(params.quizIntent, quiz?.quizIntent).toUpperCase() || undefined,
    };
  }
  return {type: 'quiz-list'};
}

export default function QuizDetailScreen({navigation, route}: any) {
  const params = useMemo<QuizDetailParams>(() => route.params || {}, [route.params]);
  const {t} = useTranslation();
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const {user} = useAuth();
  const initialQuiz = params.quiz || null;
  const initialQuizId = toPositiveNumber(params.quizId || getQuizIdFrom(initialQuiz));
  const [quiz, setQuiz] = useState<any>(initialQuiz);
  const [history, setHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<QuizDetailTab>('overview');
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(Boolean(initialQuizId));
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [shuffleSaving, setShuffleSaving] = useState(false);
  const [discussionMessages, setDiscussionMessages] = useState<any[]>([]);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [discussionPosting, setDiscussionPosting] = useState(false);
  const [discussionDraft, setDiscussionDraft] = useState('');
  const [discussionDraftTags, setDiscussionDraftTags] = useState<Record<string, {questionId: number; index: number}>>({});
  const [discussionReplyTarget, setDiscussionReplyTarget] = useState<any>(null);
  const [discussionSelection, setDiscussionSelection] = useState({start: 0, end: 0});
  const [discussionSlashQuery, setDiscussionSlashQuery] = useState('');
  const [discussionSlashRange, setDiscussionSlashRange] = useState<{start: number; end: number} | null>(null);
  const [discussionQuestionContext, setDiscussionQuestionContext] = useState<{
    questionId: number;
    label: string;
  } | null>(null);
  const [sourceDialogQuestion, setSourceDialogQuestion] = useState<{
    chunkId: string;
    sourceSpan?: string;
  } | null>(null);
  const [sourceLookupQuestionKey, setSourceLookupQuestionKey] = useState('');

  const scrollRef = useRef<ScrollView | null>(null);
  const scrollContentRef = useRef<View | null>(null);
  const questionCardRefs = useRef<Record<string, View | null>>({});
  const pendingQuestionScrollKeyRef = useRef<string>('');

  const effectiveQuiz = useMemo(
    () => ({
      ...(initialQuiz || {}),
      ...(quiz || {}),
    }),
    [initialQuiz, quiz],
  );
  const quizId = initialQuizId || getQuizIdFrom(effectiveQuiz);
  const currentUserId = Number(user?.id || 0);
  const isCreator = currentUserId > 0
    && Number(effectiveQuiz?.creatorId || 0) === currentUserId;
  const shuffleEnabled = Boolean(effectiveQuiz?.shuffleEnabled);

  const handleToggleShuffle = useCallback(async (next: boolean) => {
    if (!quizId || shuffleSaving) {return;}
    setShuffleSaving(true);
    setQuiz((prev: any) => ({...(prev || {}), shuffleEnabled: next}));
    try {
      await QuizAPI.updateShuffleEnabled(quizId, next);
    } catch (err: any) {
      setQuiz((prev: any) => ({...(prev || {}), shuffleEnabled: !next}));
      showToast(
        err?.response?.data?.message || err?.message || 'Không thể cập nhật chế độ shuffle',
        'error',
      );
    } finally {
      setShuffleSaving(false);
    }
  }, [quizId, shuffleSaving, showToast]);
  const sections = useMemo(() => buildSections(effectiveQuiz), [effectiveQuiz]);
  const allQuestions = useMemo(
    () => sections.flatMap(section => section.questions),
    [sections],
  );
  const questionLookup = useMemo(() => {
    const map = new Map<number, {question: any; index: number}>();
    allQuestions.forEach((question, index) => {
      const questionId = getQuestionId(question);
      if (questionId > 0) {
        map.set(questionId, {question, index: index + 1});
      }
    });
    return map;
  }, [allQuestions]);
  const discussionMessageMap = useMemo(() => buildDiscussionMessageMap(discussionMessages), [discussionMessages]);
  const firstQuestionKey = useMemo(
    () => (allQuestions.length > 0 ? getQuestionKey(allQuestions[0], 1) : ''),
    [allQuestions],
  );
  const sortedHistory = useMemo(() => sortAttempts(history), [history]);
  const backContext = useMemo(
    () => buildBackContext(params, effectiveQuiz),
    [effectiveQuiz, params],
  );
  const isRoadmapQuiz =
    backContext.type === 'roadmap' ||
    String(params.contextType || '').toUpperCase() === 'ROADMAP' ||
    Boolean(params.roadmapId || params.phaseId);
  const isGroupContext =
    backContext.type === 'group' ||
    String(params.contextType || '').toUpperCase() === 'GROUP';
  const groupHistoryContextId = useMemo(() => {
    if (backContext.type === 'group') {
      return backContext.groupId;
    }
    if (String(params.contextType || '').toUpperCase() === 'GROUP') {
      return toPositiveNumber(params.contextId || params.groupId);
    }
    return 0;
  }, [backContext, params.contextId, params.contextType, params.groupId]);
  const discussionCanAccess = Boolean(isGroupContext && groupHistoryContextId > 0 && quizId > 0);
  const discussionCurrentUserId = Number((user as any)?.id || (user as any)?.userID || 0);
  const visibleDiscussionMessages = useMemo(() => {
    if (!discussionQuestionContext?.questionId) {
      return discussionMessages;
    }

    return discussionMessages.filter(message => {
      const payloadQuestionId = toPositiveNumber(message?.questionId || message?.data?.questionId);
      return !payloadQuestionId || payloadQuestionId === discussionQuestionContext.questionId;
    });
  }, [discussionMessages, discussionQuestionContext?.questionId]);
  const discussionFilteredSuggestions = useMemo(() => {
    const suggestions = allQuestions.map((question, index) => ({question, index: index + 1}));
    if (!discussionSlashQuery.trim()) {
      return suggestions.slice(0, 12);
    }

    const query = discussionSlashQuery.toLowerCase().trim();
    return suggestions
      .filter(({question, index}) => {
        const content = firstText(question?.content, question?.questionText, question?.text).toLowerCase();
        const questionIndex = String(index);
        return content.includes(query) || questionIndex.includes(query);
      })
      .slice(0, 12);
  }, [allQuestions, discussionSlashQuery]);

  const scrollToQuestionKey = useCallback((questionKey: string) => {
    const scrollView = scrollRef.current;
    const scrollContent = scrollContentRef.current;
    const targetNode = questionCardRefs.current[questionKey];
    if (!scrollView || !scrollContent || !targetNode) {
      return;
    }

    const contentHandle = findNodeHandle(scrollContent);
    if (!contentHandle) {
      return;
    }

    try {
      (targetNode as any).measureLayout(
        contentHandle,
        (_x: number, y: number) => {
          scrollView.scrollTo({y: Math.max(y - 120, 0), animated: true});
        },
        () => {},
      );
    } catch {
      // Ignore measurement errors (rare on some Android layouts)
    }
  }, []);

  const handleJumpToQuestion = useCallback(
    (question: any, globalIndex: number) => {
      const key = getQuestionKey(question, globalIndex);
      pendingQuestionScrollKeyRef.current = key;
      setActiveTab('questions');
    },
    [setActiveTab],
  );

  const handleOpenQuestionSource = useCallback(
    async (question: any, globalIndex: number) => {
      const questionKey = getQuestionKey(question, globalIndex);
      const openFromQuestion = (sourceQuestion: any) => {
        const chunkId = getQuestionSourceChunkId(sourceQuestion);
        const sourceSpan = getQuestionSourceSpan(sourceQuestion);
        if (!chunkId) {
          return false;
        }
        setSourceDialogQuestion({chunkId, sourceSpan});
        return true;
      };

      if (openFromQuestion(question)) {
        return;
      }

      const questionId = getQuestionId(question);
      if (!questionId || sourceLookupQuestionKey === questionKey) {
        if (!questionId) {
          showToast('Câu hỏi này chưa có nguồn để hiển thị.', 'error');
        }
        return;
      }

      setSourceLookupQuestionKey(questionKey);
      try {
        const response = await QuizAPI.getQuestionById(questionId);
        if (!openFromQuestion({...question, ...(response?.data || {})})) {
          showToast('Câu hỏi này chưa có nguồn để hiển thị.', 'error');
        }
      } catch (error: any) {
        showToast(
          error?.response?.data?.message ||
            error?.message ||
            'Không tải được nguồn của câu hỏi.',
          'error',
        );
      } finally {
        setSourceLookupQuestionKey('');
      }
    },
    [showToast, sourceLookupQuestionKey],
  );

  useEffect(() => {
    if (activeTab !== 'questions') {
      return;
    }
    const pendingKey = pendingQuestionScrollKeyRef.current;
    if (!pendingKey) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToQuestionKey(pendingKey);
        pendingQuestionScrollKeyRef.current = '';
      });
    });
  }, [activeTab, scrollToQuestionKey, sections]);

  const displayTitle = firstText(
    effectiveQuiz?.title,
    effectiveQuiz?.name,
    params.title,
    'Chi tiết quiz',
  );
  const description = firstText(
    effectiveQuiz?.description,
    effectiveQuiz?.aiDescription,
    effectiveQuiz?.summary,
    effectiveQuiz?.prompt,
  );
  const normalizedIntent = firstText(params.quizIntent, effectiveQuiz?.quizIntent).toUpperCase();
  const durationInMinutes = getDurationInMinutes(effectiveQuiz);
  const materialNames = getMaterialNames(effectiveQuiz);
  const questionCount = getQuestionCount(effectiveQuiz, sections);

  const infoItems = useMemo(() => {
    const rawPassScore = effectiveQuiz?.passScore ?? effectiveQuiz?.passingScore;
    const passScoreNum = Number(rawPassScore);
    const hasPassScore = Number.isFinite(passScoreNum) && passScoreNum > 0;
    const isMockTest = normalizedIntent === 'MOCK_TEST';
    const maxScoreNum = Number(effectiveQuiz?.maxScore);
    const hasMaxScore = Number.isFinite(maxScoreNum) && maxScoreNum > 0;

    const passScoreItem = hasPassScore
      ? [
          {
            icon: 'target',
            label: 'Điểm đậu',
            value: isMockTest
              ? hasMaxScore
                ? `${passScoreNum} / ${maxScoreNum}`
                : `${passScoreNum} điểm`
              : `${passScoreNum}%`,
          },
        ]
      : [];

    return [
      {
        icon: 'creation',
        label: 'Nguồn',
        value:
          String(effectiveQuiz?.createVia || '').toUpperCase() === 'AI'
            ? 'AI'
            : 'Manual Quiz',
      },
      {
        icon: 'account-lock-outline',
        label: 'Nhóm',
        value: getAudienceLabel(effectiveQuiz, params),
      },
      {
        icon: 'flag-outline',
        label: 'Mục đích',
        value: getIntentLabel(normalizedIntent),
      },
      {
        icon: 'clock-outline',
        label: 'Kiểu thời gian',
        value: getTimerModeLabel(effectiveQuiz),
      },
      {
        icon: 'timer-outline',
        label: 'Thời gian',
        value: durationInMinutes ? `${durationInMinutes} phút` : 'Không giới hạn',
      },
      {
        icon: 'chart-bar',
        label: 'Độ khó tổng thể',
        value: getDifficultyLabel(effectiveQuiz?.overallDifficulty || effectiveQuiz?.difficulty),
      },
      ...passScoreItem,
      {
        icon: 'repeat',
        label: 'Số lần tối đa',
        value: firstText(effectiveQuiz?.maxAttempt, effectiveQuiz?.maxAttempts, 'Không giới hạn'),
      },
      {
        icon: 'check-decagram-outline',
        label: 'Kết quả',
        value: getResultLabel(effectiveQuiz, history),
      },
      {
        icon: 'help-circle-outline',
        label: 'Câu hỏi',
        value: `${questionCount}`,
      },
    ];
  }, [durationInMinutes, effectiveQuiz, history, normalizedIntent, params, questionCount]);
  const visibleTabs = useMemo(
    () => tabs.filter(tab => tab.key !== 'discussion' || isGroupContext),
    [isGroupContext],
  );

  const fetchHistory = useCallback(
    async (showSpinner = true) => {
      if (!quizId) {
        return;
      }
      if (showSpinner) {
        setHistoryLoading(true);
      }
      try {
        let response;
        if (groupHistoryContextId) {
          try {
            response = await QuizAPI.getGroupAttemptHistory(groupHistoryContextId, quizId);
          } catch {
            response = await QuizAPI.getAttemptHistory(quizId);
          }
        } else {
          response = await QuizAPI.getAttemptHistory(quizId);
        }
        setHistory(Array.isArray(response?.data) ? response.data : []);
      } catch {
        setHistory([]);
      } finally {
        if (showSpinner) {
          setHistoryLoading(false);
        }
      }
    },
    [groupHistoryContextId, quizId],
  );

  const fetchDiscussion = useCallback(
    async (showSpinner = true, questionIdOverride?: number | null) => {
      if (!isGroupContext || !groupHistoryContextId || !quizId) {
        setDiscussionMessages([]);
        return;
      }
      const normalizedQuestionId =
        questionIdOverride === undefined
          ? toPositiveNumber(discussionQuestionContext?.questionId)
          : toPositiveNumber(questionIdOverride);
      if (showSpinner) {
        setDiscussionLoading(true);
      }
      try {
        const response = await GroupDiscussionAPI.getMessages(
          groupHistoryContextId,
          quizId,
          normalizedQuestionId || undefined,
        );
        setDiscussionMessages(Array.isArray(response?.data) ? [...response.data].sort(compareDiscussionMessages) : []);
      } catch {
        setDiscussionMessages([]);
      } finally {
        if (showSpinner) {
          setDiscussionLoading(false);
        }
      }
    },
    [discussionQuestionContext?.questionId, groupHistoryContextId, isGroupContext, quizId],
  );

  const updateDiscussionSlashState = useCallback((value: string, selectionStart: number) => {
    const textBeforeCursor = value.slice(0, selectionStart);
    const slashMatch = textBeforeCursor.match(/(?:^|[\s\n])\/([^\s]*)$/);

    if (slashMatch) {
      const slashStart = textBeforeCursor.lastIndexOf('/');
      setDiscussionSlashQuery(slashMatch[1]);
      setDiscussionSlashRange({start: slashStart, end: selectionStart});
      return;
    }

    setDiscussionSlashQuery('');
    setDiscussionSlashRange(null);
  }, []);

  const handleDiscussionInputChange = useCallback((value: string) => {
    setDiscussionDraft(value);
    updateDiscussionSlashState(value, discussionSelection.start);
  }, [discussionSelection.start, updateDiscussionSlashState]);

  const handleDiscussionSelectionChange = useCallback((event: any) => {
    const selection = event?.nativeEvent?.selection || {start: 0, end: 0};
    setDiscussionSelection(selection);
    updateDiscussionSlashState(discussionDraft, selection.start);
  }, [discussionDraft, updateDiscussionSlashState]);

  const handleSelectDiscussionQuestion = useCallback((question: any, questionIndexOverride?: number) => {
    if (!discussionSlashRange) {
      return;
    }

    const questionId = getQuestionId(question);
    const questionIndex = questionIndexOverride || toPositiveNumber(question?.index || question?.questionIndex || question?.order || 0) || questionLookup.get(questionId)?.index || 0;
    if (!questionId || !questionIndex) {
      return;
    }

    const marker = buildDraftTagMarker({...question, index: questionIndex});
    const before = discussionDraft.slice(0, discussionSlashRange.start).replace(/[ \t]+$/, '');
    const after = discussionDraft.slice(discussionSlashRange.end).replace(/^[ \t]+/, '');
    const prefix = before ? (before.endsWith('\n') ? before : `${before}\n`) : '';
    const suffix = after ? `\n${after}` : '\n';
    const nextDraft = `${prefix}${marker}${suffix}`;

    setDiscussionDraft(nextDraft);
    setDiscussionDraftTags(prev => ({
      ...prev,
      [marker]: {questionId, index: questionIndex},
    }));
    setDiscussionSlashQuery('');
    setDiscussionSlashRange(null);
    setDiscussionSelection({start: prefix.length + marker.length + 1, end: prefix.length + marker.length + 1});
  }, [discussionDraft, discussionSlashRange, questionLookup]);

  const handleReplyDiscussion = useCallback((message: any) => {
    const messageId = normalizeDiscussionMessageId(message?.id || message?.messageId);
    if (!messageId) {
      return;
    }

    setDiscussionReplyTarget({
      id: messageId,
      authorName: firstText(message?.authorName, message?.user?.name, 'User'),
      authorUserName: firstText(message?.authorUserName, message?.user?.username),
      body: formatDiscussionPreview(message?.body || message?.content || message?.message),
    });
  }, []);

  useWebSocket({
    groupId: isGroupContext ? groupHistoryContextId : undefined,
    enabled: isGroupContext && groupHistoryContextId > 0 && quizId > 0,
    onDiscussionUpdate: payload => {
      const payloadQuizId = toPositiveNumber(payload?.quizId || payload?.data?.quizId);
      const payloadQuestionId = toPositiveNumber(
        payload?.questionId || payload?.data?.questionId,
      );
      const currentQuestionId = toPositiveNumber(discussionQuestionContext?.questionId);
      if (!payloadQuizId || payloadQuizId === quizId) {
        if (!payloadQuestionId || !currentQuestionId || payloadQuestionId === currentQuestionId) {
          fetchDiscussion(false);
        }
      }
    },
  });

  const handlePostDiscussion = useCallback(async () => {
    const body = discussionDraft.trim();
    if (!body || !groupHistoryContextId || !quizId || discussionPosting) {
      return;
    }
    setDiscussionPosting(true);
    try {
      const encodedBody = encodeDraftTags(body, discussionDraftTags);
      const response = await GroupDiscussionAPI.postMessage(groupHistoryContextId, quizId, {
        body: encodedBody,
        questionId: discussionQuestionContext?.questionId || undefined,
        parentMessageId: discussionReplyTarget?.id || undefined,
      });
      const created = response?.data;
      setDiscussionDraft('');
      setDiscussionDraftTags({});
      setDiscussionReplyTarget(null);
      setDiscussionSlashQuery('');
      setDiscussionSlashRange(null);
      if (created) {
        setDiscussionMessages(prev => upsertDiscussionMessage(prev, created));
      }
      fetchDiscussion(false);
    } catch {
      showToast('Không thể gửi thảo luận', 'error');
    } finally {
      setDiscussionPosting(false);
    }
  }, [
    discussionDraft,
    discussionDraftTags,
    discussionQuestionContext?.questionId,
    discussionPosting,
    discussionReplyTarget?.id,
    fetchDiscussion,
    groupHistoryContextId,
    quizId,
    showToast,
  ]);

  const handleDeleteDiscussion = useCallback(
    (message: any) => {
      const messageId = getDiscussionMessageId(message);
      if (!messageId || !groupHistoryContextId || !quizId) {
        return;
      }

      Alert.alert('Xóa tin nhắn?', 'Tin nhắn thảo luận sẽ bị xóa khỏi nhóm.', [
        {text: 'Hủy', style: 'cancel'},
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await GroupDiscussionAPI.deleteMessage(groupHistoryContextId, quizId, messageId);
              setDiscussionMessages(prev =>
                removeDiscussionMessage(prev, messageId),
              );
              setDiscussionReplyTarget((current: any) => (current?.id === messageId ? null : current));
            } catch {
              showToast('Không thể xóa tin nhắn', 'error');
            }
          },
        },
      ]);
    },
    [groupHistoryContextId, quizId, showToast],
  );

  const handleOpenGeneralDiscussion = useCallback(() => {
    setDiscussionQuestionContext(null);
    setDiscussionReplyTarget(null);
    setActiveTab('discussion');
    fetchDiscussion(true, null);
  }, [fetchDiscussion]);

  const handleOpenQuestionDiscussion = useCallback(
    (question: any, index: number) => {
      const questionId = getQuestionId(question);
      if (!questionId) {
        showToast('Câu hỏi này chưa có ID để mở thảo luận', 'error');
        return;
      }
      setDiscussionQuestionContext({
        questionId,
        label: `Câu ${index}`,
      });
      setDiscussionReplyTarget(null);
      setActiveTab('discussion');
      fetchDiscussion(true, questionId);
    },
    [fetchDiscussion, showToast],
  );

  const fetchDetail = useCallback(
    async (showSpinner = true) => {
      if (!quizId) {
        setLoadError('Thiếu Quiz ID');
        setLoading(false);
        return;
      }

      if (showSpinner) {
        setLoading(true);
      }
      setLoadError('');
      try {
        const response = await QuizAPI.getFull(quizId);
        const detail = response?.data || {};
        setQuiz({
          ...(initialQuiz || {}),
          ...detail,
        });
      } catch {
        if (!initialQuiz) {
          setLoadError('Không thể tải chi tiết quiz');
        }
        showToast('Không thể tải chi tiết quiz', 'error');
      } finally {
        if (showSpinner) {
          setLoading(false);
        }
      }
    },
    [initialQuiz, quizId, showToast],
  );

  useEffect(() => {
    fetchDetail();
    fetchHistory(false);
    fetchDiscussion(false);
  }, [fetchDetail, fetchHistory, fetchDiscussion]);

  useEffect(() => {
    setExpandedQuestions({});
  }, [quizId]);

  useEffect(() => {
    if (activeTab !== 'discussion' || !isGroupContext || !groupHistoryContextId || !quizId) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchDiscussion(false);
    }, 2000);

    return () => clearInterval(intervalId);
  }, [activeTab, fetchDiscussion, groupHistoryContextId, isGroupContext, quizId]);

  useEffect(() => {
    if (!firstQuestionKey || Object.keys(expandedQuestions).length > 0) {
      return;
    }
    setExpandedQuestions({[firstQuestionKey]: true});
  }, [expandedQuestions, firstQuestionKey]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchDetail(false), fetchHistory(false), fetchDiscussion(false)]);
    setRefreshing(false);
  }, [fetchDetail, fetchHistory, fetchDiscussion]);

  const handleBack = useCallback(() => {
    const routeNames = navigation.getState?.()?.routeNames || [];

    if (
      backContext.type === 'workspace' &&
      Number.isInteger(backContext.workspaceId) &&
      backContext.workspaceId > 0
    ) {
      navigation.navigate('Home', {
        screen: 'Workspace',
        params: {
          workspaceId: backContext.workspaceId,
          title: backContext.title,
        },
      });
      return;
    }

    if (
      backContext.type === 'group' &&
      Number.isInteger(backContext.groupId) &&
      backContext.groupId > 0
    ) {
      if (routeNames.includes('GroupWorkspace')) {
        navigation.navigate('GroupWorkspace', {
          groupId: backContext.groupId,
          title: backContext.title,
        });
        return;
      }

      navigation.navigate('Home', {
        screen: 'GroupWorkspace',
        params: {
          groupId: backContext.groupId,
          title: backContext.title,
        },
      });
      return;
    }

    if (
      backContext.type === 'roadmap' &&
      Number.isInteger(backContext.contextId) &&
      backContext.contextId > 0
    ) {
      if (
        backContext.contextType === 'GROUP' &&
        routeNames.includes('RoadmapJourney')
      ) {
        navigation.navigate('RoadmapJourney', {
          contextType: backContext.contextType,
          contextId: backContext.contextId,
          title: backContext.title,
          roadmapId: backContext.roadmapId,
          phaseId: backContext.phaseId,
        });
        return;
      }

      navigation.navigate('Home', {
        screen: 'RoadmapJourney',
        params: {
          contextType: backContext.contextType,
          contextId: backContext.contextId,
          title: backContext.title,
          roadmapId: backContext.roadmapId,
          phaseId: backContext.phaseId,
        },
      });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('GroupList');
  }, [backContext, navigation]);

  const handleStart = useCallback(
    (mode: 'practice' | 'exam') => {
      if (!quizId) {
        showToast('Thiếu Quiz ID', 'error');
        return;
      }
      navigation.navigate(mode === 'practice' ? 'PracticeQuiz' : 'ExamQuiz', {
        quizId,
        title: displayTitle,
        backContext,
        quizDetailParams: {
          quizId,
          title: displayTitle,
          quiz: effectiveQuiz,
          backContext,
          contextType: params.contextType,
          contextId: params.contextId,
          workspaceId: params.workspaceId,
          groupId: params.groupId,
          roadmapId: params.roadmapId,
          phaseId: params.phaseId,
          quizIntent: normalizedIntent || params.quizIntent,
          roadmapTitle: params.roadmapTitle,
          phaseTitle: params.phaseTitle,
        },
      });
    },
    [backContext, displayTitle, effectiveQuiz, navigation, normalizedIntent, params, quizId, showToast],
  );

  const handleToggleCommunityShare = useCallback(async () => {
    if (!quizId || shareLoading) {
      return;
    }

    const nextShared = !(effectiveQuiz?.communityShared === true);
    const title = nextShared ? 'Công khai quiz?' : 'Chuyển quiz về riêng tư?';
    const message = nextShared
      ? 'Quiz sẽ hiển thị cho cộng đồng và có thể được tìm thấy.'
      : 'Quiz sẽ chỉ hiển thị trong workspace của bạn.';

    Alert.alert(title, message, [
      {text: 'Hủy', style: 'cancel'},
      {
        text: nextShared ? 'Công khai' : 'Chuyển về riêng tư',
        onPress: async () => {
          setShareLoading(true);
          try {
            await QuizAPI.shareToCommunity(quizId, nextShared);
            setQuiz((prev: any) => ({
              ...(prev || {}),
              communityShared: nextShared,
            }));
            showToast(
              nextShared ? 'Đã công khai quiz' : 'Đã chuyển quiz về riêng tư',
              'success',
            );
          } catch {
            showToast('Không thể cập nhật trạng thái công khai', 'error');
          } finally {
            setShareLoading(false);
          }
        },
      },
    ]);
  }, [effectiveQuiz?.communityShared, quizId, shareLoading, showToast]);

  const handleDeleteQuiz = useCallback(() => {
    if (!quizId || deleteLoading) {
      return;
    }

    Alert.alert('Xóa quiz?', 'Quiz sẽ bị xóa và không thể khôi phục.', [
      {text: 'Hủy', style: 'cancel'},
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setDeleteLoading(true);
          try {
            await QuizAPI.delete(quizId);
            showToast('Đã xóa quiz', 'success');
            handleBack();
          } catch {
            showToast('Không thể xóa quiz', 'error');
          } finally {
            setDeleteLoading(false);
          }
        },
      },
    ]);
  }, [deleteLoading, handleBack, quizId, showToast]);

  const handleOpenAttempt = useCallback(
    (attempt: any) => {
      const attemptId = toPositiveNumber(attempt?.attemptId || attempt?.id);
      if (!attemptId) {
        showToast('Thiếu Attempt ID', 'error');
        return;
      }
      navigation.navigate('QuizResult', {attemptId, backContext});
    },
    [backContext, navigation, showToast],
  );

  const handleOpenSourceMaterial = useCallback(
    async (materialId: number, chunk: any, sourceChunkId: string, targetPage = 0) => {
      if (!materialId) {
        showToast('Không tìm thấy tài liệu gốc', 'error');
        return;
      }

      const materialFromQuiz = findMaterialCandidate(effectiveQuiz, materialId);
      let resolvedMaterial =
        materialFromQuiz && materialHasSourceUrl(materialFromQuiz)
          ? materialFromQuiz
          : null;

      if (!resolvedMaterial) {
        const sourceBackContext = backContext as any;
        const sourceWorkspaceId =
          toPositiveNumber(chunk?.workspace_id ?? chunk?.workspaceId) ||
          toPositiveNumber(effectiveQuiz?.workspaceId ?? effectiveQuiz?.workspaceID) ||
          toPositiveNumber(sourceBackContext?.workspaceId) ||
          toPositiveNumber(sourceBackContext?.contextId) ||
          toPositiveNumber(params.workspaceId ?? params.contextId ?? params.groupId);

        if (sourceWorkspaceId) {
          try {
            const response = await MaterialAPI.getByWorkspace(sourceWorkspaceId);
            resolvedMaterial = toArray(response?.data).find(
              item => getMaterialId(item) === materialId,
            ) || null;
          } catch {
            resolvedMaterial = materialFromQuiz || null;
          }
        }
      }

      if (!resolvedMaterial) {
        resolvedMaterial = {
          ...(materialFromQuiz || {}),
          materialId,
          id: materialId,
        };
      }

      setSourceDialogQuestion(null);
      navigation.navigate('Home', {
        screen: 'MaterialDetail',
        params: {
          material: {
            ...resolvedMaterial,
            materialId: getMaterialId(resolvedMaterial) || materialId,
            id: getMaterialId(resolvedMaterial) || materialId,
            title: firstText(
              resolvedMaterial?.title,
              resolvedMaterial?.fileName,
              resolvedMaterial?.name,
              chunk?.material_title,
              chunk?.materialTitle,
              chunk?.fileName,
              `Tài liệu #${materialId}`,
            ),
          },
          contextType: isGroupContext ? 'GROUP' : 'WORKSPACE',
          sourceChunkId,
          sourcePage: targetPage || undefined,
        },
      });
    },
    [backContext, effectiveQuiz, isGroupContext, navigation, params.contextId, params.groupId, params.workspaceId, showToast],
  );

  const toggleQuestion = useCallback((question: any, fallbackIndex: number) => {
    const key = String(question?.id || question?.questionId || fallbackIndex);
    setExpandedQuestions(prev => ({...prev, [key]: !prev[key]}));
  }, []);

  if (loading && !quiz) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top', 'bottom']}>
      <View
        style={[
          styles.header,
          {backgroundColor: colors.surface, borderBottomColor: colors.border},
        ]}>
        <TouchableOpacity
          onPress={handleBack}
          style={[styles.iconButton, {backgroundColor: colors.surfaceVariant}]}
          activeOpacity={0.7}>
          <Icon name="chevron-left" size={24} color={colors.heading} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, {color: colors.heading}]} numberOfLines={1}>
            Chi tiết quiz
          </Text>
          <Text style={[styles.headerSubtitle, {color: colors.textSecondary}]} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {!isGroupContext ? (
            <TouchableOpacity
              onPress={handleToggleCommunityShare}
              disabled={shareLoading}
              accessibilityLabel="Công khai quiz"
              style={[
                styles.iconButton,
                styles.headerActionButton,
                {backgroundColor: colors.surfaceVariant},
                shareLoading && styles.disabledButton,
              ]}
              activeOpacity={0.7}>
              <Icon
                name={effectiveQuiz?.communityShared ? 'earth' : 'earth-off'}
                size={20}
                color={effectiveQuiz?.communityShared ? Colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={handleDeleteQuiz}
            disabled={deleteLoading}
            accessibilityLabel="Xóa quiz"
            style={[
              styles.iconButton,
              styles.headerActionButton,
              {backgroundColor: colors.surfaceVariant},
              deleteLoading && styles.disabledButton,
            ]}
            activeOpacity={0.7}>
            <Icon name="trash-can-outline" size={20} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }>
        <View ref={scrollContentRef} collapsable={false}>
          {loadError ? (
            <View
              style={[
                styles.emptyState,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <Icon name="alert-circle-outline" size={36} color={Colors.error} />
              <Text style={[styles.emptyTitle, {color: colors.heading}]}>{loadError}</Text>
            </View>
          ) : (
            <>
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  shadowColor: isDark ? colors.shadow : '#0F172A',
                },
              ]}>
              <View style={styles.heroTopRow}>
                <View
                  style={[
                    styles.heroIcon,
                    {backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : '#EFF6FF'},
                  ]}>
                  <Icon name="clipboard-text-outline" size={24} color={Colors.primary} />
                </View>
                <View style={styles.heroBadges}>
                  {normalizedIntent ? (
                    <View
                      style={[
                        styles.pill,
                        {backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : '#DBEAFE'},
                      ]}>
                      <Text style={[styles.pillText, {color: Colors.primary}]}>
                        {getIntentLabel(normalizedIntent)}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.pill,
                      {backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : '#D1FAE5'},
                    ]}>
                    <Text style={[styles.pillText, {color: isDark ? '#34D399' : '#059669'}]}>
                      {getStatusLabel(effectiveQuiz?.status || 'ACTIVE')}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={[styles.heroTimer, {color: Colors.primary}]}>
                {getTimerModeLabel(effectiveQuiz)}
              </Text>
              <Text style={[styles.heroTitle, {color: colors.heading}]}>
                {displayTitle}
              </Text>
              {description ? (
                <Text style={[styles.description, {color: colors.textSecondary}]}>
                  {description}
                </Text>
              ) : null}
            </View>

            <View
              style={[
                styles.tabs,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              {visibleTabs.map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setActiveTab(tab.key)}
                    style={[
                      styles.tabButton,
                      isActive && {
                        backgroundColor: isDark ? 'rgba(37,99,235,0.18)' : '#EFF6FF',
                      },
                    ]}
                    activeOpacity={0.7}>
                    <Icon
                      name={tab.icon}
                      size={16}
                      color={isActive ? Colors.primary : colors.textTertiary}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tabLabel,
                        {color: isActive ? Colors.primary : colors.textSecondary},
                      ]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeTab === 'overview' ? (
              <View style={styles.section}>
                {isCreator ? (
                  <View
                    style={[
                      styles.shufflePanel,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <View style={styles.shufflePanelHeader}>
                      <Icon name="shuffle-variant" size={20} color={Colors.primary} />
                      <View style={styles.shufflePanelText}>
                        <Text style={[styles.shufflePanelTitle, {color: colors.heading}]}>
                          Trộn thứ tự câu hỏi & đáp án
                        </Text>
                        <Text style={[styles.shufflePanelSubtitle, {color: colors.textSecondary}]}>
                          Khi bật, mỗi lần làm bài câu hỏi và đáp án sẽ hiển thị theo thứ tự ngẫu nhiên khác nhau.
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={shuffleEnabled}
                      onValueChange={handleToggleShuffle}
                      disabled={shuffleSaving}
                      trackColor={{false: colors.border, true: Colors.primary}}
                    />
                  </View>
                ) : null}
                <View style={styles.infoGrid}>
                  {infoItems.map(item => (
                    <InfoTile
                      key={`${item.label}-${item.value}`}
                      icon={item.icon}
                      label={item.label}
                      value={item.value}
                      colors={colors}
                      isDark={isDark}
                    />
                  ))}
                </View>
                {materialNames.length > 0 ? (
                  <View
                    style={[
                      styles.panel,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <View style={styles.panelTitleRow}>
                      <Icon name="book-open-page-variant-outline" size={18} color={Colors.primary} />
                      <Text style={[styles.panelTitle, {color: colors.heading}]}>
                        Tài liệu tham khảo
                      </Text>
                    </View>
                    <Text style={[styles.panelText, {color: colors.textSecondary}]}>
                      {materialNames.join(', ')}
                    </Text>
                  </View>
                ) : null}
                <View
                  style={[
                    styles.panel,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.panelTitleRow}>
                    <Icon name="calendar-clock" size={18} color={Colors.primary} />
                    <Text style={[styles.panelTitle, {color: colors.heading}]}>
                      Ngày tạo
                    </Text>
                  </View>
                  <Text style={[styles.panelText, {color: colors.textSecondary}]}>
                    {formatDateTime(effectiveQuiz?.createdAt)}
                  </Text>
                </View>
              </View>
            ) : null}

            {activeTab === 'discussion' && isGroupContext ? (
              <View style={styles.section}>
                <View
                  style={[
                    styles.discussionPanel,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.panelTitleRow}>
                    <Icon name="message-text-outline" size={18} color={Colors.primary} />
                    <View style={styles.discussionTitleWrap}>
                      <Text style={[styles.panelTitle, {color: colors.heading}]}>
                        {discussionQuestionContext
                          ? `Thảo luận ${discussionQuestionContext.label.toLowerCase()}`
                          : 'Thảo luận nhóm'}
                      </Text>
                      <Text style={[styles.panelText, {color: colors.textSecondary}]}>
                        {discussionQuestionContext
                          ? 'Trao đổi riêng về đáp án, lời giải hoặc điểm chưa rõ của câu hỏi này.'
                          : 'Trao đổi về quiz, lời giải và những điểm chưa rõ với thành viên trong nhóm.'}
                      </Text>
                    </View>
                  </View>
                  {discussionQuestionContext ? (
                    <TouchableOpacity
                      activeOpacity={0.78}
                      onPress={handleOpenGeneralDiscussion}
                      style={[
                        styles.discussionScopeButton,
                        {backgroundColor: colors.surfaceVariant, borderColor: colors.border},
                      ]}>
                      <Icon name="message-reply-text-outline" size={16} color={Colors.primary} />
                      <Text style={[styles.discussionScopeText, {color: Colors.primary}]}>
                        Chuyển về thảo luận chung
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  {discussionLoading ? (
                    <View style={styles.discussionLoader}>
                      <LoadingSpinner />
                    </View>
                  ) : visibleDiscussionMessages.length === 0 ? (
                    <View style={[styles.discussionEmpty, {backgroundColor: colors.surfaceVariant}]}>
                      <Icon name="chat-outline" size={28} color={colors.textTertiary} />
                      <Text style={[styles.emptyTitle, {color: colors.heading}]}>
                        Chưa có thảo luận
                      </Text>
                      <Text style={[styles.emptySubtitle, {color: colors.textSecondary}]}>
                        Hãy mở đầu cuộc trao đổi cho quiz này hoặc gõ / để tag câu hỏi.
                      </Text>
                    </View>
                  ) : (
                    visibleDiscussionMessages.map(message => {
                      const authorId = Number(message?.authorId || message?.userId || message?.user?.id || 0);
                      const canDelete = discussionCurrentUserId > 0 && authorId === discussionCurrentUserId;
                      const messageId = getDiscussionMessageId(message);
                      const replyPreview = getDiscussionReplyPreview(discussionMessageMap, message);
                      const replyDepth = getDiscussionReplyDepth(discussionMessageMap, message);
                      const bodyParts = parseDiscussionBody(firstText(message?.body, message?.content, message?.message));
                      return (
                        <View
                          key={messageId}
                          style={[
                            styles.discussionMessage,
                            {
                              backgroundColor: colors.surfaceVariant,
                              borderColor: colors.border,
                              marginLeft: replyDepth > 0 ? 18 : 0,
                              borderLeftWidth: replyDepth > 0 ? 3 : 1,
                              borderLeftColor: replyDepth > 0 ? Colors.primary : colors.border,
                            },
                          ]}>
                          <View style={styles.discussionAvatar}>
                            <Text style={styles.discussionAvatarText}>
                              {getDiscussionAuthor(message).charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.discussionMessageBody}>
                            <View style={styles.discussionMessageHeader}>
                              <Text style={[styles.discussionAuthor, {color: colors.heading}]} numberOfLines={1}>
                                {getDiscussionAuthor(message)}
                              </Text>
                              <Text style={[styles.discussionTime, {color: colors.textTertiary}]}>
                                {relativeTime(message?.createdAt || message?.sentAt)}
                              </Text>
                            </View>
                            {replyPreview ? (
                              <View
                                style={[
                                  styles.discussionReplyPreview,
                                  {backgroundColor: colors.backgroundSecondary, borderColor: colors.border},
                                ]}>
                                <Icon name="reply" size={14} color={Colors.primary} />
                                <View style={styles.discussionReplyPreviewBody}>
                                  <Text style={[styles.discussionReplyPreviewTitle, {color: colors.heading}]}>
                                    {replyPreview.missing
                                      ? 'Bình luận gốc không còn tồn tại'
                                      : `Đang trả lời ${replyPreview.authorName || 'User'}`}
                                  </Text>
                                  {!replyPreview.missing ? (
                                    <Text style={[styles.discussionReplyPreviewText, {color: colors.textSecondary}]} numberOfLines={2}>
                                      {replyPreview.body || 'Không có nội dung'}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                            ) : null}
                            <View style={styles.discussionBodyWrap}>
                              {bodyParts.map((part, partIndex) => {
                                const tagMatch = part.match(/^\[\[q:(\d+):(\d+)\]\]$/);
                                if (tagMatch) {
                                  const taggedQuestionId = Number(tagMatch[1]);
                                  const taggedQuestionIndex = Number(tagMatch[2]);
                                  const taggedQuestion = questionLookup.get(taggedQuestionId);
                                  const taggedQuestionText = taggedQuestion
                                    ? firstText(
                                        taggedQuestion.question?.content,
                                        taggedQuestion.question?.questionText,
                                        taggedQuestion.question?.text,
                                      )
                                    : '';
                                  return (
                                    <TouchableOpacity
                                      key={`${messageId}-tag-${partIndex}`}
                                      activeOpacity={0.8}
                                      onPress={() => {
                                        if (taggedQuestion?.question) {
                                          handleJumpToQuestion(taggedQuestion.question, taggedQuestionIndex);
                                        }
                                      }}
                                      style={[
                                        styles.discussionTagChip,
                                        {backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : '#EFF6FF', borderColor: Colors.primary},
                                      ]}>
                                      <Icon name="tag-outline" size={12} color={Colors.primary} />
                                      <Text
                                        style={[styles.discussionTagChipText, {color: Colors.primary}]}
                                        numberOfLines={1}
                                        ellipsizeMode="tail">
                                        {taggedQuestion
                                          ? `Câu ${taggedQuestionIndex}: ${taggedQuestionText || `Câu ${taggedQuestionIndex}`}`
                                          : `#${taggedQuestionIndex}`}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                }

                                if (!part) {
                                  return null;
                                }

                                return (
                                  <Text key={`${messageId}-text-${partIndex}`} style={[styles.discussionBodyText, {color: colors.text}]}>
                                    {part}
                                  </Text>
                                );
                              })}
                            </View>
                            <View style={styles.discussionActionsRow}>
                              <TouchableOpacity
                                onPress={() => handleReplyDiscussion(message)}
                                style={styles.discussionReplyButton}
                                activeOpacity={0.75}>
                                <Icon name="reply" size={14} color={Colors.primary} />
                                <Text style={[styles.discussionReplyText, {color: Colors.primary}]}>Trả lời</Text>
                              </TouchableOpacity>
                            {canDelete ? (
                              <TouchableOpacity
                                onPress={() => handleDeleteDiscussion(message)}
                                style={styles.discussionDeleteButton}>
                                <Icon name="trash-can-outline" size={14} color={Colors.error} />
                                <Text style={[styles.discussionDeleteText, {color: Colors.error}]}>
                                  Xóa
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}

                  {discussionCanAccess ? (
                    <>
                      {discussionReplyTarget ? (
                        <View
                          style={[
                            styles.discussionReplyBanner,
                            {backgroundColor: colors.backgroundSecondary, borderColor: colors.border},
                          ]}>
                          <View style={styles.discussionReplyBannerBody}>
                            <Text style={[styles.discussionReplyBannerTitle, {color: colors.heading}]}>
                              Đang trả lời {discussionReplyTarget.authorName || 'User'}
                            </Text>
                            <Text style={[styles.discussionReplyBannerText, {color: colors.textSecondary}]} numberOfLines={2}>
                              {discussionReplyTarget.body || 'Không có nội dung'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setDiscussionReplyTarget(null)}
                            style={styles.discussionClearReplyButton}
                            activeOpacity={0.75}>
                            <Icon name="close" size={16} color={colors.textTertiary} />
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      <View style={styles.discussionComposerWrap}>
                        {discussionSlashQuery || discussionSlashRange ? (
                          <View
                            style={[
                              styles.discussionSuggestions,
                              {backgroundColor: colors.surfaceVariant, borderColor: colors.border},
                            ]}>
                            <View style={styles.discussionSuggestionsHeader}>
                              <Text style={[styles.discussionSuggestionsTitle, {color: colors.heading}]}>
                                Chọn câu hỏi
                              </Text>
                              <Text style={[styles.discussionSuggestionsHint, {color: colors.textTertiary}]}>
                                Gõ / để lọc và chạm để chèn tag
                              </Text>
                            </View>
                            <ScrollView
                              style={styles.discussionSuggestionsList}
                              contentContainerStyle={styles.discussionSuggestionsListContent}
                              showsVerticalScrollIndicator
                              nestedScrollEnabled
                              keyboardShouldPersistTaps="handled">
                              {discussionFilteredSuggestions.map(({question, index}) => {
                                const questionId = getQuestionId(question);
                                const questionIndex = index;
                                const questionText = firstText(question?.content, question?.questionText, question?.text);
                                return (
                                  <TouchableOpacity
                                    key={String(questionId || questionIndex)}
                                    activeOpacity={0.78}
                                    onPress={() => handleSelectDiscussionQuestion(question, questionIndex)}
                                    style={[
                                      styles.discussionSuggestionItem,
                                      {backgroundColor: colors.surface, borderColor: colors.border},
                                    ]}>
                                    <View
                                      style={[
                                        styles.discussionSuggestionIndex,
                                        {backgroundColor: isDark ? 'rgba(37,99,235,0.18)' : '#DBEAFE'},
                                      ]}>
                                      <Text style={[styles.discussionSuggestionIndexText, {color: Colors.primary}]}>#{questionIndex}</Text>
                                    </View>
                                    <View style={styles.discussionSuggestionContent}>
                                      <Text style={[styles.discussionSuggestionTitle, {color: colors.heading}]} numberOfLines={1}>
                                        {questionText || `Câu ${questionIndex}`}
                                      </Text>
                                      <Text
                                        style={[styles.discussionSuggestionSubtitle, {color: colors.textSecondary}]}
                                        numberOfLines={1}>
                                        Chạm để chèn tag vào thảo luận
                                      </Text>
                                    </View>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          </View>
                        ) : null}

                        <View
                          style={[
                            styles.discussionComposer,
                            {backgroundColor: colors.surfaceVariant, borderColor: colors.border},
                          ]}>
                          <View style={styles.discussionComposerAvatar}>
                            <Text style={styles.discussionAvatarText}>
                              {firstText((user as any)?.fullName, (user as any)?.name, 'U').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <TextInput
                            value={discussionDraft}
                            onChangeText={handleDiscussionInputChange}
                            onSelectionChange={handleDiscussionSelectionChange}
                            multiline
                            placeholder={discussionReplyTarget ? 'Trả lời bình luận này...' : 'Viết thảo luận... Gõ / để tag câu hỏi'}
                            placeholderTextColor={colors.placeholder}
                            style={[styles.discussionInput, {color: colors.text}]}
                          />
                          <TouchableOpacity
                            onPress={handlePostDiscussion}
                            disabled={!discussionDraft.trim() || discussionPosting}
                            style={[
                              styles.discussionSend,
                              (!discussionDraft.trim() || discussionPosting) && styles.disabledButton,
                            ]}>
                            <Icon
                              name={discussionPosting ? 'clock-outline' : 'send'}
                              size={18}
                              color="#FFFFFF"
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}

            {activeTab === 'questions' ? (
              <View style={styles.section}>
                {allQuestions.length === 0 ? (
                  <View
                    style={[
                      styles.emptyState,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <Icon name="help-circle-outline" size={36} color={colors.textTertiary} />
                    <Text style={[styles.emptyTitle, {color: colors.heading}]}>
                      Chưa có câu hỏi
                    </Text>
                    <Text style={[styles.emptySubtitle, {color: colors.textSecondary}]}>
                      Kéo xuống để làm mới nếu quiz vừa được tạo.
                    </Text>
                  </View>
                ) : (
                  sections.map((section, sectionIndex) => (
                    <View key={String(section.id || sectionIndex)} style={styles.questionSection}>
                      <View style={styles.questionSectionHeader}>
                        <Text style={[styles.questionSectionTitle, {color: colors.heading}]}>
                          {section.name}
                        </Text>
                        <Text style={[styles.questionSectionCount, {color: colors.textSecondary}]}>
                          {section.questions.length} câu
                        </Text>
                      </View>
                      {section.questions.map((question: any, questionIndex: number) => {
                        const globalIndex =
                          sections
                            .slice(0, sectionIndex)
                            .reduce((count, item) => count + item.questions.length, 0) +
                          questionIndex +
                          1;
                        const questionKey = getQuestionKey(question, globalIndex);
                        const expanded = Boolean(expandedQuestions[questionKey]);
                        const type = firstText(question?.questionType, question?.type).toUpperCase();
                        const answers = toArray(question?.answers);
                        const explanation = getExplanationText(question, answers);
                        const fallbackCorrectAnswers = getFallbackCorrectAnswers(question, answers);
                        const sourceButtonLoading = sourceLookupQuestionKey === questionKey;
                        return (
                          <View
                            key={questionKey}
                            ref={node => {
                              questionCardRefs.current[questionKey] = node;
                            }}
                            collapsable={false}>
                            <TouchableOpacity
                              activeOpacity={0.78}
                              onPress={() => toggleQuestion(question, globalIndex)}
                              style={[
                                styles.questionCard,
                                {backgroundColor: colors.surface, borderColor: colors.border},
                              ]}>
                              <View style={styles.questionHeader}>
                              <View style={styles.questionIndex}>
                                <Text style={styles.questionIndexText}>{globalIndex}</Text>
                              </View>
                              <View style={styles.questionMain}>
                                <Text style={[styles.questionText, {color: colors.heading}]}>
                                  {getQuestionText(question)}
                                </Text>
                                <View style={styles.questionMetaRow}>
                                  <Text style={[styles.questionMeta, {color: colors.textSecondary}]}>
                                    {questionTypeLabels[type] || firstText(type, 'Câu hỏi')}
                                  </Text>
                                  {question?.difficulty ? (
                                    <Text style={[styles.questionMeta, {color: colors.textSecondary}]}>
                                      {getDifficultyLabel(question.difficulty)}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                              <Icon
                                name={expanded ? 'chevron-up' : 'chevron-down'}
                                size={20}
                                color={colors.textTertiary}
                              />
                              </View>
                              {expanded ? (
                                <View style={styles.answerList}>
                                {type === 'MATCHING' ? (() => {
                                  const pairs = extractMatchingPairs(answers);
                                  if (pairs.length === 0) {
                                    return (
                                      <Text style={[styles.noAnswerText, {color: colors.textSecondary}]}>
                                        Câu hỏi chưa có dữ liệu ghép cặp.
                                      </Text>
                                    );
                                  }
                                  return pairs.map((pair, pairIndex) => (
                                    <View
                                      key={`${pair.leftKey}-${pairIndex}`}
                                      style={[
                                        styles.matchingPairRow,
                                        {
                                          backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : '#ECFDF5',
                                          borderColor: isDark ? 'rgba(52,211,153,0.45)' : '#A7F3D0',
                                        },
                                      ]}>
                                      <View style={[styles.matchingPairBadge, {backgroundColor: isDark ? 'rgba(52,211,153,0.25)' : '#A7F3D0'}]}>
                                        <Text style={[styles.matchingPairBadgeText, {color: isDark ? '#A7F3D0' : '#047857'}]}>
                                          {pairIndex + 1}
                                        </Text>
                                      </View>
                                      <Text
                                        style={[styles.matchingPairLeft, {color: isDark ? '#A7F3D0' : '#047857'}]}
                                        numberOfLines={3}>
                                        {pair.leftKey}
                                      </Text>
                                      <Icon
                                        name="arrow-right"
                                        size={16}
                                        color={isDark ? '#34D399' : '#059669'}
                                      />
                                      <Text
                                        style={[styles.matchingPairRight, {color: isDark ? '#D1FAE5' : '#065F46'}]}
                                        numberOfLines={3}>
                                        {pair.rightKey}
                                      </Text>
                                    </View>
                                  ));
                                })() : answers.length > 0 ? (
                                  answers.map((answer: any, answerIndex: number) => {
                                    const correct = isAnswerCorrect(answer);
                                    return (
                                      <View
                                        key={String(answer?.id || answer?.answerId || answerIndex)}
                                        style={[
                                          styles.answerRow,
                                          {
                                            backgroundColor: correct
                                              ? isDark
                                                ? 'rgba(16,185,129,0.16)'
                                                : '#ECFDF5'
                                              : isDark
                                              ? 'rgba(15,23,42,0.7)'
                                              : '#F8FAFC',
                                            borderColor: correct
                                              ? isDark
                                                ? 'rgba(52,211,153,0.45)'
                                                : '#A7F3D0'
                                              : 'transparent',
                                          },
                                        ]}>
                                        <Text
                                          style={[
                                            styles.answerPrefix,
                                            {color: correct ? '#059669' : Colors.primary},
                                          ]}>
                                          {String.fromCharCode(65 + answerIndex)}
                                        </Text>
                                        <Text
                                          style={[
                                            styles.answerText,
                                            {color: correct ? (isDark ? '#A7F3D0' : '#047857') : colors.textSecondary},
                                          ]}>
                                          {getAnswerText(answer)}
                                        </Text>
                                        {correct ? (
                                          <Icon
                                            name="check-circle-outline"
                                            size={18}
                                            color={isDark ? '#34D399' : '#059669'}
                                          />
                                        ) : null}
                                      </View>
                                    );
                                  })
                                ) : fallbackCorrectAnswers.length > 0 ? (
                                  <View
                                    style={[
                                      styles.correctAnswerBox,
                                      {
                                        backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : '#ECFDF5',
                                        borderColor: isDark ? 'rgba(52,211,153,0.45)' : '#A7F3D0',
                                      },
                                    ]}>
                                    <Icon name="check-circle-outline" size={18} color={isDark ? '#34D399' : '#059669'} />
                                    <View style={styles.correctAnswerContent}>
                                      <Text style={[styles.correctAnswerLabel, {color: isDark ? '#A7F3D0' : '#047857'}]}>
                                        {t(
                                          isShortAnswerType(question)
                                            ? 'quiz.expectedAnswerLabel'
                                            : 'quiz.correctAnswerLabel',
                                          isShortAnswerType(question) ? 'Expected answer' : 'Correct answer',
                                        )}
                                      </Text>
                                      <Text style={[styles.correctAnswerText, {color: isDark ? '#D1FAE5' : '#065F46'}]}>
                                        {fallbackCorrectAnswers.join(' / ')}
                                      </Text>
                                    </View>
                                  </View>
                                ) : (
                                  <Text style={[styles.noAnswerText, {color: colors.textSecondary}]}>
                                    Câu hỏi này không có lựa chọn hiển thị.
                                  </Text>
                                )}
                                {explanation ? (
                                  <View
                                    style={[
                                      styles.explanationBox,
                                      {
                                        backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB',
                                        borderColor: isDark ? 'rgba(251,191,36,0.35)' : '#FDE68A',
                                      },
                                    ]}>
                                    <Icon
                                      name="lightbulb-on-outline"
                                      size={17}
                                      color={isDark ? '#FBBF24' : '#D97706'}
                                    />
                                    <Text style={[styles.explanationText, {color: isDark ? '#FDE68A' : '#92400E'}]}>
                                      <Text style={styles.explanationLabel}>Giải thích: </Text>
                                      {explanation}
                                    </Text>
                                  </View>
                                ) : null}
                                <TouchableOpacity
                                  activeOpacity={0.78}
                                  disabled={sourceButtonLoading}
                                  onPress={event => {
                                    event.stopPropagation?.();
                                    handleOpenQuestionSource(question, globalIndex);
                                  }}
                                  style={[
                                    styles.questionSourceButton,
                                    {
                                      backgroundColor: isDark
                                        ? 'rgba(37,99,235,0.16)'
                                        : '#EFF6FF',
                                      borderColor: isDark
                                        ? 'rgba(96,165,250,0.34)'
                                        : '#BFDBFE',
                                      opacity: sourceButtonLoading ? 0.7 : 1,
                                    },
                                  ]}>
                                  {sourceButtonLoading ? (
                                    <ActivityIndicator size="small" color={Colors.primary} />
                                  ) : (
                                    <Icon name="file-search-outline" size={16} color={Colors.primary} />
                                  )}
                                  <Text style={[styles.questionSourceText, {color: Colors.primary}]}>
                                    Xem nguồn
                                  </Text>
                                </TouchableOpacity>
                                {isGroupContext ? (
                                  <TouchableOpacity
                                    activeOpacity={0.78}
                                    onPress={() => handleOpenQuestionDiscussion(question, globalIndex)}
                                    style={[
                                      styles.questionDiscussionButton,
                                      {
                                        backgroundColor: isDark
                                          ? 'rgba(37,99,235,0.16)'
                                          : '#EFF6FF',
                                        borderColor: isDark
                                          ? 'rgba(96,165,250,0.34)'
                                          : '#BFDBFE',
                                      },
                                    ]}>
                                    <Icon
                                      name="message-text-outline"
                                      size={16}
                                      color={Colors.primary}
                                    />
                                    <Text
                                      style={[
                                        styles.questionDiscussionText,
                                        {color: Colors.primary},
                                      ]}>
                                      Thảo luận câu {globalIndex}
                                    </Text>
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                                ) : null}
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  ))
                )}
              </View>
            ) : null}

            {activeTab === 'history' ? (
              <View style={styles.section}>
                {historyLoading ? (
                  <View
                    style={[
                      styles.emptyState,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <LoadingSpinner />
                  </View>
                ) : sortedHistory.length === 0 ? (
                  <View
                    style={[
                      styles.emptyState,
                      {backgroundColor: colors.surface, borderColor: colors.border},
                    ]}>
                    <Icon name="history" size={36} color={colors.textTertiary} />
                    <Text style={[styles.emptyTitle, {color: colors.heading}]}>
                      Chưa có lịch sử làm bài
                    </Text>
                    <Text style={[styles.emptySubtitle, {color: colors.textSecondary}]}>
                      Sau khi làm quiz, kết quả sẽ xuất hiện tại đây.
                    </Text>
                  </View>
                ) : (
                  sortedHistory.map((attempt, index) => {
                    const status = String(attempt?.status || '').toUpperCase();
                    const completed = status === 'COMPLETED' || status === 'SUBMITTED';
                    return (
                      <TouchableOpacity
                        key={String(attempt?.attemptId || attempt?.id || index)}
                        activeOpacity={0.75}
                        onPress={() => handleOpenAttempt(attempt)}
                        style={[
                          styles.historyCard,
                          {backgroundColor: colors.surface, borderColor: colors.border},
                        ]}>
                        <View
                          style={[
                            styles.historyStatusIcon,
                            {
                              backgroundColor: completed
                                ? isDark
                                  ? 'rgba(16,185,129,0.16)'
                                  : '#D1FAE5'
                                : isDark
                                ? 'rgba(245,158,11,0.16)'
                                : '#FEF3C7',
                            },
                          ]}>
                          <Icon
                            name={completed ? 'check-circle-outline' : 'clock-outline'}
                            size={20}
                            color={completed ? '#059669' : '#D97706'}
                          />
                        </View>
                        <View style={styles.historyMain}>
                          <Text style={[styles.historyTitle, {color: colors.heading}]}>
                            {formatDateTime(getAttemptDate(attempt))}
                          </Text>
                          <Text style={[styles.historyMeta, {color: colors.textSecondary}]}>
                            {getAttemptModeLabel(attempt)} • {getStatusLabel(attempt?.status)}
                          </Text>
                        </View>
                        <View style={styles.historyScoreBox}>
                          <Text style={[styles.historyScore, {color: Colors.primary}]}>
                            {getAttemptScoreLabel(attempt)}
                          </Text>
                          <Icon name="chevron-right" size={18} color={colors.textTertiary} />
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ) : null}
            </>
          )}
        </View>
      </ScrollView>

      <QuestionSourceDialog
        visible={Boolean(sourceDialogQuestion?.chunkId)}
        chunkId={sourceDialogQuestion?.chunkId || ''}
        sourceSpan={sourceDialogQuestion?.sourceSpan || ''}
        colors={colors}
        isDark={isDark}
        onClose={() => setSourceDialogQuestion(null)}
        onOpenMaterial={handleOpenSourceMaterial}
      />

      <View
        style={[
          styles.footer,
          {backgroundColor: colors.surface, borderTopColor: colors.border},
        ]}>
        {!isRoadmapQuiz ? (
          <TouchableOpacity
            onPress={() => handleStart('practice')}
            activeOpacity={0.75}
            style={[
              styles.footerButton,
              styles.practiceButton,
              {
                borderColor: isDark ? 'rgba(37,99,235,0.45)' : '#BFDBFE',
                backgroundColor: isDark ? 'rgba(37,99,235,0.14)' : '#EFF6FF',
              },
            ]}>
            <Icon name="play-outline" size={18} color={Colors.primary} />
            <Text style={[styles.footerButtonText, {color: Colors.primary}]}>
              Luyện tập
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => handleStart('exam')}
          activeOpacity={0.75}
          style={[styles.footerButton, styles.examButton]}>
          <Icon name="clipboard-check-outline" size={18} color="#FFFFFF" />
          <Text style={[styles.footerButtonText, {color: '#FFFFFF'}]}>
            Kiểm tra
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function QuestionSourceDialog({
  visible,
  chunkId,
  sourceSpan,
  colors,
  isDark,
  onClose,
  onOpenMaterial,
}: {
  visible: boolean;
  chunkId: string;
  sourceSpan: string;
  colors: any;
  isDark: boolean;
  onClose: () => void;
  onOpenMaterial: (materialId: number, chunk: any, sourceChunkId: string, targetPage?: number) => void;
}) {
  const [chunk, setChunk] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [openingDocument, setOpeningDocument] = useState(false);
  const [errorState, setErrorState] = useState<{status?: number; message: string} | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!visible || !chunkId) {
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setChunk(null);
    setErrorState(null);

    (async () => {
      try {
        const response = await MaterialAPI.getChunkById(chunkId);
        if (!cancelled) {
          setChunk(response?.data || null);
        }
      } catch (error: any) {
        if (!cancelled) {
          const status = error?.response?.status;
          setErrorState({
            status,
            message:
              status === 404
                ? 'Không có nguồn cho câu hỏi này.'
                : error?.response?.data?.message ||
                  error?.message ||
                  'Không tải được nội dung nguồn.',
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chunkId, reloadKey, visible]);

  const sectionTitle = firstText(chunk?.chunk_section_title, chunk?.chunkSectionTitle);
  const topic = firstText(chunk?.chunk_topic, chunk?.chunkTopic);
  const sequence = firstText(chunk?.chunk_sequence, chunk?.chunkSequence);
  const content = firstText(chunk?.content);
  const materialId = toPositiveNumber(chunk?.material_id ?? chunk?.materialId);
  const segments = useMemo(
    () => getHighlightedContentSegments(content, sourceSpan),
    [content, sourceSpan],
  );

  const handleOpenDocument = useCallback(async () => {
    if (!materialId || openingDocument) {
      return;
    }
    setOpeningDocument(true);
    try {
      let targetPage = resolveChunkPage(chunk);
      if (!targetPage) {
        try {
          const response = await MaterialAPI.getRAGChunks(materialId, 500);
          const chunks = extractChunks(response);
          const normalizedChunkId = normalizeChunkId(chunkId);
          const matchedChunk = chunks.find((item: any) => {
            const itemChunkId = normalizeChunkId(item?.chunk_id ?? item?.chunkId);
            if (normalizedChunkId && itemChunkId === normalizedChunkId) {
              return true;
            }
            const itemSequence = Number(
              item?.chunk_sequence ??
                item?.chunkSequence ??
                item?.chunk_index ??
                item?.chunkIndex,
            );
            return Number.isFinite(itemSequence) && itemSequence === Number(sequence);
          });
          targetPage = resolveChunkPage(matchedChunk);
        } catch {
          targetPage = 0;
        }
      }
      onOpenMaterial(materialId, chunk, chunkId, targetPage);
    } finally {
      setOpeningDocument(false);
    }
  }, [chunk, chunkId, materialId, onOpenMaterial, openingDocument, sequence]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sourceModalOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          style={[
            styles.sourceDialog,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}>
          <View
            style={[
              styles.sourceDialogHeader,
              {borderBottomColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC'},
            ]}>
            <View style={styles.sourceDialogIcon}>
              <Icon name="file-search-outline" size={20} color={Colors.primary} />
            </View>
            <View style={styles.sourceDialogTitleWrap}>
              <Text style={[styles.sourceDialogTitle, {color: colors.heading}]}>
                Nguồn của câu hỏi
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.sourceDialogMeta, {color: colors.textSecondary}]}>
                {[sectionTitle, topic, sequence ? `#${sequence}` : ''].filter(Boolean).join(' · ') || chunkId}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.sourceCloseButton}>
              <Icon name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.sourceDialogBody}>
            {loading ? (
              <View style={styles.sourceLoading}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={[styles.sourceStatusText, {color: colors.textSecondary}]}>
                  Đang tải nguồn...
                </Text>
              </View>
            ) : null}

            {!loading && errorState ? (
              <View
                style={[
                  styles.sourceErrorBox,
                  {
                    backgroundColor: isDark ? '#111827' : '#F8FAFC',
                    borderColor: colors.border,
                  },
                ]}>
                <Icon name="alert-circle-outline" size={26} color={Colors.error} />
                <Text style={[styles.sourceStatusText, {color: colors.textSecondary}]}>
                  {errorState.message}
                </Text>
                {errorState.status !== 404 ? (
                  <TouchableOpacity
                    onPress={() => setReloadKey(value => value + 1)}
                    style={styles.sourceRetryButton}>
                    <Icon name="refresh" size={15} color="#FFFFFF" />
                    <Text style={styles.sourceRetryText}>Thử lại</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {!loading && !errorState && chunk && content ? (
              <Text style={[styles.sourceContentText, {color: colors.text}]}>
                {segments.map((segment, index) => (
                  <Text
                    key={`${index}-${segment.text.slice(0, 8)}`}
                    style={segment.highlight ? styles.sourceHighlightText : undefined}>
                    {segment.text}
                  </Text>
                ))}
              </Text>
            ) : null}

            {!loading && !errorState && chunk && !content ? (
              <Text style={[styles.sourceStatusText, {color: colors.textSecondary}]}>
                Chunk không có nội dung văn bản.
              </Text>
            ) : null}
          </ScrollView>

          {!loading && !errorState && chunk ? (
            <View
              style={[
                styles.sourceDialogFooter,
                {
                  borderTopColor: colors.border,
                  backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB',
                },
              ]}>
              <Text style={[styles.sourceFooterHint, {color: isDark ? '#FDE68A' : '#92400E'}]}>
                {sourceSpan
                  ? 'Đoạn tô vàng là phần AI dùng làm bằng chứng.'
                  : 'Mở tài liệu gốc để đối chiếu nội dung chunk này.'}
              </Text>
              <TouchableOpacity
                disabled={!materialId || openingDocument}
                onPress={handleOpenDocument}
                style={[
                  styles.sourceOpenDocumentButton,
                  (!materialId || openingDocument) && styles.disabledButton,
                ]}>
                {openingDocument ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Icon name="open-in-new" size={15} color="#FFFFFF" />
                )}
                <Text style={styles.sourceOpenDocumentText}>Mở tài liệu</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function InfoTile({
  icon,
  label,
  value,
  colors,
  isDark,
}: {
  icon: string;
  label: string;
  value: any;
  colors: any;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.infoTile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: isDark ? colors.shadow : '#0F172A',
        },
      ]}>
      <View
        style={[
          styles.infoIcon,
          {backgroundColor: isDark ? 'rgba(37,99,235,0.14)' : '#EFF6FF'},
        ]}>
        <Icon name={icon} size={17} color={Colors.primary} />
      </View>
      <Text style={[styles.infoLabel, {color: colors.textTertiary}]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.infoValue, {color: colors.heading}]} numberOfLines={3}>
        {firstText(value, 'Không rõ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {flex: 1, minWidth: 0},
  headerTitle: {fontSize: 18, fontWeight: '700'},
  headerSubtitle: {fontSize: 12, marginTop: 2},
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionButton: {
    width: 36,
    height: 36,
  },
  disabledButton: {
    opacity: 0.6,
  },
  scroll: {flex: 1},
  content: {
    padding: Spacing.base,
    paddingBottom: 112,
    gap: Spacing.base,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    flex: 1,
  },
  pill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: {fontSize: 11, fontWeight: '700'},
  heroTimer: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 6,
  },
  heroTitle: {fontSize: 20, lineHeight: 28, fontWeight: '800'},
  description: {fontSize: 14, lineHeight: 21, marginTop: Spacing.sm},
  tabs: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: 4,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 3,
  },
  tabLabel: {fontSize: 11, fontWeight: '700'},
  section: {gap: Spacing.base},
  shufflePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  shufflePanelHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  shufflePanelText: {flex: 1, gap: 2},
  shufflePanelTitle: {fontSize: 14, fontWeight: '700'},
  shufflePanelSubtitle: {fontSize: 12, lineHeight: 17},
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  infoTile: {
    width: '48%',
    minHeight: 118,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  infoLabel: {fontSize: 11, fontWeight: '700', textTransform: 'uppercase'},
  infoValue: {fontSize: 14, lineHeight: 19, fontWeight: '700', marginTop: 4},
  panel: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.base,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  panelTitle: {fontSize: 15, fontWeight: '700'},
  panelText: {fontSize: 14, lineHeight: 20},
  emptyState: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {fontSize: 15, fontWeight: '700', marginTop: 10, textAlign: 'center'},
  emptySubtitle: {fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 19},
  discussionPanel: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    gap: Spacing.md,
    position: 'relative',
  },
  discussionTitleWrap: {flex: 1, minWidth: 0},
  discussionScopeButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 6,
  },
  discussionScopeText: {fontSize: 12, fontWeight: '800'},
  discussionLoader: {minHeight: 120, justifyContent: 'center'},
  discussionEmpty: {
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: 4,
  },
  discussionMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: 10,
  },
  discussionReplyPreview: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  discussionReplyPreviewBody: {flex: 1, minWidth: 0},
  discussionReplyPreviewTitle: {fontSize: 12, fontWeight: '700'},
  discussionReplyPreviewText: {fontSize: 11, marginTop: 2, lineHeight: 16},
  discussionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discussionAvatarText: {color: '#FFFFFF', fontSize: 13, fontWeight: '800'},
  discussionMessageBody: {flex: 1, minWidth: 0},
  discussionBodyWrap: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  discussionMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  discussionAuthor: {flex: 1, fontSize: 13, fontWeight: '800'},
  discussionTime: {fontSize: 11},
  discussionBodyText: {fontSize: 14, lineHeight: 21, marginTop: 6},
  discussionTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    gap: 4,
    marginRight: 4,
    marginTop: 6,
    maxWidth: '96%',
    flexShrink: 1,
  },
  discussionTagChipText: {fontSize: 11, fontWeight: '800', flexShrink: 1},
  discussionActionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  discussionReplyButton: {flexDirection: 'row', alignItems: 'center', gap: 4},
  discussionReplyText: {fontSize: 12, fontWeight: '800'},
  discussionDeleteButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  discussionDeleteText: {fontSize: 12, fontWeight: '700'},
  discussionReplyBanner: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  discussionReplyBannerBody: {flex: 1, minWidth: 0},
  discussionReplyBannerTitle: {fontSize: 12, fontWeight: '800'},
  discussionReplyBannerText: {fontSize: 11, marginTop: 2, lineHeight: 16},
  discussionClearReplyButton: {padding: 4},
  discussionSuggestions: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    position: 'absolute',
    left: Spacing.base,
    right: Spacing.base,
    bottom: 58,
    zIndex: 20,
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 10},
    height: 260,
    gap: Spacing.sm,
  },
  discussionComposerWrap: {
    position: 'relative',
    overflow: 'visible',
    marginTop: 2,
  },
  discussionSuggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  discussionSuggestionsTitle: {fontSize: 12, fontWeight: '800'},
  discussionSuggestionsHint: {fontSize: 10},
  discussionSuggestionsList: {flex: 1, minHeight: 0},
  discussionSuggestionsListContent: {gap: Spacing.sm, paddingBottom: 2},
  discussionSuggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: 8,
  },
  discussionSuggestionIndex: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discussionSuggestionIndexText: {fontSize: 11, fontWeight: '800'},
  discussionSuggestionContent: {flex: 1, minWidth: 0},
  discussionSuggestionTitle: {fontSize: 13, fontWeight: '700'},
  discussionSuggestionSubtitle: {fontSize: 11, marginTop: 2},
  discussionComposer: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  discussionComposerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  discussionInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 8,
  },
  discussionSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionDiscussionButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    marginTop: Spacing.sm,
    gap: 6,
  },
  questionDiscussionText: {fontSize: 12, fontWeight: '800'},
  questionSourceButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginTop: Spacing.sm,
    gap: 6,
  },
  questionSourceText: {fontSize: 12, fontWeight: '900'},
  questionSourceWarning: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginTop: Spacing.sm,
    gap: 6,
  },
  questionSourceWarningText: {fontSize: 12, fontWeight: '800'},
  questionSection: {gap: Spacing.sm},
  questionSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  questionSectionTitle: {fontSize: 16, fontWeight: '800'},
  questionSectionCount: {fontSize: 12, fontWeight: '600'},
  questionCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  questionHeader: {flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start'},
  questionIndex: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionIndexText: {color: '#FFFFFF', fontSize: 12, fontWeight: '800'},
  questionMain: {flex: 1, minWidth: 0},
  questionText: {fontSize: 14, lineHeight: 20, fontWeight: '700'},
  questionMetaRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6},
  questionMeta: {fontSize: 11, fontWeight: '600'},
  answerList: {marginTop: Spacing.md, gap: Spacing.sm},
  answerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  answerPrefix: {width: 18, fontSize: 12, fontWeight: '800'},
  answerText: {flex: 1, fontSize: 13, lineHeight: 18},
  noAnswerText: {fontSize: 13, fontStyle: 'italic'},
  matchingPairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  matchingPairBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchingPairBadgeText: {fontSize: 11, fontWeight: '800'},
  matchingPairLeft: {flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700'},
  matchingPairRight: {flex: 1, fontSize: 13, lineHeight: 18},
  correctAnswerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  correctAnswerContent: {flex: 1, minWidth: 0},
  correctAnswerLabel: {fontSize: 11, fontWeight: '800', marginBottom: 2},
  correctAnswerText: {fontSize: 13, lineHeight: 18, fontWeight: '600'},
  explanationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  explanationText: {flex: 1, fontSize: 12, lineHeight: 18},
  explanationLabel: {fontWeight: '800'},
  sourceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  sourceDialog: {
    width: '100%',
    maxHeight: '82%',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  sourceDialogHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderBottomWidth: 1,
    padding: Spacing.md,
  },
  sourceDialogIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.md,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceDialogTitleWrap: {flex: 1, minWidth: 0, gap: 4},
  sourceDialogTitle: {fontSize: 16, fontWeight: '900'},
  sourceDialogMeta: {fontSize: 11, fontWeight: '700'},
  sourceCloseButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceDialogBody: {
    maxHeight: 420,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  sourceLoading: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  sourceStatusText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  sourceErrorBox: {
    minHeight: 150,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  sourceRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  sourceRetryText: {color: '#FFFFFF', fontSize: 12, fontWeight: '900'},
  sourceContentText: {
    fontSize: 14,
    lineHeight: 24,
  },
  sourceHighlightText: {
    backgroundColor: '#FDE68A',
    color: '#111827',
    fontWeight: '800',
  },
  sourceDialogFooter: {
    borderTopWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sourceFooterHint: {fontSize: 11, lineHeight: 16, fontWeight: '800'},
  sourceOpenDocumentButton: {
    minHeight: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sourceOpenDocumentText: {color: '#FFFFFF', fontSize: 13, fontWeight: '900'},
  historyCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  historyStatusIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyMain: {flex: 1, minWidth: 0},
  historyTitle: {fontSize: 14, fontWeight: '700'},
  historyMeta: {fontSize: 12, marginTop: 3},
  historyScoreBox: {flexDirection: 'row', alignItems: 'center', gap: 4},
  historyScore: {fontSize: 13, fontWeight: '800'},
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.base,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  footerButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  practiceButton: {borderWidth: 1},
  examButton: {backgroundColor: Colors.primary},
  footerButtonText: {fontSize: 14, fontWeight: '800'},
});
