"use client";

import { useCallback, useRef } from "react";

export interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}

export interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
}

const DEFAULT_THRESHOLD = 50;

/**
 * Custom hook for detecting horizontal swipe/drag gestures
 * Supports both touch (mobile) and mouse drag (desktop)
 *
 * @param options - Configuration options
 * @param options.onSwipeLeft - Callback when swiping left
 * @param options.onSwipeRight - Callback when swiping right
 * @param options.threshold - Minimum distance in pixels to register as swipe (default: 50)
 * @returns Event handlers to spread on the target element
 *
 * @example
 * ```tsx
 * const swipeHandlers = useSwipe({
 *   onSwipeLeft: () => goToNextSlide(),
 *   onSwipeRight: () => goToPrevSlide(),
 *   threshold: 50,
 * });
 *
 * return <div {...swipeHandlers}>Swipeable content</div>;
 * ```
 */
export function useSwipe(options: UseSwipeOptions = {}): SwipeHandlers {
  const { onSwipeLeft, onSwipeRight, threshold = DEFAULT_THRESHOLD } = options;

  // Track touch/drag state
  const startXRef = useRef<number | null>(null);
  const currentXRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const handleSwipeEnd = useCallback(() => {
    if (startXRef.current === null || currentXRef.current === null) {
      return;
    }

    const deltaX = currentXRef.current - startXRef.current;
    const absDeltaX = Math.abs(deltaX);

    if (absDeltaX >= threshold) {
      if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft();
      } else if (deltaX > 0 && onSwipeRight) {
        onSwipeRight();
      }
    }

    // Reset state
    startXRef.current = null;
    currentXRef.current = null;
    isDraggingRef.current = false;
  }, [onSwipeLeft, onSwipeRight, threshold]);

  // Touch event handlers (mobile)
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      startXRef.current = touch.clientX;
      currentXRef.current = touch.clientX;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch && startXRef.current !== null) {
      currentXRef.current = touch.clientX;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    handleSwipeEnd();
  }, [handleSwipeEnd]);

  // Mouse event handlers (desktop)
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only handle left mouse button
    if (e.button !== 0) return;

    startXRef.current = e.clientX;
    currentXRef.current = e.clientX;
    isDraggingRef.current = true;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || startXRef.current === null) {
      return;
    }
    currentXRef.current = e.clientX;
  }, []);

  const onMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      handleSwipeEnd();
    }
  }, [handleSwipeEnd]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  };
}
