'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { QUALIFICATION_STEPS, QualificationQuestion } from '@/lib/qualification/config';
import { CheckCircle2, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';

interface QualificationFormProps {
  onComplete: (responses: Record<string, unknown>) => void;
  onSkip?: () => void;
  initialResponses?: Record<string, unknown>;
  showSkip?: boolean;
}

export function QualificationForm({
  onComplete,
  onSkip,
  initialResponses = {},
  showSkip = true,
}: QualificationFormProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, unknown>>(initialResponses);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = QUALIFICATION_STEPS[currentStepIndex];
  const isLastStep = currentStepIndex === QUALIFICATION_STEPS.length - 1;
  const isFirstStep = currentStepIndex === 0;

  // Check if current step is complete
  const isStepComplete = () => {
    return currentStep.questions.every(q => {
      if (!q.required) return true;
      const response = responses[q.id];
      if (Array.isArray(response)) return response.length > 0;
      return !!response;
    });
  };

  const handleSelect = (questionId: string, value: string, isMulti: boolean, maxSelections?: number) => {
    setResponses(prev => {
      if (isMulti) {
        const current = (prev[questionId] as string[]) || [];
        if (current.includes(value)) {
          // Remove
          return { ...prev, [questionId]: current.filter(v => v !== value) };
        } else {
          // Add (respecting max)
          if (maxSelections && current.length >= maxSelections) {
            // Remove first, add new
            return { ...prev, [questionId]: [...current.slice(1), value] };
          }
          return { ...prev, [questionId]: [...current, value] };
        }
      } else {
        return { ...prev, [questionId]: value };
      }
    });
    setError(null);
  };

  const handleNext = async () => {
    if (!isStepComplete()) {
      setError('Пожалуйста, ответьте на все обязательные вопросы');
      return;
    }

    if (isLastStep) {
      // Submit
      setSaving(true);
      try {
        const res = await fetch('/api/user/qualification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responses, complete: true }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to save');
        }

        onComplete(responses);
      } catch (err) {
        setError('Не удалось сохранить. Попробуйте ещё раз.');
        setSaving(false);
      }
    } else {
      // Save progress and go to next step
      try {
        await fetch('/api/user/qualification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responses, complete: false }),
        });
      } catch {
        // Silent fail for progress save
      }
      
      setCurrentStepIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card className="border-0 shadow-lg">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl">{currentStep.title}</CardTitle>
          {currentStep.subtitle && (
            <CardDescription className="text-base">
              {currentStep.subtitle}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="space-y-8 pb-8">
          {currentStep.questions.map((question) => (
            <QuestionBlock
              key={question.id}
              question={question}
              value={responses[question.id]}
              onChange={(value) => 
                handleSelect(question.id, value, question.type === 'multi', question.maxSelections)
              }
            />
          ))}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <div className="flex items-center justify-between pt-4">
            <div>
              {!isFirstStep && (
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  disabled={saving}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Назад
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {showSkip && onSkip && (
                <Button
                  variant="ghost"
                  onClick={onSkip}
                  disabled={saving}
                  className="text-muted-foreground"
                >
                  Пропустить
                </Button>
              )}
              
              <Button
                onClick={handleNext}
                disabled={saving || !isStepComplete()}
                className="min-w-[140px]"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isLastStep ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Готово
                  </>
                ) : (
                  <>
                    Далее
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface QuestionBlockProps {
  question: QualificationQuestion;
  value: unknown;
  onChange: (value: string) => void;
}

function QuestionBlock({ question, value, onChange }: QuestionBlockProps) {
  const isMulti = question.type === 'multi';
  const selectedValues = isMulti 
    ? (value as string[] || []) 
    : [value as string].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-base">
          {question.question}
          {question.required && <span className="text-destructive ml-1">*</span>}
        </h3>
        {isMulti && question.maxSelections && (
          <span className="text-xs text-muted-foreground">
            (до {question.maxSelections})
          </span>
        )}
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {question.options.map((option) => {
          const isSelected = selectedValues.includes(option.value);
          
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
                'hover:border-primary/50 hover:bg-primary/5',
                isSelected 
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/20' 
                  : 'border-border'
              )}
            >
              {option.icon && (
                <span className="text-xl flex-shrink-0">{option.icon}</span>
              )}
              <span className={cn(
                'text-sm',
                isSelected ? 'font-medium' : ''
              )}>
                {option.label}
              </span>
              {isSelected && (
                <CheckCircle2 className="h-4 w-4 text-primary ml-auto flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

