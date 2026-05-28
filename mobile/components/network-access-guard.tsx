import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppState, StyleSheet, TouchableOpacity, View } from "react-native";
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';
import { checkNetworkAccess, VPN_PROXY_BLOCK_MESSAGE } from '@/utils/network-access';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';

type Props = {
  children: ReactNode;
};

export function NetworkAccessGuard({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState(VPN_PROXY_BLOCK_MESSAGE);

  const runCheck = useCallback(async () => {
    setLoading(true);
    const status = await checkNetworkAccess(supabase);
    setBlocked(status.blocked || !status.allowed);
    setMessage(status.reason || VPN_PROXY_BLOCK_MESSAGE);
    setLoading(false);
  }, []);

  useEffect(() => {
    runCheck();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runCheck();
      }
    });

    return () => subscription.remove();
  }, [runCheck]);

  useEffect(() => {
    if (!blocked) return;

    supabase.auth.signOut().catch((err) => {
      console.warn('Sign out after VPN/proxy block:', err);
    });
  }, [blocked]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <NetpayLoadingAnimation message="Verifying network…" />
      </View>
    );
  }

  if (blocked) {
    return (
      <View style={styles.centered}>
        <View style={styles.card}>
          <MaterialIcons name="shield" size={48} color="#d32f2f" style={styles.icon} />
          <ThemedText style={styles.title}>Connection blocked</ThemedText>
          <ThemedText style={styles.message}>{message}</ThemedText>
          <TouchableOpacity style={styles.button} onPress={runCheck} activeOpacity={0.85}>
            <MaterialIcons name="refresh" size={18} color="#fff" />
            <ThemedText style={styles.buttonText}>Check again</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 24,
  },
  card: {
    maxWidth: 360,
    alignItems: 'center',
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF7F00',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
