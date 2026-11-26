import { StyleSheet, View, TouchableOpacity, TextInput, Platform, Modal, Alert, ScrollView } from 'react-native';
import { NetpayLoadingAnimation } from '@/components/netpay-loading-animation';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useRef, useEffect } from 'react';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';

const PIN_LENGTH = 4;

export default function ChangePinScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState(Array(PIN_LENGTH).fill(''));
  const [newPin, setNewPin] = useState(Array(PIN_LENGTH).fill(''));
  const [confirmPin, setConfirmPin] = useState(Array(PIN_LENGTH).fill(''));
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showWrongPinModal, setShowWrongPinModal] = useState(false);
  const [showSamePinModal, setShowSamePinModal] = useState(false);
  const [showPinMismatchModal, setShowPinMismatchModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [verifiedCurrentPin, setVerifiedCurrentPin] = useState(false);
  const [verifiedCurrentPinValue, setVerifiedCurrentPinValue] = useState('');
  const [isDemoUser, setIsDemoUser] = useState(false);

  // Create refs for PIN inputs - must be created at component level, not in callbacks
  const currentPinRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];
  const newPinRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];
  const confirmPinRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];

  useEffect(() => {
    const loadPinState = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          router.replace('/auth/login');
          return;
        }

        setUserId(session.user.id);

        // Check if user is demo user
        if (session.user.email === 'demo@netppay.com') {
          setIsDemoUser(true);
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('pin_hash')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profileError) throw profileError;

        if (!profile?.pin_hash) {
          Alert.alert(
            'Set Up PIN',
            'You do not have a PIN yet. Please create one first.',
            [
              {
                text: 'Set Up PIN',
                onPress: () => router.replace('/setup-pin'),
              },
            ],
          );
        }
      } catch (error) {
        const errorDetails =
          error instanceof Error
            ? {
                message: error.message,
                name: error.name,
                stack: error.stack,
              }
            : {
                message:
                  (error as any)?.message ||
                  (error as any)?.error_description ||
                  (error as any)?.details ||
                  JSON.stringify(error),
                code: (error as any)?.code,
                details: (error as any)?.details,
                hint: (error as any)?.hint,
              };

        console.error('Failed to load PIN info:', errorDetails);

        const friendlyMessage =
          (error as any)?.message ||
          (error as any)?.details ||
          (error as any)?.error_description ||
          'Please try again later.';

        Alert.alert(
          'Unable to load PIN',
          friendlyMessage,
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } finally {
        setLoading(false);
      }
    };

    loadPinState();
  }, [router]);

  const handlePinChange = (value: string, index: number, type: 'current' | 'new' | 'confirm') => {
    if (value && !/^\d$/.test(value)) return;

    const pinArray = type === 'current' ? currentPin : type === 'new' ? newPin : confirmPin;
    const setPin = type === 'current' ? setCurrentPin : type === 'new' ? setNewPin : setConfirmPin;
    const refs = type === 'current' ? currentPinRefs : type === 'new' ? newPinRefs : confirmPinRefs;

    const next = [...pinArray];
    next[index] = value;
    setPin(next);

    if (value && index < PIN_LENGTH - 1) {
      refs[index + 1].current?.focus();
    }

    // Auto-verify and move to next step when PIN is complete
    if (type === 'current' && next.every((digit) => digit) && index === PIN_LENGTH - 1) {
      // Use setTimeout to ensure state is updated before verification
      setTimeout(() => {
        verifyCurrentPin(next.join(''));
      }, 100);
    }

    if (type === 'new' && next.every((digit) => digit) && index === PIN_LENGTH - 1) {
      setTimeout(() => {
        setStep('confirm');
        confirmPinRefs[0].current?.focus();
      }, 200);
    }

    // Do not auto-submit on confirm step.
    // User must explicitly tap the confirm button.
  };

  const verifyCurrentPin = async (pinString: string) => {
    if (!userId || verifying || pinString.length !== PIN_LENGTH) {
      return;
    }

    try {
      setVerifying(true);

      // For demo users, try both bcrypt (via RPC) and SHA256 verification
      if (isDemoUser) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          // First, try RPC function for bcrypt verification
          const { data: verifyData, error: verifyError } = await supabase.rpc('verify_user_pin', {
            user_email: user.email,
            user_pin: pinString,
          });

          // If RPC succeeds and returns a UUID, PIN is correct (bcrypt)
          if (!verifyError && verifyData) {
            // PIN is correct, move to next step
            setVerifiedCurrentPin(true);
            setVerifiedCurrentPinValue(pinString);
            setStep('new');
            setTimeout(() => {
              newPinRefs[0].current?.focus();
            }, 200);
            setVerifying(false);
            return;
          }

          // If RPC fails, try SHA256 verification (in case PIN was changed to SHA256)
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('pin_hash')
            .eq('id', userId)
            .maybeSingle();

          if (!profileError && profile?.pin_hash) {
            const storedHash = profile.pin_hash;
            const currentHash = await Crypto.digestStringAsync(
              Crypto.CryptoDigestAlgorithm.SHA256,
              pinString,
            );

            if (storedHash === currentHash) {
              // PIN is correct (SHA256), move to next step
              setVerifiedCurrentPin(true);
              setVerifiedCurrentPinValue(pinString);
              setStep('new');
              setTimeout(() => {
                newPinRefs[0].current?.focus();
              }, 200);
              setVerifying(false);
              return;
            }
          }

          // Both methods failed, show wrong PIN modal
          setShowWrongPinModal(true);
          setCurrentPin(Array(PIN_LENGTH).fill(''));
          setVerifying(false);
          return;
        }
      }

      // For non-demo users, use SHA256 verification
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('pin_hash')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile?.pin_hash) {
        Alert.alert('Error', 'No PIN found. Please set up a PIN first.');
        setCurrentPin(Array(PIN_LENGTH).fill(''));
        setVerifying(false);
        return;
      }

      const storedHash = profile.pin_hash;
      const currentHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        pinString,
      );

      if (storedHash !== currentHash) {
        setShowWrongPinModal(true);
        setCurrentPin(Array(PIN_LENGTH).fill(''));
        setVerifying(false);
        return;
      }

      // PIN is correct, move to next step
      setVerifiedCurrentPin(true);
      setVerifiedCurrentPinValue(pinString);
      setStep('new');
      setTimeout(() => {
        newPinRefs[0].current?.focus();
      }, 200);
    } catch (error) {
      console.error('Failed to verify PIN:', error);
      Alert.alert('Error', 'Failed to verify PIN. Please try again.');
      setCurrentPin(Array(PIN_LENGTH).fill(''));
      setStep('current');
    } finally {
      setVerifying(false);
    }
  };

  const handleBackspace = (index: number, type: 'current' | 'new' | 'confirm') => {
    const pinArray = type === 'current' ? currentPin : type === 'new' ? newPin : confirmPin;
    const setPin = type === 'current' ? setCurrentPin : type === 'new' ? setNewPin : setConfirmPin;
    const refs = type === 'current' ? currentPinRefs : type === 'new' ? newPinRefs : confirmPinRefs;

    const next = [...pinArray];

    if (next[index]) {
      next[index] = '';
      setPin(next);
      return;
    }

    if (index > 0) {
      next[index - 1] = '';
      setPin(next);
      refs[index - 1].current?.focus();
    }
  };

  const handleChangePin = async () => {
    if (loading || updating) return;

    if (!userId) {
      Alert.alert('Change PIN', 'Please sign in again to change your PIN.');
      return;
    }

    if (!verifiedCurrentPin) {
      Alert.alert('Error', 'Please verify your current PIN first');
      setStep('current');
      return;
    }

    const newPinString = newPin.join('');
    if (newPinString.length !== PIN_LENGTH) {
      Alert.alert('Error', 'Please enter a new 4-digit PIN');
      setStep('new');
      newPinRefs[0].current?.focus();
      return;
    }

    const currentPinString = verifiedCurrentPinValue || currentPin.join('');
    if (newPinString === currentPinString) {
      setShowSamePinModal(true);
      setNewPin(Array(PIN_LENGTH).fill(''));
      setStep('new');
      newPinRefs[0].current?.focus();
      return;
    }

    const confirmPinString = confirmPin.join('');
    if (confirmPinString.length !== PIN_LENGTH) {
      Alert.alert('Error', 'Please confirm your new PIN');
      setStep('confirm');
      confirmPinRefs[0].current?.focus();
      return;
    }

    if (newPinString !== confirmPinString) {
      setShowPinMismatchModal(true);
      setConfirmPin(Array(PIN_LENGTH).fill(''));
      setStep('confirm');
      confirmPinRefs[0].current?.focus();
      return;
    }

    try {
      setUpdating(true);

      const newHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        newPinString,
      );

      const { error } = await supabase
        .from('profiles')
        .update({
          pin_hash: newHash,
          pin_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      setShowSuccessModal(true);
      setNewPin(Array(PIN_LENGTH).fill(''));
      setConfirmPin(Array(PIN_LENGTH).fill(''));
      setCurrentPin(Array(PIN_LENGTH).fill(''));
      setStep('current');
      setVerifiedCurrentPin(false);
      setVerifiedCurrentPinValue('');
    } catch (error) {
      console.error('Failed to save new PIN:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save new PIN');
    } finally {
      setUpdating(false);
    }
  };

  const handleBack = () => {
    if (step === 'confirm') {
      setStep('new');
      setConfirmPin(Array(PIN_LENGTH).fill(''));
      setTimeout(() => {
        newPinRefs[0].current?.focus();
      }, 100);
    } else if (step === 'new') {
      setStep('current');
      setNewPin(Array(PIN_LENGTH).fill(''));
      setVerifiedCurrentPin(false);
      setVerifiedCurrentPinValue('');
      // Don't clear currentPin - user might want to go back and verify again
      setTimeout(() => {
        currentPinRefs[0].current?.focus();
      }, 100);
    } else {
      router.back();
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    router.back();
  };

  const handleCloseWrongPinModal = () => {
    setShowWrongPinModal(false);
    setCurrentPin(Array(PIN_LENGTH).fill(''));
    setStep('current');
    setVerifiedCurrentPin(false);
    setVerifiedCurrentPinValue('');
    setTimeout(() => {
      currentPinRefs[0].current?.focus();
    }, 100);
  };

  const handleCloseSamePinModal = () => {
    setShowSamePinModal(false);
    setStep('new');
    setTimeout(() => {
      newPinRefs[0].current?.focus();
    }, 100);
  };

  const handleClosePinMismatchModal = () => {
    setShowPinMismatchModal(false);
    setStep('confirm');
    setTimeout(() => {
      confirmPinRefs[0].current?.focus();
    }, 100);
  };

  const renderCurrentPinScreen = () => {
    return (
      <View style={styles.screenContainer}>
        <View style={styles.iconContainer}>
          <MaterialIcons name="lock" size={64} color="#FF7F00" />
        </View>
        <ThemedText style={styles.screenTitle}>Enter Current PIN</ThemedText>
        <ThemedText style={styles.screenDescription}>
          Please enter your current 4-digit PIN to continue
        </ThemedText>
        {isDemoUser && (
          <View style={styles.demoPinHint}>
            <MaterialIcons name="info" size={16} color="#FF7F00" />
            <ThemedText style={styles.demoPinHintText}>
              Demo account default PIN: 1234
            </ThemedText>
          </View>
        )}
        <View style={styles.pinContainer}>
          {currentPin.map((digit, index) => (
            <TextInput
              key={index}
              ref={currentPinRefs[index]}
              style={[
                styles.pinInput,
                digit && styles.pinInputFilled,
                !digit && styles.pinInputActive,
              ]}
              value={digit}
              onChangeText={(value) => handlePinChange(value, index, 'current')}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace') {
                  handleBackspace(index, 'current');
                }
              }}
              keyboardType="number-pad"
              maxLength={1}
              secureTextEntry
              selectTextOnFocus
              editable={!loading && !verifying && !updating}
            />
          ))}
        </View>
        {verifying && (
          <View style={styles.verifyingContainer}>
            <NetpayLoadingAnimation size={28} strokeWidth={2.5} />
            <ThemedText style={styles.verifyingText}>Verifying...</ThemedText>
          </View>
        )}
        <TouchableOpacity
          style={styles.forgotPinLink}
          onPress={() => router.push('/forgot-pin')}
          activeOpacity={0.7}
          disabled={verifying || updating}
        >
          <ThemedText style={styles.forgotPinLinkText}>Forgot PIN?</ThemedText>
        </TouchableOpacity>
      </View>
    );
  };

  const renderNewPinScreen = () => {
    return (
      <View style={styles.screenContainer}>
        <View style={styles.iconContainer}>
          <MaterialIcons name="lock-outline" size={64} color="#FF7F00" />
        </View>
        <ThemedText style={styles.screenTitle}>Enter New PIN</ThemedText>
        <ThemedText style={styles.screenDescription}>
          Create a new 4-digit PIN for your account
        </ThemedText>
        <View style={styles.pinContainer}>
          {newPin.map((digit, index) => (
            <TextInput
              key={index}
              ref={newPinRefs[index]}
              style={[
                styles.pinInput,
                digit && styles.pinInputFilled,
                !digit && styles.pinInputActive,
              ]}
              value={digit}
              onChangeText={(value) => handlePinChange(value, index, 'new')}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace') {
                  handleBackspace(index, 'new');
                }
              }}
              keyboardType="number-pad"
              maxLength={1}
              secureTextEntry
              selectTextOnFocus
              editable={!loading && !updating}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderConfirmPinScreen = () => {
    return (
      <View style={styles.screenContainer}>
        <View style={styles.iconContainer}>
          <MaterialIcons name="lock" size={64} color="#FF7F00" />
        </View>
        <ThemedText style={styles.screenTitle}>Confirm New PIN</ThemedText>
        <ThemedText style={styles.screenDescription}>
          Please confirm your new 4-digit PIN
        </ThemedText>
        <View style={styles.pinContainer}>
          {confirmPin.map((digit, index) => (
            <TextInput
              key={index}
              ref={confirmPinRefs[index]}
              style={[
                styles.pinInput,
                digit && styles.pinInputFilled,
                !digit && styles.pinInputActive,
              ]}
              value={digit}
              onChangeText={(value) => handlePinChange(value, index, 'confirm')}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace') {
                  handleBackspace(index, 'confirm');
                }
              }}
              keyboardType="number-pad"
              maxLength={1}
              secureTextEntry
              selectTextOnFocus
              editable={!loading && !updating}
            />
          ))}
        </View>
        {updating && (
          <View style={styles.verifyingContainer}>
            <NetpayLoadingAnimation size={28} strokeWidth={2.5} />
            <ThemedText style={styles.verifyingText}>Updating PIN...</ThemedText>
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.changeButton,
            (!confirmPin.every((digit) => digit) || updating) && styles.changeButtonDisabled,
          ]}
          onPress={handleChangePin}
          disabled={updating || !confirmPin.every((digit) => digit)}
        >
          {updating ? (
            <NetpayLoadingAnimation size={40} variant="onBrand" strokeWidth={2.5} />
          ) : (
            <ThemedText style={styles.changeButtonText}>Confirm New PIN</ThemedText>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <NetpayLoadingAnimation message="Loading…" />
      </ThemedView>
    );
  }

  const getStepTitle = () => {
    switch (step) {
      case 'current':
        return 'Current PIN';
      case 'new':
        return 'New PIN';
      case 'confirm':
        return 'Confirm PIN';
      default:
        return 'Change PIN';
    }
  };

  const getStepIndicator = () => {
    return (
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, step === 'current' && styles.stepDotActive]} />
        <View style={[styles.stepLine, step !== 'current' && styles.stepLineActive]} />
        <View style={[styles.stepDot, step === 'new' && styles.stepDotActive]} />
        <View style={[styles.stepLine, step === 'confirm' && styles.stepLineActive]} />
        <View style={[styles.stepDot, step === 'confirm' && styles.stepDotActive]} />
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{getStepTitle()}</ThemedText>
        <View style={styles.placeholder} />
      </View>

      {getStepIndicator()}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Demo User Banner */}
        {isDemoUser && (
          <View style={styles.demoUserCard}>
            <View style={styles.demoUserHeader}>
              <MaterialIcons name="info" size={24} color="#FF7F00" />
              <ThemedText style={styles.demoUserTitle}>Demo Account Information</ThemedText>
            </View>
            <View style={styles.demoUserContent}>
              <ThemedText style={styles.demoUserText}>
                You are currently using a demo account (demo@netppay.com). This account is designed for testing purposes.
              </ThemedText>
              <ThemedText style={styles.demoUserText}>
                PIN changes for demo accounts work normally. You can change your PIN as needed for testing.
              </ThemedText>
            </View>
          </View>
        )}

        <View style={styles.content}>
          {step === 'current' && renderCurrentPinScreen()}
          {step === 'new' && renderNewPinScreen()}
          {step === 'confirm' && renderConfirmPinScreen()}
        </View>
      </ScrollView>

      <Modal
        visible={showSuccessModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseSuccessModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <View style={styles.successIconCircle}>
                <MaterialIcons name="check" size={48} color="#fff" />
              </View>
            </View>
            <ThemedText style={styles.modalTitle}>PIN Changed!</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Your PIN has been changed successfully
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseSuccessModal}>
              <ThemedText style={styles.modalButtonText}>OK</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showWrongPinModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseWrongPinModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.errorIconContainer}>
              <View style={styles.errorIconCircle}>
                <MaterialIcons name="close" size={48} color="#fff" />
              </View>
            </View>
            <ThemedText style={styles.modalTitle}>Wrong PIN</ThemedText>
            <ThemedText style={styles.modalMessage}>
              The current PIN you entered is incorrect. Please try again.
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseWrongPinModal}>
              <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={() => {
                setShowWrongPinModal(false);
                router.push('/forgot-pin');
              }}
            >
              <ThemedText style={styles.modalSecondaryButtonText}>Forgot PIN?</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSamePinModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseSamePinModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.warningIconContainer}>
              <View style={styles.warningIconCircle}>
                <MaterialIcons name="warning-amber" size={44} color="#fff" />
              </View>
            </View>
            <ThemedText style={styles.modalTitle}>PIN Not Allowed</ThemedText>
            <ThemedText style={styles.modalMessage}>
              New PIN must be different from your current PIN.
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleCloseSamePinModal}>
              <ThemedText style={styles.modalButtonText}>Use Different PIN</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPinMismatchModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleClosePinMismatchModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.warningIconContainer}>
              <View style={styles.warningIconCircle}>
                <MaterialIcons name="warning-amber" size={44} color="#fff" />
              </View>
            </View>
            <ThemedText style={styles.modalTitle}>PIN Mismatch</ThemedText>
            <ThemedText style={styles.modalMessage}>
              New PIN and confirm PIN do not match. Please re-enter your confirm PIN.
            </ThemedText>
            <TouchableOpacity style={styles.modalButton} onPress={handleClosePinMismatchModal}>
              <ThemedText style={styles.modalButtonText}>Try Again</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
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
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#F9F9F9',
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E0E0E0',
  },
  stepDotActive: {
    backgroundColor: '#FF7F00',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#FF7F00',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 48,
  },
  content: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 400,
  },
  iconContainer: {
    marginBottom: 32,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
    textAlign: 'center',
  },
  screenDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 32,
  },
  verifyingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  verifyingText: {
    fontSize: 14,
    color: '#666',
  },
  pinInput: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    backgroundColor: '#F5F5F5',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  pinInputActive: {
    borderColor: '#FF7F00',
    backgroundColor: '#FFF3E0',
  },
  pinInputFilled: {
    borderColor: '#FF7F00',
    backgroundColor: '#FFF3E0',
  },
  changeButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    width: '100%',
    maxWidth: 340,
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#FF7F00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  changeButtonDisabled: {
    backgroundColor: '#CCCCCC',
    shadowOpacity: 0,
    elevation: 0,
  },
  changeButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    marginHorizontal: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 280,
  },
  successIconContainer: {
    marginBottom: 24,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  errorIconContainer: {
    marginBottom: 24,
  },
  errorIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F44336',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  warningIconContainer: {
    marginBottom: 24,
  },
  warningIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF7F00',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF7F00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: '#FF7F00',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    minWidth: 120,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  demoUserCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    marginHorizontal: 20,
    borderWidth: 2,
    borderColor: '#FF7F00',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  demoUserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  demoUserTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E65100',
    flex: 1,
  },
  demoUserContent: {
    gap: 8,
  },
  demoUserText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  demoPinHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  demoPinHintText: {
    fontSize: 13,
    color: '#E65100',
    fontWeight: '500',
  },
  forgotPinLink: {
    marginTop: 24,
    paddingVertical: 8,
  },
  forgotPinLinkText: {
    fontSize: 15,
    color: '#FF7F00',
    fontWeight: '600',
  },
  modalSecondaryButton: {
    marginTop: 12,
    paddingVertical: 8,
  },
  modalSecondaryButtonText: {
    fontSize: 15,
    color: '#FF7F00',
    fontWeight: '600',
  },
});

