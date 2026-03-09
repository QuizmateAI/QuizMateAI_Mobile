import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Colors } from '../../theme/colors';
import { BorderRadius, Spacing } from '../../theme/spacing';
import TabBar from '../../components/ui/TabBar';
import Avatar from '../../components/ui/Avatar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import WorkspaceCard from '../../components/features/WorkspaceCard';
import GroupCard from '../../components/features/GroupCard';
import UserProfileMenu from '../../components/features/UserProfileMenu';
import Dialog from '../../components/ui/Dialog';
import ActionSheet from '../../components/ui/ActionSheet';
import FloatingInput from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import WorkspaceAPI from '../../api/WorkspaceAPI';
import GroupAPI from '../../api/GroupAPI';

const TABS = [
  { key: 'workspace', label: 'Workspace' },
  { key: 'group', label: 'Group' },
];

const WORKSPACE_ACTIONS = [
  { key: 'edit', label: 'Edit Workspace', icon: 'pencil-outline' },
  {
    key: 'delete',
    label: 'Delete Workspace',
    icon: 'delete-outline',
    destructive: true,
  },
];

export default function HomeScreen({ navigation }: any) {
  const { isDark, colors, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('workspace');
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  // Create workspace/group dialog
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // Action sheet for workspace contextual menu
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any>(null);

  // Edit workspace dialog
  const [editDialogVisible, setEditDialogVisible] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete workspace dialog
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [wsRes, grRes] = await Promise.all([
        WorkspaceAPI.getByUser(),
        GroupAPI.getJoined(),
      ]);
      setWorkspaces(wsRes.data || []);
      setGroups(grRes.data || []);
    } catch {
      // ──── MOCK DATA for UI testing when backend is unavailable ────
      setWorkspaces([
        { id: 1, name: 'Machine Learning Basics', description: 'An introduction to ML concepts, algorithms, and applications', topicName: 'AI & ML', createdAt: '2026-03-01T10:00:00Z' },
        { id: 2, name: 'React Native Development', description: 'Mobile app development with React Native', topicName: 'Programming', createdAt: '2026-03-05T14:30:00Z' },
        { id: 3, name: 'Data Structures & Algorithms', description: 'Core CS concepts for coding interviews', topicName: 'Computer Science', createdAt: '2026-02-28T09:00:00Z' },
        { id: 4, name: 'Japanese N3 Grammar', description: 'JLPT N3 grammar patterns and practice', topicName: 'Language', createdAt: '2026-03-08T16:00:00Z' },
      ]);
      setGroups([
        { id: 1, name: 'SEP490 Capstone Team', description: 'Capstone project collaboration', memberCount: 6, role: 'LEADER' },
        { id: 2, name: 'Study Group - AI', description: 'AI study group for final exam prep', memberCount: 12, role: 'MEMBER' },
      ]);
      // ──── END MOCK ────
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // ---------- Create ----------
  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      if (activeTab === 'workspace') {
        await WorkspaceAPI.create({ name: newName });
      } else {
        await GroupAPI.create({ name: newName });
      }
      showToast(
        `${activeTab === 'workspace' ? 'Workspace' : 'Group'} created!`,
        'success',
      );
      setCreateDialogVisible(false);
      setNewName('');
      fetchData();
    } catch {
      showToast('Failed to create', 'error');
    } finally {
      setCreating(false);
    }
  };

  // ---------- Workspace Actions ----------
  const handleOpenActionSheet = (workspace: any) => {
    setSelectedWorkspace(workspace);
    setActionSheetVisible(true);
  };

  const handleActionSelect = (key: string) => {
    if (!selectedWorkspace) return;
    if (key === 'edit') {
      // Pre-fill dialog with workspace data
      setEditTitle(selectedWorkspace.title || selectedWorkspace.name || '');
      setEditDescription(selectedWorkspace.description || '');
      setEditDialogVisible(true);
    } else if (key === 'delete') {
      setDeleteDialogVisible(true);
    }
  };

  // ---------- Edit Workspace ----------
  const handleEditWorkspace = async () => {
    if (!selectedWorkspace) return;
    setSaving(true);
    try {
      const workspaceId =
        selectedWorkspace.workspaceId || selectedWorkspace.id;
      await WorkspaceAPI.update(workspaceId, {
        name: editTitle.trim() || undefined,
        description: editDescription.trim() || undefined,
      });
      showToast('Workspace updated!', 'success');
      setEditDialogVisible(false);
      fetchData();
    } catch {
      showToast('Failed to update workspace', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Delete Workspace ----------
  const handleDeleteWorkspace = async () => {
    if (!selectedWorkspace) return;
    setDeleting(true);
    try {
      const workspaceId =
        selectedWorkspace.workspaceId || selectedWorkspace.id;
      await WorkspaceAPI.delete(workspaceId);
      showToast('Workspace deleted!', 'success');
      setDeleteDialogVisible(false);
      setSelectedWorkspace(null);
      fetchData();
    } catch {
      showToast('Failed to delete workspace', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ---------- Navigation ----------
  const handleProfileNavigate = (screen: string) => {
    navigation.navigate('Profile', { screen });
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon
        name={
          activeTab === 'workspace' ? 'book-open-variant' : 'account-group'
        }
        size={56}
        color={colors.textTertiary}
      />
      <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
        No {activeTab === 'workspace' ? 'workspaces' : 'groups'} yet
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
        Tap the + button to create one
      </Text>
    </View>
  );

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark
              ? Colors.dark.surface + 'E6'
              : '#FFFFFFE6',
            borderBottomColor: colors.border,
          },
        ]}>
        <View style={styles.headerLeft}>
          <View style={[styles.logo, { backgroundColor: Colors.primary }]}>
            <Text style={styles.logoText}>Q</Text>
          </View>
          <Text style={[styles.headerTitle, { color: colors.heading }]}>
            QuizMate
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={toggleTheme}
            style={[
              styles.iconBtn,
              {
                backgroundColor: isDark
                  ? Colors.dark.surfaceVariant
                  : '#F1F5F9',
              },
            ]}>
            <Icon
              name={isDark ? 'white-balance-sunny' : 'moon-waning-crescent'}
              size={18}
              color={colors.icon}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setProfileMenuVisible(true)}>
            <Avatar uri={user?.avatarUrl} name={user?.fullName} size={36} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabContainer}>
        <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      </View>

      {/* Content */}
      {activeTab === 'workspace' ? (
        <FlatList
          data={workspaces}
          keyExtractor={item => String(item.id || item.workspaceId)}
          renderItem={({ item, index }) => (
            <WorkspaceCard
              id={item.id || item.workspaceId}
              name={item.name || item.title}
              description={item.description}
              topicName={item.topicName}
              createdAt={item.createdAt}
              colorIndex={index}
              onPress={() =>
                navigation.navigate('Workspace', {
                  workspaceId: item.id || item.workspaceId,
                  title: item.name || item.title,
                })
              }
              onLongPress={() => handleOpenActionSheet(item)}
              onDotsPress={() => handleOpenActionSheet(item)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={item => String(item.id || item.groupId)}
          renderItem={({ item }) => (
            <GroupCard
              id={item.id || item.groupId}
              name={item.name || item.groupName}
              description={item.description}
              memberCount={item.memberCount}
              role={item.role || item.memberRole}
              onPress={() =>
                navigation.navigate('GroupWorkspace', {
                  groupId: item.id || item.groupId,
                  title: item.name || item.groupName,
                })
              }
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setCreateDialogVisible(true)}
        activeOpacity={0.8}
        style={styles.fab}>
        <Icon name="plus" size={26} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ─── Action Sheet for Workspace ─── */}
      <ActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        title={selectedWorkspace?.name || selectedWorkspace?.title || 'Actions'}
        items={WORKSPACE_ACTIONS}
        onSelect={handleActionSelect}
      />

      {/* ─── Create Dialog ─── */}
      <Dialog
        visible={createDialogVisible}
        onClose={() => setCreateDialogVisible(false)}
        title={`New ${activeTab === 'workspace' ? 'Workspace' : 'Group'}`}>
        <FloatingInput
          label="Name"
          value={newName}
          onChangeText={setNewName}
        />
        <View style={styles.dialogActions}>
          <Button
            title="Cancel"
            variant="outline"
            size="md"
            onPress={() => setCreateDialogVisible(false)}
            fullWidth={false}
            style={{ flex: 1 }}
          />
          <Button
            title="Create"
            size="md"
            onPress={handleCreate}
            loading={creating}
            fullWidth={false}
            style={{ flex: 1 }}
          />
        </View>
      </Dialog>

      {/* ─── Edit Workspace Dialog ─── */}
      <Dialog
        visible={editDialogVisible}
        onClose={() => setEditDialogVisible(false)}
        title="Edit Workspace">
        <View style={styles.editForm}>
          <FloatingInput
            label="Title"
            value={editTitle}
            onChangeText={setEditTitle}
          />
          <FloatingInput
            label="Description"
            value={editDescription}
            onChangeText={setEditDescription}
            multiline
          />
        </View>
        <View style={styles.dialogActions}>
          <Button
            title="Cancel"
            variant="outline"
            size="md"
            onPress={() => setEditDialogVisible(false)}
            fullWidth={false}
            style={{ flex: 1 }}
          />
          <Button
            title="Save"
            size="md"
            onPress={handleEditWorkspace}
            loading={saving}
            fullWidth={false}
            style={{ flex: 1 }}
          />
        </View>
      </Dialog>

      {/* ─── Delete Workspace Dialog ─── */}
      <Dialog
        visible={deleteDialogVisible}
        onClose={() => setDeleteDialogVisible(false)}
        title="Delete Workspace">
        <View style={styles.deleteContent}>
          <View
            style={[
              styles.warningIcon,
              { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2' },
            ]}>
            <Icon name="alert-outline" size={28} color={Colors.error} />
          </View>
          <Text style={[styles.deleteMessage, { color: colors.text }]}>
            Are you sure you want to delete this workspace? This action cannot
            be undone.
          </Text>

          {selectedWorkspace && (
            <View
              style={[
                styles.deleteWorkspaceInfo,
                {
                  backgroundColor: isDark
                    ? Colors.dark.surfaceVariant
                    : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}>
              <Icon
                name="book-open-variant"
                size={18}
                color={Colors.error}
              />
              <Text
                style={[styles.deleteWorkspaceName, { color: colors.heading }]}
                numberOfLines={1}>
                {selectedWorkspace.name ||
                  selectedWorkspace.title ||
                  'Workspace'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.dialogActions}>
          <Button
            title="Cancel"
            variant="outline"
            size="md"
            onPress={() => setDeleteDialogVisible(false)}
            fullWidth={false}
            style={{ flex: 1 }}
          />
          <Button
            title="Delete"
            variant="destructive"
            size="md"
            onPress={handleDeleteWorkspace}
            loading={deleting}
            fullWidth={false}
            style={{ flex: 1 }}
          />
        </View>
      </Dialog>

      {/* Profile Menu */}
      <UserProfileMenu
        visible={profileMenuVisible}
        onClose={() => setProfileMenuVisible(false)}
        onNavigate={handleProfileNavigate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: Spacing.lg,
  },
  editForm: {
    gap: Spacing.md,
  },
  deleteContent: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  warningIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  deleteWorkspaceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 10,
    alignSelf: 'stretch',
  },
  deleteWorkspaceName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
});
