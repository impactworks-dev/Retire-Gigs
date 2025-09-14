import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Question, QuestionnaireAnswers } from "@/types/questionnaire";
import { questions } from "@/data/questions";

interface QuestionnaireFlowProps {
  onComplete: (answers: QuestionnaireAnswers) => void;
}

export function QuestionnaireFlow({ onComplete }: QuestionnaireFlowProps) {
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({});

  const totalQuestions = questions.length;
  const progress = (currentQuestion / totalQuestions) * 100;

  const handleAnswerSelect = (value: string) => {
    const questionKey = `question_${currentQuestion}` as keyof QuestionnaireAnswers;
    setAnswers(prev => {
      const currentAnswers = prev[questionKey] || [];
      const isSelected = currentAnswers.includes(value);
      
      if (isSelected) {
        // Remove the value if already selected
        return {
          ...prev,
          [questionKey]: currentAnswers.filter(answer => answer !== value)
        };
      } else {
        // Add the value if not selected
        return {
          ...prev,
          [questionKey]: [...currentAnswers, value]
        };
      }
    });
  };

  const handleNext = () => {
    if (currentQuestion < totalQuestions) {
      setCurrentQuestion(prev => prev + 1);
    } else {
      onComplete(answers);
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 1) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const currentQuestionData = questions[currentQuestion - 1];
  const currentAnswers = answers[`question_${currentQuestion}` as keyof QuestionnaireAnswers] || [];
  const isAnswered = currentAnswers.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-senior-secondary mb-2">
          <span data-testid="text-question-progress" className="text-senior-secondary">
            Question <span className="font-semibold">{currentQuestion}</span> of {totalQuestions}
          </span>
          <div className="flex items-center gap-4">
            {currentAnswers.length > 0 && (
              <span data-testid="text-selections-count" className="text-primary font-semibold text-senior">
                {currentAnswers.length} selected
              </span>
            )}
            <span data-testid="text-progress-percent" className="text-senior-secondary font-medium">{Math.round(progress)}%</span>
          </div>
        </div>
        <Progress value={progress} className="h-3" data-testid="progress-questionnaire" />
      </div>

      {/* Question Content */}
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 
          className="mobile-heading text-gray-900 mb-4"
          data-testid={`text-question-title-${currentQuestion}`}
        >
          {currentQuestionData.title}
        </h2>
        <p 
          className="text-senior-large text-senior-secondary mb-4"
          data-testid={`text-question-description-${currentQuestion}`}
        >
          {currentQuestionData.description}
        </p>
        <p className="text-senior text-senior-muted mb-8 italic font-medium">
          You can select multiple options that apply to you.
        </p>

        {/* Answer Options */}
        <div className="space-y-6">
          {currentQuestionData.options.map((option) => {
            const isSelected = currentAnswers.includes(option.value);
            return (
              <button
                key={option.value}
                onClick={() => handleAnswerSelect(option.value)}
                className={`w-full text-left text-senior-button py-6 px-8 rounded-xl border-2 transition-all duration-200 flex items-center justify-between min-h-16 ${
                  isSelected
                    ? "bg-primary text-white border-primary"
                    : "bg-gray-50 hover:bg-primary hover:text-white text-gray-900 border-transparent hover:border-primary"
                }`}
                data-testid={`button-answer-${option.value}`}
              >
                <div className="flex items-center">
                  <div className="mr-4">{option.icon}</div>
                  {option.label}
                </div>
                {isSelected && (
                  <div className="ml-4">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8">
        <Button
          onClick={handlePrevious}
          disabled={currentQuestion === 1}
          variant="outline"
          size="lg"
          className="text-senior-button min-h-12 px-8 py-4"
          data-testid="button-previous"
        >
          <ChevronLeft className="w-5 h-5 mr-2" />
          Previous
        </Button>
        
        <Button
          onClick={handleNext}
          disabled={!isAnswered}
          size="lg"
          className="bg-primary hover:bg-blue-700 text-white text-senior-button min-h-12 px-8 py-4"
          data-testid="button-next"
        >
          {currentQuestion === totalQuestions ? "See My Matches" : "Next"}
          <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
