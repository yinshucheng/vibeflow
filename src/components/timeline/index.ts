/**
 * Timeline Components
 * 
 * Components for displaying activity timeline and calendar views.
 * Requirements: 6.1, 6.3, 6.6, 6.7
 */

export { CalendarView } from './calendar-view';
export { TimelineView } from './timeline-view';
export { 
  TimelineFilter, 
  DEFAULT_FILTER_STATE,
  getActiveFilterTypes,
} from './timeline-filter';
export type { 
  TimelineFilterState, 
  TimelineEventType,
} from './timeline-filter';
