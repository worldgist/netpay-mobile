import { StyleSheet, View, ScrollView, TouchableOpacity, Platform, ImageSourcePropType } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function TransactionDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Sample transaction data - in a real app, this would be fetched based on transaction ID
  const transaction = {
    id: params.id || '1',
    type: params.type || 'credit',
    amount: parseFloat(params.amount as string) || 500,
    date: params.date || 'Nov 6, 2025',
    time: params.time || '4:22 PM',
    reference: params.reference || 'CREDIT-1762442529579',
    status: params.status || 'Completed',
    description: params.description || 'Wallet funding',
    recipient: params.recipient || '',
    serviceType: params.serviceType || '',
    network: params.network || '',
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      Alert.alert('Copied', `${label} copied to clipboard`);
    } catch (error) {
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return '#4CAF50';
      case 'pending':
        return '#FF9800';
      case 'failed':
      case 'cancelled':
        return '#F44336';
      default:
        return '#666';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'credit':
        return 'arrow-downward';
      case 'debit':
        return 'arrow-upward';
      default:
        return 'swap-horiz';
    }
  };

  const getTypeColor = (type: string) => {
    return type.toLowerCase() === 'credit' ? '#4CAF50' : '#F44336';
  };

  // Helper function to get transaction logo
  const getTransactionLogo = (serviceType: string, network: string): ImageSourcePropType | null => {
    if (!serviceType || !network) return null;
    
    const networkLower = network.toLowerCase();
    const serviceLower = serviceType.toLowerCase();
    
    // Network logos (for Airtime, Data)
    if (serviceLower === 'airtime vtu' || serviceLower === 'data bundle') {
      switch (networkLower) {
        case 'mtn':
          return require('@/assets/images/mtn.png');
        case 'airtel':
          return require('@/assets/images/airtel.png');
        case '9mobile':
          return require('@/assets/images/9mobile.png');
        case 'glo':
          return require('@/assets/images/glo.png');
        default:
          return null;
      }
    }
    
    // Cable TV logos
    if (serviceLower === 'cable tv') {
      switch (networkLower) {
        case 'dstv':
          return require('@/assets/images/dstv.png');
        case 'gotv':
          return require('@/assets/images/gotv.png');
        case 'startimes':
          return require('@/assets/images/startimes.png');
        default:
          return null;
      }
    }
    
    // Electricity logos
    if (serviceLower === 'electricity') {
      switch (networkLower) {
        case 'aedc':
          return require('@/assets/images/AEDC.png');
        case 'eedc':
          return require('@/assets/images/EEDC.png');
        case 'ekedc':
          return require('@/assets/images/EKEDC.png');
        case 'ikedc':
          return require('@/assets/images/IKEDC.png');
        case 'kedco':
          return require('@/assets/images/KEDCO.png');
        case 'phedc':
          return require('@/assets/images/PHEDC.png');
        default:
          return null;
      }
    }
    
    // Education logos
    if (serviceLower === 'education') {
      switch (networkLower) {
        case 'waec':
          return require('@/assets/images/waec.png');
        case 'neco':
          return require('@/assets/images/neco.png');
        case 'jamb':
          return require('@/assets/images/jamb.png');
        default:
          return null;
      }
    }
    
    return null;
  };

  const transactionLogo = getTransactionLogo(transaction.serviceType, transaction.network);

  // Generate HTML receipt template
  const generateReceiptHTML = () => {
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = currentDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Transaction Receipt</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              padding: 20px;
              background: #fff;
              color: #333;
            }
            .receipt-container {
              max-width: 600px;
              margin: 0 auto;
              background: #fff;
              border: 1px solid #e0e0e0;
              border-radius: 8px;
              padding: 30px;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #FF7F00;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 28px;
              font-weight: bold;
              color: #FF7F00;
              margin-bottom: 10px;
            }
            .receipt-title {
              font-size: 24px;
              font-weight: bold;
              color: #333;
              margin-bottom: 5px;
            }
            .receipt-subtitle {
              font-size: 14px;
              color: #666;
            }
            .transaction-info {
              margin-bottom: 30px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              padding: 12px 0;
              border-bottom: 1px solid #f0f0f0;
            }
            .info-row:last-child {
              border-bottom: none;
            }
            .info-label {
              font-size: 14px;
              color: #666;
              font-weight: 500;
            }
            .info-value {
              font-size: 14px;
              color: #333;
              font-weight: 600;
              text-align: right;
            }
            .amount-section {
              background: #F5F5F5;
              border-radius: 8px;
              padding: 20px;
              margin: 30px 0;
              text-align: center;
            }
            .amount-label {
              font-size: 14px;
              color: #666;
              margin-bottom: 10px;
            }
            .amount-value {
              font-size: 36px;
              font-weight: bold;
              color: ${transaction.type === 'credit' ? '#4CAF50' : '#F44336'};
            }
            .status-badge {
              display: inline-block;
              padding: 6px 16px;
              border-radius: 20px;
              font-size: 14px;
              font-weight: 600;
              background: ${getStatusColor(transaction.status) + '20'};
              color: ${getStatusColor(transaction.status)};
              margin-top: 10px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
              text-align: center;
              font-size: 12px;
              color: #999;
            }
            .reference {
              background: #F5F5F5;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              text-align: center;
            }
            .reference-code {
              font-size: 16px;
              font-weight: bold;
              color: #333;
              font-family: monospace;
              letter-spacing: 1px;
            }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <div class="logo">NetPay</div>
              <div class="receipt-title">Transaction Receipt</div>
              <div class="receipt-subtitle">${formattedDate} at ${formattedTime}</div>
            </div>

            <div class="amount-section">
              <div class="amount-label">${transaction.type === 'credit' ? 'Amount Received' : 'Amount Sent'}</div>
              <div class="amount-value">${transaction.type === 'credit' ? '+' : '-'}₦${transaction.amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div class="status-badge">${transaction.status}</div>
            </div>

            <div class="transaction-info">
              <div class="info-row">
                <span class="info-label">Transaction Type</span>
                <span class="info-value">${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}</span>
              </div>
              ${transaction.serviceType ? `
              <div class="info-row">
                <span class="info-label">Service Type</span>
                <span class="info-value">${transaction.serviceType}</span>
              </div>
              ` : ''}
              ${transaction.network ? `
              <div class="info-row">
                <span class="info-label">Provider/Network</span>
                <span class="info-value">${transaction.network}</span>
              </div>
              ` : ''}
              ${transaction.recipient ? `
              <div class="info-row">
                <span class="info-label">Recipient</span>
                <span class="info-value">${transaction.recipient}</span>
              </div>
              ` : ''}
              ${transaction.description ? `
              <div class="info-row">
                <span class="info-label">Description</span>
                <span class="info-value">${transaction.description}</span>
              </div>
              ` : ''}
              <div class="info-row">
                <span class="info-label">Date</span>
                <span class="info-value">${transaction.date}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Time</span>
                <span class="info-value">${transaction.time}</span>
              </div>
            </div>

            <div class="reference">
              <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Reference Number</div>
              <div class="reference-code">${transaction.reference}</div>
            </div>

            <div class="reference">
              <div style="font-size: 12px; color: #666; margin-bottom: 5px;">Transaction ID</div>
              <div class="reference-code">${transaction.id}</div>
            </div>

            <div class="footer">
              <p>This is a computer-generated receipt. No signature is required.</p>
              <p style="margin-top: 10px;">Thank you for using NetPay!</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Handle print receipt
  const handlePrintReceipt = async () => {
    try {
      const html = generateReceiptHTML();
      
      // Generate PDF
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
        width: 612, // US Letter width in points
        height: 792, // US Letter height in points
      });

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Receipt',
        });
      } else {
        Alert.alert('Success', 'Receipt generated successfully!', [
          { text: 'OK' }
        ]);
      }
    } catch (error) {
      console.error('Error generating receipt:', error);
      Alert.alert('Error', 'Failed to generate receipt. Please try again.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Transaction Details</ThemedText>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Amount Card */}
        <View style={styles.amountCard}>
          <View style={[styles.iconContainer, { backgroundColor: transaction.type.toLowerCase() === 'credit' ? '#E8F5E9' : '#FFEBEE' }]}>
            {transactionLogo ? (
              <Image
                source={transactionLogo}
                style={styles.transactionLogo}
                contentFit="contain"
              />
            ) : (
              <MaterialIcons 
                name={getTypeIcon(transaction.type) as any} 
                size={32} 
                color={getTypeColor(transaction.type)} 
              />
            )}
          </View>
          <ThemedText style={styles.amountLabel}>
            {transaction.type === 'credit' ? 'Amount Received' : 'Amount Sent'}
          </ThemedText>
          <View style={styles.amountValueContainer}>
            <ThemedText style={[styles.amountValue, { color: getTypeColor(transaction.type) }]}>
              {transaction.type === 'credit' ? '+' : '-'}₦{transaction.amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </ThemedText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(transaction.status) + '20' }]}>
            <ThemedText style={[styles.statusText, { color: getStatusColor(transaction.status) }]}>
              {transaction.status}
            </ThemedText>
          </View>
        </View>

        {/* Transaction Information */}
        <View style={styles.infoSection}>
          <ThemedText style={styles.sectionTitle}>Transaction Information</ThemedText>
          
          {/* Transaction Type */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Transaction Type</ThemedText>
            <ThemedText style={styles.infoValue} numberOfLines={1}>
              {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
            </ThemedText>
          </View>

          {/* Date */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Date</ThemedText>
            <ThemedText style={styles.infoValue}>{transaction.date}</ThemedText>
          </View>

          {/* Time */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Time</ThemedText>
            <ThemedText style={styles.infoValue}>{transaction.time}</ThemedText>
          </View>

          {/* Reference Number */}
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Reference Number</ThemedText>
            <TouchableOpacity 
              style={styles.copyRow}
              onPress={() => handleCopy(transaction.reference, 'Reference number')}>
              <ThemedText style={styles.infoValue} numberOfLines={1}>
                {transaction.reference}
              </ThemedText>
              <MaterialIcons name="content-copy" size={18} color="#FF7F00" style={styles.copyIcon} />
            </TouchableOpacity>
          </View>

          {/* Description */}
          {transaction.description && (
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>Description</ThemedText>
              <ThemedText style={styles.infoValue}>{transaction.description}</ThemedText>
            </View>
          )}

          {/* Service Type */}
          {transaction.serviceType && (
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>Service Type</ThemedText>
              <ThemedText style={styles.infoValue}>{transaction.serviceType}</ThemedText>
            </View>
          )}

          {/* Network/Provider */}
          {transaction.network && (
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>Provider</ThemedText>
              <ThemedText style={styles.infoValue}>{transaction.network}</ThemedText>
            </View>
          )}

          {/* Recipient */}
          {transaction.recipient && (
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>Recipient</ThemedText>
              <TouchableOpacity 
                style={styles.copyRow}
                onPress={() => handleCopy(transaction.recipient, 'Recipient')}>
                <ThemedText style={styles.infoValue} numberOfLines={1}>
                  {transaction.recipient}
                </ThemedText>
                <MaterialIcons name="content-copy" size={18} color="#FF7F00" style={styles.copyIcon} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Transaction ID */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Transaction ID</ThemedText>
            <TouchableOpacity 
              style={styles.copyRow}
              onPress={() => handleCopy(transaction.id, 'Transaction ID')}>
              <ThemedText style={styles.infoValue} numberOfLines={1}>
                {transaction.id}
              </ThemedText>
              <MaterialIcons name="content-copy" size={18} color="#FF7F00" style={styles.copyIcon} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Print Receipt Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.printButton}
            onPress={handlePrintReceipt}
            activeOpacity={0.8}>
            <MaterialIcons name="print" size={20} color="#fff" style={styles.printIcon} />
            <ThemedText style={styles.printButtonText}>Print Receipt</ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  amountCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    padding: 32,
    marginHorizontal: 20,
    marginBottom: 24,
    alignItems: 'center',
    minHeight: 200,
    justifyContent: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    padding: 12,
  },
  transactionLogo: {
    width: '100%',
    height: '100%',
  },
  amountLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontWeight: '500',
  },
  amountValueContainer: {
    minHeight: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  amountValue: {
    fontSize: 40,
    fontWeight: 'bold',
    lineHeight: 48,
    textAlign: 'center',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },
  copyIcon: {
    marginLeft: 8,
  },
  buttonContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  printButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  printIcon: {
    marginRight: 8,
  },
  printButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});

