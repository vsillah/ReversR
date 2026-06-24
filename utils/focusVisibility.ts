import type { RefObject } from 'react';
import { Platform, type NativeSyntheticEvent, type ScrollView, type TargetedEvent } from 'react-native';

type FocusEventLike = NativeSyntheticEvent<TargetedEvent> | { nativeEvent?: { target?: unknown }; target?: unknown } | undefined;

const WEB_REFOCUS_DELAY_MS = 260;
const NATIVE_KEYBOARD_OFFSET = 180;

const scrollWebFocusIntoView = () => {
  if (typeof document === 'undefined') return;
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return;

  const tagName = activeElement.tagName;
  const isEditable =
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    activeElement.isContentEditable;

  if (!isEditable) return;

  activeElement.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: 'auto',
  });
};

const scrollNativeFocusIntoView = (
  scrollRef: RefObject<ScrollView | null>,
  target: unknown,
) => {
  if (!target) return;
  const scrollResponder = (scrollRef.current as any)?.scrollResponderScrollNativeHandleToKeyboard;
  if (typeof scrollResponder !== 'function') return;
  scrollResponder(target, NATIVE_KEYBOARD_OFFSET, true);
};

export const ensureFocusedFieldVisible = (
  scrollRef: RefObject<ScrollView | null>,
  event?: FocusEventLike,
) => {
  const nativeTarget = event && 'nativeEvent' in event ? event.nativeEvent?.target : event?.target;

  const run = () => {
    if (Platform.OS === 'web') {
      scrollWebFocusIntoView();
      return;
    }
    scrollNativeFocusIntoView(scrollRef, nativeTarget);
  };

  requestAnimationFrame(run);
  setTimeout(run, WEB_REFOCUS_DELAY_MS);
};
