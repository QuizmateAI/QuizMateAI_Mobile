import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
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
import api from '../../api/api';

const TABS = [
  {key: 'dashboard', label: 'Dashboard'},
  {key: 'members', label: 'Members'},
  {key: 'settings', label: 'Settings'},
];

const ROLE_FILTER_TABS = [
  {key: 'all', label: 'All'},
  {key: 'LEADER', label: 'Leader'},
  {key: 'CONTRIBUTOR', label: 'Contributor'},
  {key: 'MEMBER', label: 'Member'},
];

export default function GroupManagementScreen({navigation, route}: any) {
  const {groupId, title} = route.params;
  const {isDark, colors} = useTheme();
  const {user} = useAuth();
  const {showToast} = useToast();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [members, setMembers] = useState<any[]>([]);
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Members tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [memberActionVisible, setMemberActionVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Settings tab state
  const [isEditing, setIsEditing] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Invite dialog
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const currentUserId = user?.id;
  const isLeader = members.some(
    m =>
      (m.userId === currentUserId || m.id === currentUserId) &&
      m.role === 'LEADER',
  );

  const fetchData = useCallback(async () => {
    try {
      const memRes = await GroupAPI.getMembers(groupId);
      setMembers(memRes.data || []);
      // Try to get group info if we have an endpoint
      try {
        const grRes = await api.get(`/group/${groupId}`);
        setGroup(grRes.data);
        setEditGroupName(grRes.data?.groupName || title || '');
        setEditDescription(grRes.data?.description || '');
      } catch {
        setGroup({groupName: title, groupId});
        setEditGroupName(title || '');
      }
    } catch {
      // ──── MOCK DATA for UI testing ────
      setGroup({groupId, groupName: title || 'SEP490 Capstone Team', description: 'Capstone project collaboration', topicName: 'Software Engineering'});
      setEditGroupName(title || 'SEP490 Capstone Team');
      setEditDescription('Capstone project collaboration');
      setMembers([
        {userId: 1, id: 1, groupMemberId: 101, fullName: 'Test User', username: 'test', email: 'test@quizmateai.com', role: 'LEADER', canUpload: true},
        {userId: 2, id: 2, groupMemberId: 102, fullName: 'Nguyễn Văn An', username: 'nguyenan', email: 'an@quizmateai.com', role: 'CONTRIBUTOR', canUpload: true},
        {userId: 3, id: 3, groupMemberId: 103, fullName: 'Trần Thị Bình', username: 'tranbinh', email: 'binh@quizmateai.com', role: 'MEMBER', canUpload: false},
        {userId: 4, id: 4, groupMemberId: 104, fullName: 'Lê Hoàng Cường', username: 'lecuong', email: 'cuong@quizmateai.com', role: 'MEMBER', canUpload: true},
        {userId: 5, id: 5, groupMemberId: 105, fullName: 'Phạm Minh Duy', username: 'phamduy', email: 'duy@quizmateai.com', role: 'CONTRIBUTOR', canUpload: false},
      ]);
      // ──── END MOCK ────
    } finally {
      setLoading(false);
    }
  }, [groupId, title, showToast]);

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

  const leaders = members.filter(m => m.role === 'LEADER');
  const contributors = members.filter(m => m.role === 'CONTRIBUTOR');
  const canUploadCount = members.filter(m => m.canUpload).length;

  // ──── Member actions ────
  const getMemberActions = (member: any) => {
    const actions: any[] = [];
    if (!isLeader || member.role === 'LEADER') return actions;
    const isSelf =
      member.userId === currentUserId || member.id === currentUserId;
    if (isSelf) return actions;

    // Toggle upload
    actions.push({
      key: 'toggleUpload',
      label: member.canUpload ? 'Revoke Upload' : 'Grant Upload',
      icon: member.canUpload ? 'upload-off' : 'upload',
    });

    // Role change
    if (member.role === 'MEMBER') {
      actions.push({
        key: 'promote',
        label: 'Promote to Contributor',
        icon: 'shield-account',
      });
    } else if (member.role === 'CONTRIBUTOR') {
      actions.push({
        key: 'demote',
        label: 'Demote to Member',
        icon: 'shield-off-outline',
      });
    }

    // Remove
    actions.push({
      key: 'remove',
      label: 'Remove Member',
      icon: 'account-remove',
      destructive: true,
    });

    return actions;
  };

  const handleMemberAction = async (key: string) => {
    if (!selectedMember) return;
    const memberId = selectedMember.groupMemberId || selectedMember.id;
    setActionLoading(true);

    try {
      switch (key) {
        case 'toggleUpload':
          if (selectedMember.canUpload) {
            await GroupAPI.revokeUpload(groupId, memberId);
            showToast('Upload revoked', 'success');
          } else {
            await GroupAPI.grantUpload(groupId, memberId);
            showToast('Upload granted', 'success');
          }
          break;
        case 'promote':
          await GroupAPI.updateRole(groupId, memberId, 'CONTRIBUTOR');
          showToast('Member promoted!', 'success');
          break;
        case 'demote':
          await GroupAPI.updateRole(groupId, memberId, 'MEMBER');
          showToast('Member demoted', 'success');
          break;
        case 'remove':
          Alert.alert(
            'Remove Member',
            `Remove ${selectedMember.fullName || selectedMember.username}?`,
            [
              {text: 'Cancel', style: 'cancel'},
              {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await GroupAPI.removeMember(groupId, memberId);
                    showToast('Member removed', 'success');
                    fetchData();
                  } catch {
                    showToast('Failed to remove member', 'error');
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
      showToast('Action failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // ──── Invite ────
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await GroupAPI.sendInvitation(groupId, {email: inviteEmail});
      showToast('Invitation sent!', 'success');
      setInviteVisible(false);
      setInviteEmail('');
    } catch {
      showToast('Failed to send invitation', 'error');
    } finally {
      setInviting(false);
    }
  };

  // ──── Settings: Save ────
  const handleSaveGroup = async () => {
    if (!editGroupName.trim()) {
      showToast('Group name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/group/${groupId}`, {
        groupName: editGroupName.trim(),
        description: editDescription.trim(),
      });
      showToast('Group updated!', 'success');
      setIsEditing(false);
      fetchData();
    } catch {
      showToast('Failed to update group', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ──── Settings: Delete ────
  const handleDeleteGroup = async () => {
    setDeleting(true);
    try {
      await api.delete(`/group/${groupId}`);
      showToast('Group deleted', 'success');
      navigation.popToTop();
    } catch {
      showToast('Failed to delete group', 'error');
    } finally {
      setDeleting(false);
      setDeleteDialogVisible(false);
    }
  };

  // ──── Role badge ────
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'LEADER':
        return {variant: 'warning' as const, icon: 'crown', label: 'Leader'};
      case 'CONTRIBUTOR':
        return {variant: 'info' as const, icon: 'shield-account', label: 'Contributor'};
      default:
        return {variant: 'default' as const, icon: 'account', label: 'Member'};
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
            {group?.groupName || title}
          </Text>
          <Text style={[styles.headerSub, {color: colors.textSecondary}]}>
            Group Management
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
                  {group?.description || 'No description'}
                </Text>
              </View>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <StatCard
                icon="account-multiple"
                label="Members"
                value={members.length}
                color="#2563EB"
                colors={colors}
                isDark={isDark}
              />
              <StatCard
                icon="shield-account"
                label="Contributors"
                value={contributors.length}
                color="#7C3AED"
                colors={colors}
                isDark={isDark}
              />
              <StatCard
                icon="upload"
                label="Can Upload"
                value={canUploadCount}
                color="#059669"
                colors={colors}
                isDark={isDark}
              />
              <StatCard
                icon="crown"
                label="Leaders"
                value={leaders.length}
                color="#F59E0B"
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
                  Role Distribution
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
                    label: 'Leader',
                    count: leaders.length,
                    color: '#F59E0B',
                  },
                  {
                    label: 'Contributor',
                    count: contributors.length,
                    color: '#7C3AED',
                  },
                  {
                    label: 'Member',
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
                placeholder="Search members..."
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
              Showing {filteredMembers.length} of {members.length} members
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
          </View>
        )}

        {/* ───────── SETTINGS ───────── */}
        {activeTab === 'settings' && (
          <View>
            {isLeader ? (
              <>
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
                        Group Info
                      </Text>
                    </View>
                    {!isEditing && (
                      <TouchableOpacity onPress={() => setIsEditing(true)}>
                        <Text style={[styles.editLink, {color: Colors.primary}]}>
                          Edit
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
                          Name
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
                          Description
                        </Text>
                        <Text
                          style={[styles.infoValue, {color: colors.heading}]}>
                          {group?.description || 'No description'}
                        </Text>
                      </View>
                      {group?.topicName && (
                        <View style={styles.infoRow}>
                          <Text
                            style={[
                              styles.infoLabel,
                              {color: colors.textSecondary},
                            ]}>
                            Topic
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
                    <Text style={styles.dangerTitle}>Danger Zone</Text>
                  </View>
                  <Text
                    style={[
                      styles.dangerDesc,
                      {color: colors.textSecondary},
                    ]}>
                    Deleting a group is permanent. All data will be lost.
                  </Text>
                  <Button
                    title="Delete Group"
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
                  Only group leaders can manage settings
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
        title="Invite Member">
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
        title="Delete Group">
        <View style={styles.deleteContent}>
          <View
            style={[
              styles.warningIcon,
              {backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2'},
            ]}>
            <Icon name="alert-outline" size={28} color={Colors.error} />
          </View>
          <Text style={[styles.deleteMessage, {color: colors.text}]}>
            Are you sure you want to delete "{group?.groupName}"? This
            action cannot be undone and all group data will be lost.
          </Text>
        </View>
        <View style={styles.dialogActions}>
          <Button
            title="Cancel"
            variant="outline"
            size="md"
            onPress={() => setDeleteDialogVisible(false)}
            fullWidth={false}
            style={{flex: 1}}
          />
          <Button
            title="Delete"
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
  isDark,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
  colors: any;
  isDark: boolean;
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
  editLink: {fontSize: 14, fontWeight: '600'},

  editForm: {gap: Spacing.md},
  editActions: {flexDirection: 'row', gap: 12, marginTop: Spacing.sm},

  infoDisplay: {gap: Spacing.md},
  infoRow: {gap: 4},
  infoLabel: {fontSize: 12, fontWeight: '500'},
  infoValue: {fontSize: 14},

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
});
