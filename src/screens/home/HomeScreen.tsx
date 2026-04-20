import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Colors } from '../../theme/colors';
import { BorderRadius, Spacing } from '../../theme/spacing';
import Avatar from '../../components/ui/Avatar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import WorkspaceCard from '../../components/features/WorkspaceCard';
import UserProfileMenu from '../../components/features/UserProfileMenu';
import Dialog from '../../components/ui/Dialog';
import ActionSheet from '../../components/ui/ActionSheet';
import FloatingInput from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import WorkspaceAPI from '../../api/WorkspaceAPI';
import AppLogo from '../../components/AppLogo';

const PAGE_SIZE = 10;

const isIndividualWorkspace = (workspace: any) => {
  const kind = String(workspace?.workspaceKind || workspace?.type || '').toUpperCase();
  if (!kind) {
    return workspace?.isGroupWorkspace !== true;
  }
  return kind === 'INDIVIDUAL';
};

const sortWorkspacesByNewest = (items: any[]) =>
  [...items].sort((left, right) => {
    const leftCreatedAt = new Date(left?.createdAt || 0).getTime();
    const rightCreatedAt = new Date(right?.createdAt || 0).getTime();

    if (rightCreatedAt !== leftCreatedAt) {
      return rightCreatedAt - leftCreatedAt;
    }

    return Number(right?.id || right?.workspaceId || 0) -
      Number(left?.id || left?.workspaceId || 0);
  });

const mergeWorkspacePages = (currentItems: any[], incomingItems: any[], replace = false) => {
  const mergedMap = new Map<string, any>();
  const baseItems = replace ? [] : currentItems;

  [...baseItems, ...incomingItems].forEach(item => {
    mergedMap.set(String(item?.id || item?.workspaceId), item);
  });

  return sortWorkspacesByNewest(Array.from(mergedMap.values()));
};

const getApiErrorMessage = (error: any, fallback: string) =>
  error?.response?.data?.message ||
  error?.response?.data?.data?.message ||
  error?.message ||
  fallback;

const WORKSPACE_ACTIONS = [
  { key: 'edit', label: 'Sửa workspace', icon: 'pencil-outline' },
  {
    key: 'delete',
    label: 'Xóa workspace',
    icon: 'delete-outline',
    destructive: true,
  },
];

export default function HomeScreen({ navigation }: any) {
  const { isDark, colors, toggleTheme } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
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

  const fetchData = useCallback(async (page = 0, replace = false) => {
    if (page === 0) {
      if (replace) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
    } else {
      setLoadingMore(true);
    }

    try {
      const wsRes = await WorkspaceAPI.getByUser(page, PAGE_SIZE);
      const nextItems = (wsRes.data || []).filter(isIndividualWorkspace);
      const nextPagination = wsRes.pagination;

      setWorkspaces(currentItems =>
        mergeWorkspacePages(currentItems, nextItems, replace || page === 0),
      );
      setCurrentPage(nextPagination?.page ?? page);
      setHasMore(!(nextPagination?.last ?? nextItems.length < PAGE_SIZE));
    } catch (error: any) {
      if (page === 0) {
        setWorkspaces([]);
        setHasMore(false);
        setCurrentPage(0);
      }
      showToast(
        getApiErrorMessage(error, 'Không thể tải danh sách workspace'),
        'error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData(0, false);
  }, [fetchData]);

  const onRefresh = () => {
    fetchData(0, true);
  };

  const handleLoadMore = () => {
    if (loading || refreshing || loadingMore || !hasMore) {
      return;
    }

    fetchData(currentPage + 1, false);
  };

  // ---------- Create ----------
  const handleCreate = async () => {
    if (!newName.trim()) {return;}
    setCreating(true);
    try {
      await WorkspaceAPI.create({ name: newName });
      showToast('Workspace đã được tạo!', 'success');
      setCreateDialogVisible(false);
      setNewName('');
      fetchData(0, true);
    } catch (error: any) {
      showToast(getApiErrorMessage(error, 'Không thể tạo mới'), 'error');
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
    if (!selectedWorkspace) {return;}
    if (key === 'edit') {
      // Pre-fill dialog with workspace data
      setEditTitle(
        selectedWorkspace.rawTitle ||
          selectedWorkspace.rawName ||
          selectedWorkspace.title ||
          selectedWorkspace.name ||
          '',
      );
      setEditDescription(selectedWorkspace.description || '');
      setEditDialogVisible(true);
    } else if (key === 'delete') {
      setDeleteDialogVisible(true);
    }
  };

  // ---------- Edit Workspace ----------
  const handleEditWorkspace = async () => {
    if (!selectedWorkspace) {return;}
    setSaving(true);
    try {
      const workspaceId =
        selectedWorkspace.workspaceId || selectedWorkspace.id;
      await WorkspaceAPI.update(workspaceId, {
        name: editTitle.trim() || undefined,
        description: editDescription.trim() || undefined,
      });
      showToast('Đã cập nhật workspace!', 'success');
      setEditDialogVisible(false);
      fetchData(0, true);
    } catch (error: any) {
      showToast(
        getApiErrorMessage(error, 'Không thể cập nhật workspace'),
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  // ---------- Delete Workspace ----------
  const handleDeleteWorkspace = async () => {
    if (!selectedWorkspace) {return;}
    setDeleting(true);
    try {
      const workspaceId =
        selectedWorkspace.workspaceId || selectedWorkspace.id;
      await WorkspaceAPI.delete(workspaceId);
      showToast('Đã xóa workspace!', 'success');
      setDeleteDialogVisible(false);
      setSelectedWorkspace(null);
      fetchData(0, true);
    } catch (error: any) {
      showToast(getApiErrorMessage(error, 'Không thể xóa workspace'), 'error');
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
        name="book-open-variant"
        size={56}
        color={colors.textTertiary}
      />
      <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
        Chưa có workspace nào
      </Text>
      <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
        Nhấn nút + để tạo mới
      </Text>
    </View>
  );

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoading}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      );
    }

    if (workspaces.length > 0 && !hasMore) {
      return (
        <View style={styles.footerSummary}>
          <Text style={[styles.footerSummaryText, { color: colors.textTertiary }]}>
            Đã hiển thị {workspaces.length} workspace
          </Text>
        </View>
      );
    }

    return null;
  };

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
          <AppLogo size={40} />
          <Text style={[styles.headerTitle, { color: colors.heading }]}>
            Cá nhân
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

      {/* Content */}
      <FlatList
        data={workspaces}
        keyExtractor={item => String(item.id || item.workspaceId)}
        renderItem={({ item, index }) => (
          <WorkspaceCard
            id={item.id || item.workspaceId}
            name={item.displayName || item.name || item.title}
            description={item.description}
            topicName={item.topicName}
            createdAt={item.createdAt}
            colorIndex={index}
            onPress={() =>
              navigation.navigate('Workspace', {
                workspaceId: item.id || item.workspaceId,
                title: item.displayName || item.name || item.title,
              })
            }
            onLongPress={() => handleOpenActionSheet(item)}
            onDotsPress={() => handleOpenActionSheet(item)}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.35}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      />

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
        title={
          selectedWorkspace?.displayName ||
          selectedWorkspace?.name ||
          selectedWorkspace?.title ||
          'Không gian học tập chưa có tiêu đề'
        }
        items={WORKSPACE_ACTIONS}
        onSelect={handleActionSelect}
      />

      {/* ─── Create Dialog ─── */}
      <Dialog
        visible={createDialogVisible}
        onClose={() => setCreateDialogVisible(false)}
        title="Tạo workspace mới">
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
        title="Sửa workspace">
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
        title="Xóa workspace">
        <View style={styles.deleteContent}>
          <View
            style={[
              styles.warningIcon,
              { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2' },
            ]}>
            <Icon name="alert-outline" size={28} color={Colors.error} />
          </View>
          <Text style={[styles.deleteMessage, { color: colors.text }]}>
            Bạn có chắc muốn xóa workspace này không? Hành động này không thể
            hoàn tác.
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
                {selectedWorkspace.displayName ||
                  selectedWorkspace.name ||
                  selectedWorkspace.title ||
                  'Không gian học tập chưa có tiêu đề'}
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
  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
    flexGrow: 1,
  },
  footerLoading: {
    paddingVertical: Spacing.base,
    alignItems: 'center',
  },
  footerSummary: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
    alignItems: 'center',
  },
  footerSummaryText: {
    fontSize: 12,
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
