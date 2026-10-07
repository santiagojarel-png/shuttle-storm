export const SKILLS = ['Beginner 1', 'Beginner 2', 'Intermediate 1', 'Intermediate 2', 'Advanced'];
export const GENDERS = ['Male', 'Female', 'Other'];
export const STATUSES = ['Active', 'Standby', 'Checked Out'];
export const MODES = ['Balanced', 'Mixed Doubles', 'Same Gender Balanced'];
export const DEFAULT_WEIGHTS = { games: 100, waiting: 2, arrival: 40, skill: 12, partner: 8, opponent: 3 };
export const STORAGE_KEY = 'shuttle-storm.session.v1';
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
