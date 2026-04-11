import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import Avatar from '../../components/ui/Avatar';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import GroupCard from '../../components/features/GroupCard';
import UserProfileMenu from '../../components/features/UserProfileMenu';
import Dialog from '../../components/ui/Dialog';
import FloatingInput from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import GroupAPI from '../../api/GroupAPI';
import AppLogo from '../../components/AppLogo';

export default function GroupListScreen({navigation}: any) {
  const {isDark, colors, toggleTheme} = useTheme();
  const {user} = useAuth();
  const {showToast} = useToast();
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await GroupAPI.getJoined();
      setGroups(res.data || []);
    } catch {
      setGroups([]);
      showToast('Không thể tải danh sách nhóm', 'error');
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

  const handleCreate = async () => {
    if (!newName.trim()) {return;}
    setCreating(true);
    try {
      await GroupAPI.create({name: newName});
      showToast('Nhóm đã được tạo!', 'success');
      setCreateDialogVisible(false);
      setNewName('');
      fetchData();
    } catch {
      showToast('Không thể tạo nhóm', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleProfileNavigate = (screen: string) => {
    navigation.navigate('Profile', {screen});
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.background}]}
      edges={['top']}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? Colors.dark.surface + 'E6' : '#FFFFFFE6',
            borderBottomColor: colors.border,
          },
        ]}>
        <View style={styles.headerLeft}>
          <AppLogo size={40} />
          <Text style={[styles.headerTitle, {color: colors.heading}]}>
            Nhóm
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

      {/* List */}
      <FlatList
        data={groups}
        keyExtractor={item => String(item.id || item.groupId)}
        renderItem={({item}) => (
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
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="account-group" size={56} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, {color: colors.textSecondary}]}>
              Chưa có nhóm nào
            </Text>
            <Text style={[styles.emptySubtitle, {color: colors.textTertiary}]}>
              Nhấn nút + để tạo nhóm mới
            </Text>
          </View>
        }
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

      {/* Create Dialog */}
      <Dialog
        visible={createDialogVisible}
        onClose={() => setCreateDialogVisible(false)}
        title="Tạo nhóm mới">
        <FloatingInput
          label="Tên nhóm"
          value={newName}
          onChangeText={setNewName}
        />
        <View style={styles.dialogActions}>
          <Button
            title="Huỷ"
            variant="outline"
            size="md"
            onPress={() => setCreateDialogVisible(false)}
            fullWidth={false}
            style={{flex: 1}}
          />
          <Button
            title="Tạo"
            size="md"
            onPress={handleCreate}
            loading={creating}
            fullWidth={false}
            style={{flex: 1}}
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
  container: {flex: 1},
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
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: Spacing.lg,
  },
});
