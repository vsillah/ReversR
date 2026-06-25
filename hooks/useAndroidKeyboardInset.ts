import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

export const useAndroidKeyboardInset = (extraOffset = 0) => {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const computeInsetFromDimensions = () => {
      const windowHeight = Dimensions.get('window').height;
      const screenHeight = Dimensions.get('screen').height;
      const occupiedHeight = Math.max(0, screenHeight - windowHeight);
      return occupiedHeight > 120 ? occupiedHeight + extraOffset : 0;
    };

    const handleShow = (event: any) => {
      const keyboardHeight = event?.endCoordinates?.height ?? 0;
      setKeyboardInset(Math.max(0, keyboardHeight + extraOffset));
    };

    const handleHide = () => setKeyboardInset(0);
    const handleDimensionChange = () => {
      setKeyboardInset(computeInsetFromDimensions());
    };

    const showSubscription = Keyboard.addListener('keyboardDidShow', handleShow);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', handleHide);
    const dimensionSubscription = Dimensions.addEventListener('change', handleDimensionChange);
    handleDimensionChange();

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      dimensionSubscription.remove();
    };
  }, [extraOffset]);

  return keyboardInset;
};
