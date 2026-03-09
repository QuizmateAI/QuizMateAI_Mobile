import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {launchImageLibrary} from 'react-native-image-picker';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import FloatingInput from '../../components/ui/Input';
import Dialog from '../../components/ui/Dialog';
import {Card} from '../../components/ui/Card';
import ProfileAPI from '../../api/ProfileAPI';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

export default function ProfileScreen({navigation}: any) {
  const {isDark, colors} = useTheme();
  const {user, updateUser} = useAuth();
  const {showToast} = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Edit profile state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ProfileAPI.getProfile()
      .then(res => {
        setProfile(res.data);
        setEditName(res.data?.fullName || '');
        setEditBirthday(res.data?.birthday || '');
      })
      .catch(() => {
        // ──── MOCK DATA ────
        const mock = {
          fullName: user?.fullName || 'Test User',
          username: user?.username || 'test',
          email: user?.email || 'test@quizmateai.com',
          avatarUrl: user?.avatarUrl || null,
          birthday: '2003-05-15',
          level: 5,
          xp: 450,
          nextLevelXp: 1000,
          topicCount: 8,
          totalHours: 42,
          streak: 7,
          avgScore: 78,
          badges: [
            {emoji: '🏆', name: 'Quiz Master'},
            {emoji: '🔥', name: 'Streak Keeper'},
            {emoji: '⚡', name: 'Speedster'},
          ],
        };
        setProfile(mock);
        setEditName(mock.fullName);
        setEditBirthday(mock.birthday);
      });
  }, [user]);

  /* ──── Avatar Upload ──── */
  const handleAvatarPress = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.8,
      });

      if (result.didCancel || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) {return;}

      setUploadingAvatar(true);

      const formData = new FormData();
      formData.append('avatar', {
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        name: asset.fileName || 'avatar.jpg',
      } as any);

      try {
        const res = await ProfileAPI.uploadAvatar(formData);
        const newUrl = res.data?.avatarUrl || res.data?.url || asset.uri;
        setProfile((prev: any) => ({...prev, avatarUrl: newUrl}));
        if (user) {
          await updateUser({...user, avatarUrl: newUrl});
        }
        showToast('Avatar updated!', 'success');
      } catch {
        // For mock mode: just update locally
        setProfile((prev: any) => ({...prev, avatarUrl: asset.uri}));
        if (user) {
          await updateUser({...user, avatarUrl: asset.uri || undefined});
        }
        showToast('Avatar updated!', 'success');
      }
    } catch (err: any) {
      showToast('Failed to pick image', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  }, [user, updateUser, showToast]);

  /* ──── Save Profile ──── */
  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      showToast('Name cannot be empty', 'warning');
      return;
    }
    setSaving(true);
    try {
      await ProfileAPI.updateProfile({fullName: editName, birthday: editBirthday});
      setProfile((prev: any) => ({
        ...prev,
        fullName: editName,
        birthday: editBirthday,
      }));
      if (user) {
        await updateUser({...user, fullName: editName});
      }
      showToast('Profile updated!', 'success');
    } catch {
      // Mock: update locally anyway
      setProfile((prev: any) => ({
        ...prev,
        fullName: editName,
        birthday: editBirthday,
      }));
      if (user) {
        await updateUser({...user, fullName: editName});
      }
      showToast('Profile updated!', 'success');
    } finally {
      setSaving(false);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(profile?.fullName || '');
    setEditBirthday(profile?.birthday || '');
    setIsEditing(false);
  };

  const stats = [
    {
      icon: 'book-open-variant',
      label: 'Topics',
      value: profile?.topicCount || 0,
      color: Colors.primary,
    },
    {
      icon: 'clock-outline',
      label: 'Hours',
      value: profile?.totalHours || 0,
      color: '#059669',
    },
    {
      icon: 'fire',
      label: 'Streak',
      value: profile?.streak || 0,
      color: '#EA580C',
    },
    {
      icon: 'star-outline',
      label: 'Avg Score',
      value: profile?.avgScore ? `${profile.avgScore}%` : '0%',
      color: '#7C3AED',
    },
  ];

  const xpPercent = profile?.xp
    ? Math.min((profile.xp / (profile.nextLevelXp || 1000)) * 100, 100)
    : 0;

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
        <Text style={[styles.headerTitle, {color: colors.heading}]}>
          Profile
        </Text>
        <View style={styles.headerRight}>
          {!isEditing && (
            <TouchableOpacity
              onPress={() => setIsEditing(true)}
              style={styles.editBtn}>
              <Icon name="pencil-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.settingsBtn}>
            <Icon name="cog-outline" size={22} color={colors.icon} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Identity Card */}
        <Card style={styles.identityCard}>
          <View style={styles.identityTop}>
            {/* Avatar with camera overlay */}
            <TouchableOpacity
              onPress={handleAvatarPress}
              activeOpacity={0.7}
              style={styles.avatarWrap}>
              <Avatar
                uri={profile?.avatarUrl || user?.avatarUrl}
                name={profile?.fullName || user?.fullName}
                size={80}
              />
              <View
                style={[
                  styles.cameraBadge,
                  {
                    backgroundColor: Colors.primary,
                    borderColor: colors.surface,
                  },
                ]}>
                {uploadingAvatar ? (
                  <ActivityIndicator size={12} color="#FFF" />
                ) : (
                  <Icon name="camera" size={14} color="#FFF" />
                )}
              </View>
            </TouchableOpacity>

            {/* User info */}
            <View style={styles.identityInfo}>
              {isEditing ? (
                <View style={styles.editFields}>
                  <FloatingInput
                    label="Full Name"
                    value={editName}
                    onChangeText={setEditName}
                  />
                  <FloatingInput
                    label="Birthday (YYYY-MM-DD)"
                    value={editBirthday}
                    onChangeText={setEditBirthday}
                    placeholder="2000-01-15"
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity
                      onPress={handleCancelEdit}
                      style={[
                        styles.editActionBtn,
                        {
                          backgroundColor: isDark
                            ? 'rgba(239,68,68,0.1)'
                            : '#FEF2F2',
                        },
                      ]}>
                      <Icon name="close" size={18} color="#EF4444" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveProfile}
                      disabled={saving}
                      style={[
                        styles.editActionBtn,
                        {
                          backgroundColor: isDark
                            ? 'rgba(16,185,129,0.1)'
                            : '#ECFDF5',
                        },
                      ]}>
                      {saving ? (
                        <ActivityIndicator size={16} color="#10B981" />
                      ) : (
                        <Icon name="check" size={18} color="#10B981" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={[styles.fullName, {color: colors.heading}]}>
                    {profile?.fullName || user?.fullName}
                  </Text>
                  <Text
                    style={[styles.username, {color: colors.textSecondary}]}>
                    @{profile?.username || user?.username}
                  </Text>
                  <Text
                    style={[styles.email, {color: colors.textTertiary}]}>
                    {profile?.email || user?.email}
                  </Text>
                  {profile?.birthday && (
                    <View style={styles.birthdayRow}>
                      <Icon
                        name="cake-variant"
                        size={14}
                        color={colors.textTertiary}
                      />
                      <Text
                        style={[
                          styles.birthdayText,
                          {color: colors.textTertiary},
                        ]}>
                        {profile.birthday}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>

          {/* XP Bar */}
          <View style={styles.xpSection}>
            <View style={styles.xpHeader}>
              <View style={styles.levelBadge}>
                <Icon name="lightning-bolt" size={14} color="#F59E0B" />
                <Text style={[styles.xpLabel, {color: colors.textSecondary}]}>
                  Level {profile?.level || 1}
                </Text>
              </View>
              <Text style={[styles.xpValue, {color: colors.textSecondary}]}>
                {profile?.xp || 0} / {profile?.nextLevelXp || 1000} XP
              </Text>
            </View>
            <View
              style={[
                styles.xpBarBg,
                {backgroundColor: isDark ? '#1E293B' : '#E2E8F0'},
              ]}>
              <View
                style={[
                  styles.xpBarFill,
                  {
                    width: `${xpPercent}%`,
                    backgroundColor: Colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        </Card>

        {/* Stats Grid */}
        <Text style={[styles.sectionTitle, {color: colors.heading}]}>
          Statistics
        </Text>
        <View style={styles.statsGrid}>
          {stats.map(stat => (
            <View
              key={stat.label}
              style={[
                styles.statCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}>
              <View
                style={[
                  styles.statIcon,
                  {backgroundColor: `${stat.color}15`},
                ]}>
                <Icon name={stat.icon} size={18} color={stat.color} />
              </View>
              <Text style={[styles.statValue, {color: colors.heading}]}>
                {stat.value}
              </Text>
              <Text style={[styles.statLabel, {color: colors.textSecondary}]}>
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Badges */}
        <Text style={[styles.sectionTitle, {color: colors.heading}]}>
          Badges
        </Text>
        <View style={styles.badgesRow}>
          {(profile?.badges || []).length > 0 ? (
            profile.badges.map((badge: any, i: number) => (
              <View
                key={i}
                style={[
                  styles.badgeCard,
                  {backgroundColor: colors.surface, borderColor: colors.border},
                ]}>
                <Text style={styles.badgeEmoji}>{badge.emoji || '🏆'}</Text>
                <Text
                  style={[styles.badgeName, {color: colors.heading}]}
                  numberOfLines={1}>
                  {badge.name}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyBadges}>
              <Icon
                name="trophy-outline"
                size={32}
                color={colors.textTertiary}
              />
              <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
                No badges earned yet
              </Text>
            </View>
          )}
        </View>

        {/* Quick Links */}
        <Text style={[styles.sectionTitle, {color: colors.heading}]}>
          Account
        </Text>
        {[
          {
            icon: 'crown-outline',
            label: 'Subscription',
            desc: 'Manage your plan',
            screen: 'Subscription',
            color: '#F59E0B',
          },
          {
            icon: 'cog-outline',
            label: 'Settings',
            desc: 'App preferences',
            screen: 'Settings',
            color: colors.icon,
          },
        ].map(item => (
          <TouchableOpacity
            key={item.label}
            onPress={() => navigation.navigate(item.screen)}
            style={[
              styles.menuItem,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <View
              style={[
                styles.menuIconWrap,
                {backgroundColor: `${item.color}15`},
              ]}>
              <Icon name={item.icon} size={20} color={item.color} />
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuLabel, {color: colors.text}]}>
                {item.label}
              </Text>
              <Text style={[styles.menuDesc, {color: colors.textTertiary}]}>
                {item.desc}
              </Text>
            </View>
            <Icon
              name="chevron-right"
              size={20}
              color={colors.textTertiary}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
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
  headerTitle: {fontSize: 20, fontWeight: '700'},
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: 4},
  editBtn: {padding: Spacing.sm},
  settingsBtn: {padding: Spacing.sm},
  scrollContent: {padding: Spacing.lg, paddingBottom: 40},

  // Identity
  identityCard: {marginBottom: Spacing.lg},
  identityTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.base,
    marginBottom: Spacing.lg,
  },
  avatarWrap: {position: 'relative'},
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  identityInfo: {flex: 1, paddingTop: 4},
  fullName: {fontSize: 20, fontWeight: '700'},
  username: {fontSize: 14, marginTop: 2},
  email: {fontSize: 12, marginTop: 2},
  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  birthdayText: {fontSize: 12},

  // Edit fields
  editFields: {gap: Spacing.sm},
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  editActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // XP
  xpSection: {marginTop: Spacing.sm},
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  xpLabel: {fontSize: 12, fontWeight: '600'},
  xpValue: {fontSize: 12},
  xpBarBg: {height: 8, borderRadius: 4, overflow: 'hidden'},
  xpBarFill: {height: '100%', borderRadius: 4},

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCard: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2,
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
  statValue: {fontSize: 20, fontWeight: '700'},
  statLabel: {fontSize: 11},

  // Badges
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badgeCard: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm * 2) / 3,
  },
  badgeEmoji: {fontSize: 28},
  badgeName: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  emptyBadges: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 8,
  },
  emptyText: {fontSize: 13},

  // Menu
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: 12,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {flex: 1},
  menuLabel: {fontSize: 14, fontWeight: '500'},
  menuDesc: {fontSize: 11, marginTop: 1},
});
