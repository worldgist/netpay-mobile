import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';

type DemoNumbersBannerProps = {
  type: 'airtime' | 'data' | 'cable' | 'electricity' | 'transfer';
};

const DEMO_NUMBERS = {
  airtime: {
    title: 'Demo Phone Number for Airtime',
    number: '08012345678',
    description: 'Use this number for all networks (MTN, AIRTEL, GLO, 9MOBILE)',
  },
  data: {
    title: 'Demo Phone Number for Data',
    number: '08012345678',
    description: 'Use this number for all networks (MTN, AIRTEL, GLO, 9MOBILE)',
  },
  cable: {
    title: 'Demo Smartcard Numbers',
    numbers: [
      { provider: 'DStv', number: '1234567890' },
      { provider: 'GOtv', number: '3456789012' },
      { provider: 'StarTimes', number: '5678901234' },
    ],
  },
  electricity: {
    title: 'Demo Meter Numbers',
    numbers: [
      { provider: 'EKEDC', number: '12345678901' },
      { provider: 'PHEDC', number: '98765432109' },
      { provider: 'IKEDC', number: '11223344556' },
      { provider: 'AEDC', number: '99887766554' },
      { provider: 'KAEDC', number: '55667788990' },
      { provider: 'JED', number: '44332211009' },
    ],
  },
  transfer: {
    title: 'Demo Recipient Email for Transfer',
    number: 'demo-recipient@netpayy.ng',
    description: 'Use this email address to test money transfers',
  },
};

export function DemoNumbersBanner({ type }: DemoNumbersBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const demoInfo = DEMO_NUMBERS[type];

  const handleCopy = async (number: string) => {
    try {
      await Clipboard.setStringAsync(number);
      Alert.alert('Copied!', `"${number}" has been copied to clipboard`);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}>
        <View style={styles.headerContent}>
          <MaterialIcons name="info" size={20} color="#FF7F00" />
          <ThemedText style={styles.title}>{demoInfo.title}</ThemedText>
        </View>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={24}
          color="#666"
        />
      </TouchableOpacity>

          {expanded && (
        <View style={styles.content}>
          {type === 'airtime' || type === 'data' || type === 'transfer' ? (
            <View style={styles.numberContainer}>
              <ThemedText style={styles.numberLabel}>Phone Number:</ThemedText>
              <TouchableOpacity
                style={styles.numberBox}
                onPress={() => handleCopy(demoInfo.number)}
                activeOpacity={0.7}>
                <ThemedText style={styles.numberText}>{demoInfo.number}</ThemedText>
                <MaterialIcons
                  name="content-copy"
                  size={18}
                  color="#FF7F00"
                  style={styles.copyIcon}
                />
              </TouchableOpacity>
              <ThemedText style={styles.description}>{demoInfo.description}</ThemedText>
            </View>
          ) : (
            <View style={styles.numbersList}>
              {demoInfo.numbers?.map((item, index) => (
                <View key={index} style={styles.numberItem}>
                  <ThemedText style={styles.providerLabel}>{item.provider}:</ThemedText>
                  <TouchableOpacity
                    style={styles.numberBox}
                    onPress={() => handleCopy(item.number)}
                    activeOpacity={0.7}>
                    <ThemedText style={styles.numberText}>{item.number}</ThemedText>
                    <MaterialIcons
                      name="content-copy"
                      size={18}
                      color="#FF7F00"
                      style={styles.copyIcon}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
    flex: 1,
  },
  content: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#FFE082',
  },
  numberContainer: {
    gap: 8,
  },
  numbersList: {
    gap: 12,
  },
  numberItem: {
    gap: 6,
  },
  numberLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
  },
  providerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 4,
  },
  numberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FFE082',
    gap: 8,
  },
  numberText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    fontFamily: 'monospace',
  },
  copyIcon: {
    marginLeft: 'auto',
  },
  description: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
});

