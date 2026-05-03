import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import TabBar from '../../components/ui/TabBar';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Dialog from '../../components/ui/Dialog';
import FloatingInput from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import ActionSheet from '../../components/ui/ActionSheet';
import GroupAPI from '../../api/GroupAPI';
import GroupWorkspaceProfileAPI from '../../api/GroupWorkspaceProfileAPI';
import ManagementSystemAPI from '../../api/ManagementSystemAPI';
import {
  formatCredits,
  formatCreditDateTime,
  getCreditTransactionActivity,
  getCreditTransactionIcon,
  getCreditTransactionSourceLabel,
} from '../../utils/accountSummary';
const TABS = [
  {key: 'dashboard', label: 'Tổng quan'},
  {key: 'members', label: 'Thành viên'},
  {key: 'ranking', label: 'Xếp hạng'},
  {key: 'logs', label: 'Hoạt động'},
  {key: 'wallet', label: 'Ví'},
  {key: 'settings', label: 'Cài đặt'},
];

const ROLE_FILTER_TABS = [
  {key: 'all', label: 'Tất cả'},
  {key: 'LEADER', label: 'Trưởng nhóm'},
  {key: 'CONTRIBUTOR', label: 'Cộng tác viên'},
  {key: 'MEMBER', label: 'Thành viên'},
];

export default function GroupManagementScreen({navigation, route}: any) {
  const {groupId, title} = route.params;
  const normalizedGroupId = Number(groupId || route?.params?.workspaceId || 0);
  const requestedInitialTab = String(route?.params?.initialTab || '').toLowerCase();
  const {isDark, colors} = useTheme();
  const {user} = useAuth();
  const {showToast} = useToast();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [members, setMembers] = useState<any[]>([]);
  const [group, setGroup] = useState<any>(null);
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);
  const [groupVisibilityPublic, setGroupVisibilityPublic] = useState<boolean | null>(null);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  // Members tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberActionVisible, setMemberActionVisible] = useState(false);
  const [_actionLoading, setActionLoading] = useState(false);

  // Settings tab state
  const [isEditing, setIsEditing] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Invite dialog
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [invitationActionLoadingId, setInvitationActionLoadingId] = useState<number | string | null>(null);

  // Ranking tab state
  const [rankingData, setRankingData] = useState<any>(null);

  // Logs tab state
  const [logs, setLogs] = useState<any[]>([]);
  const [workspacePayments, setWorkspacePayments] = useState<any[]>([]);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [groupCreditSummary, setGroupCreditSummary] = useState<any>(null);

  const currentUserId = user?.id;

  const normalizeArray = useCallback((payload: any): any[] => {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload?.content)) {
      return payload.content;
    }
    if (Array.isArray(payload?.items)) {
      return payload.items;
    }
    if (Array.isArray(payload?.data)) {
      return payload.data;
    }
    if (Array.isArray(payload?.data?.content)) {
      return payload.data.content;
    }
    if (Array.isArray(payload?.data?.items)) {
      return payload.data.items;
    }
    if (Array.isArray(payload?.data?.data)) {
      return payload.data.data;
    }
    return [];
  }, []);

  const unwrapPayload = useCallback((payload: any) => {
    if (payload?.data?.data != null) {
      return payload.data.data;
    }
    if (payload?.data != null) {
      return payload.data;
    }
    return payload ?? null;
  }, []);

  useEffect(() => {
    const allowedTabs = new Set(['dashboard', 'members', 'ranking', 'logs', 'wallet', 'settings']);
    if (allowedTabs.has(requestedInitialTab)) {
      setActiveTab(requestedInitialTab);
    }
  }, [requestedInitialTab]);

  const normalizedCurrentUserId = Number(currentUserId || 0);
  const normalizedCurrentUserKey = String(currentUserId ?? '').trim();

  const isLeader = members.some(m => {
    const memberUserId = Number(m?.userId || m?.id || m?.memberId || 0);
    const memberUserKey = String(m?.userId || m?.id || m?.memberId || '').trim();
    const memberRole = String(m?.role || m?.memberRole || '').toUpperCase();
    const isSameUserByNumber =
      memberUserId > 0 &&
      normalizedCurrentUserId > 0 &&
      memberUserId === normalizedCurrentUserId;
    const isSameUserByString =
      memberUserKey.length > 0 &&
      normalizedCurrentUserKey.length > 0 &&
      memberUserKey === normalizedCurrentUserKey;

    return (isSameUserByNumber || isSameUserByString) && memberRole === 'LEADER';
  });

  const fetchData = useCallback(async () => {
    if (!Number.isInteger(normalizedGroupId) || normalizedGroupId <= 0) {
      setLoading(false);
      setMembers([]);
      showToast('Group ID không hợp lệ', 'error');
      return;
    }

    try {
      // Fetch members and joined groups
      const [memRes, joinedRes] = await Promise.all([
        GroupAPI.getMembers(normalizedGroupId),
        GroupAPI.getJoined(),
      ]);
      const membersData = normalizeArray(memRes?.data);
      const joinedGroups = normalizeArray(joinedRes?.data);
      setMembers(membersData);

      // Fetch dashboard data with allSettled for resilience
      const dashboardResults = await Promise.allSettled([
        GroupAPI.getPendingInvitations(normalizedGroupId),
        GroupAPI.getDashboardSummary(normalizedGroupId),
        GroupAPI.getOverallRanking(normalizedGroupId),
        GroupAPI.getGroupLogs(normalizedGroupId),
        ManagementSystemAPI.getWorkspacePayments(normalizedGroupId, 0, 5),
        ManagementSystemAPI.getGroupWorkspaceWallet(normalizedGroupId),
        ManagementSystemAPI.getGroupWorkspaceWalletTransactions(normalizedGroupId, 0, 10),
      ]);

      const pendingRes = dashboardResults[0].status === 'fulfilled' ? dashboardResults[0].value : {data: []};
      const summaryRes = dashboardResults[1].status === 'fulfilled' ? dashboardResults[1].value : {data: null};
      const rankingRes = dashboardResults[2].status === 'fulfilled' ? dashboardResults[2].value : {data: null};
      const logsRes = dashboardResults[3].status === 'fulfilled' ? dashboardResults[3].value : {data: []};
      const paymentRes = dashboardResults[4].status === 'fulfilled' ? dashboardResults[4].value : {data: null};
      const walletRes = dashboardResults[5].status === 'fulfilled' ? dashboardResults[5].value : {data: null};
      const walletTransRes = dashboardResults[6].status === 'fulfilled' ? dashboardResults[6].value : {data: []};

      const pendingInvitesData = normalizeArray(pendingRes?.data);
      const summaryData = unwrapPayload(summaryRes?.data);
      const rankingDataRaw = unwrapPayload(rankingRes?.data);
      const logsData = normalizeArray(logsRes?.data);
      const paymentDataRaw = unwrapPayload(paymentRes?.data);
      const walletData = unwrapPayload(walletRes?.data);
      const walletTransData = normalizeArray(walletTransRes?.data);

      setPendingInvitations(pendingInvitesData);
      setDashboardSummary(summaryData || null);
      setRankingData(
        Array.isArray(rankingDataRaw)
          ? {members: rankingDataRaw}
          : rankingDataRaw || null,
      );
      setLogs(logsData);
      setWorkspacePayments(normalizeArray(paymentDataRaw));
      setGroupCreditSummary(walletData || null);
      setWalletTransactions(walletTransData);

      const selectedGroup = joinedGroups.find(
        (g: any) => Number(g.groupId || g.id || 0) === normalizedGroupId,
      );
      setGroupVisibilityPublic(
        typeof selectedGroup?.isPublic === 'boolean' ? selectedGroup.isPublic : null,
      );
      setGroup(selectedGroup || {groupName: title, groupId: normalizedGroupId});
      setEditGroupName(
        selectedGroup?.groupName || selectedGroup?.name || title || '',
      );
      setEditDescription(selectedGroup?.description || '');
    } catch (error) {
      console.error('GroupManagementScreen fetchData error:', error);
      setGroup({groupId: normalizedGroupId, groupName: title || '', description: ''});
      setEditGroupName(title || '');
      setEditDescription('');
      setMembers([]);
      setPendingInvitations([]);
      setDashboardSummary(null);
      setGroupVisibilityPublic(null);
      setRankingData(null);
      setLogs([]);
      setWorkspacePayments([]);
      setGroupCreditSummary(null);
      setWalletTransactions([]);
      showToast('Không thể tải chi tiết nhóm', 'error');
    } finally {
      setLoading(false);
    }
  }, [normalizedGroupId, title, showToast, normalizeArray, unwrapPayload]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ──── Filtered members ────
  const filteredMembers = members.filter(m => {
    const name = (m.fullName || m.username || '').toLowerCase();
    const email = (m.email || '').toLowerCase();
    const matchSearch =
      name.includes(searchQuery.toLowerCase()) ||
      email.includes(searchQuery.toLowerCase());
    const matchRole = roleFilter === 'all' || m.role === roleFilter;
    return matchSearch && matchRole;
  });

  const leaders = members.filter(
    m => String(m?.role || m?.memberRole || '').toUpperCase() === 'LEADER',
  );
  const contributors = members.filter(
    m => String(m?.role || m?.memberRole || '').toUpperCase() === 'CONTRIBUTOR',
  );
  const canUploadCount = members.filter(
    m => m?.canUpload === true || m?.canUpload === 'true',
  ).length;
  const totalMembers =
    Number(dashboardSummary?.totalActiveMembers) > 0
      ? Number(dashboardSummary.totalActiveMembers)
      : members.length;
  const totalCompleted = Number(dashboardSummary?.totalQuizCompleted || 0);
  const averageScore = Number(dashboardSummary?.groupAverageScore || 0);

  // ──── Member actions ────
  const getMemberActions = (member: any) => {
    const actions: any[] = [];
    if (!isLeader || member.role === 'LEADER') {return actions;}
    const isSelf =
      member.userId === currentUserId || member.id === currentUserId;
    if (isSelf) {return actions;}

    // Toggle upload
    actions.push({
      key: 'toggleUpload',
      label: member.canUpload ? 'Thu hồi quyền tải lên' : 'Cấp quyền tải lên',
      icon: member.canUpload ? 'upload-off' : 'upload',
    });

    // Role change
    if (member.role === 'MEMBER') {
      actions.push({
        key: 'promote',
        label: 'Nâng lên cộng tác viên',
        icon: 'shield-account',
      });
    } else if (member.role === 'CONTRIBUTOR') {
      actions.push({
        key: 'demote',
        label: 'Hạ xuống thành viên',
        icon: 'shield-off-outline',
      });
    }

    // Remove
    actions.push({
      key: 'remove',
      label: 'Xóa thành viên',
      icon: 'account-remove',
      destructive: true,
    });

    return actions;
  };

  const handleMemberAction = async (key: string) => {
    if (!selectedMember) {return;}
    const memberId = selectedMember.groupMemberId || selectedMember.id;
    setActionLoading(true);

    try {
      switch (key) {
        case 'toggleUpload':
          if (selectedMember.canUpload) {
            await GroupAPI.revokeUpload(normalizedGroupId, memberId);
            showToast('Đã thu hồi quyền tải lên', 'success');
          } else {
            await GroupAPI.grantUpload(normalizedGroupId, memberId);
            showToast('Đã cấp quyền tải lên', 'success');
          }
          break;
        case 'promote':
          await GroupAPI.updateRole(normalizedGroupId, memberId, 'CONTRIBUTOR');
          showToast('Đã thăng quyền thành viên!', 'success');
          break;
        case 'demote':
          await GroupAPI.updateRole(normalizedGroupId, memberId, 'MEMBER');
          showToast('Đã hạ quyền thành viên', 'success');
          break;
        case 'remove':
          Alert.alert(
            'Xóa thành viên',
            `Xóa ${selectedMember.fullName || selectedMember.username}?`,
            [
              {text: 'Hủy', style: 'cancel'},
              {
                text: 'Xóa',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await GroupAPI.removeMember(normalizedGroupId, memberId);
                    showToast('Đã xóa thành viên', 'success');
                    fetchData();
                  } catch {
                    showToast('Không thể xóa thành viên', 'error');
                  }
                },
              },
            ],
          );
          setActionLoading(false);
          return;
      }
      fetchData();
    } catch {
      showToast('Thao tác thất bại', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // ──── Invite ────
  const handleInvite = async () => {
    if (!inviteEmail.trim()) {return;}
    setInviting(true);
    try {
      await GroupAPI.sendInvitation(normalizedGroupId, {email: inviteEmail});
      showToast('Đã gửi lời mời!', 'success');
      setInviteVisible(false);
      setInviteEmail('');
      fetchData();
    } catch {
      showToast('Không thể gửi lời mời', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleResendInvitation = async (invitation: any) => {
    const invitationId = invitation?.invitationId || invitation?.id;
    if (!invitationId) {
      return;
    }
    setInvitationActionLoadingId(invitationId);
    try {
      await GroupAPI.resendInvitation(
        normalizedGroupId,
        invitationId,
        invitation?.email || invitation?.invitedEmail,
      );
      showToast('Đã gửi lại lời mời', 'success');
    } catch {
      showToast('Không thể gửi lại lời mời', 'error');
    } finally {
      setInvitationActionLoadingId(null);
    }
  };

  const handleCancelInvitation = async (invitation: any) => {
    const invitationId = invitation?.invitationId || invitation?.id;
    if (!invitationId) {
      return;
    }
    setInvitationActionLoadingId(invitationId);
    try {
      await GroupAPI.cancelInvitation(normalizedGroupId, invitationId);
      setPendingInvitations(current =>
        current.filter(
          item => (item?.invitationId || item?.id) !== invitationId,
        ),
      );
      showToast('Đã hủy lời mời', 'success');
    } catch {
      showToast('Không thể hủy lời mời', 'error');
    } finally {
      setInvitationActionLoadingId(null);
    }
  };

  // ──── Settings: Save ────
  const handleSaveGroup = async () => {
    if (!editGroupName.trim()) {
      showToast('Vui lòng nhập tên nhóm', 'error');
      return;
    }

    setSaving(true);
    try {
      await GroupWorkspaceProfileAPI.saveBasicStep(normalizedGroupId, {
        groupName: editGroupName.trim(),
        rules: editDescription.trim(),
      });
      setGroup((current: any) => ({
        ...(current || {}),
        groupName: editGroupName.trim(),
        name: editGroupName.trim(),
        description: editDescription.trim(),
      }));
      setIsEditing(false);
      showToast('Đã lưu thông tin nhóm', 'success');
    } catch {
      showToast('Không thể lưu thông tin nhóm', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ──── Settings: Delete ────
  const handleDeleteGroup = async () => {
    if (deleteConfirmText.trim().toLowerCase() !== 'delete group') {
      showToast('Nhập đúng "delete group" để xác nhận', 'error');
      return;
    }

    setDeleting(true);
    try {
      await GroupAPI.deleteGroup(normalizedGroupId, deleteConfirmText.trim());
      setDeleteDialogVisible(false);
      showToast('Đã xóa nhóm', 'success');
      navigation.goBack();
    } catch {
      showToast('Không thể xóa nhóm', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleVisibility = async () => {
    setVisibilityLoading(true);
    try {
      const res = await GroupAPI.toggleVisibility(normalizedGroupId);
      const nextValue =
        typeof res?.data?.isPublic === 'boolean'
          ? Boolean(res.data.isPublic)
          : groupVisibilityPublic == null
          ? true
          : !groupVisibilityPublic;
      setGroupVisibilityPublic(nextValue);
      showToast(nextValue ? 'Nhóm đã chuyển sang Public' : 'Nhóm đã chuyển sang Private', 'success');
    } catch {
      showToast('Không thể cập nhật trạng thái hiển thị nhóm', 'error');
    } finally {
      setVisibilityLoading(false);
    }
  };

  // ──── Role badge ────
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'LEADER':
        return {variant: 'warning' as const, icon: 'crown', label: 'Trưởng nhóm'};
      case 'CONTRIBUTOR':
        return {variant: 'info' as const, icon: 'shield-account', label: 'Cộng tác viên'};
      default:
        return {variant: 'default' as const, icon: 'account', label: 'Thành viên'};
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top']}>
      {/* Header */}
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
        <View style={styles.headerCenter}>
          <Text
            style={[styles.headerTitle, {color: colors.heading}]}
            numberOfLines={1}>
            {group?.groupName || group?.name || title}
          </Text>
          <Text style={[styles.headerSub, {color: colors.textSecondary}]}>
            Quản lý nhóm
          </Text>
        </View>
        {isLeader && (
          <TouchableOpacity
            onPress={() => setInviteVisible(true)}
            style={[styles.inviteBtn, {backgroundColor: Colors.primary}]}>
            <Icon name="account-plus" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* ───────── DASHBOARD ───────── */}
        {activeTab === 'dashboard' && (
          <View>
            {/* Group Info Card */}
            <View
              style={[
                styles.infoCard,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <View
                style={[
                  styles.infoCardIcon,
                  {backgroundColor: isDark ? '#1E3A8A20' : '#DBEAFE'},
                ]}>
                <Icon
                  name="account-group"
                  size={28}
                  color={isDark ? '#60A5FA' : Colors.primary}
                />
              </View>
              <View style={styles.infoCardContent}>
                <Text style={[styles.infoCardTitle, {color: colors.heading}]}>
                  {group?.groupName}
                </Text>
                <Text
                  style={[styles.infoCardDesc, {color: colors.textSecondary}]}>
                  {group?.description || 'Chưa có mô tả'}
                </Text>
              </View>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <StatCard
                icon="account-multiple"
                label="Thành viên"
                value={totalMembers}
                color="#2563EB"
                colors={colors}
                isDark={isDark}
              />
              <StatCard
                icon="shield-account"
                label="Cộng tác viên"
                value={contributors.length}
                color="#7C3AED"
                colors={colors}
                isDark={isDark}
              />
              <StatCard
                icon="upload"
                label="Có thể tải lên"
                value={canUploadCount}
                color="#059669"
                colors={colors}
                isDark={isDark}
              />
              <StatCard
                icon="check-decagram"
                label="Quiz hoàn tất"
                value={totalCompleted}
                color="#0D9488"
                colors={colors}
                isDark={isDark}
              />
              <StatCard
                icon="crown"
                label="Trưởng nhóm"
                value={leaders.length}
                color="#F59E0B"
                colors={colors}
                isDark={isDark}
              />
              <StatCard
                icon="chart-line"
                label="Điểm TB"
                value={Number.isFinite(averageScore) ? Number(averageScore.toFixed(1)) : 0}
                color="#9333EA"
                colors={colors}
                isDark={isDark}
              />
            </View>

            {/* Role Distribution */}
            <View
              style={[
                styles.distCard,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <View style={styles.distHeader}>
                <Icon
                  name="chart-bar"
                  size={18}
                  color={colors.textSecondary}
                />
                <Text style={[styles.distTitle, {color: colors.heading}]}>
                  Phân bổ vai trò
                </Text>
              </View>
              {members.length > 0 && (
                <View style={styles.progressBar}>
                  {leaders.length > 0 && (
                    <View
                      style={[
                        styles.progressSegment,
                        {
                          flex: leaders.length,
                          backgroundColor: '#F59E0B',
                          borderTopLeftRadius: 4,
                          borderBottomLeftRadius: 4,
                        },
                      ]}
                    />
                  )}
                  {contributors.length > 0 && (
                    <View
                      style={[
                        styles.progressSegment,
                        {flex: contributors.length, backgroundColor: '#7C3AED'},
                      ]}
                    />
                  )}
                  {members.length - leaders.length - contributors.length > 0 && (
                    <View
                      style={[
                        styles.progressSegment,
                        {
                          flex:
                            members.length - leaders.length - contributors.length,
                          backgroundColor: '#94A3B8',
                          borderTopRightRadius: 4,
                          borderBottomRightRadius: 4,
                        },
                      ]}
                    />
                  )}
                </View>
              )}
              <View style={styles.distLegend}>
                {[
                  {
                    label: 'Trưởng nhóm',
                    count: leaders.length,
                    color: '#F59E0B',
                  },
                  {
                    label: 'Cộng tác viên',
                    count: contributors.length,
                    color: '#7C3AED',
                  },
                  {
                    label: 'Thành viên',
                    count:
                      members.length - leaders.length - contributors.length,
                    color: '#94A3B8',
                  },
                ].map(item => (
                  <View key={item.label} style={styles.legendItem}>
                    <View
                      style={[styles.legendDot, {backgroundColor: item.color}]}
                    />
                    <Text
                      style={[
                        styles.legendLabel,
                        {color: colors.textSecondary},
                      ]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.legendCount, {color: colors.heading}]}>
                      {item.count}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ───────── MEMBERS ───────── */}
        {activeTab === 'members' && (
          <View>
            {/* Search bar */}
            <View
              style={[
                styles.searchBar,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <Icon name="magnify" size={18} color={colors.textTertiary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Tìm kiếm thành viên..."
                placeholderTextColor={colors.placeholder}
                style={[styles.searchInput, {color: colors.text}]}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Icon name="close-circle" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Role filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterRow}>
              {ROLE_FILTER_TABS.map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setRoleFilter(tab.key)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        roleFilter === tab.key
                          ? isDark
                            ? '#2563EB30'
                            : '#EFF6FF'
                          : isDark
                          ? Colors.dark.surfaceVariant
                          : '#F1F5F9',
                      borderColor:
                        roleFilter === tab.key
                          ? isDark
                            ? '#2563EB60'
                            : '#BFDBFE'
                          : 'transparent',
                    },
                  ]}>
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color:
                          roleFilter === tab.key
                            ? isDark
                              ? '#60A5FA'
                              : Colors.primary
                            : colors.textSecondary,
                      },
                    ]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Member Count */}
            <Text
              style={[styles.memberCountText, {color: colors.textTertiary}]}>
              Hiển thị {filteredMembers.length}/{members.length} thành viên
            </Text>

            {/* Members list */}
            {filteredMembers.map((member: any) => {
              const isSelf =
                member.userId === currentUserId ||
                member.id === currentUserId;
              const role = getRoleBadge(member.role);
              return (
                <TouchableOpacity
                  key={member.userId || member.id || member.groupMemberId}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (isLeader && !isSelf && member.role !== 'LEADER') {
                      setSelectedMember(member);
                      setMemberActionVisible(true);
                    }
                  }}
                  style={[
                    styles.memberCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}>
                  <Avatar
                    uri={member.avatarUrl || member.avatar}
                    name={member.fullName || member.username}
                    size={42}
                  />
                  <View style={styles.memberInfo}>
                    <View style={styles.memberNameRow}>
                      <Text
                        style={[styles.memberName, {color: colors.heading}]}
                        numberOfLines={1}>
                        {member.fullName || member.username}
                      </Text>
                      {isSelf && (
                        <Badge label="You" variant="info" size="sm" />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.memberEmail,
                        {color: colors.textSecondary},
                      ]}
                      numberOfLines={1}>
                      {member.email || `@${member.username}`}
                    </Text>
                  </View>

                  <View style={styles.memberMeta}>
                    <Badge
                      label={role.label}
                      variant={role.variant}
                      size="sm"
                    />
                    {member.canUpload && (
                      <View style={styles.uploadBadge}>
                        <Icon
                          name="upload"
                          size={10}
                          color={isDark ? '#34D399' : '#059669'}
                        />
                      </View>
                    )}
                  </View>

                  {isLeader && !isSelf && member.role !== 'LEADER' && (
                    <Icon
                      name="dots-vertical"
                      size={18}
                      color={colors.textTertiary}
                    />
                  )}
                </TouchableOpacity>
              );
            })}

            {isLeader ? (
              <View
                style={[
                  styles.pendingInviteCard,
                  {backgroundColor: colors.surface, borderColor: colors.border},
                ]}>
                <Text style={[styles.pendingInviteTitle, {color: colors.heading}]}>Lời mời đang chờ</Text>
                {pendingInvitations.length === 0 ? (
                  <Text style={[styles.pendingInviteEmpty, {color: colors.textSecondary}]}>Không có lời mời đang chờ.</Text>
                ) : (
                  pendingInvitations.map((invitation: any, index: number) => {
                    const invitationId = invitation?.invitationId || invitation?.id || `pending-${index}`;
                    const email = invitation?.email || invitation?.invitedEmail || 'unknown@email';
                    const loadingThis = invitationActionLoadingId === invitationId;
                    return (
                      <View key={String(invitationId)} style={styles.pendingInviteItem}>
                        <View style={{flex: 1}}>
                          <Text style={[styles.pendingInviteEmail, {color: colors.heading}]}>{email}</Text>
                        </View>
                        <Button
                          title="Gửi lại"
                          size="sm"
                          variant="outline"
                          onPress={() => handleResendInvitation(invitation)}
                          loading={loadingThis}
                          fullWidth={false}
                          style={styles.pendingInviteAction}
                        />
                        <Button
                          title="Hủy"
                          size="sm"
                          variant="destructive"
                          onPress={() => handleCancelInvitation(invitation)}
                          loading={loadingThis}
                          fullWidth={false}
                          style={styles.pendingInviteAction}
                        />
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
          </View>
        )}

        {/* ───────── SETTINGS ───────── */}
        {activeTab === 'settings' && (
          <View>
            {isLeader ? (
              <>
                <View
                  style={[
                    styles.settingsCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <Text style={[styles.settingsCardTitle, {color: colors.heading}]}>Cấu hình nhóm</Text>
                  <View style={styles.settingsQuickActions}>
                    <Button
                      title="Cấu hình hồ sơ nhóm"
                      size="md"
                      variant="outline"
                      fullWidth={false}
                      onPress={() =>
                        navigation.navigate('WorkspaceProfileWizard', {
                          workspaceId: normalizedGroupId,
                          title: group?.groupName || title,
                          contextType: 'GROUP',
                        })
                      }
                      style={{flex: 1}}
                    />
                    <Button
                      title={groupVisibilityPublic ? 'Đang Public' : 'Đang Private'}
                      size="md"
                      variant="outline"
                      fullWidth={false}
                      loading={visibilityLoading}
                      onPress={handleToggleVisibility}
                      style={{flex: 1}}
                    />
                  </View>
                  <View style={styles.settingsQuickActions}>
                    <Button
                      title="Mua gói nhóm"
                      size="md"
                      variant="outline"
                      fullWidth={false}
                      onPress={() =>
                        navigation.navigate('Subscription', {
                          planType: 'group',
                          workspaceId: normalizedGroupId,
                          workspaceName: group?.groupName || title,
                        })
                      }
                      style={{flex: 1}}
                    />
                    <Button
                      title="Nạp credit nhóm"
                      size="md"
                      variant="outline"
                      fullWidth={false}
                      onPress={() =>
                        navigation.navigate('CreditPackages', {
                          workspaceId: normalizedGroupId,
                          workspaceName: group?.groupName || title,
                        })
                      }
                      style={{flex: 1}}
                    />
                  </View>
                </View>

                <View
                  style={[
                    styles.settingsCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.settingsCardHeader}>
                    <View style={styles.settingsHeaderLeft}>
                      <Icon
                        name="receipt-text-outline"
                        size={18}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.settingsCardTitle,
                          {color: colors.heading},
                        ]}>
                        Lịch sử thanh toán nhóm
                      </Text>
                    </View>
                  </View>

                  {workspacePayments.length === 0 ? (
                    <Text style={[styles.emptyHistoryText, {color: colors.textSecondary}]}>Chưa có giao dịch thanh toán gần đây.</Text>
                  ) : (
                    workspacePayments.map((payment: any, index: number) => (
                      <View
                        key={String(payment?.orderId || payment?.paymentId || index)}
                        style={[
                          styles.paymentHistoryRow,
                          {
                            borderBottomColor: colors.border,
                            borderBottomWidth:
                              index === workspacePayments.length - 1
                                ? 0
                                : StyleSheet.hairlineWidth,
                          },
                        ]}>
                        <View style={{flex: 1}}>
                          <Text style={[styles.paymentHistoryTitle, {color: colors.heading}]}> 
                            {payment?.targetType || 'PAYMENT'}
                          </Text>
                          <Text style={[styles.paymentHistoryMeta, {color: colors.textSecondary}]}> 
                            {payment?.orderId || 'Không có mã đơn'}
                          </Text>
                        </View>
                        <View style={{alignItems: 'flex-end'}}>
                          <Text style={[styles.paymentHistoryAmount, {color: colors.heading}]}> 
                            {Number(payment?.amount || 0).toLocaleString('vi-VN')}đ
                          </Text>
                          <Text style={[styles.paymentHistoryStatus, {color: colors.textSecondary}]}> 
                            {String(payment?.status || '').toUpperCase() || 'UNKNOWN'}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>

                {/* Group Info Edit */}
                <View
                  style={[
                    styles.settingsCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.settingsCardHeader}>
                    <View style={styles.settingsHeaderLeft}>
                      <Icon
                        name="information-outline"
                        size={18}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.settingsCardTitle,
                          {color: colors.heading},
                        ]}>
                        Thông tin nhóm
                      </Text>
                    </View>
                    {!isEditing && (
                      <TouchableOpacity onPress={() => setIsEditing(true)}>
                        <Text style={[styles.editLink, {color: Colors.primary}]}>
                          Sửa
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {isEditing ? (
                    <View style={styles.editForm}>
                      <FloatingInput
                        label="Group Name"
                        value={editGroupName}
                        onChangeText={setEditGroupName}
                      />
                      <FloatingInput
                        label="Description"
                        value={editDescription}
                        onChangeText={setEditDescription}
                        multiline
                      />
                      <View style={styles.editActions}>
                        <Button
                          title="Cancel"
                          variant="outline"
                          size="md"
                          onPress={() => {
                            setIsEditing(false);
                            setEditGroupName(
                              group?.groupName || title || '',
                            );
                            setEditDescription(group?.description || '');
                          }}
                          fullWidth={false}
                          style={{flex: 1}}
                        />
                        <Button
                          title="Save"
                          size="md"
                          onPress={handleSaveGroup}
                          loading={saving}
                          fullWidth={false}
                          style={{flex: 1}}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.infoDisplay}>
                      <View style={styles.infoRow}>
                        <Text
                          style={[
                            styles.infoLabel,
                            {color: colors.textSecondary},
                          ]}>
                          Tên
                        </Text>
                        <Text
                          style={[styles.infoValue, {color: colors.heading}]}>
                          {group?.groupName || '—'}
                        </Text>
                      </View>
                      <View style={styles.infoRow}>
                        <Text
                          style={[
                            styles.infoLabel,
                            {color: colors.textSecondary},
                          ]}>
                          Mô tả
                        </Text>
                        <Text
                          style={[styles.infoValue, {color: colors.heading}]}>
                          {group?.description || 'Chưa có mô tả'}
                        </Text>
                      </View>
                      {group?.topicName && (
                        <View style={styles.infoRow}>
                          <Text
                            style={[
                              styles.infoLabel,
                              {color: colors.textSecondary},
                            ]}>
                            Chủ đề
                          </Text>
                          <Text
                            style={[styles.infoValue, {color: colors.heading}]}>
                            {group.topicName}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Danger Zone */}
                <View
                  style={[
                    styles.dangerCard,
                    {
                      backgroundColor: isDark
                        ? 'rgba(239,68,68,0.05)'
                        : '#FEF2F2',
                      borderColor: isDark ? '#991B1B50' : '#FECACA',
                    },
                  ]}>
                  <View style={styles.dangerHeader}>
                    <Icon name="alert-outline" size={18} color={Colors.error} />
                    <Text style={styles.dangerTitle}>Vùng nguy hiểm</Text>
                  </View>
                  <Text
                    style={[
                      styles.dangerDesc,
                      {color: colors.textSecondary},
                    ]}>
                    Xóa nhóm là thao tác vĩnh viễn. Toàn bộ dữ liệu sẽ bị mất.
                  </Text>
                  <Button
                    title="Xóa nhóm"
                    variant="destructive"
                    size="md"
                    icon="delete-outline"
                    onPress={() => setDeleteDialogVisible(true)}
                    fullWidth={false}
                    style={{alignSelf: 'flex-start', marginTop: Spacing.md}}
                  />
                </View>
              </>
            ) : (
              <View style={styles.emptySettings}>
                <Icon name="lock-outline" size={40} color={colors.textTertiary} />
                <Text
                  style={[
                    styles.emptySettingsText,
                    {color: colors.textSecondary},
                  ]}>
                    Chỉ trưởng nhóm mới có quyền quản lý cài đặt
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ───────── RANKING ───────── */}
        {activeTab === 'ranking' && (
          <View>
            {Array.isArray(rankingData?.members) && rankingData.members.length > 0 ? (
              <View>
                <Text style={[styles.rankingTitle, {color: colors.heading}]}>
                  Xếp hạng toàn bộ nhóm
                </Text>
                <View style={[styles.rankingList, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                  {(rankingData.members as any[]).map((member: any, index: number) => (
                    <View
                      key={member.memberId || member.userId || index}
                      style={[
                        styles.rankingItem,
                        {borderBottomColor: colors.border},
                        index === rankingData.members.length - 1 && {borderBottomWidth: 0},
                      ]}>
                      <View style={styles.rankingPosition}>
                        <Text style={[styles.rankingNum, {color: colors.heading}]}>
                          #{index + 1}
                        </Text>
                      </View>
                      <View style={styles.rankingMemberInfo}>
                        <Text style={[styles.rankingMemberName, {color: colors.heading}]}>
                          {member.fullName || member.username || 'Người dùng'}
                        </Text>
                        <Text style={[styles.rankingMemberEmail, {color: colors.textSecondary}]}>
                          {member.email || ''}
                        </Text>
                      </View>
                      <View style={styles.rankingScore}>
                        <Text style={[styles.rankingScoreValue, {color: colors.heading}]}>
                          {Number(member.totalScore || 0).toFixed(0)}
                        </Text>
                        <Text style={[styles.rankingScoreLabel, {color: colors.textSecondary}]}>
                          điểm
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Icon name="chart-box-outline" size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyStateText, {color: colors.textSecondary}]}>
                  Chưa có dữ liệu xếp hạng
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ───────── LOGS ───────── */}
        {activeTab === 'logs' && (
          <View>
            {logs && logs.length > 0 ? (
              <View>
                <Text style={[styles.logsTitle, {color: colors.heading}]}>
                  Lịch sử hoạt động nhóm
                </Text>
                <View style={[styles.logsList, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                  {logs.map((log: any, index: number) => (
                    <View
                      key={log.id || index}
                      style={[
                        styles.logItem,
                        {borderBottomColor: colors.border},
                        index === logs.length - 1 && {borderBottomWidth: 0},
                      ]}>
                      <View style={[styles.logIcon, {backgroundColor: `${Colors.primary}15`}]}>
                        <Icon name="history" size={16} color={Colors.primary} />
                      </View>
                      <View style={styles.logContent}>
                        <Text style={[styles.logDescription, {color: colors.heading}]}>
                          {log.description || 'Hoạt động nhóm'}
                        </Text>
                        <Text style={[styles.logTime, {color: colors.textSecondary}]}>
                          {log.createdAt
                            ? new Date(log.createdAt).toLocaleString('vi-VN')
                            : 'Không rõ thời gian'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Icon name="history" size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyStateText, {color: colors.textSecondary}]}>
                  Chưa có hoạt động gì
                </Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'wallet' && (
          <View>
            {groupCreditSummary && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, {color: colors.heading}]}>Số dư credit</Text>
                <View
                  style={[
                    styles.creditCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.creditHeaderRow}>
                    <View
                      style={[
                        styles.creditIconSmall,
                        {backgroundColor: isDark ? 'rgba(37,99,235,0.18)' : '#DBEAFE'},
                      ]}>
                      <Icon
                        name="lightning-bolt-circle"
                        size={20}
                        color={isDark ? '#93C5FD' : Colors.primary}
                      />
                    </View>
                    <View style={{flex: 1}}>
                      <Text style={[styles.creditLabelSmall, {color: colors.textTertiary}]}>
                        Tổng số dư
                      </Text>
                      <Text style={[styles.creditAmountSmall, {color: colors.heading}]}>
                        {formatCredits(groupCreditSummary.totalAvailableCredits || 0)} credit
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {walletTransactions && walletTransactions.length > 0 ? (
              <View>
                <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                  Lịch sử sử dụng credit
                </Text>
                <View style={[styles.transactionList, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                  {walletTransactions.map((transaction: any, index: number) => {
                    const isPositive = Number(transaction.creditChange || 0) >= 0;
                    const activity = getCreditTransactionActivity(transaction);
                    return (
                      <View
                        key={transaction.id || index}
                        style={[
                          styles.transactionItem,
                          {borderBottomColor: colors.border},
                          index === walletTransactions.length - 1 && {borderBottomWidth: 0},
                        ]}>
                        <View
                          style={[
                            styles.transactionIconSmall,
                            {
                              backgroundColor: isPositive
                                ? isDark
                                  ? 'rgba(16,185,129,0.16)'
                                  : '#ECFDF5'
                                : isDark
                                ? 'rgba(245,158,11,0.16)'
                                : '#FFF7ED',
                            },
                          ]}>
                          <Icon
                            name={getCreditTransactionIcon(
                              transaction.type,
                              transaction.source,
                              transaction.note,
                            )}
                            size={16}
                            color={
                              isPositive
                                ? isDark
                                  ? '#34D399'
                                  : '#059669'
                                : isDark
                                ? '#FBBF24'
                                : '#D97706'
                            }
                          />
                        </View>

                        <View style={styles.transactionContentSmall}>
                          <Text style={[styles.transactionTitleSmall, {color: colors.heading}]}>
                            {activity.title}
                          </Text>
                          {activity.subtitle && (
                            <Text style={[styles.transactionSubtitleSmall, {color: colors.textSecondary}]}>
                              {activity.subtitle}
                            </Text>
                          )}
                          <Text style={[styles.transactionMetaSmall, {color: colors.textTertiary}]}>
                            {getCreditTransactionSourceLabel(transaction.source)} • {formatCreditDateTime(transaction.createdAt)}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.transactionAmountSmall,
                            {
                              color: isPositive
                                ? isDark
                                  ? '#34D399'
                                  : '#059669'
                                : isDark
                                ? '#FBBF24'
                                : '#D97706',
                            },
                          ]}>
                          {isPositive ? '+' : ''}
                          {formatCredits(transaction.creditChange)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Icon name="wallet" size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyStateText, {color: colors.textSecondary}]}>
                  Chưa có giao dịch nào
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ─── Member Action Sheet ─── */}
      {selectedMember && (
        <ActionSheet
          visible={memberActionVisible}
          onClose={() => setMemberActionVisible(false)}
          title={selectedMember.fullName || selectedMember.username}
          items={getMemberActions(selectedMember)}
          onSelect={handleMemberAction}
        />
      )}

      {/* ─── Invite Dialog ─── */}
      <Dialog
        visible={inviteVisible}
        onClose={() => setInviteVisible(false)}
        title="Mời thành viên">
        <FloatingInput
          label="Email"
          value={inviteEmail}
          onChangeText={setInviteEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <View style={styles.dialogActions}>
          <Button
            title="Cancel"
            variant="outline"
            size="md"
            onPress={() => setInviteVisible(false)}
            fullWidth={false}
            style={{flex: 1}}
          />
          <Button
            title="Invite"
            size="md"
            onPress={handleInvite}
            loading={inviting}
            fullWidth={false}
            style={{flex: 1}}
          />
        </View>
      </Dialog>

      {/* ─── Delete Group Dialog ─── */}
      <Dialog
        visible={deleteDialogVisible}
        onClose={() => setDeleteDialogVisible(false)}
        title="Xóa nhóm">
        <View style={styles.deleteContent}>
          <View
            style={[
              styles.warningIcon,
              {backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2'},
            ]}>
            <Icon name="alert-outline" size={28} color={Colors.error} />
          </View>
          <Text style={[styles.deleteMessage, {color: colors.text}]}> 
            Bạn có chắc muốn xóa "{group?.groupName}" không? Hành động này
            không thể hoàn tác và toàn bộ dữ liệu nhóm sẽ bị mất.
          </Text>
          <FloatingInput
            label="Nhập 'delete group' để xác nhận"
            value={deleteConfirmText}
            onChangeText={setDeleteConfirmText}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.dialogActions}>
          <Button
            title="Hủy"
            variant="outline"
            size="md"
            onPress={() => setDeleteDialogVisible(false)}
            fullWidth={false}
            style={{flex: 1}}
          />
          <Button
            title="Xóa"
            variant="destructive"
            size="md"
            onPress={handleDeleteGroup}
            loading={deleting}
            fullWidth={false}
            style={{flex: 1}}
          />
        </View>
      </Dialog>
    </SafeAreaView>
  );
}

/* ──── Sub-components ──── */
function StatCard({
  icon,
  label,
  value,
  color,
  colors,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
  colors: any;
}) {
  return (
    <View
      style={[
        styles.statCard,
        {backgroundColor: colors.surface, borderColor: colors.border},
      ]}>
      <View style={[styles.statIcon, {backgroundColor: `${color}15`}]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, {color: colors.heading}]}>{value}</Text>
      <Text style={[styles.statLabel, {color: colors.textSecondary}]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {padding: Spacing.sm},
  headerCenter: {flex: 1, marginHorizontal: Spacing.sm},
  headerTitle: {fontSize: 16, fontWeight: '600'},
  headerSub: {fontSize: 12, marginTop: 1},
  inviteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  tabContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  scrollContent: {padding: Spacing.lg, paddingBottom: 40},

  // Dashboard
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    gap: 14,
  },
  infoCardIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCardContent: {flex: 1},
  infoCardTitle: {fontSize: 16, fontWeight: '600'},
  infoCardDesc: {fontSize: 13, marginTop: 2},

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    width: '48%',
    alignItems: 'center',
    paddingVertical: Spacing.base,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 4,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  statValue: {fontSize: 22, fontWeight: '700'},
  statLabel: {fontSize: 11},

  distCard: {
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  distHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  distTitle: {fontSize: 14, fontWeight: '600'},
  progressBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  progressSegment: {},
  distLegend: {gap: Spacing.sm},
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {width: 10, height: 10, borderRadius: 5},
  legendLabel: {flex: 1, fontSize: 13},
  legendCount: {fontSize: 13, fontWeight: '600'},

  // Members
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 8,
    marginBottom: Spacing.md,
  },
  searchInput: {flex: 1, fontSize: 14, paddingVertical: 4},
  filterRow: {marginBottom: Spacing.md},
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
    borderWidth: 1,
  },
  filterChipText: {fontSize: 12, fontWeight: '600'},
  memberCountText: {fontSize: 12, marginBottom: Spacing.md},

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: 12,
  },
  memberInfo: {flex: 1},
  memberNameRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  memberName: {fontSize: 14, fontWeight: '600', flexShrink: 1},
  memberEmail: {fontSize: 12, marginTop: 2},
  memberMeta: {alignItems: 'flex-end', gap: 4},
  uploadBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingInviteCard: {
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  pendingInviteTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  pendingInviteEmpty: {
    fontSize: 12,
  },
  pendingInviteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingInviteEmail: {
    fontSize: 13,
    fontWeight: '500',
  },
  pendingInviteAction: {
    minWidth: 66,
  },

  // Settings
  settingsCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  settingsCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  settingsHeaderLeft: {flexDirection: 'row', alignItems: 'center', gap: 8},
  settingsCardTitle: {fontSize: 15, fontWeight: '600'},
  settingsQuickActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.sm,
  },
  editLink: {fontSize: 14, fontWeight: '600'},

  editForm: {gap: Spacing.md},
  editActions: {flexDirection: 'row', gap: 12, marginTop: Spacing.sm},

  infoDisplay: {gap: Spacing.md},
  infoRow: {gap: 4},
  infoLabel: {fontSize: 12, fontWeight: '500'},
  infoValue: {fontSize: 14},
  emptyHistoryText: {fontSize: 13},
  paymentHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  paymentHistoryTitle: {fontSize: 13, fontWeight: '600'},
  paymentHistoryMeta: {fontSize: 11, marginTop: 2},
  paymentHistoryAmount: {fontSize: 13, fontWeight: '700'},
  paymentHistoryStatus: {fontSize: 11, marginTop: 2},

  dangerCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    padding: Spacing.lg,
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  dangerTitle: {fontSize: 15, fontWeight: '600', color: Colors.error},
  dangerDesc: {fontSize: 13, lineHeight: 18},

  emptySettings: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: 12,
  },
  emptySettingsText: {fontSize: 14, textAlign: 'center'},

  dialogActions: {flexDirection: 'row', gap: 12, marginTop: Spacing.lg},
  deleteContent: {alignItems: 'center', gap: Spacing.md},
  warningIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteMessage: {fontSize: 14, textAlign: 'center', lineHeight: 20},

  // Ranking
  rankingTitle: {fontSize: 16, fontWeight: '600', marginBottom: Spacing.md},
  rankingList: {borderRadius: BorderRadius.lg, borderWidth: 1, overflow: 'hidden'},
  rankingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  rankingPosition: {
    width: 40,
    alignItems: 'center',
  },
  rankingNum: {fontSize: 13, fontWeight: '700'},
  rankingMemberInfo: {flex: 1},
  rankingMemberName: {fontSize: 14, fontWeight: '600'},
  rankingMemberEmail: {fontSize: 12, marginTop: 2},
  rankingScore: {alignItems: 'flex-end'},
  rankingScoreValue: {fontSize: 14, fontWeight: '700'},
  rankingScoreLabel: {fontSize: 11, marginTop: 2},

  // Logs
  logsTitle: {fontSize: 16, fontWeight: '600', marginBottom: Spacing.md},
  logsList: {borderRadius: BorderRadius.lg, borderWidth: 1, overflow: 'hidden'},
  logItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  logIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  logContent: {flex: 1},
  logDescription: {fontSize: 14, fontWeight: '500', lineHeight: 18},
  logTime: {fontSize: 12, marginTop: 4},
  paymentAmount: {fontSize: 14, fontWeight: '600', marginLeft: 12},

  // Wallet tab
  section: {marginBottom: Spacing.lg},
  sectionTitle: {fontSize: 16, fontWeight: '600', marginBottom: Spacing.md},
  creditCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  creditHeaderRow: {flexDirection: 'row', alignItems: 'center'},
  creditIconSmall: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  creditLabelSmall: {fontSize: 12},
  creditAmountSmall: {fontSize: 16, fontWeight: '700', marginTop: 2},
  transactionList: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderBottomWidth: 1,
  },
  transactionIconSmall: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    marginTop: 2,
  },
  transactionContentSmall: {flex: 1},
  transactionTitleSmall: {fontSize: 13, fontWeight: '600', marginBottom: 2},
  transactionSubtitleSmall: {fontSize: 11, marginBottom: 4},
  transactionMetaSmall: {fontSize: 10},
  transactionAmountSmall: {fontSize: 13, fontWeight: '700', textAlign: 'right'},

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: 12,
  },
  emptyStateText: {fontSize: 14, textAlign: 'center'},
});
