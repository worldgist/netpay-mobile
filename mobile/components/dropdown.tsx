import { useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Modal, FlatList, ImageSourcePropType } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';

interface DropdownOption {
  id: string;
  name: string;
  amount?: number;
  logo?: ImageSourcePropType;
}

interface DropdownProps {
  options: DropdownOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Dropdown({ options, selectedId, onSelect, placeholder = 'Select an option' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(opt => opt.id === selectedId);

  const handleSelect = (id: string) => {
    onSelect(id);
    setIsOpen(false);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => setIsOpen(true)}
        activeOpacity={0.7}>
        <View style={styles.dropdownContent}>
          {selectedOption?.logo && (
            <View style={styles.dropdownLogoContainer}>
              <Image
                source={selectedOption.logo}
                style={styles.dropdownLogo}
                contentFit="contain"
              />
            </View>
          )}
          <ThemedText style={[styles.dropdownText, !selectedOption && styles.placeholderText]}>
            {selectedOption 
              ? selectedOption.amount 
                ? `${selectedOption.name} - ₦${selectedOption.amount.toLocaleString()}`
                : selectedOption.name
              : placeholder}
          </ThemedText>
        </View>
        <MaterialIcons 
          name={isOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'} 
          size={24} 
          color="#666" 
        />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsOpen(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select Option</ThemedText>
              <TouchableOpacity onPress={() => setIsOpen(false)}>
                <MaterialIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    selectedId === item.id && styles.selectedOptionItem,
                  ]}
                  onPress={() => handleSelect(item.id)}>
                  <View style={styles.optionContent}>
                    {item.logo && (
                      <View style={styles.optionLogoContainer}>
                        <Image
                          source={item.logo}
                          style={styles.optionLogo}
                          contentFit="contain"
                        />
                      </View>
                    )}
                    <View style={styles.optionTextContent}>
                      <ThemedText style={styles.optionName}>{item.name}</ThemedText>
                      {item.amount && (
                        <ThemedText style={styles.optionAmount}>
                          ₦{item.amount.toLocaleString()}
                        </ThemedText>
                      )}
                    </View>
                  </View>
                  {selectedId === item.id && (
                    <MaterialIcons name="check-circle" size={24} color="#FF7F00" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  dropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 50,
  },
  dropdownContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropdownLogoContainer: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    padding: 4,
  },
  dropdownLogo: {
    width: '100%',
    height: '100%',
  },
  dropdownText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  placeholderText: {
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  selectedOptionItem: {
    backgroundColor: '#FFF3E0',
  },
  optionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionLogoContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    padding: 6,
  },
  optionLogo: {
    width: '100%',
    height: '100%',
  },
  optionTextContent: {
    flex: 1,
  },
  optionName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  optionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF7F00',
  },
});

