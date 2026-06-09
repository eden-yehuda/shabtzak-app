// Default opening text for the leave survey (סקר יציאות).
// Used as a fallback in the soldier-facing modal and as the initial value
// in the admin editor, when no custom intro_text has been saved yet.
export const DEFAULT_INTRO_TEXT = [
  '📅 לבחור 6 ימים מקסימום. שבת אחת ושישי אחד (או חג) מותר ברצף.',
  '🔗 יש לרשום לפחות יומיים ברצף כדי לא ליצור בלאגן של יוצאים חוזרים.',
  '✡️ שישי 22/5 הוא חג שבועות — מתייחסים אליו כמו שישי או שבת.',
  '🪖 יום ראשון 17/5 הוא יום פלוגה (אימון + ערב). לא יוצאים למעט חריגים.',
].join('\n')
