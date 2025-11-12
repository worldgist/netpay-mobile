import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Share,
  Alert,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

export default function ReferralScreen() {
  const router = useRouter();
  const [referralCode, setReferralCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalReferrals: 0,
    completedReferrals: 0,
    pendingReferrals: 0,
    totalEarnings: 0,
    paidEarnings: 0,
    pendingEarnings: 0,
  });
  const [recentReferrals, setRecentReferrals] = useState<
    Array<{
      id: string;
      referred_email: string | null;
      status: string;
      reward_amount: number | null;
      created_at: string;
      referrer_reward_paid: boolean;
    }>
  >([]);
  const [referrerReward, setReferrerReward] = useState<number | null>(null);
  const [referredReward, setReferredReward] = useState<number | null>(null);
  const isMounted = useRef(true);

  const formatCurrency = useCallback((value: number | null | undefined) => {
    const amount = Number(value || 0);
    return `₦${amount.toLocaleString('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, []);

  const fetchReferralData = useCallback(
    async ({ isRefresh = false }: { isRefresh?: boolean } = {}) => {
      if (isRefresh) {
        if (isMounted.current) setRefreshing(true);
      } else {
        if (isMounted.current) setLoading(true);
      }

      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          router.replace('/auth/login');
          return;
        }

        const userId = session.user.id;
        const generatedCode = `REF-${userId.slice(0, 8).toUpperCase()}`;
        if (isMounted.current) {
          setReferralCode(generatedCode);
        }

        const { data: referralRows, error: referralError } = await supabase
          .from('referrals')
          .select('*')
          .eq('referrer_id', userId)
          .order('created_at', { ascending: false });

        if (referralError) {
          console.warn('referrals query error:', referralError);
          if (isMounted.current) {
            setRecentReferrals([]);
            setStats({
              totalReferrals: 0,
              completedReferrals: 0,
              pendingReferrals: 0,
              totalEarnings: 0,
              paidEarnings: 0,
              pendingEarnings: 0,
            });
          }
        } else if (isMounted.current) {
          const rows = referralRows || [];
          setRecentReferrals(rows.slice(0, 5));

          const completed = rows.filter((r) => r.status === 'completed');
          const pending = rows.filter((r) => r.status === 'pending');
          const totalEarnings = rows.reduce((sum, r) => sum + Number(r.reward_amount || 0), 0);
          const paidEarnings = rows
            .filter((r) => r.referrer_reward_paid)
            .reduce((sum, r) => sum + Number(r.reward_amount || 0), 0);
          const pendingEarnings = completed
            .filter((r) => !r.referrer_reward_paid)
            .reduce((sum, r) => sum + Number(r.reward_amount || 0), 0);

          setStats({
            totalReferrals: rows.length,
            completedReferrals: completed.length,
            pendingReferrals: pending.length,
            totalEarnings,
            paidEarnings,
            pendingEarnings,
          });
        }

        const { data: settingsRow, error: settingsError } = await supabase
          .from('referral_settings')
          .select('referrer_reward, referred_reward')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (settingsError && settingsError.code !== 'PGRST116') {
          throw settingsError;
        }

        if (isMounted.current && settingsRow) {
          setReferrerReward(Number(settingsRow.referrer_reward || 0));
          setReferredReward(Number(settingsRow.referred_reward || 0));
        } else if (isMounted.current) {
          setReferrerReward(null);
          setReferredReward(null);
        }
      } catch (error) {
        console.error('Failed to load referral data:', error);
        if (isMounted.current) {
          const message = error instanceof Error ? error.message : 'Unable to load referral data. Please try again.';
          Alert.alert('Referral Program', message);
        }
      } finally {
        if (isMounted.current) {
          if (isRefresh) {
            setRefreshing(false);
          } else {
            setLoading(false);
          }
        }
      }
    },
    [router]
  );

  useFocusEffect(
    useCallback(() => {
      isMounted.current = true;
      fetchReferralData();

      return () => {
        isMounted.current = false;
      };
    }, [fetchReferralData])
  );

  const handleRefresh = useCallback(() => {
    fetchReferralData({ isRefresh: true });
  }, [fetchReferralData]);

  const handleCopyCode = async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareLink = () => {
    if (!referralCode) return;

    const message = `Use my NetPay referral code ${referralCode} to sign up and earn rewards! Download the app and enter the code during signup.`;

    Share.share({
      message,
      title: 'Invite to NetPay',
    }).catch((error) => {
      console.error('Failed to share referral link:', error);
      Alert.alert('Referral', 'Unable to share right now. Please try again.');
    });
  };

  const rewardSummary = useMemo(() => {
    if (referrerReward === null && referredReward === null) return '';

    if (referrerReward !== null && referredReward !== null) {
      return `Earn ${formatCurrency(referrerReward)} and your friend gets ${formatCurrency(referredReward)} after their first transaction.`;
    }

    if (referrerReward !== null) {
      return `Earn ${formatCurrency(referrerReward)} when your friend completes their first transaction.`;
    }

    if (referredReward !== null) {
      return `Your friend receives ${formatCurrency(referredReward)} after their first transaction.`;
    }

    return '';
  }, [formatCurrency, referrerReward, referredReward]);

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator color="#FF7F00" size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Referral Program</ThemedText>
        <View style={styles.placeholder} />
      </View>
      <ThemedText style={styles.headerSubtitle}>Invite friends and earn rewards</ThemedText>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF7F00" />}>
        
        {/* Your Referral Code Section */}
        <View style={styles.referralCard}>
          <ThemedText style={styles.referralCardTitle}>Your Referral Code</ThemedText>
          <ThemedText style={styles.referralCardSubtitle}>Share this code with friends to earn rewards</ThemedText>

          <View style={styles.codeContainer}>
            <ThemedText style={styles.referralCode}>{referralCode || 'Generating...'}</ThemedText>
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyCode} disabled={!referralCode}>
              <MaterialIcons name={copied ? "check" : "content-copy"} size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.shareButton, !referralCode && styles.shareButtonDisabled]} onPress={handleShareLink} disabled={!referralCode}>
            <MaterialIcons name="share" size={20} color="#333" style={styles.shareIcon} />
            <ThemedText style={styles.shareButtonText}>Share Referral Link</ThemedText>
          </TouchableOpacity>

          {!!rewardSummary && (
            <ThemedText style={styles.rewardSummary}>{rewardSummary}</ThemedText>
          )}
        </View>

        {/* Statistics Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <MaterialIcons name="people" size={36} color="#FF7F00" />
            <ThemedText style={styles.statValue}>{stats.totalReferrals}</ThemedText>
            <ThemedText style={styles.statLabel}>Total Referrals</ThemedText>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="check-circle" size={36} color="#4CAF50" />
            <ThemedText style={styles.statValue}>{stats.completedReferrals}</ThemedText>
            <ThemedText style={styles.statLabel}>Completed</ThemedText>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="card-giftcard" size={36} color="#9C27B0" />
            <ThemedText style={styles.statValue}>{formatCurrency(stats.totalEarnings)}</ThemedText>
            <ThemedText style={styles.statLabel}>Total Earnings</ThemedText>
          </View>
          <View style={styles.statCard}>
            <MaterialIcons name="card-giftcard" size={36} color="#4CAF50" />
            <ThemedText style={styles.statValue}>{formatCurrency(stats.paidEarnings)}</ThemedText>
            <ThemedText style={styles.statLabel}>Paid Out</ThemedText>
          </View>
        </View>

        {/* Recent Referrals */}
        <View style={styles.referralsCard}>
          <View style={styles.referralsHeader}>
            <ThemedText style={styles.referralsTitle}>Recent Referrals</ThemedText>
            <ThemedText style={styles.referralsSubtitle}>
              {stats.pendingReferrals > 0
                ? `${stats.pendingReferrals} pending reward${stats.pendingReferrals === 1 ? '' : 's'}`
                : 'All rewards paid'}
            </ThemedText>
          </View>

          {recentReferrals.length === 0 ? (
            <View style={styles.noReferralsCard}>
              <MaterialIcons name="people-outline" size={48} color="#999" />
              <ThemedText style={styles.noReferralsTitle}>No referrals yet</ThemedText>
              <ThemedText style={styles.noReferralsSubtitle}>Start sharing your code to earn rewards!</ThemedText>
            </View>
          ) : (
            recentReferrals.map((referral) => (
              <View key={referral.id} style={styles.referralRow}>
                <View style={styles.referralRowIcon}>
                  <MaterialIcons name="person-add" size={20} color="#FF7F00" />
                </View>
                <View style={styles.referralRowContent}>
                  <ThemedText style={styles.referralRowEmail}>
                    {referral.referred_email || 'Pending sign up'}
                  </ThemedText>
                  <ThemedText style={styles.referralRowMeta}>
                    {new Date(referral.created_at).toLocaleDateString('en-NG', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {' • '}
                    {referral.status === 'completed' ? 'Completed' : 'Pending'}
                  </ThemedText>
                </View>
                <View style={styles.referralRowStatus}>
                  <ThemedText
                    style={[
                      styles.referralRowStatusText,
                      referral.status === 'completed' ? styles.statusCompleted : styles.statusPending,
                    ]}
                  >
                    {referral.status === 'completed'
                      ? referral.referrer_reward_paid
                        ? 'Paid'
                        : 'Reward Pending'
                      : 'In Progress'}
                  </ThemedText>
                  <ThemedText style={styles.referralRowAmount}>
                    {formatCurrency(referral.reward_amount)}
                  </ThemedText>
                </View>
              </View>
            ))
          )}
        </View>

        {/* How It Works Card */}
        <View style={styles.howItWorksCard}>
          <ThemedText style={styles.howItWorksTitle}>How It Works</ThemedText>
          
          <View style={styles.stepContainer}>
            <View style={styles.stepNumber}>
              <ThemedText style={styles.stepNumberText}>1</ThemedText>
            </View>
            <View style={styles.stepContent}>
              <ThemedText style={styles.stepTitle}>Share your code</ThemedText>
              <ThemedText style={styles.stepDescription}>Send your referral code to friends and family</ThemedText>
            </View>
          </View>

          <View style={styles.stepContainer}>
            <View style={styles.stepNumber}>
              <ThemedText style={styles.stepNumberText}>2</ThemedText>
            </View>
            <View style={styles.stepContent}>
              <ThemedText style={styles.stepTitle}>They sign up</ThemedText>
              <ThemedText style={styles.stepDescription}>Your friend creates an account using your code</ThemedText>
            </View>
          </View>

          <View style={styles.stepContainer}>
            <View style={styles.stepNumber}>
              <ThemedText style={styles.stepNumberText}>3</ThemedText>
            </View>
            <View style={styles.stepContent}>
              <ThemedText style={styles.stepTitle}>Earn rewards</ThemedText>
              <ThemedText style={styles.stepDescription}>Get rewarded when they complete their first transaction</ThemedText>
            </View>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  referralCard: {
    backgroundColor: '#FF7F00',
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  referralCardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  referralCardSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
    marginBottom: 20,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    width: '100%',
    justifyContent: 'space-between',
  },
  referralCode: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  copyButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    padding: 8,
    marginLeft: 10,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareIcon: {
    marginRight: 10,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  rewardSummary: {
    marginTop: 16,
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.95,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '47%',
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  referralsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  referralsHeader: {
    marginBottom: 16,
  },
  referralsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  referralsSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  noReferralsCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  noReferralsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  noReferralsSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  referralRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF1E6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  referralRowContent: {
    flex: 1,
  },
  referralRowEmail: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  referralRowMeta: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  referralRowStatus: {
    alignItems: 'flex-end',
    minWidth: 110,
  },
  referralRowStatusText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusCompleted: {
    color: '#4CAF50',
  },
  statusPending: {
    color: '#FF9800',
  },
  referralRowAmount: {
    fontSize: 12,
    color: '#666',
  },
  howItWorksCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  howItWorksTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 24,
  },
  stepContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

