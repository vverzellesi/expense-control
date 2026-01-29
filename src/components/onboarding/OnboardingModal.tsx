"use client";

import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { slides } from "./slides-content";
import { OnboardingSlide } from "./OnboardingSlide";
import { OnboardingDots } from "./OnboardingDots";
import { useSwipe } from "@/hooks/useSwipe";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const isFirstSlide = currentSlide === 0;
  const isLastSlide = currentSlide === slides.length - 1;

  const goToNextSlide = useCallback(() => {
    if (isLastSlide) {
      onComplete();
    } else {
      setCurrentSlide((prev) => prev + 1);
    }
  }, [isLastSlide, onComplete]);

  const goToPreviousSlide = useCallback(() => {
    if (!isFirstSlide) {
      setCurrentSlide((prev) => prev - 1);
    }
  }, [isFirstSlide]);

  const goToSlide = useCallback((index: number) => {
    setCurrentSlide(index);
  }, []);

  const swipeHandlers = useSwipe({
    onSwipeLeft: goToNextSlide,
    onSwipeRight: goToPreviousSlide,
  });

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onComplete()}>
      <DialogContent
        className="max-w-md w-[calc(100vw-32px)] p-0 overflow-hidden"
        aria-describedby={undefined}
      >
        {/* Visually hidden title for accessibility */}
        <DialogTitle className="sr-only">Tutorial do MyPocket</DialogTitle>

        {/* Slides container with swipe support */}
        <div
          className="relative overflow-hidden"
          {...swipeHandlers}
        >
          {/* Slides track */}
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${currentSlide * 100}%)` }}
          >
            {slides.map((slide, index) => (
              <div
                key={index}
                className="w-full flex-shrink-0"
                aria-hidden={index !== currentSlide}
              >
                <OnboardingSlide
                  icon={slide.icon}
                  title={slide.title}
                  description={slide.description}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Navigation section */}
        <div className="px-6 pb-6 space-y-4">
          {/* Dots navigation */}
          <OnboardingDots
            total={slides.length}
            current={currentSlide}
            onDotClick={goToSlide}
          />

          {/* Previous/Next buttons */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={goToPreviousSlide}
              disabled={isFirstSlide}
              className="flex-1"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>

            <Button
              onClick={goToNextSlide}
              className="flex-1"
            >
              {isLastSlide ? (
                "Começar a usar"
              ) : (
                <>
                  Próximo
                  <ChevronRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
