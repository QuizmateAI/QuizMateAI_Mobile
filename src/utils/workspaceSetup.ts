export type WorkspaceSetupContext = 'WORKSPACE' | 'GROUP';

export type WorkspaceSetupState = {
  contextType: WorkspaceSetupContext;
  status: string;
  currentStep: number;
  completed: boolean;
  needsSetup: boolean;
  canUseQuickActions: boolean;
  summary: string;
};

const hasText = (value: any) =>
  typeof value === 'string' && value.trim().length > 0;

const normalizeStatus = (profile: any) =>
  String(
    profile?.workspaceSetupStatus ||
      profile?.setupStatus ||
      profile?.profileStatus ||
      '',
  )
    .trim()
    .toUpperCase();

export const deriveWorkspaceSetupState = (
  profile: any,
  contextType: WorkspaceSetupContext = 'WORKSPACE',
): WorkspaceSetupState => {
  const status = normalizeStatus(profile);
  const onboardingCompleted = profile?.onboardingCompleted === true;

  const completed =
    onboardingCompleted ||
    status === 'DONE' ||
    status === 'PROFILE_DONE';

  let currentStep = Number(profile?.currentStep || 0);
  if (!Number.isInteger(currentStep) || currentStep <= 0) {
    if (completed) {
      currentStep = 3;
    } else if (
      contextType === 'GROUP'
        ? hasText(profile?.groupLearningGoal) &&
          hasText(profile?.knowledge) &&
          hasText(profile?.domain)
        : hasText(profile?.learningGoal) &&
          hasText(profile?.knowledge) &&
          hasText(profile?.domain)
    ) {
      currentStep = 2;
    } else {
      currentStep = 1;
    }
  }

  const needsSetup = !completed;
  const summary = completed
    ? 'Hồ sơ học tập đã hoàn tất.'
    : contextType === 'GROUP'
    ? 'Nhóm cần hoàn tất hồ sơ chung trước khi dùng các tính năng học tập.'
    : 'Bạn cần hoàn tất hồ sơ không gian học tập trước khi dùng các tác vụ nhanh.';

  return {
    contextType,
    status,
    currentStep: Math.min(Math.max(currentStep, 1), 3),
    completed,
    needsSetup,
    canUseQuickActions: completed,
    summary,
  };
};

export const getSetupLockMessage = (
  contextType: WorkspaceSetupContext,
  isLeader = false,
) => {
  if (contextType === 'GROUP') {
    return isLeader
      ? 'Hoàn tất hồ sơ nhóm trước để mở khóa studio, lời mời và tác vụ nhanh.'
      : 'Nhóm này chưa hoàn tất hồ sơ chung. Hãy nhờ trưởng nhóm thiết lập trước.';
  }

  return 'Hoàn tất hồ sơ không gian học tập trước khi dùng tác vụ nhanh này.';
};
