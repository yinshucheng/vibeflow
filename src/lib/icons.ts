import {
  Home,
  Sunrise,
  Timer,
  FolderKanban,
  CheckSquare,
  Target,
  BarChart3,
  Calendar,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  MoreHorizontal,
  Trash2,
  Edit2,
  Play,
  Pause,
  Square,
  Waves,
  Check,
  X,
  Search,
  Menu,
  Bell,
  User,
  LogOut,
  Moon,
  Sun,
  Loader2,
  AlertCircle,
  Info,
  Star,
  Clock,
  type LucideIcon,
} from 'lucide-react';

export const Icons = {
  // Navigation
  home: Home,
  airlock: Sunrise,
  pomodoro: Timer,
  projects: FolderKanban,
  tasks: CheckSquare,
  goals: Target,
  stats: BarChart3,
  timeline: Calendar,
  settings: Settings,

  // Chevrons
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,

  // Actions
  plus: Plus,
  more: MoreHorizontal,
  trash: Trash2,
  edit: Edit2,
  check: Check,
  close: X,
  search: Search,
  menu: Menu,

  // Pomodoro
  play: Play,
  pause: Pause,
  stop: Square,

  // Task
  star: Star,
  clock: Clock,

  // Misc
  logo: Waves,
  bell: Bell,
  user: User,
  logout: LogOut,
  moon: Moon,
  sun: Sun,
  loader: Loader2,
  alert: AlertCircle,
  info: Info,
} as const;

export type IconName = keyof typeof Icons;
export type { LucideIcon };
