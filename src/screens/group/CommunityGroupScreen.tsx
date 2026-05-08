import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import AppLogo from '../../components/AppLogo';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import FloatingInput from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import UserProfileMenu from '../../components/features/UserProfileMenu';
import GroupAPI from '../../api/GroupAPI';

const truncateText = (value: any, maxLength = 120) => {
  const normalized = String(value || '').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(maxLength - 1, 0)).trim()}...`;
};

const getGroupId = (group: any) =>
  Number(group?.workspaceId || group?.groupId || group?.id || 0);

const getGroupName = (group: any) =>
  String(group?.groupName || group?.name || group?.displayTitle || 'Nhóm cộng đồng');

const getDescription = (group: any) =>
  group?.description ||
  group?.groupLearningGoal ||
  group?.knowledge ||
  'Nhóm công khai trong cộng đồng QuizMateAI.';

const formatLearningMode = (value: any) => {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'STUDY_NEW') {
    return 'Học kiến thức mới';
  }
  if (normalized === 'REVIEW') {
    return 'Ôn tập';
  }
  if (normalized === 'EXAM_PREP') {
    return 'Luyện thi';
  }
  return value ? String(value) : '';
};

const buildCapacitySummary = (group: any) => {
  const limit = Number(group?.memberSeatLimit);
  if (!Number.isFinite(limit) || limit <= 0) {
    return '';
  }
  const active = Number(group?.activeMemberCount ?? group?.memberCount ?? 0);
  const pending = Number(group?.pendingInvitationCount ?? 0);
  const remaining = Number(group?.remainingSeatCount ?? 0);
  return `${active} thành viên, ${pending} lời mời chờ, còn ${remaining}/${limit} chỗ`;
};

export default function CommunityGroupScreen({navigation}: any) {
  const {isDark, colors, toggleTheme} = useTheme();
  const {user} = useAuth();
  const {showToast} = useToast();
  const [groups, setGroups] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningGroupId, setJoiningGroupId] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  const loadGroups = useCallback(async (nextSearch = '', showSpinner = true) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const res = await GroupAPI.getPublicGroups(nextSearch);
      setGroups(Array.isArray(res.data) ? res.data : []);
    } catch (error: any) {
      setGroups([]);
      showToast(
        error?.response?.data?.message ||
          error?.message ||
          'Không thể tải cộng đồng nhóm',
        'error',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadGroups('', true);
  }, [loadGroups]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return groups;
    }
    return groups.filter(group =>
      [
        group?.groupName,
        group?.name,
        group?.description,
        group?.domain,
        group?.knowledge,
        group?.examName,
        group?.groupLearningGoal,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [groups, search]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadGroups(search, false);
  };

  const handleSearchSubmit = () => {
    loadGroups(search, true);
  };

  const openGroup = (group: any) => {
    const groupId = getGroupId(group);
    if (!groupId) {
      showToast('Group ID không hợp lệ', 'error');
      return;
    }
    setSelectedGroup(null);
    navigation.navigate('GroupWorkspace', {
      groupId,
      title: getGroupName(group),
    });
  };

  const joinGroup = async (group: any) => {
    const groupId = getGroupId(group);
    if (!groupId || joiningGroupId) {
      return;
    }
    try {
      setJoiningGroupId(groupId);
      await GroupAPI.joinPublicGroup(groupId);
      showToast('Tham gia nhóm thành công', 'success');
      setGroups(current =>
        current.map(item =>
          getGroupId(item) === groupId ? {...item, joined: true, joinable: true} : item,
        ),
      );
      setSelectedGroup((current: any) =>
        current && getGroupId(current) === groupId
          ? {...current, joined: true, joinable: true}
          : current,
      );
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ||
          error?.message ||
          'Không thể tham gia nhóm này',
        'error',
      );
      loadGroups(search, false);
    } finally {
      setJoiningGroupId(null);
    }
  };

  const handlePrimaryAction = (group: any) => {
    if (group?.joined) {
      openGroup(group);
      return;
    }
    if (group?.joinable === false) {
      return;
    }
    joinGroup(group);
  };

  const handleProfileNavigate = (screen: string) => {
    navigation.navigate('Profile', {screen});
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  const selectedCapacity = buildCapacitySummary(selectedGroup);
  const selectedLearningMode = formatLearningMode(selectedGroup?.learningMode);
  const selectedGroupId = selectedGroup ? getGroupId(selectedGroup) : 0;

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.background}]}
      edges={['top']}>
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
            Cộng đồng
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={toggleTheme}
            style={[
              styles.iconBtn,
              {
                backgroundColor: isDark ? colors.surfaceVariant : colors.surface,
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
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

      <FlatList
        data={filteredGroups}
        keyExtractor={item => String(getGroupId(item))}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.searchWrap}>
            <FloatingInput
              label="Tìm nhóm cộng đồng"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={handleSearchSubmit}
            />
            <Button
              title="Tìm kiếm"
              size="md"
              onPress={handleSearchSubmit}
              style={styles.searchButton}
            />
          </View>
        }
        renderItem={({item}) => {
          const groupId = getGroupId(item);
          const joining = joiningGroupId === groupId;
          const disabled = !item?.joined && item?.joinable === false;
          const learningMode = formatLearningMode(item?.learningMode);
          const capacity = buildCapacitySummary(item);

          return (
            <TouchableOpacity
              activeOpacity={0.78}
              onPress={() => setSelectedGroup(item)}
              style={[
                styles.groupCard,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <View style={styles.cardTop}>
                <View style={[styles.groupIcon, {backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : '#EFF6FF'}]}>
                  <Icon name="account-group-outline" size={22} color={Colors.primary} />
                </View>
                <View style={styles.cardTitleWrap}>
                  <Text style={[styles.groupTitle, {color: colors.heading}]} numberOfLines={1}>
                    {getGroupName(item)}
                  </Text>
                  <Text style={[styles.groupOwner, {color: colors.textSecondary}]} numberOfLines={1}>
                    {item?.createdByFullName || item?.createdByUsername || 'Nhóm công khai'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: item?.joined
                        ? isDark ? 'rgba(100,116,139,0.22)' : '#F1F5F9'
                        : disabled
                        ? isDark ? 'rgba(245,158,11,0.14)' : '#FEF3C7'
                        : isDark ? 'rgba(16,185,129,0.14)' : '#D1FAE5',
                    },
                  ]}>
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color: item?.joined
                          ? colors.textSecondary
                          : disabled
                          ? '#D97706'
                          : '#059669',
                      },
                    ]}>
                    {item?.joined ? 'Đã tham gia' : disabled ? 'Đã đầy' : 'Công khai'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.groupDescription, {color: colors.text}]} numberOfLines={2}>
                {truncateText(getDescription(item), 110)}
              </Text>

              <View style={styles.metaRow}>
                <MetaPill icon="account-multiple-outline" label={`${item?.memberCount ?? 0} thành viên`} />
                {item?.domain ? <MetaPill icon="compass-outline" label={String(item.domain)} /> : null}
                {learningMode ? <MetaPill icon="layers-outline" label={learningMode} /> : null}
              </View>

              {capacity ? (
                <Text style={[styles.capacityText, {color: colors.textTertiary}]}>
                  {capacity}
                </Text>
              ) : null}

              <View style={[styles.cardFooter, {borderTopColor: colors.border}]}>
                <Text style={[styles.detailsHint, {color: colors.textTertiary}]}>
                  Xem chi tiết
                </Text>
                <Button
                  title={item?.joined ? 'Mở nhóm' : disabled ? 'Đã đầy' : 'Tham gia'}
                  size="sm"
                  loading={joining}
                  disabled={disabled || joining}
                  onPress={() => handlePrimaryAction(item)}
                  fullWidth={false}
                  style={styles.joinButton}
                />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="earth" size={56} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, {color: colors.textSecondary}]}>
              Chưa có nhóm cộng đồng
            </Text>
            <Text style={[styles.emptySubtitle, {color: colors.textTertiary}]}>
              Khi nhóm được bật công khai, danh sách sẽ xuất hiện tại đây.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      />

      <Dialog
        visible={Boolean(selectedGroup)}
        onClose={() => setSelectedGroup(null)}
        title={selectedGroup ? getGroupName(selectedGroup) : 'Nhóm cộng đồng'}>
        {selectedGroup ? (
          <View style={styles.detailContent}>
            <Text style={[styles.detailDescription, {color: colors.textSecondary}]}>
              {getDescription(selectedGroup)}
            </Text>
            <View style={styles.metaRow}>
              <MetaPill icon="account-multiple-outline" label={`${selectedGroup?.memberCount ?? 0} thành viên`} />
              {selectedGroup?.domain ? <MetaPill icon="compass-outline" label={String(selectedGroup.domain)} /> : null}
              {selectedLearningMode ? <MetaPill icon="layers-outline" label={selectedLearningMode} /> : null}
              {selectedGroup?.examName ? <MetaPill icon="target" label={String(selectedGroup.examName)} /> : null}
            </View>
            <DetailRow label="Mục tiêu" value={selectedGroup?.groupLearningGoal} />
            <DetailRow label="Trọng tâm" value={selectedGroup?.knowledge} />
            <DetailRow label="Quy tắc" value={selectedGroup?.rules} />
            <DetailRow label="Sức chứa" value={selectedCapacity} />
            <View style={styles.dialogActions}>
              <Button
                title="Đóng"
                variant="outline"
                size="md"
                onPress={() => setSelectedGroup(null)}
                fullWidth={false}
                style={{flex: 1}}
              />
              <Button
                title={
                  selectedGroup?.joined
                    ? 'Mở nhóm'
                    : selectedGroup?.joinable === false
                    ? 'Đã đầy'
                    : 'Tham gia'
                }
                size="md"
                loading={joiningGroupId === selectedGroupId}
                disabled={selectedGroup?.joinable === false && !selectedGroup?.joined}
                onPress={() => handlePrimaryAction(selectedGroup)}
                fullWidth={false}
                style={{flex: 1}}
              />
            </View>
          </View>
        ) : null}
      </Dialog>

      <UserProfileMenu
        visible={profileMenuVisible}
        onClose={() => setProfileMenuVisible(false)}
        onNavigate={handleProfileNavigate}
      />
    </SafeAreaView>
  );
}

function MetaPill({icon, label}: {icon: string; label: string}) {
  const {isDark} = useTheme();
  return (
    <View style={[styles.metaPill, {backgroundColor: isDark ? 'rgba(37,99,235,0.14)' : '#EFF6FF'}]}>
      <Icon name={icon} size={13} color={Colors.primary} />
      <Text style={styles.metaPillText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function DetailRow({label, value}: {label: string; value?: any}) {
  const {isDark, colors} = useTheme();
  if (!value) {
    return null;
  }
  return (
    <View
      style={[
        styles.detailRow,
        {
          backgroundColor: isDark ? Colors.dark.surfaceVariant : '#F8FAFC',
          borderColor: colors.border,
        },
      ]}>
      <Text style={[styles.detailLabel, {color: colors.textTertiary}]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, {color: colors.text}]}>
        {String(value)}
      </Text>
    </View>
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
  headerLeft: {flexDirection: 'row', alignItems: 'center', gap: 10},
  headerTitle: {fontSize: 18, fontWeight: '700'},
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: 10},
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
  searchWrap: {
    paddingTop: Spacing.base,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchButton: {alignSelf: 'stretch'},
  groupCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.md,
  },
  cardTop: {flexDirection: 'row', alignItems: 'center', gap: 10},
  groupIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleWrap: {flex: 1, minWidth: 0},
  groupTitle: {fontSize: 15, fontWeight: '800'},
  groupOwner: {fontSize: 12, marginTop: 2},
  statusPill: {borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5},
  statusText: {fontSize: 11, fontWeight: '700'},
  groupDescription: {fontSize: 13, lineHeight: 20, marginTop: Spacing.md},
  metaRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: Spacing.md},
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  metaPillText: {fontSize: 11, fontWeight: '700', color: Colors.primary, maxWidth: 180},
  capacityText: {fontSize: 12, lineHeight: 18, marginTop: Spacing.sm},
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  detailsHint: {fontSize: 12},
  joinButton: {minWidth: 104},
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {fontSize: 16, fontWeight: '700', marginTop: 12},
  emptySubtitle: {fontSize: 13, textAlign: 'center', lineHeight: 19},
  detailContent: {gap: Spacing.sm},
  detailDescription: {fontSize: 14, lineHeight: 21},
  detailRow: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  detailLabel: {fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 6},
  detailValue: {fontSize: 13, lineHeight: 20},
  dialogActions: {flexDirection: 'row', gap: 12, marginTop: Spacing.md},
});
