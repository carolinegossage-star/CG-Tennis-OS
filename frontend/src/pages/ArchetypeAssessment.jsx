import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const QUESTIONS = [
  {
    id: 1,
    text: "When a player is struggling with a technique, your first instinct is to:",
    options: [
      { text: "Break down the mechanics into step-by-step instructions.", archetype: "Technical Coach" },
      { text: "Ask the player how they feel and build their confidence.", archetype: "Relationship Builder" },
      { text: "Change the drill setup to force a natural adjustment.", archetype: "Breakthrough Leader" },
      { text: "Look at the data from their last match to find the root cause.", archetype: "Data-Driven Coach" }
    ]
  },
  {
    id: 2,
    text: "Your ideal coaching environment is:",
    options: [
      { text: "A high-level academy with structured pathways.", archetype: "Technical Coach" },
      { text: "A community club where everyone feels like family.", archetype: "Relationship Builder" },
      { text: "Anywhere I can inspire players to reach their full potential.", archetype: "Breakthrough Leader" },
      { text: "A lab-like setting with video analysis and sensor data.", archetype: "Data-Driven Coach" }
    ]
  },
  {
    id: 3,
    text: "What do you value most in a session?",
    options: [
      { text: "Precision and technical mastery.", archetype: "Technical Coach" },
      { text: "Engagement and emotional connection.", archetype: "Relationship Builder" },
      { text: "Breakthrough moments and mindset shifts.", archetype: "Breakthrough Leader" },
      { text: "Measurable progress and objective facts.", archetype: "Data-Driven Coach" }
    ]
  }
];

export default function ArchetypeAssessment() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [result, setResult] = useState(null);
  const email = location.state?.email || "";

  const handleAnswer = (archetype) => {
    const newAnswers = [...answers, archetype];
    if (step < QUESTIONS.length - 1) {
      setAnswers(newAnswers);
      setStep(step + 1);
    } else {
      calculateResult(newAnswers);
    }
  };

  const calculateResult = (finalAnswers) => {
    const counts = {};
    finalAnswers.forEach(a => counts[a] = (counts[a] || 0) + 1);
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    setResult(sorted[0][0]);
  };

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-gray-100">
          <div className="text-6xl mb-6">🎯</div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-[--primary-green] mb-2">Your Archetype</h2>
          <h1 className="text-3xl font-extrabold mb-4">{result}</h1>
          <p className="text-gray-600 mb-8 leading-relaxed">
            You excel at {result === "Technical Coach" ? "building robust systems and technical precision." : 
                        result === "Relationship Builder" ? "creating deep connections and emotional safety." :
                        result === "Breakthrough Leader" ? "inspiring vision and creating mindset breakthroughs." :
                        "using data and evidence to help players get better."}
          </p>
          <div className="bg-[--primary-green]/5 rounded-2xl p-6 mb-8 border border-[--primary-green]/10">
            <p className="text-sm font-semibold text-gray-800 mb-2">Next Step: The Full OS</p>
            <p className="text-xs text-gray-500">
              We've sent your full profile to <strong>{email || "your email"}</strong>. 
              Join the waitlist to unlock the full CGTennis OS.
            </p>
          </div>
          <button 
            onClick={() => navigate('/login')}
            className="w-full bg-[--primary-green] text-white py-4 rounded-xl font-bold hover:bg-[#1a7a4a] transition-all"
          >
            Access the Dashboard
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = QUESTIONS[step];
  const progress = ((step + 1) / QUESTIONS.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full">
        <div className="mb-8 flex items-center justify-between">
          <span className="text-sm font-bold text-gray-400">Archetype Assessment</span>
          <span className="text-sm font-bold text-[--primary-green]">{step + 1} / {QUESTIONS.length}</span>
        </div>
        <div className="h-2 w-full bg-gray-200 rounded-full mb-12 overflow-hidden">
          <div className="h-full bg-[--primary-green] transition-all duration-500" style={{ width: `${progress}%` }}></div>
        </div>
        
        <h2 className="text-2xl md:text-3xl font-extrabold mb-10 text-gray-900 leading-tight">
          {currentQuestion.text}
        </h2>
        
        <div className="space-y-4">
          {currentQuestion.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleAnswer(opt.archetype)}
              className="w-full text-left p-6 rounded-2xl border-2 border-transparent bg-white hover:border-[--primary-green] hover:shadow-lg transition-all group"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700 group-hover:text-[--primary-green]">{opt.text}</span>
                <span className="text-gray-300 group-hover:text-[--primary-green]">→</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
