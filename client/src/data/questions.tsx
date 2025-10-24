import { 
  Settings, 
  TreePine, 
  Palette, 
  Heart, 
  Users, 
  BookOpen, 
  Monitor, 
  Building,
  DollarSign,
  Zap,
  UserPlus,
  Target,
  Coffee,
  HelpCircle,
  MapPin,
  Home,
  Calendar,
  GraduationCap,
  Stethoscope,
  Briefcase,
  Hammer,
  Shield,
  Film,
  ShoppingCart,
  Mail
} from "lucide-react";
import type { Question } from "@/types/questionnaire";

export const questions: Question[] = [
  {
    id: 1,
    title: "What do you enjoy doing in your free time?",
    description: "Select all activities that interest you. This helps us understand what type of work might appeal to you.",
    options: [
     
      {
        value: "outdoor",
        label: "Outdoor activities (gardening, walking, nature)",
        icon: <TreePine className="w-6 h-6" />
      },
      {
        value: "creative",
        label: "Creative work (crafts, cooking, DIY)",
        icon: <Palette className="w-6 h-6" />
      },
      {
        value: "helping",
        label: "Helping others (volunteering, caregiving, mentoring)",
        icon: <Heart className="w-6 h-6" />
      },
      {
        value: "social",
        label: "Being social (talking with people, community events)",
        icon: <Users className="w-6 h-6" />
      },
      {
        value: "quiet",
        label: "Quiet tasks (reading, admin work, organizing)",
        icon: <BookOpen className="w-6 h-6" />
      },
      {
        value: "tech",
        label: "Working with tech (email, Zoom, spreadsheets)",
        icon: <Monitor className="w-6 h-6" />
      },
      {
        value: "professional",
        label: "Professional thinking (office work, advising, leadership)",
        icon: <Building className="w-6 h-6" />
      }
    ]
  },
  {
    id: 2,
    title: "What are you hoping this new job brings into your life?",
    description: "Select all that apply. Understanding your motivations helps us find the right fit.",
    options: [
      {
        value: "income",
        label: "Extra income",
        icon: <DollarSign className="w-6 h-6" />
      },
      {
        value: "active",
        label: "Staying active",
        icon: <Zap className="w-6 h-6" />
      },
      {
        value: "social",
        label: "Meeting new people",
        icon: <UserPlus className="w-6 h-6" />
      },
      {
        value: "purposeful",
        label: "Feeling useful / purposeful",
        icon: <Target className="w-6 h-6" />
      },
      {
        value: "busy",
        label: "Something to do",
        icon: <Coffee className="w-6 h-6" />
      },
      {
        value: "unsure",
        label: "Not sure yet",
        icon: <HelpCircle className="w-6 h-6" />
      }
    ]
  },
  {
    id: 3,
    title: "Are there jobs you would not enjoy?",
    description: "Select any that apply. This helps us filter out work that doesn't match your preferences.",
    options: [
      {
        value: "physical",
        label: "Physical work / heavy lifting",
        icon: <Hammer className="w-6 h-6" />
      },
      {
        value: "customer-service",
        label: "Customer service / talking with customers",
        icon: <Users className="w-6 h-6" />
      },
      {
        value: "computer-heavy",
        label: "Computer-heavy tasks",
        icon: <Monitor className="w-6 h-6" />
      },
      {
        value: "long-hours",
        label: "Long hours / rigid schedules",
        icon: <Calendar className="w-6 h-6" />
      },
      {
        value: "none",
        label: "None of these",
        icon: <HelpCircle className="w-6 h-6" />
      }
    ]
  },
  {
    id: 4,
    title: "Where would you prefer to work?",
    description: "Select all that work for you. This helps us match you with opportunities in your preferred locations.",
    options: [
      {
        value: "home",
        label: "From home",
        icon: <Home className="w-6 h-6" />
      },
      {
        value: "close",
        label: "Close to home",
        icon: <MapPin className="w-6 h-6" />
      },
      {
        value: "either",
        label: "Either one is fine",
        icon: <HelpCircle className="w-6 h-6" />
      }
    ]
  },
  {
    id: 5,
    title: "How often would you like to work?",
    description: "Select all schedules that interest you. This helps us find opportunities that match your availability.",
    options: [
      {
        value: "occasional",
        label: "Just here and there",
        icon: <Coffee className="w-6 h-6" />
      },
      {
        value: "few-hours",
        label: "A few hours per week",
        icon: <Calendar className="w-6 h-6" />
      },
      {
        value: "part-time",
        label: "Steady part-time (10–20 hours/week)",
        icon: <Briefcase className="w-6 h-6" />
      },
      {
        value: "open",
        label: "I'm open to anything",
        icon: <HelpCircle className="w-6 h-6" />
      }
    ]
  },
  {
    id: 6,
    title: "Want to tell us about your past work experience? (Optional)",
    description: "Select all that apply. This helps us find opportunities that use your valuable skills and experience.",
    options: [
      {
        value: "education",
        label: "Education / Teaching",
        icon: <GraduationCap className="w-6 h-6" />
      },
      {
        value: "healthcare",
        label: "Healthcare / Nursing",
        icon: <Stethoscope className="w-6 h-6" />
      },
      {
        value: "business",
        label: "Business / Management",
        icon: <Briefcase className="w-6 h-6" />
      },
      {
        value: "trades",
        label: "Trades / Skilled Labor",
        icon: <Hammer className="w-6 h-6" />
      },
      {
        value: "public-service",
        label: "Public Service / Government",
        icon: <Shield className="w-6 h-6" />
      },
      {
        value: "creative-media",
        label: "Creative / Media / Arts",
        icon: <Film className="w-6 h-6" />
      },
      {
        value: "sales",
        label: "Sales / Customer Service",
        icon: <ShoppingCart className="w-6 h-6" />
      },
      {
        value: "prefer-not-say",
        label: "Prefer not to say / Doesn't apply",
        icon: <HelpCircle className="w-6 h-6" />
      }
    ]
  },
  {
    id: 7,
    title: "Anything else we should know while we match you? (Optional)",
    description: "Select all that apply. These preferences help us fine-tune your job matches.",
    options: [
      {
        value: "low-pressure",
        label: "I prefer low-pressure work",
        icon: <Coffee className="w-6 h-6" />
      },
      {
        value: "use-skills",
        label: "I'd like to use my skills again",
        icon: <Target className="w-6 h-6" />
      },
      {
        value: "meaningful",
        label: "I want something meaningful",
        icon: <Heart className="w-6 h-6" />
      },
      {
        value: "close-commute",
        label: "I don't want to drive far",
        icon: <MapPin className="w-6 h-6" />
      },
      {
        value: "stay-busy",
        label: "I just want to stay busy",
        icon: <Zap className="w-6 h-6" />
      },
      {
        value: "figuring-out",
        label: "I'm still figuring this out",
        icon: <HelpCircle className="w-6 h-6" />
      }
    ]
  }
];
