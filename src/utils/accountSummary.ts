export const EMPTY_CREDIT_SUMMARY = {
  balance: 0,
  totalAvailableCredits: 0,
  regularCreditBalance: 0,
  planCreditBalance: 0,
  hasActivePlan: false,
  planCreditExpiresAt: null as string | null,
};

function normalizePlanType(planScope: any) {
  const normalizedScope = String(planScope || '').toUpperCase();

  if (
    normalizedScope === 'WORKSPACE' ||
    normalizedScope === 'GROUP' ||
    normalizedScope === 'GROUP_WORKSPACE'
  ) {
    return 'GROUP';
  }

  return 'INDIVIDUAL';
}

export function normalizeCreditSummary(data: any) {
  const summary = data?.data ?? data ?? {};

  return {
    ...EMPTY_CREDIT_SUMMARY,
    ...summary,
    totalAvailableCredits:
      summary?.totalAvailableCredits ?? summary?.balance ?? 0,
    regularCreditBalance: summary?.regularCreditBalance ?? 0,
    planCreditBalance: summary?.planCreditBalance ?? 0,
    hasActivePlan: Boolean(summary?.hasActivePlan),
    planCreditExpiresAt: summary?.planCreditExpiresAt ?? null,
  };
}

export function normalizeCreditTransactions(data: any) {
  const page = data?.data ?? data ?? {};
  const content = Array.isArray(page?.content) ? page.content : [];

  return content.map((item: any) => ({
    id: item?.creditTransactionId ?? `${item?.createdAt}-${item?.creditChange}`,
    type: String(item?.transactionType || '').toUpperCase(),
    source: String(item?.sourceType || '').toUpperCase(),
    creditChange: Number(item?.creditChange ?? 0),
    balanceAfter: item?.balanceAfter ?? null,
    note: String(item?.note || '').trim(),
    createdAt: item?.createdAt ?? null,
  }));
}

export function normalizeCurrentPlan(data: any) {
  const summary = data?.data ?? data ?? null;
  if (!summary || typeof summary !== 'object') {
    return null;
  }

  const plan = summary?.plan;

  return {
    ...summary,
    defaultPlan: Boolean(summary?.defaultPlan),
    plan: plan
      ? {
          ...plan,
          id: plan?.planCatalogId ?? plan?.planId ?? plan?.id ?? null,
          name: plan?.displayName ?? plan?.planName ?? plan?.name ?? 'Free',
          type: normalizePlanType(plan?.planScope ?? plan?.type),
        }
      : null,
  };
}

export function formatCredits(value: any) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return '0';
  }

  return new Intl.NumberFormat('vi-VN').format(amount);
}

export function formatPlanDate(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new Date(value).toLocaleDateString('vi-VN');
  } catch {
    return value;
  }
}

export function formatCreditDateTime(value?: string | null) {
  if (!value) {
    return '';
  }

  try {
    return new Date(value).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export function getCurrentPlanName(currentPlan: any) {
  return String(
    currentPlan?.plan?.name || currentPlan?.plan?.displayName || 'Free',
  );
}

export function getCurrentPlanSubtitle(currentPlan: any) {
  if (!currentPlan) {
    return 'Đang cập nhật thông tin gói';
  }

  if (currentPlan.defaultPlan) {
    return 'Gói mặc định của tài khoản';
  }

  const expiresAt = formatPlanDate(currentPlan.expiresAt);
  if (expiresAt) {
    return `Hiệu lực đến ${expiresAt}`;
  }

  return 'Đang hoạt động';
}

export function getCreditTransactionLabel(type?: string, source?: string) {
  const normalizedType = String(type || '').toUpperCase();
  const normalizedSource = String(source || '').toUpperCase();

  if (normalizedType === 'WELCOME') {
    return 'Credit chào mừng';
  }
  if (normalizedType === 'TOPUP') {
    return 'Nạp thêm credit';
  }
  if (normalizedType === 'PLAN_BONUS') {
    return 'Nhận credit từ gói';
  }
  if (normalizedType === 'CONSUME') {
    return 'Sử dụng credit';
  }
  if (normalizedType === 'RESERVE') {
    return 'Tạm giữ credit';
  }
  if (normalizedType === 'RESERVE_CANCELLED') {
    return 'Hoàn tạm giữ credit';
  }
  if (normalizedType === 'REFUND') {
    return 'Hoàn lại credit';
  }
  if (normalizedType === 'PLAN_EXPIRE_RESET') {
    return 'Điều chỉnh credit gói';
  }
  if (normalizedType === 'ADJUST') {
    return 'Điều chỉnh credit';
  }

  if (normalizedSource === 'PAYMENT') {
    return 'Thanh toán credit';
  }
  if (normalizedSource === 'AI_USAGE') {
    return 'Tác vụ học tập';
  }

  return 'Biến động credit';
}

function parseAiUsageNote(note?: string) {
  const normalizedNote = String(note || '').trim();
  if (!normalizedNote) {
    return null;
  }

  const match = normalizedNote.match(/AI\s+[A-Z_]+:\s*([A-Z_]+)(?:\s+x(\d+))?/i);
  if (!match) {
    return null;
  }

  return {
    actionKey: String(match[1] || '').toUpperCase(),
  };
}

function sanitizeActivityNote(note?: string) {
  return String(note || '')
    .replace(/\s+\[(?:PARTIAL_REFUND|RELEASED)[^\]]*\]/gi, '')
    .trim();
}

function decodeUiActivityValue(value?: string) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return '';
  }

  try {
    return decodeURIComponent(normalizedValue.replace(/\+/g, '%20'));
  } catch {
    return normalizedValue;
  }
}

function parseUiActivityNote(note?: string) {
  const normalizedNote = sanitizeActivityNote(note);
  if (normalizedNote.startsWith('UI_ACTIVITY_V2|')) {
    const [, actionKey, encodedTarget = '', encodedWorkspace = ''] =
      normalizedNote.split('|');
    return {
      actionKey: String(actionKey || '').toUpperCase(),
      target: decodeUiActivityValue(encodedTarget),
      workspaceName: decodeUiActivityValue(encodedWorkspace),
    };
  }

  if (!normalizedNote.startsWith('UI_ACTIVITY|')) {
    return null;
  }

  const [, actionKey, ...targetParts] = normalizedNote.split('|');
  return {
    actionKey: String(actionKey || '').toUpperCase(),
    target: targetParts.join('|').trim(),
    workspaceName: '',
  };
}

function getAiActionActivity(actionKey?: string) {
  const activityMap: Record<string, {title: string}> = {
    PROCESS_PDF: {
      title: 'Bạn đã tải lên tài liệu PDF',
    },
    PROCESS_IMAGE: {
      title: 'Bạn đã tải lên hình ảnh',
    },
    PROCESS_TEXT: {
      title: 'Bạn đã xử lý văn bản',
    },
    PROCESS_DOCX: {
      title: 'Bạn đã tải lên tài liệu Word',
    },
    PROCESS_XLSX: {
      title: 'Bạn đã tải lên file Excel',
    },
    PROCESS_PPTX: {
      title: 'Bạn đã tải lên slide PowerPoint',
    },
    PROCESS_AUDIO: {
      title: 'Bạn đã tải lên tệp âm thanh',
    },
    PROCESS_VIDEO: {
      title: 'Bạn đã tải lên video',
    },
    GENERATE_QUIZ: {
      title: 'Bạn đã tạo bài quiz',
    },
    PREVIEW_QUIZ_STRUCTURE: {
      title: 'Bạn đã xem trước cấu trúc quiz',
    },
    GENERATE_FLASHCARDS: {
      title: 'Bạn đã tạo flashcard',
    },
    GENERATE_MOCK_TEST: {
      title: 'Bạn đã tạo đề luyện tập',
    },
    GENERATE_ROADMAP: {
      title: 'Bạn đã tạo lộ trình học',
    },
    GENERATE_ROADMAP_PHASES: {
      title: 'Bạn đã tạo các giai đoạn học',
    },
    GENERATE_ROADMAP_PHASE_CONTENT: {
      title: 'Bạn đã tạo nội dung học tập',
    },
    GENERATE_ROADMAP_KNOWLEDGE_QUIZ: {
      title: 'Bạn đã tạo quiz kiến thức',
    },
    SUGGEST_LEARNING_RESOURCES: {
      title: 'Bạn đã gợi ý tài liệu học',
    },
    ANALYZE_STUDY_PROFILE_KNOWLEDGE: {
      title: 'Bạn đã phân tích hồ sơ học tập',
    },
    SUGGEST_STUDY_PROFILE_FIELDS: {
      title: 'Bạn đã gợi ý thông tin hồ sơ học tập',
    },
    SUGGEST_STUDY_PROFILE_EXAM_TEMPLATES: {
      title: 'Bạn đã gợi ý mẫu đề phù hợp',
    },
    VALIDATE_STUDY_PROFILE_CONSISTENCY: {
      title: 'Bạn đã kiểm tra hồ sơ học tập',
    },
  };

  return activityMap[String(actionKey || '').toUpperCase()] || {
    title: 'Bạn đã sử dụng một tính năng học tập',
  };
}

function formatUiActivityTitle(actionKey?: string, target?: string) {
  const safeTarget = String(target || '').trim();
  const withTarget = (prefix: string) =>
    safeTarget ? `${prefix}${safeTarget}` : getAiActionActivity(actionKey).title;

  const titleMap: Record<string, string> = {
    PROCESS_PDF: withTarget('Đã tải lên PDF: '),
    PROCESS_DOCX: withTarget('Đã tải lên file Word: '),
    PROCESS_PPTX: withTarget('Đã tải lên slide: '),
    PROCESS_XLSX: withTarget('Đã tải lên file Excel: '),
    PROCESS_IMAGE: withTarget('Đã tải lên ảnh: '),
    PROCESS_AUDIO: withTarget('Đã tải lên audio: '),
    PROCESS_VIDEO: withTarget('Đã tải lên video: '),
    PROCESS_TEXT: withTarget('Đã gửi văn bản: '),
    GENERATE_QUIZ: withTarget('Đã tạo quiz: '),
    GENERATE_FLASHCARDS: withTarget('Đã tạo flashcard từ: '),
    GENERATE_MOCK_TEST: withTarget('Đã tạo mock test: '),
    GENERATE_ROADMAP: withTarget('Đã tạo roadmap: '),
    GENERATE_ROADMAP_PHASES: withTarget('Đã tạo phase cho: '),
    GENERATE_ROADMAP_PHASE_CONTENT: withTarget('Đã tạo nội dung cho: '),
    GENERATE_ROADMAP_KNOWLEDGE_QUIZ: withTarget('Đã tạo quiz kiến thức: '),
  };

  return (
    titleMap[String(actionKey || '').toUpperCase()] ||
    withTarget('Đã thực hiện tác vụ: ')
  );
}

function getReadableNote(note?: string) {
  const normalizedNote = sanitizeActivityNote(note);
  if (!normalizedNote) {
    return '';
  }
  if (
    normalizedNote.startsWith('UI_ACTIVITY|') ||
    normalizedNote.startsWith('UI_ACTIVITY_V2|')
  ) {
    return '';
  }
  if (/^AI\s+[A-Z_]+:/i.test(normalizedNote)) {
    return '';
  }
  return normalizedNote;
}

function getAiUsageActivity(note?: string) {
  const uiActivity = parseUiActivityNote(note);
  if (uiActivity) {
    return {
      title: formatUiActivityTitle(uiActivity.actionKey, uiActivity.target),
      subtitle: uiActivity.workspaceName || '',
    };
  }

  const readableNote = getReadableNote(note);
  if (readableNote) {
    return {
      title: readableNote,
      subtitle: '',
    };
  }

  const aiUsageMeta = parseAiUsageNote(note);
  if (aiUsageMeta) {
    return {
      title: getAiActionActivity(aiUsageMeta.actionKey).title,
      subtitle: '',
    };
  }

  return {
    title: 'Bạn đã sử dụng một tính năng học tập',
    subtitle: '',
  };
}

export function getCreditTransactionActivity(transaction: any) {
  const normalizedType = String(transaction?.type || '').toUpperCase();
  const normalizedSource = String(transaction?.source || '').toUpperCase();

  if (normalizedSource === 'AI_USAGE') {
    return getAiUsageActivity(transaction?.note);
  }

  if (normalizedType === 'WELCOME') {
    return {
      title: 'Bạn đã nhận credit chào mừng',
      subtitle: 'Quà tặng dành cho tài khoản mới',
    };
  }

  if (normalizedType === 'PLAN_BONUS') {
    return {
      title: 'Bạn đã nhận credit từ gói',
      subtitle: 'Credit đi kèm gói đã được cộng vào số dư',
    };
  }

  if (normalizedType === 'TOPUP') {
    return {
      title: 'Bạn đã nạp thêm credit',
      subtitle: 'Credit đã được cộng vào số dư của bạn',
    };
  }

  if (normalizedType === 'REFUND') {
    return {
      title: 'Bạn đã được hoàn lại credit',
      subtitle: 'Số credit chưa dùng đã được hoàn về số dư',
    };
  }

  if (normalizedType === 'RESERVE_CANCELLED') {
    return {
      title: 'Một khoản tạm giữ đã được hoàn',
      subtitle: 'Credit tạm giữ đã được trả lại vào số dư',
    };
  }

  if (normalizedType === 'PLAN_EXPIRE_RESET') {
    return {
      title: 'Credit từ gói đã được điều chỉnh',
      subtitle: 'Hệ thống đã reset credit gói theo chu kỳ',
    };
  }

  const readableNote = getReadableNote(transaction?.note);
  return {
    title: getCreditTransactionLabel(transaction?.type, transaction?.source),
    subtitle: readableNote,
  };
}

export function getCreditTransactionSourceLabel(source?: string) {
  const normalizedSource = String(source || '').toUpperCase();

  if (normalizedSource === 'SYSTEM') {
    return 'Hệ thống';
  }
  if (normalizedSource === 'PAYMENT') {
    return 'Thanh toán';
  }
  if (normalizedSource === 'AI_USAGE') {
    return 'Tính năng học tập';
  }
  if (normalizedSource === 'USER_PLAN') {
    return 'Gói của bạn';
  }
  if (normalizedSource === 'WORKSPACE_PLAN') {
    return 'Gói nhóm';
  }
  if (normalizedSource === 'ADMIN') {
    return 'Quản trị viên';
  }

  return 'Khác';
}

function getAiActionIcon(actionKey?: string): string {
  const iconMap: Record<string, string> = {
    PROCESS_PDF: 'file-pdf-box',
    PROCESS_IMAGE: 'image-outline',
    PROCESS_TEXT: 'text-box-outline',
    PROCESS_DOCX: 'file-word-box',
    PROCESS_XLSX: 'file-excel-box',
    PROCESS_PPTX: 'file-powerpoint-box',
    PROCESS_AUDIO: 'music-note',
    PROCESS_VIDEO: 'video-outline',
    GENERATE_QUIZ: 'head-question-outline',
    PREVIEW_QUIZ_STRUCTURE: 'eye-outline',
    GENERATE_FLASHCARDS: 'cards-outline',
    GENERATE_MOCK_TEST: 'clipboard-text-outline',
    GENERATE_ROADMAP: 'map-outline',
    GENERATE_ROADMAP_PHASES: 'layers-outline',
    GENERATE_ROADMAP_PHASE_CONTENT: 'book-open-page-variant-outline',
    GENERATE_ROADMAP_KNOWLEDGE_QUIZ: 'school-outline',
    SUGGEST_LEARNING_RESOURCES: 'lightbulb-outline',
    ANALYZE_STUDY_PROFILE_KNOWLEDGE: 'brain',
    SUGGEST_STUDY_PROFILE_FIELDS: 'account-edit-outline',
    SUGGEST_STUDY_PROFILE_EXAM_TEMPLATES: 'file-document-edit-outline',
    VALIDATE_STUDY_PROFILE_CONSISTENCY: 'check-circle-outline',
  };
  return iconMap[String(actionKey || '').toUpperCase()] || 'creation';
}

export function getCreditTransactionIcon(
  type?: string,
  source?: string,
  note?: string,
) {
  const normalizedType = String(type || '').toUpperCase();
  const normalizedSource = String(source || '').toUpperCase();

  if (normalizedType === 'TOPUP' || normalizedSource === 'PAYMENT') {
    return 'cart-plus';
  }
  if (normalizedType === 'PLAN_BONUS') {
    return 'crown-outline';
  }
  if (normalizedType === 'WELCOME') {
    return 'gift-outline';
  }
  if (normalizedType === 'REFUND' || normalizedType === 'RESERVE_CANCELLED') {
    return 'restore';
  }
  if (normalizedType === 'CONSUME' || normalizedSource === 'AI_USAGE') {
    const uiActivity = parseUiActivityNote(note);
    if (uiActivity?.actionKey) {
      return getAiActionIcon(uiActivity.actionKey);
    }
    const aiUsageMeta = parseAiUsageNote(note);
    if (aiUsageMeta?.actionKey) {
      return getAiActionIcon(aiUsageMeta.actionKey);
    }
    return 'creation';
  }

  return 'swap-horizontal';
}
