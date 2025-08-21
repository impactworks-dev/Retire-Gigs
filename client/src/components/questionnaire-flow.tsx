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
    setAnswers(prev => ({ ...prev, [questionKey]: value }));
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
  const currentAnswer = answers[`question_${currentQuestion}` as keyof QuestionnaireAnswers];
  const isAnswered = !!currentAnswer;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span data-testid="text-question-progress">
            Question <span>{currentQuestion}</span> of {totalQuestions}
          </span>
          <span data-testid="text-progress-percent">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-3" data-testid="progress-questionnaire" />
      </div>

      {/* Question Content */}
      <div className="bg-white rounded-2xl shadow-lg p-8">
        <h2 
          className="text-2xl font-bold text-gray-900 mb-4"
          data-testid={`text-question-title-${currentQuestion}`}
        >
          {currentQuestionData.title}
        </h2>
        <p 
          className="text-lg text-gray-600 mb-8"
          data-testid={`text-question-description-${currentQuestion}`}
        >
          {currentQuestionData.description}
        </p>

        {/* Answer Options */}
        <div className="space-y-4">
          {currentQuestionData.options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleAnswerSelect(option.value)}
              className={`w-full text-left text-lg font-medium py-4 px-6 rounded-xl border-2 transition-all duration-200 flex items-center ${
                currentAnswer === option.value
                  ? "bg-primary text-white border-primary"
                  : "bg-gray-50 hover:bg-primary hover:text-white text-gray-900 border-transparent hover:border-primary"
              }`}
              data-testid={`button-answer-${option.value}`}
            >
              <div className="mr-4">{option.icon}</div>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8">
        <Button
          onClick={handlePrevious}
          disabled={currentQuestion === 1}
          variant="outline"
          size="lg"
          className="text-lg font-medium py-3 px-8"
          data-testid="button-previous"
        >
          <ChevronLeft className="w-5 h-5 mr-2" />
          Previous
        </Button>
        
        <Button
          onClick={handleNext}
          disabled={!isAnswered}
          size="lg"
          className="bg-primary hover:bg-blue-700 text-white text-lg font-medium py-3 px-8"
          data-testid="button-next"
        >
          {currentQuestion === totalQuestions ? "See My Matches" : "Next"}
          <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
